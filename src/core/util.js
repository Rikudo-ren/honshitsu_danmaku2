export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** 角度差を -PI..PI に正規化 */
export const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** 角度を徐々に target へ寄せる (1フレーム分) */
export const rotateToward = (cur, target, maxStep) => {
  const d = angleDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
};

/** 距離の二乗 (平方根を避ける) */
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};

/** 値を毎フレーム減衰 (フレームレート非依存) */
export const damp = (cur, target, rate, dt) =>
  lerp(cur, target, 1 - Math.pow(1 - rate, dt * 60));

/** 0..1 の周期波 */
export const wave = (t, period, phase = 0) =>
  Math.sin(((t / period) + phase) * TAU);

/** 秒を mm:ss / ss 表記に */
export const fmtTime = (sec) => {
  sec = Math.max(0, sec);
  const s = Math.ceil(sec);
  return String(s).padStart(2, '0');
};

/** 3桁区切り */
export const fmtScore = (n) =>
  Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 度 -> ラジアン */
export const rad = (deg) => (deg * Math.PI) / 180;

/** 配列からランダムに1つ (rng は 0..1 を返す関数) */
export const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

/** イージング付きの数値列を作る (フェーズ内のタイムライン用) */
export function tween(from, to, dur, t, ease = smoothstep) {
  if (t <= 0) return from;
  if (t >= dur) return to;
  return lerp(from, to, ease(t / dur));
}
