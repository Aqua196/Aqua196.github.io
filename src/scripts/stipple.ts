// CPU 点刻渲染：浏览器不支持 WebGL2（或上下文创建失败）时的降级方案。
// 预先在 U×V 网格上（带一点随机抖动）采样出点和法线，每帧旋转 → 透视投影 →
// 用一张粗网格的深度图挡掉背面的点 → 按光照决定每个点的浓淡，直接写进 ImageData。
import { MODELS, cross, sub, unit, type Vec } from './surfaces';

const U = 720;
const V = 72;
const N = U * V;

type Geo = { P: Float32Array; Nn: Float32Array };
const cache = new Map<number, Geo>();

// 每个采样点在自己的格子里随机挪一下，画出来是均匀的点刻而不是一圈圈整齐的线。
// 用固定种子：每次刷新、每个模型的抖动都一样，变形时点和点才能对上。
const JU = new Float32Array(N);
const JV = new Float32Array(N);
{
  let seed = 196;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  for (let i = 0; i < N; i++) {
    JU[i] = rnd();
    JV[i] = rnd();
  }
}

// 采样：位置居中并缩放到单位球内（双面光照，法线朝向无所谓）
function geometry(i: number): Geo {
  const hit = cache.get(i);
  if (hit) return hit;
  const f = MODELS[i].f;
  const P = new Float32Array(N * 3);
  const Nn = new Float32Array(N * 3);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  // 法线直接在参数空间里取差分，接缝处、几段拼起来的模型也不会算错
  const e = 1e-5;
  for (let a = 0; a < U; a++) {
    for (let b = 0; b < V; b++) {
      const i = a * V + b;
      const u = (a + 0.5 + JU[i]) / U;
      // 不夹到 [0, 1]：闭合曲面在 v 方向本来就是周期的，夹住反而会在接缝处堆出一条线
      const w = (b + JV[i]) / (V - 1);
      const p = f(u, w);
      const k = i * 3;
      for (let d = 0; d < 3; d++) {
        P[k + d] = p[d];
        lo[d] = Math.min(lo[d], p[d]);
        hi[d] = Math.max(hi[d], p[d]);
      }
      Nn.set(unit(cross(sub(f(u + e, w), f(u - e, w)), sub(f(u, w + e), f(u, w - e)))), k);
    }
  }
  const mid = lo.map((l, d) => (l + hi[d]) / 2);
  let R = 0;
  for (let k = 0; k < N * 3; k += 3) {
    P[k] -= mid[0];
    P[k + 1] -= mid[1];
    P[k + 2] -= mid[2];
    R = Math.max(R, Math.hypot(P[k], P[k + 1], P[k + 2]));
  }
  for (let k = 0; k < N * 3; k++) P[k] /= R;
  const geo = { P, Nn };
  cache.set(i, geo);
  return geo;
}

const hex = (s: string): Vec => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [n >> 16, (n >> 8) & 255, n & 255];
};

export function createStipple(canvas: HTMLCanvasElement, opts: { onModel?: (index: number) => void }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const K2 = 4; // 相机到原点的距离
  const LIGHT = unit([-0.5, 0.6, -0.65]); // 从观察者左上方打光
  const IDLE = -0.0045; // 每帧自转的弧度
  const AUTO_NEXT = 16000;

  // 转台式旋转：M = Rx(tilt) · Ry(spin)，模型永远绕自己的对称轴转，不会翻到看不懂的角度
  let spin = 0.6;
  let tiltBase = MODELS[0].tilt;
  let tiltFrom = tiltBase;
  let tiltDrag = 0; // 竖直拖动带来的额外俯仰，松手后慢慢回弹
  const matrix = () => {
    const t = Math.max(-1.45, Math.min(1.45, tiltBase + tiltDrag));
    const cx = Math.cos(t), sx = Math.sin(t), cy = Math.cos(spin), sy = Math.sin(spin);
    return [cy, 0, sy, sx * sy, cx, -sx * cy, -cx * sy, sx, cx * cy];
  };

  let current = 0;
  const P = new Float32Array(N * 3);
  const Nn = new Float32Array(N * 3);
  let from: Geo | null = null;
  let to: Geo = geometry(0);
  let morph = 1;
  P.set(to.P);
  Nn.set(to.Nn);

  // ---------- 画布：按设备像素建一张 ImageData，点直接写进去 ----------
  let W = 0;
  let dot = 1; // 一个点占几个设备像素
  let cell = 4; // 深度图一格的边长（设备像素）
  let G = 0;
  let img: ImageData | null = null;
  let px = new Uint32Array(0);
  let zbuf = new Float32Array(0);
  const SX = new Int16Array(N);
  const SY = new Int16Array(N);
  const SZ = new Float32Array(N);
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

  let AMBIENT = 0.2; // 背光面的最低浓度
  let ink: Vec = [255, 255, 255];
  let glow: Vec = [255, 255, 255];
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    ink = hex(cs.getPropertyValue('--fg'));
    glow = hex(cs.getPropertyValue('--accent'));
    // 深色底上的点要更亮一些才立得住；浅色底上墨点本身就够重
    AMBIENT = document.documentElement.dataset.theme === 'light' ? 0.1 : 0.26;
  };

  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    if (!w || w === W) return;
    W = w;
    canvas.width = canvas.height = W;
    img = ctx.createImageData(W, W);
    px = new Uint32Array(img.data.buffer);
    dot = dpr >= 1.5 ? 2 : 1;
    cell = Math.max(3, Math.round(W / 150));
    G = Math.ceil(W / cell);
    zbuf = new Float32Array(G * G);
  };

  const render = () => {
    if (!img) return;
    px.fill(0);
    zbuf.fill(0);
    const K1 = W * K2 * 0.46; // 单位球内的点投影后刚好不出界
    const half = W / 2;
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix();

    // 第一遍：投影，并记下每个格子里离相机最近的深度
    for (let i = 0, k = 0; i < N; i++, k += 3) {
      const x0 = P[k], y0 = P[k + 1], z0 = P[k + 2];
      const ooz = 1 / (K2 + m6 * x0 + m7 * y0 + m8 * z0);
      const x = (half + K1 * ooz * (m0 * x0 + m1 * y0 + m2 * z0)) | 0;
      const y = (half - K1 * ooz * (m3 * x0 + m4 * y0 + m5 * z0)) | 0;
      SX[i] = x;
      SY[i] = y;
      SZ[i] = ooz;
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const c = ((x / cell) | 0) + ((y / cell) | 0) * G;
      if (ooz > zbuf[c]) zbuf[c] = ooz;
    }

    // 第二遍：只画没被挡住的点
    const [ir, ig, ib] = ink;
    const [gr, gg, gb] = glow;
    for (let i = 0, k = 0; i < N; i++, k += 3) {
      const x = SX[i], y = SY[i], ooz = SZ[i];
      if (x < 0 || y < 0 || x > W - dot || y > W - dot) continue;
      const a = Nn[k], b = Nn[k + 1], c = Nn[k + 2];
      let nx = m0 * a + m1 * b + m2 * c;
      let ny = m3 * a + m4 * b + m5 * c;
      let nz = m6 * a + m7 * b + m8 * c;
      if (nz > 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      // 曲面越是侧对相机，同一格里的深度差越大，容差要跟着放宽，否则边缘会被一格一格地啃掉
      const cz = -nz / len;
      const slope = Math.sqrt(Math.max(0, 1 - cz * cz)) / Math.max(0.06, cz);
      const tol = 0.003 + Math.min(0.03, (cell / K1) * ooz * slope);
      if (ooz < zbuf[((x / cell) | 0) + ((y / cell) | 0) * G] - tol) continue;
      const L = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / len);
      // 近处实、远处虚；暗部带一点主色，亮部回到前景色
      const depth = 0.55 + 0.45 * Math.min(1, Math.max(0, (ooz - 0.2) * 7.5));
      const alpha = (AMBIENT + (1 - AMBIENT) * Math.pow(L, 1.4)) * depth;
      const t = Math.min(1, L * 1.1);
      const r = gr + (ir - gr) * t, g = gg + (ig - gg) * t, bl = gb + (ib - gb) * t;
      const A = (alpha * 255) | 0;
      const color = little ? ((A << 24) | (bl << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (bl << 8) | A) >>> 0;
      const o = x + y * W;
      px[o] = color;
      if (dot === 2) px[o + 1] = px[o + W] = px[o + W + 1] = color;
    }
    ctx.putImageData(img, 0, 0);
  };

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const stepMorph = (dt: number) => {
    if (!from) return;
    morph = Math.min(1, morph + dt / 80);
    const e = ease(morph);
    tiltBase = tiltFrom + (MODELS[current].tilt - tiltFrom) * e;
    const fP = from.P, tP = to.P, fN = from.Nn, tN = to.Nn;
    for (let k = 0; k < N * 3; k++) {
      P[k] = fP[k] + (tP[k] - fP[k]) * e;
      Nn[k] = fN[k] + (tN[k] - fN[k]) * e;
    }
    if (morph >= 1) from = null;
  };

  let lastInteraction = performance.now();
  const next = () => {
    current = (current + 1) % MODELS.length;
    opts.onModel?.(current);
    // 从“当前画面”出发变形，切换途中再点也是连续的
    from = { P: P.slice(), Nn: Nn.slice() };
    tiltFrom = tiltBase;
    to = geometry(current);
    morph = 0;
    lastInteraction = performance.now();
    if (reduce) {
      stepMorph(Infinity);
      render();
    }
  };

  // ---------- 拖动：水平拨动转台（带惯性），竖直调俯仰（松手回弹）；点一下换模型 ----------
  let v = IDLE;
  let drag: { x: number; y: number; moved: number } | null = null;
  const perPx = () => Math.PI / Math.max(240, canvas.clientWidth);

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
    v = 0;
    lastInteraction = performance.now();
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    const k = perPx();
    spin -= dx * k;
    tiltDrag = Math.max(-1.45 - tiltBase, Math.min(1.45 - tiltBase, tiltDrag - dy * k));
    v = v * 0.3 - dx * k * 0.7;
    lastInteraction = performance.now();
    if (reduce) render();
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const click = e.type === 'pointerup' && drag.moved < 6;
    drag = null;
    canvas.classList.remove('dragging');
    v = Math.max(-0.25, Math.min(0.25, v));
    if (click) next();
  };

  let raf = 0;
  let visible = true;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(3, (now - last) / 16.667);
    last = now;
    if (!drag) {
      spin += v * dt;
      // 甩出去的速度慢慢回落到默认自转，俯仰在松手一会儿后回弹
      v += (IDLE - v) * (1 - Math.pow(0.97, dt));
      if (now - lastInteraction > 1200) tiltDrag *= Math.pow(0.96, dt);
      if (now - lastInteraction > AUTO_NEXT) next();
    } else {
      v *= Math.pow(0.7, dt);
    }
    stepMorph(dt);
    render();
    if (visible && !document.hidden) raf = requestAnimationFrame(loop);
  };
  const start = () => {
    cancelAnimationFrame(raf);
    if (!reduce && visible && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  const redraw = () => {
    fit();
    readColors();
    render();
  };

  redraw();
  // 其余模型趁空闲时预先算好，切换时就不会卡一下
  let alive = true;
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb) : setTimeout(cb, 300));
  const warm = (i: number) => {
    if (!alive || i >= MODELS.length) return;
    geometry(i);
    idle(() => warm(i + 1));
  };
  idle(() => warm(1));
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('resize', redraw);
  // 切换明暗主题后重新取色
  const themeWatch = new MutationObserver(redraw);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    start();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', start);

  return {
    next,
    refresh: redraw,
    setScroll(_p: number) {},
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      themeWatch.disconnect();
      window.removeEventListener('resize', redraw);
      document.removeEventListener('visibilitychange', start);
    },
  };
}
