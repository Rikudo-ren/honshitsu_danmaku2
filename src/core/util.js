/* =============================================================================
 * HONSHITSU — 本質
 * src/core/util.js — 数学・乱数・イージング・色 ユーティリティ
 * ========================================================================== */
'use strict';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const mod = (a, n) => ((a % n) + n) % n;

/** 角度差を [-PI, PI] に正規化 */
function angleDelta(a, b) { return mod(b - a + Math.PI, TAU) - Math.PI; }
/** 角度を目標へ最大 maxStep だけ近づける（ゆるやかな追尾用） */
function angleApproach(cur, target, maxStep) {
  const d = angleDelta(cur, target);
  return cur + clamp(d, -maxStep, maxStep);
}

/* ---------------------------------------------------------------- 乱数 ----- */
/** 再現可能な xorshift128 乱数。弾幕のリプレイ性・検証のためシード管理する。 */
class RNG {
  constructor(seed = 1) { this.seed(seed); }
  seed(s) { this.s = (s >>> 0) || 0x9e3779b9; return this; }
  /** [0,1) */
  next() {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  /** 中心寄りの分布（±1 を返す） */
  bell() { return (this.next() + this.next() + this.next()) / 1.5 - 1; }
}

/* ------------------------------------------------------------ イージング --- */
const ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => (t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: t => (t <= 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: t => {
    if (t === 0 || t === 1) return t;
    const c4 = TAU / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * c4) + 1;
  },
  outBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + .75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + .9375;
    return n1 * (t -= 2.625 / d1) * t + .984375;
  },
  sine: t => Math.sin(t * Math.PI / 2),
  pulse: t => Math.sin(t * Math.PI),
};

/* ------------------------------------------------------------------ 色 ----- */
function rgb(r, g, b, a = 1) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (clamp(r | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)).toString(16).slice(1);
}
/** 2色を線形補間（0..1） */
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A.r, B.r, t), lerp(A.g, B.g, t), lerp(A.b, B.b, t));
}
/** 明度シフト（amt>0 明るく / <0 暗く） */
function shade(hex, amt) {
  const c = hexToRgb(hex);
  const f = amt > 0 ? (v) => v + (255 - v) * amt : (v) => v * (1 + amt);
  return rgbToHex(f(c.r), f(c.g), f(c.b));
}
/** HSL を経由した色相回転（パレット生成用） */
function rotateHue(hex, deg) {
  const c = hexToRgb(hex);
  let [h, s, l] = rgbToHsl(c.r, c.g, c.b);
  h = mod(h + deg / 360, 1);
  const o = hslToRgb(h, s, l);
  return rgbToHex(o.r, o.g, o.b);
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
  const q = l < .5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = mod(t, 1);
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}

/* ------------------------------------------------------ 配列・ユーティリティ - */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor((rng ? rng.next() : Math.random()) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
/** 時間フォーマット mm:ss または ss.d */
function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = sec - m * 60;
  if (m > 0) return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  return s.toFixed(1);
}
function fmtSec1(sec) { return Math.max(0, sec).toFixed(1); }
/** 3桁区切り */
function fmtNum(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ------------------------------------------------------- オフスクリーン ----- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return { canvas: c, ctx: x };
}

/* --------------------------------------------------------- 簡易 FPS 計 ------ */
class FpsMeter {
  constructor(n = 40) { this.buf = new Float32Array(n); this.i = 0; this.n = 0; }
  push(dt) { this.buf[this.i] = dt; this.i = (this.i + 1) % this.buf.length; if (this.n < this.buf.length) this.n++; }
  get fps() {
    if (!this.n) return 0;
    let s = 0; for (let i = 0; i < this.n; i++) s += this.buf[i];
    return this.n / Math.max(1e-6, s);
  }
}

window.HN = window.HN || {};
Object.assign(window.HN, {
  TAU, DEG, clamp, lerp, invLerp, sign, dist, dist2, angleTo, mod,
  angleDelta, angleApproach, RNG, ease, rgb, hexToRgb, rgbToHex, mixHex,
  shade, rotateHue, rgbToHsl, hslToRgb, shuffle, sum, fmtTime, fmtSec1,
  fmtNum, makeCanvas, FpsMeter,
});
