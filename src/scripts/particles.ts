// ============================================================
//  首页的粒子雕塑：手写 WebGL2，没有用任何三维库。
//
//  - 形状：参数曲面直接在顶点着色器里求值，用 transform feedback 把每个模型“烘焙”成一份
//    目标位置 + 法线（每个模型只画一次，之后一直复用）
//  - 物理：每个粒子的位置和速度都存在显存里，每帧用 transform feedback 积分一步：
//    弹簧把它拉向目标点，无散流场让它微微浮动，鼠标射线把它推开并卷成涡旋
//  - 绘制：先用放大的圆片写一遍深度（把背面的粒子挡掉），再画真正的小圆点；
//    深色主题用加色混合（密的地方会发光），浅色主题用普通混合（像墨点）
//  - 切换模型只是把“目标”从 A 换成 B，粒子带着各自的延迟飞过去，不需要逐点插值
// ============================================================
import { MODELS, bounds, unit, type Vec } from './surfaces';

/** 和 surfaces.ts 里 MODELS 一一对应的 GLSL 实现，顺序必须一致 */
const SURFACES = /* glsl */ `
const float TAU = 6.283185307179586;

vec3 knot(float t) {
  float r = 2.0 + cos(3.0 * t);
  return vec3(r * cos(2.0 * t), sin(3.0 * t), r * sin(2.0 * t));
}
vec3 ring(int k, float t) {
  float c = cos(t), s = sin(t) * 0.55;
  return k == 0 ? vec3(c, s, 0.0) : k == 1 ? vec3(0.0, c, s) : vec3(s, 0.0, c);
}
vec3 curve(int id, float t) {
  return id == 0 ? knot(t) : ring(id - 1, t);
}
// 沿空间曲线包一根半径为 r 的管子（Frenet 标架）
vec3 tube(int id, float u, float v, float r) {
  float t = u * TAU;
  const float e = 0.01;
  vec3 p = curve(id, t), a = curve(id, t - e), b = curve(id, t + e);
  vec3 T = normalize(b - a);
  vec3 B = normalize(cross(T, a + b - 2.0 * p));
  vec3 N = cross(B, T);
  float ph = v * TAU;
  return p + r * (cos(ph) * N + sin(ph) * B);
}
vec3 mobius(vec2 q) {
  float t = q.x * TAU;
  float s = (q.y - 0.5) * 0.8;
  float r = 1.0 + s * cos(t * 0.5);
  return vec3(r * cos(t), s * sin(t * 0.5), r * sin(t));
}
vec3 klein(vec2 q) {
  float u = q.x * 3.141592653589793, v = q.y * TAU;
  float cu = cos(u), su = sin(u), cv = cos(v), sv = sin(v);
  float c2 = cu * cu, c3 = c2 * cu, c4 = c2 * c2, c5 = c4 * cu, c6 = c4 * c2, c7 = c6 * cu;
  float x = (-2.0 / 15.0) * cu * (3.0 * cv - 30.0 * su + 90.0 * c4 * su - 60.0 * c6 * su + 5.0 * cu * cv * su);
  float y = (-1.0 / 15.0) * su * (3.0 * cv - 3.0 * c2 * cv - 48.0 * c4 * cv + 48.0 * c6 * cv - 60.0 * su
    + 5.0 * cu * cv * su - 5.0 * c3 * cv * su - 80.0 * c5 * cv * su + 80.0 * c7 * cv * su);
  float z = (2.0 / 15.0) * (3.0 + 5.0 * cu * su) * sv;
  return vec3(x, y, z);
}
vec3 surface(int m, vec2 q) {
  if (m == 0) return tube(0, q.x, q.y, 0.42);
  if (m == 1) return mobius(q);
  if (m == 2) return klein(q);
  float k = min(2.0, floor(q.x * 3.0));
  return tube(1 + int(k), q.x * 3.0 - k, q.y, 0.13);
}
`;

// 烘焙：每个粒子拿着自己的 (u, v)，算出它在这个模型上的位置和法线
const BAKE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 4) in vec4 aSeed;
uniform int uModel;
uniform vec4 uNorm; // xyz = 中心，w = 1 / 半径
out vec3 oPos;
out vec3 oNrm;
${SURFACES}
void main() {
  vec2 q = aSeed.xy;
  const float e = 0.002;
  oPos = (surface(uModel, q) - uNorm.xyz) * uNorm.w;
  vec3 n = cross(
    surface(uModel, q + vec2(e, 0.0)) - surface(uModel, q - vec2(e, 0.0)),
    surface(uModel, q + vec2(0.0, e)) - surface(uModel, q - vec2(0.0, e))
  );
  float l = length(n);
  oNrm = l > 1e-9 ? n / l : vec3(0.0, 1.0, 0.0);
}`;

// 物理：一步半隐式欧拉。输入是上一帧的状态，输出写进另一块缓冲（ping-pong）
const UPDATE_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aVel;
layout(location = 2) in vec3 aTA;
layout(location = 3) in vec3 aTB;
layout(location = 4) in vec4 aSeed;
uniform mat3 uRot;
uniform float uMix;     // 形变进度 0 → 1
uniform float uDt;
uniform float uTime;
uniform float uScatter; // 页面往下滚时把雕塑吹散
uniform float uSnap;    // 减弱动效时直接贴到目标上，不做物理
uniform vec3 uRayO;
uniform vec3 uRayD;
uniform float uPush;
uniform float uBurst;   // 点击的一瞬间从射线处炸开的冲击波
uniform float uCalm;    // 画得很大时（比如整屏的字）把浮动压小，免得笔画发虚
out vec3 oPos;
out vec3 oVel;

// ABC 流：每个分量都不依赖自己那一维，所以散度恒为零，粒子不会被它挤成一团
vec3 flow(vec3 p, float t) {
  return vec3(
    sin(p.y * 2.3 + t) + cos(p.z * 1.7 - t * 0.7),
    sin(p.z * 2.3 + t * 1.1) + cos(p.x * 1.7 + t * 0.6),
    sin(p.x * 2.3 - t * 0.9) + cos(p.y * 1.7 + t * 0.8)
  );
}

void main() {
  // 每个粒子出发的时间不一样，整体看起来像一股水流过去，而不是所有点同时平移
  float delay = aSeed.z * 0.55;
  float m = smoothstep(delay, delay + 0.45, uMix);
  vec3 target = uRot * mix(aTA, aTB, m);
  vec3 away = normalize(target + (aSeed.wzw - 0.5) * 0.9 + 1e-4);
  target += away * uScatter * (0.4 + 2.2 * aSeed.w);

  if (uSnap > 0.5) {
    oPos = target;
    oVel = vec3(0.0);
    return;
  }

  float busy = sin(m * 3.14159265);
  vec3 acc = (target - aPos) * 46.0;
  acc += flow(aPos * 1.6 + aSeed.z, uTime * 0.6) * (0.5 * uCalm + 10.0 * busy + 4.0 * uScatter);

  // 鼠标：离射线越近推得越狠，同时绕着射线打旋
  vec3 rel = aPos - uRayO;
  vec3 perp = rel - dot(rel, uRayD) * uRayD;
  float f = uPush * exp(-dot(perp, perp) / 0.045);
  acc += (normalize(perp + 1e-4) * 26.0 + cross(uRayD, perp) * 90.0) * f;
  acc += normalize(perp + 1e-4) * uBurst * 170.0 * exp(-dot(perp, perp) / 0.3);

  vec3 vel = (aVel + acc * uDt) * exp(-7.5 * uDt);
  oVel = vel;
  oPos = aPos + vel * uDt;
}`;

const RENDER_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aVel;
layout(location = 2) in vec3 aNA;
layout(location = 3) in vec3 aNB;
layout(location = 4) in vec4 aSeed;
uniform mat3 uRot;
uniform float uMix;
uniform vec2 uCenter; // 雕塑中心（NDC）
uniform vec2 uScale;
uniform float uCam;   // 相机到原点的距离
uniform float uSize;  // 圆点直径（设备像素）
uniform float uBias;
uniform float uAmbient;
uniform float uHalo;  // 1 = 光晕通道：只画大而淡的圆
uniform vec3 uLight;
out float vAlpha;
out float vLit;
out float vHue;
out float vEnergy;
out float vAccent;
out float vPaper;

void main() {
  // 相机在 z = -uCam 处朝 +z 看；中心偏移乘了 w，所以雕塑挪到画面一侧也不会被透视拉歪
  float w = uCam + aPos.z;
  if (w < 0.7) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  gl_Position = vec4(aPos.xy * uScale + uCenter * w, (aPos.z / 6.0 - uBias) * w, w);

  float delay = aSeed.z * 0.55;
  float m = smoothstep(delay, delay + 0.45, uMix);
  // 法线长度是标记：0.5 = 用主色的强调文字，2 = 用前景色的普通文字，1 = 曲面
  float la = length(aNA), lb = length(aNB);
  vAccent = mix(step(la, 0.75), step(lb, 0.75), m);
  vPaper = mix(step(1.5, la), step(1.5, lb), m);
  vec3 n = uRot * normalize(mix(normalize(aNA + 1e-5), normalize(aNB + 1e-5), m) + 1e-5);
  if (n.z > 0.0) n = -n; // 双面光照
  float lit = max(dot(n, uLight), 0.0);
  float depth = 0.5 + 0.5 * smoothstep(1.0, -1.0, aPos.z);
  vLit = lit;
  vHue = aSeed.z;
  // 跑得快的粒子更亮、偏向高光色：被搅动或正在形变的地方会“亮起来”
  vEnergy = clamp(length(aVel) * 0.5, 0.0, 1.0);
  vAlpha = mix((uAmbient + (1.0 - uAmbient) * pow(lit, 1.4)) * depth * (0.75 + 0.5 * aSeed.w), 0.35 + 0.65 * lit, uHalo);
  gl_PointSize = uSize * (uCam / w);
}`;

// 深度预通道：放大的圆片，中心最近、越往边缘越深，这样斜面上相邻的粒子不会互相挡掉
const DEPTH_FS = /* glsl */ `#version 300 es
precision highp float;
uniform float uEdge;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r2 = dot(q, q);
  if (r2 > 0.25) discard;
  gl_FragDepth = gl_FragCoord.z + uEdge * r2 * 4.0;
  o = vec4(0.0);
}`;

const COLOR_FS = /* glsl */ `#version 300 es
precision highp float;
in float vAlpha;
in float vLit;
in float vHue;
in float vEnergy;
in float vAccent;
in float vPaper;
uniform vec3 uInk;
uniform vec3 uGlow;
uniform vec3 uTint;
uniform vec3 uHot;
uniform float uHalo;
uniform float uGain;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r2 = dot(q, q);
  // 暗部是主色（每个粒子再往副色偏一点，整体有点虹彩），亮部回到前景色
  vec3 base = mix(uGlow, uTint, vHue * vHue * 0.7);
  if (uHalo > 0.5) {
    float h = max(0.0, 1.0 - r2 * 4.0);
    float a = h * h * vAlpha * uGain;
    vec3 hc = mix(mix(base, uInk, vPaper * 0.5), uGlow, vAccent);
    o = vec4(hc * a, a);
    return;
  }
  float a = min(1.0, smoothstep(0.25, 0.03, r2) * vAlpha * uGain * (1.0 + 1.2 * vEnergy));
  vec3 c = mix(base, uInk, smoothstep(0.25, 0.95, vLit));
  // 文字不看光照决定颜色：普通段落是前景色，强调段落是主色（光照只影响浓淡）
  c = mix(mix(c, uInk, vPaper), uGlow, vAccent);
  c = mix(c, uHot, vEnergy * 0.75 * (1.0 - vAccent));
  o = vec4(c * a, a); // 预乘 alpha
}`;

const NULL_FS = /* glsl */ `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`;

export interface Layout {
  /** 雕塑中心，相对画布左上角（CSS 像素） */
  x: number;
  y: number;
  /** 单位球半径对应的 CSS 像素 */
  r: number;
}

/** 一段文字：可以单独设成斜体、单独用主色 */
export type Run = { text: string; italic?: boolean; accent?: boolean };

/**
 * 粒子要拼成的目标：一个参数曲面（surfaces.ts 里的序号），或者几行文字（每行由若干段组成）。
 * flat = 只有正面能看的形状（文字），不做转台自转，只左右轻轻摆动。
 */
export type Target = {
  tilt: number;
  flat?: boolean;
  /** flat 目标左右摆动的幅度（弧度），默认 0.32。画得很宽的字要小一点，不然会被透视拉歪 */
  sway?: number;
} & ({ surface: number } | { lines: Run[][] });

export interface ParticleOptions {
  count: number;
  /** 不传就是全部曲面轮播 */
  targets?: Target[];
  /** 隔一阵自动换下一个目标（默认开）。由滚动驱动时关掉 */
  auto?: boolean;
  /** 点击切换到下一个目标（默认开）。关掉后点击只触发冲击波 */
  clickNext?: boolean;
  /** false = 不做自适应降画质（调试 / 截图用） */
  adaptive?: boolean;
  /** 每帧调用。still 为 true 表示这是一张静态帧：有过渡动画的话请直接给终点 */
  layout: (still: boolean) => Layout;
  onModel?: (index: number) => void;
  onStats?: (stats: { fps: number; count: number }) => void;
}

export interface Sculpture {
  next(): void;
  /** 形变到第 i 个目标 */
  goto(i: number): void;
  refresh(): void;
  setScroll(p: number): void;
  destroy(): void;
}

const K2 = 4;
const LIGHT = unit([-0.5, 0.6, -0.65]);
const IDLE = -0.27; // 自转角速度（弧度 / 秒）
const AUTO_NEXT = 16;
const MORPH_SECONDS = 2.4;
// 自适应画质
const WARM_UP = 1500; // 开头这段时间不算：着色器编译、字体光栅化都在这时候
const FLOOR = 24000; // 粒子数最少降到这里
const STILL_COUNT = 60000; // 静态帧用的粒子数

const TAU = Math.PI * 2;

/**
 * 把几行文字变成 n 个粒子的目标：[位置, 法线] × n，外加它在单位坐标里占的面积（用来决定粒子画多大）。
 * 字画在离屏 canvas 上，从有墨的像素里均匀抽样；再用一份模糊过的副本求梯度当法线，
 * 笔画边缘的法线会向外倒，打上光就有了浮雕的立体感。只在准备阶段跑一次，不占每帧的开销。
 * 法线的长度被借来当标记（着色器里归一化之前先读它）：2 = 普通文字，用前景色；0.5 = 强调段落，用主色。
 * 曲面的法线长度是 1，颜色由光照决定。
 */
async function rasterize(lines: Run[][], n: number): Promise<{ data: Float32Array; area: number } | null> {
  const font = (run: Run, px: number) => `${run.italic ? 'italic ' : ''}400 ${px}px "Instrument Serif", "Songti SC", "Noto Serif SC", serif`;
  try {
    await Promise.all(lines.flat().map((r) => document.fonts.load(font(r, 200), r.text)));
  } catch {}
  const W = 1600, H = 640, PAD = 64, LEADING = 0.86;
  const sharpCanvas = document.createElement('canvas');
  sharpCanvas.width = W;
  sharpCanvas.height = H;
  const ctx = sharpCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const advance = (line: Run[], px: number) =>
    line.reduce((w, r) => {
      ctx.font = font(r, px);
      return w + ctx.measureText(r.text).width;
    }, 0);
  // 先按 100px 量一遍，再放大到刚好塞进画布
  const widest = Math.max(...lines.map((l) => advance(l, 100)));
  const px = 100 * Math.min((W - PAD * 2) / widest, (H - PAD * 2) / (100 * LEADING * lines.length + 20));
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    let x = (W - advance(line, px)) / 2;
    const y = H / 2 + px * LEADING * (i - (lines.length - 1) / 2) + px * 0.33;
    for (const r of line) {
      ctx.font = font(r, px);
      // 红色通道当标记：需要用主色的段落画成 (0, 255, 255)
      ctx.fillStyle = r.accent ? '#0ff' : '#fff';
      ctx.fillText(r.text, x, y);
      x += ctx.measureText(r.text).width;
    }
  });
  const sharp = ctx.getImageData(0, 0, W, H).data;

  const softCanvas = document.createElement('canvas');
  softCanvas.width = W;
  softCanvas.height = H;
  const sctx = softCanvas.getContext('2d', { willReadFrequently: true })!;
  sctx.filter = 'blur(6px)';
  sctx.drawImage(sharpCanvas, 0, 0);
  const soft = sctx.getImageData(0, 0, W, H).data;

  const filled: number[] = [];
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (sharp[(y * W + x) * 4 + 3] < 128) continue;
      filled.push(y * W + x);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!filled.length) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const scale = 0.97 / Math.max((x1 - x0) / 2, (y1 - y0) / 2);
  const alpha = (x: number, y: number) => soft[(Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))) * 4 + 3] / 255;

  const data = new Float32Array(n * 6);
  let s = 404;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < n; i++) {
    // 黄金分割步进：任意前缀在整行字上都是均匀的，降画质时少画一些也不会缺笔画
    const k = filled[Math.floor(((0.5 + i * 0.6180339887498949) % 1) * filled.length)];
    const x = k % W, y = (k / W) | 0;
    const gx = alpha(x + 2, y) - alpha(x - 2, y), gy = alpha(x, y + 2) - alpha(x, y - 2);
    const nx = -gx * 3, ny = gy * 3, nz = -1;
    const l = Math.hypot(nx, ny, nz) * (sharp[k * 4] < 128 ? 2 : 0.5);
    const o = i * 6;
    data[o] = (x + rnd() - cx) * scale;
    data[o + 1] = -(y + rnd() - cy) * scale;
    // 有一点厚度，笔画中间略微鼓向镜头
    data[o + 2] = (rnd() - 0.5) * 0.06 - alpha(x, y) * 0.05;
    data[o + 3] = nx / l;
    data[o + 4] = ny / l;
    data[o + 5] = nz / l;
  }
  return { data, area: filled.length * scale * scale };
}

const hex = (s: string): Vec => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function createSculpture(canvas: HTMLCanvasElement, opts: ParticleOptions): Sculpture | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  // 静态模式：不跑物理和动画，粒子直接贴在目标上，只在需要时重画一帧。
  // 两种情况会进来：用户要求减弱动效；或者画质降到底还是跑不动（比如没有硬件加速、WebGL 走软件渲染）
  let still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = opts.count;
  const targets: Target[] = opts.targets ?? MODELS.map((m, i) => ({ surface: i, tilt: m.tilt }));
  const norms = new Map<number, ReturnType<typeof bounds>>();
  const norm = (i: number) => norms.get(i) ?? norms.set(i, bounds(MODELS[i].f)).get(i)!;
  // 文字目标要等字体加载、离屏绘制完才有数据；在那之前先让粒子保持一团散开的云
  const textData: (Float32Array | null)[] = targets.map(() => null);
  // 每个目标在单位坐标里的表面积：曲面大约是 3，文字小得多。粒子的大小按“面积 / 粒子数”来定
  const areas: number[] = targets.map(() => 3);
  const ready = (i: number) => 'surface' in targets[i] || !!textData[i];

  // ---------- 资源 ----------
  type Res = {
    bake: WebGLProgram;
    update: WebGLProgram;
    depth: WebGLProgram;
    color: WebGLProgram;
    seed: WebGLBuffer;
    state: [WebGLBuffer, WebGLBuffer];
    cloud: WebGLBuffer;
    baked: (WebGLBuffer | null)[];
    updateVao: [WebGLVertexArrayObject, WebGLVertexArrayObject];
    renderVao: [WebGLVertexArrayObject, WebGLVertexArrayObject];
    tf: WebGLTransformFeedback;
    u: Record<string, Record<string, WebGLUniformLocation | null>>;
  };
  let res: Res | null = null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
    return sh;
  };
  const program = (vs: string, fs: string, varyings?: string[]) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    if (varyings) gl.transformFeedbackVaryings(p, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return p;
  };
  const uniforms = (p: WebGLProgram) => {
    const out: Record<string, WebGLUniformLocation | null> = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i)!.name;
      out[name] = gl.getUniformLocation(p, name);
    }
    return out;
  };

  let modelA = 0;
  let modelB = 0;
  let cur = 0; // 当前状态在 state[cur] 里

  // 把模型 i 烘焙成一份 [位置, 法线] 缓冲（只在第一次用到时做）
  const bake = (i: number) => {
    const r = res!;
    if (r.baked[i]) return r.baked[i]!;
    const t = targets[i];
    const buf = gl.createBuffer()!;
    if ('lines' in t) {
      const data = textData[i];
      if (!data) return r.cloud;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      r.baked[i] = buf;
      return buf;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, N * 24, gl.STATIC_COPY);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.useProgram(r.bake);
    gl.uniform1i(r.u.bake.uModel, t.surface);
    const { center, radius } = norm(t.surface);
    gl.uniform4f(r.u.bake.uNorm, center[0], center[1], center[2], 1 / radius);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.seed);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, r.tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buf);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disableVertexAttribArray(4);
    r.baked[i] = buf;
    return buf;
  };

  // 把 A、B 两个模型的缓冲接到四个 VAO 上：物理要位置，绘制要法线
  const bindModels = () => {
    const r = res!;
    const a = bake(modelA);
    const b = bake(modelB);
    for (let i = 0; i < 2; i++) {
      for (const [vao, offset] of [[r.updateVao[i], 0], [r.renderVao[i], 12]] as const) {
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, a);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, offset);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 24, offset);
      }
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  };

  const init = () => {
    const bakeP = program(BAKE_VS, NULL_FS, ['oPos', 'oNrm']);
    const updateP = program(UPDATE_VS, NULL_FS, ['oPos', 'oVel']);
    const depthP = program(RENDER_VS, DEPTH_FS);
    const colorP = program(RENDER_VS, COLOR_FS);

    // 每个粒子的 (u, v) 用 R2 低差异序列：任意前缀都是均匀分布的，降画质时只画前 k 个就行
    const seed = new Float32Array(N * 4);
    const init = new Float32Array(N * 6);
    let s = 196;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < N; i++) {
      seed[i * 4] = (0.5 + i * 0.7548776662466927) % 1;
      seed[i * 4 + 1] = (0.5 + i * 0.5698402909980532) % 1;
      seed[i * 4 + 2] = rnd();
      seed[i * 4 + 3] = rnd();
      // 开场：粒子从一团散开的云里聚拢成形
      const th = rnd() * Math.PI * 2, z = rnd() * 2 - 1, rad = 1.6 + rnd() * 1.6, q = Math.sqrt(1 - z * z);
      init[i * 6] = Math.cos(th) * q * rad;
      init[i * 6 + 1] = Math.sin(th) * q * rad * 0.7;
      init[i * 6 + 2] = z * rad * 0.5;
    }
    const seedBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seed, gl.STATIC_DRAW);
    const state = [gl.createBuffer()!, gl.createBuffer()!] as [WebGLBuffer, WebGLBuffer];
    for (const b of state) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
    }
    // 同一份“散开的云”也当作一个目标：文字还没准备好时粒子就先待在这里
    const cloud = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, cloud);
    gl.bufferData(gl.ARRAY_BUFFER, init, gl.STATIC_DRAW);

    const vao = (stateBuf: WebGLBuffer, withVel: boolean) => {
      const v = gl.createVertexArray()!;
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      if (withVel) {
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
      return v;
    };
    res = {
      bake: bakeP,
      update: updateP,
      depth: depthP,
      color: colorP,
      seed: seedBuf,
      state,
      cloud,
      baked: targets.map(() => null),
      updateVao: [vao(state[0], true), vao(state[1], true)],
      renderVao: [vao(state[0], true), vao(state[1], true)],
      tf: gl.createTransformFeedback()!,
      u: { bake: uniforms(bakeP), update: uniforms(updateP), depth: uniforms(depthP), color: uniforms(colorP) },
    };
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    cur = 0;
    bindModels();
  };

  // ---------- 状态 ----------
  let W = 0, H = 0, dpr = 1;
  let layout: Layout = { x: 0, y: 0, r: 100 };
  let drawCount = N;
  let dprCap = 2;
  let ink: Vec = [1, 1, 1];
  let glow: Vec = [1, 1, 1];
  let tint: Vec = [1, 1, 1];
  let light = false;

  let spin = targets[0].flat ? 0 : 0.6;
  let tilt = targets[0].tilt;
  let tiltFrom = tilt;
  let tiltDrag = 0;
  let spinVel = IDLE;
  let mix = 0;
  let morphing = false;
  let scatter = 0;
  let time = 0;
  let idleFor = 0;

  const ray = { ox: 0, oy: 0, oz: -K2, dx: 0, dy: 0, dz: 1 };
  let push = 0; // 当前推力（平滑后）
  let pushTarget = 0;
  let burst = 0;

  const fit = () => {
    dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w !== W || h !== H) {
      W = canvas.width = w;
      H = canvas.height = h;
    }
    layout = opts.layout(still);
  };
  // 布局每帧都问一次调用方（调用方自己保证便宜）：雕塑可以在画面里平滑地挪位置、变大小
  const place = () => (layout = opts.layout(still));
  const colors = () => {
    const cs = getComputedStyle(document.documentElement);
    ink = hex(cs.getPropertyValue('--fg'));
    glow = hex(cs.getPropertyValue('--accent'));
    light = document.documentElement.dataset.theme === 'light';
    tint = light ? [0.1, 0.25, 0.55] : [0.42, 0.6, 1];
  };

  const rotation = () => {
    const t = Math.max(-1.45, Math.min(1.45, tilt + tiltDrag));
    const cx = Math.cos(t), sx = Math.sin(t), cy = Math.cos(spin), sy = Math.sin(spin);
    // M = Rx(tilt) · Ry(spin)，按列主序交给 GLSL
    return [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
  };

  const step = (dt: number, snap: boolean) => {
    const r = res!;
    const u = r.u.update;
    gl.useProgram(r.update);
    gl.uniformMatrix3fv(u.uRot, false, rotation());
    gl.uniform1f(u.uMix, mix);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uScatter, scatter);
    gl.uniform1f(u.uSnap, snap ? 1 : 0);
    gl.uniform3f(u.uRayO, ray.ox, ray.oy, ray.oz);
    gl.uniform3f(u.uRayD, ray.dx, ray.dy, ray.dz);
    gl.uniform1f(u.uPush, push);
    gl.uniform1f(u.uBurst, burst);
    gl.uniform1f(u.uCalm, Math.max(0.2, Math.min(1, 300 / layout.r)));
    gl.bindVertexArray(r.updateVao[cur]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, r.tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, r.state[1 - cur]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    // 降过画质之后，不画的粒子也不用算
    gl.drawArrays(gl.POINTS, 0, drawCount);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    cur = 1 - cur;
  };

  const draw = () => {
    const r = res!;
    const R = layout.r * dpr;
    const sx = (2 * K2 * R) / W, sy = (2 * K2 * R) / H;
    const cx = ((layout.x * dpr) / W) * 2 - 1, cy = 1 - ((layout.y * dpr) / H) * 2;
    const rot = rotation();
    // 粒子之间的平均间距，决定圆点和深度圆片各画多大
    const e = morphing ? mix : 0;
    const area = areas[modelA] + (areas[modelB] - areas[modelA]) * e;
    const gap = R * Math.sqrt(area / drawCount);
    const size = Math.max(1.2 * dpr, Math.min(3.2 * dpr, gap * 0.95));
    const splat = Math.max(4, Math.min(22, gap * 3.2));
    // 粒子挤得比一个像素还密的时候（整屏的字）调暗一点，不然会糊成一片白
    const dense = Math.max(0.3, Math.min(1, gap / (1.3 * dpr)));
    // 形状的“体量”：曲面是 1，笔画很细的文字接近 0
    const bulk = Math.sqrt(Math.min(1, area / 3));

    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(r.renderVao[cur]);

    const common = (u: Record<string, WebGLUniformLocation | null>, pointSize: number, bias: number, halo = 0) => {
      gl.uniform1f(u.uHalo, halo);
      gl.uniformMatrix3fv(u.uRot, false, rot);
      gl.uniform1f(u.uMix, mix);
      gl.uniform2f(u.uCenter, cx, cy);
      gl.uniform2f(u.uScale, sx, sy);
      gl.uniform1f(u.uCam, K2);
      gl.uniform1f(u.uSize, pointSize);
      gl.uniform1f(u.uBias, bias);
      gl.uniform1f(u.uAmbient, light ? 0.12 : 0.2);
      gl.uniform3f(u.uLight, LIGHT[0], LIGHT[1], LIGHT[2]);
    };

    // 1. 只写深度
    gl.useProgram(r.depth);
    common(r.u.depth, splat, 0);
    gl.uniform1f(r.u.depth.uEdge, 0.01);
    gl.colorMask(false, false, false, false);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.POINTS, 0, drawCount);

    // 2. 画点：比深度图靠前一点的才能通过
    gl.useProgram(r.color);
    common(r.u.color, size, 0.008);
    gl.uniform3f(r.u.color.uInk, ink[0], ink[1], ink[2]);
    gl.uniform3f(r.u.color.uGlow, glow[0], glow[1], glow[2]);
    gl.uniform3f(r.u.color.uTint, tint[0], tint[1], tint[2]);
    if (light) gl.uniform3f(r.u.color.uHot, glow[0], glow[1], glow[2]);
    else gl.uniform3f(r.u.color.uHot, 0.86, 0.98, 1);
    // 深色主题是加色混合，密了要压暗；浅色主题是墨点，文字反而要画浓一点才压得住纸面
    gl.uniform1f(r.u.color.uGain, light ? 1 + 1.1 * (1 - bulk) : 1.25 * dense);
    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    if (light) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, drawCount);

    // 3. 光晕（只在深色主题）：抽一小部分粒子画成又大又淡的圆，叠起来就是一圈柔光，
    //    比真正的后期 bloom 便宜得多
    if (!light) {
      // 数量要少、每个要够亮：画布只有 8 位，太淡的圆叠多少层都会被量化成 0
      const haloCount = Math.min(3000, Math.floor(drawCount / 10));
      // 光晕的大小跟着形状的“体量”走：整屏的字虽然画得大，笔画却很细，光晕要收小，不然字会发虚
      const haloSize = Math.max(10 * dpr, Math.min(R * 0.16 * bulk, 72 * dpr));
      common(r.u.color, haloSize, 0, 1);
      // 让叠出来的总亮度大致恒定，和粒子数、画布大小无关
      gl.uniform1f(r.u.color.uGain, Math.min(0.08, (3 * bulk * R * R) / (haloCount * haloSize * haloSize)) * (0.55 + 0.45 * bulk));
      gl.disable(gl.DEPTH_TEST);
      gl.drawArrays(gl.POINTS, 0, haloCount);
    }
    gl.bindVertexArray(null);
  };

  const next = () => {
    // 跳过还没准备好的文字目标
    const from = morphing ? modelB : modelA;
    let to = from;
    do to = (to + 1) % targets.length;
    while (to !== from && !ready(to));
    goto(to);
  };
  const goto = (to: number) => {
    if (!res || to < 0 || to >= targets.length || to === (morphing ? modelB : modelA)) return;
    if (morphing) {
      // 形变途中又换了目标：直接把出发点换成原来的终点再出发，粒子的位置是连续的（都在显存里），不会闪
      modelA = modelB;
      tilt = targets[modelA].tilt;
    }
    modelB = to;
    tiltFrom = tilt;
    mix = 0;
    morphing = true;
    idleFor = 0;
    bindModels();
    opts.onModel?.(modelB);
    if (still) {
      finishMorph();
      if (targets[modelA].flat) spin = Math.round(spin / TAU) * TAU;
      renderStatic();
    }
  };
  const finishMorph = () => {
    modelA = modelB;
    tilt = targets[modelA].tilt;
    mix = 0;
    morphing = false;
    bindModels();
  };

  // ---------- 指针 ----------
  let drag: { x: number; y: number; moved: number } | null = null;
  let lastPointer: { x: number; y: number; t: number } | null = null;

  const aim = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const R = layout.r;
    // 反推出穿过这个像素的视线（相机在 z = -K2）
    const dx = (clientX - rect.left - layout.x) / (K2 * R);
    const dy = -(clientY - rect.top - layout.y) / (K2 * R);
    const l = Math.hypot(dx, dy, 1);
    ray.dx = dx / l;
    ray.dy = dy / l;
    ray.dz = 1 / l;
  };
  const onMove = (e: PointerEvent) => {
    aim(e.clientX, e.clientY);
    const now = performance.now();
    if (lastPointer) {
      const speed = Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y) / Math.max(1, now - lastPointer.t);
      // 动得越快搅得越厉害；停下来就慢慢平息
      pushTarget = Math.min(1, pushTarget + speed * 0.35);
    }
    lastPointer = { x: e.clientX, y: e.clientY, t: now };
    if (!drag) return;
    const mx = e.clientX - drag.x, my = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(mx) + Math.abs(my);
    const k = Math.PI / Math.max(240, layout.r * 2);
    spin -= mx * k;
    tiltDrag = Math.max(-1.45 - tilt, Math.min(1.45 - tilt, tiltDrag - my * k));
    spinVel = spinVel * 0.3 - mx * k * 60 * 0.7;
    idleFor = 0;
    if (still) renderStatic();
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
    spinVel = 0;
    idleFor = 0;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    const click = e.type === 'pointerup' && drag.moved < 6;
    drag = null;
    canvas.classList.remove('dragging');
    spinVel = Math.max(-15, Math.min(15, spinVel));
    if (click) {
      burst = 1;
      if (opts.clickNext !== false) next();
    }
  };

  // ---------- 主循环 ----------
  let raf = 0;
  let last = 0;
  let visible = true;
  let fps = 60;
  let slowFrames = 0;
  let slowTime = 0;
  const born = performance.now();
  let frames = 0;
  let statsAt = 0;

  const frame = (now: number) => {
    raf = 0;
    if (!alive || !res) return;
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(1 / 30, Math.max(1 / 240, raw));
    time += dt;
    frames++;

    if (!drag) {
      if (targets[morphing ? modelB : modelA].flat) {
        // 文字：转回正面，然后只左右轻轻摆
        const want = Math.round(spin / TAU) * TAU + (targets[morphing ? modelB : modelA].sway ?? 0.32) * Math.sin(time * 0.6);
        spin += (want - spin) * (1 - Math.exp(-3 * dt));
        spinVel = 0;
      } else {
        spin += spinVel * dt;
        spinVel += (IDLE - spinVel) * (1 - Math.pow(0.16, dt));
      }
      idleFor += dt;
      if (idleFor > 1.2) tiltDrag *= Math.pow(0.09, dt);
      if (opts.auto !== false && idleFor > AUTO_NEXT && !morphing && scatter < 0.05 && targets.length > 1) next();
    } else {
      spinVel *= Math.pow(1e-9, dt);
    }
    if (morphing) {
      mix = Math.min(1, mix + dt / MORPH_SECONDS);
      const e = mix < 0.5 ? 4 * mix * mix * mix : 1 - Math.pow(-2 * mix + 2, 3) / 2;
      tilt = tiltFrom + (targets[modelB].tilt - tiltFrom) * e;
      if (mix >= 1) finishMorph();
    }
    push += (pushTarget - push) * (1 - Math.pow(0.001, dt));
    pushTarget *= Math.pow(0.02, dt);
    burst *= Math.pow(0.0004, dt);

    // 字体加载、图片撑开等原因会让占位格悄悄挪位置（尺寸没变，ResizeObserver 不会通知），每半秒对一次
    if (frames % 30 === 0) fit();
    else place();

    step(dt, false);
    draw();

    // 自适应画质：开场稳定后如果持续掉帧，先降像素比，再减粒子；降到底还不行就停下来，改成静态帧。
    // 按时间而不是按帧数累计：帧率越低，越应该早点反应，而不是等更久
    if (raw < 0.25) fps += (1 / raw - fps) * 0.05;
    if (opts.adaptive !== false && now - born > WARM_UP) {
      if (raw > 1 / 42) {
        slowTime += Math.min(raw, 0.25);
        slowFrames++;
      } else {
        slowTime = Math.max(0, slowTime - raw * 2);
        slowFrames = Math.max(0, slowFrames - 2);
      }
      if (slowTime > 1) {
        const average = slowFrames / slowTime;
        slowTime = slowFrames = 0;
        if (dpr <= 1 && drawCount <= FLOOR) {
          if (average < 24) freeze();
        } else if (average < 15) {
          // 差得太远，一步降到底
          dprCap = 1;
          drawCount = Math.min(drawCount, FLOOR);
          fit();
        } else if (dpr > 1) {
          dprCap = 1;
          fit();
        } else {
          drawCount = Math.max(FLOOR, Math.floor(drawCount * 0.6));
        }
      }
    }
    if (now - statsAt > 500) {
      statsAt = now;
      opts.onStats?.({ fps: Math.round(fps), count: drawCount });
    }
    schedule();
  };
  const schedule = () => {
    if (!raf && alive && res && !still && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const resume = () => {
    last = performance.now();
    schedule();
  };
  // 静态帧。拖动、滚动一帧里可能要求重画很多次，合并成一次
  let staticQueued = false;
  const renderStatic = () => {
    if (staticQueued) return;
    staticQueued = true;
    requestAnimationFrame(() => {
      staticQueued = false;
      if (!alive || !res) return;
      place();
      step(0, true);
      draw();
      opts.onStats?.({ fps: 0, count: drawCount });
    });
  };
  // 跑不动：停掉循环。既然不用每帧都画了，粒子数可以加回来一些，静态的画面更实
  const freeze = () => {
    still = true;
    drawCount = Math.min(N, STILL_COUNT);
    if (morphing) finishMorph();
    if (targets[modelA].flat) spin = Math.round(spin / TAU) * TAU;
    renderStatic();
  };

  const refresh = () => {
    fit();
    colors();
    if (still) renderStatic();
    else if (!raf && res) draw();
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
    res = null;
  };
  const onRestored = () => {
    try {
      init();
      refresh();
      resume();
    } catch {
      res = null;
    }
  };

  try {
    init();
  } catch (err) {
    console.warn('[sculpture] WebGL2 初始化失败，页面退回纯文字版本', err);
    return null;
  }

  // 文字目标在后台准备：好了以后如果它正是当前要显示的，粒子立刻朝它聚拢
  let alive = true;
  targets.forEach((t, i) => {
    if (!('lines' in t)) return;
    rasterize(t.lines, N).then((out) => {
      if (!out || !alive) return;
      textData[i] = out.data;
      areas[i] = out.area;
      if (res && (i === modelA || i === modelB)) {
        bindModels();
        if (still) renderStatic();
      }
    });
  });

  const hero = canvas.closest('section') ?? canvas;
  hero.addEventListener('pointermove', onMove as EventListener);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  window.addEventListener('resize', refresh);
  document.addEventListener('visibilitychange', resume);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  io.observe(canvas);

  refresh();
  resume();

  return {
    next,
    goto,
    refresh,
    setScroll(p: number) {
      scatter = Math.max(0, Math.min(1, p));
      if (still) renderStatic();
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      hero.removeEventListener('pointermove', onMove as EventListener);
      window.removeEventListener('resize', refresh);
      document.removeEventListener('visibilitychange', resume);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      // 主动释放上下文：站内跳转多次也不会把浏览器的 WebGL 上下文配额用光
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
