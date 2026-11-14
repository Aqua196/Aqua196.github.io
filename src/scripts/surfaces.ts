// 首页用到的参数曲面：每个模型是一个函数 f(u, v)，u、v ∈ [0, 1]。
// 真正画到屏幕上的版本在 GLSL 里（见 particles.ts 的 SURFACES，和这里一一对应）；
// 这份 JS 实现只用来粗采样、算出包围球，好把模型居中并缩放到单位球内。
// 改模型时两边要一起改，顺序也要一致。
export type Vec = [number, number, number];
// 约定：模型的对称轴是 y 轴，展示时绕它转（转台），tilt 是默认的俯视角
export type Model = { name: string; note: string; tilt: number; f: (u: number, v: number) => Vec };

export const TAU = Math.PI * 2;
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// 沿空间曲线 c(t) 包一根半径为 r 的管子（Frenet 标架）
const tube = (c: (t: number) => Vec, r: number) => (u: number, v: number): Vec => {
  const t = u * TAU;
  const e = 1e-3;
  const p = c(t), a = c(t - e), b = c(t + e);
  const T = unit(sub(b, a));
  const B = unit(cross(T, [a[0] + b[0] - 2 * p[0], a[1] + b[1] - 2 * p[1], a[2] + b[2] - 2 * p[2]]));
  const Nn = cross(B, T);
  const cp = Math.cos(v * TAU) * r, sp = Math.sin(v * TAU) * r;
  return [p[0] + cp * Nn[0] + sp * B[0], p[1] + cp * Nn[1] + sp * B[1], p[2] + cp * Nn[2] + sp * B[2]];
};

const ring = (p: (c: number, s: number) => Vec) => tube((t) => p(Math.cos(t), Math.sin(t)), 0.13);
const BORROMEAN = [
  ring((c, s) => [c, s * 0.55, 0]),
  ring((c, s) => [0, c, s * 0.55]),
  ring((c, s) => [s * 0.55, 0, c]),
];

export const MODELS: Model[] = [
  {
    name: 'trefoil knot',
    note: 'crossing number = 3',
    tilt: 1.0,
    // 写成 (2,3) 环面纽结：俯视是绕着中心孔的三瓣
    f: tube((t) => {
      const r = 2 + Math.cos(3 * t);
      return [r * Math.cos(2 * t), Math.sin(3 * t), r * Math.sin(2 * t)];
    }, 0.42),
  },
  {
    name: 'möbius strip',
    note: 'one side, one edge',
    tilt: 0.7,
    f: (u, v) => {
      const t = u * TAU;
      const s = (v - 0.5) * 0.8;
      const r = 1 + s * Math.cos(t / 2);
      return [r * Math.cos(t), s * Math.sin(t / 2), r * Math.sin(t)];
    },
  },
  {
    name: 'klein bottle',
    note: 'non-orientable, χ = 0',
    tilt: 0.25,
    f: (uu, vv) => {
      const u = uu * Math.PI, v = vv * TAU;
      const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
      const x = (-2 / 15) * cu * (3 * cv - 30 * su + 90 * cu ** 4 * su - 60 * cu ** 6 * su + 5 * cu * cv * su);
      const y =
        (-1 / 15) * su *
        (3 * cv - 3 * cu ** 2 * cv - 48 * cu ** 4 * cv + 48 * cu ** 6 * cv - 60 * su + 5 * cu * cv * su -
          5 * cu ** 3 * cv * su - 80 * cu ** 5 * cv * su + 80 * cu ** 7 * cv * su);
      const z = (2 / 15) * (3 + 5 * cu * su) * sv;
      return [x, y, z];
    },
  },
  {
    // 三个互相垂直的椭圆：整体扣在一起，但任意拿掉一个，剩下两个就散了
    name: 'borromean rings',
    note: 'no two rings are linked',
    tilt: 0.55,
    f: (u, v) => {
      const k = Math.min(2, Math.floor(u * 3));
      return BORROMEAN[k](u * 3 - k, v);
    },
  },
];

/** 粗采样估出模型的中心和半径，用来把它居中并缩放进单位球 */
export function bounds(f: Model['f'], n = 48): { center: Vec; radius: number } {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const pts: Vec[] = [];
  for (let a = 0; a < n * 4; a++) {
    for (let b = 0; b < n; b++) {
      const p = f((a + 0.5) / (n * 4), b / (n - 1));
      pts.push(p);
      for (let d = 0; d < 3; d++) {
        lo[d] = Math.min(lo[d], p[d]);
        hi[d] = Math.max(hi[d], p[d]);
      }
    }
  }
  const center = lo.map((l, d) => (l + hi[d]) / 2) as Vec;
  let radius = 0;
  for (const p of pts) radius = Math.max(radius, Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]));
  return { center, radius };
}
