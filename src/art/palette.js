/* =============================================================================
 * src/art/palette.js — 色彩設計
 *
 * 原作の中心にある二項対立をそのまま配色の骨格にする:
 *   南棟/内進（偏差値70）…… 紺のネクタイ  → 冷たい藍
 *   北棟/理数科（偏差値60）…… えんじのネクタイ → 熱い紅
 *   その境界＝糸魚川-静岡構造線／味噌の色／餅の形
 *
 * 【視認性の絶対規則】
 *   背景は 明度40%以下・彩度を抑える。弾は 白いコア＋彩度の高い外周。
 *   この規則により「暗い背景に光る弾」が構造的に保証される。
 * ========================================================================== */
'use strict';

/** ランプ（暗→明の4段階）。ピクセルアートの陰影はこの4段で描く。 */
const RAMP = {
  ink: ['#05060c', '#0b0d16', '#141728', '#1f2438'],
  navy: ['#0d1430', '#16275e', '#30509f', '#6b8ce0'],
  navySoft: ['#141a33', '#22305e', '#3f5896', '#8399cf'],
  crimson: ['#22060f', '#5c1226', '#a82244', '#e05575'],
  crimsonSoft: ['#2a1420', '#5e2438', '#9c4560', '#cf8199'],
  gold: ['#241a06', '#6b5320', '#c39a3c', '#f5df95'],
  cream: ['#2a261c', '#6b6350', '#b3a583', '#f2e8cd'],
  cyan: ['#06222b', '#0e4c59', '#2a9dae', '#8fe8f2'],
  green: ['#071c12', '#17402a', '#2d7a4e', '#7fd6a0'],
  purple: ['#150a2b', '#2e1a58', '#5b3aa0', '#a98ce8'],
  magenta: ['#2b0620', '#661046', '#b52482', '#f07cc4'],
  orange: ['#2b1204', '#7a3208', '#d4701a', '#f7c072'],
  white: ['#2b2f42', '#7d849e', '#c9cfe2', '#ffffff'],
  slate: ['#0c0e15', '#1c2030', '#39415c', '#7b85a8'],
  // 原作固有の色
  tieNavy: ['#0f1a3d', '#1d3370', '#2f4fa0', '#5f7fd0'],   // 内進のネクタイ
  tieEnji: ['#2a0710', '#5e0f22', '#94203c', '#c9556e'],   // 理数科のネクタイ
  corn: ['#2b1d05', '#7a5a12', '#d9a92a', '#ffe9a0'],      // コーンスープ
  miso: ['#2a1509', '#66301a', '#b1592c', '#e29b64'],      // 味噌
  honshitsu: ['#3a2c08', '#a5821f', '#f0cf6a', '#fffbe8'], // ✝本質✝ の光
};

/** ステージごとの弾幕配色（テーマカラー） */
const STAGE_THEME = {
  stage1: { name: '南棟と北棟', main: RAMP.navy, sub: RAMP.tieEnji, accent: RAMP.cream, aura: '#2f4fa0', bg: 'geometric' },
  stage2: { name: '火曜三限、味噌の地政学', main: RAMP.miso, sub: RAMP.cream, accent: RAMP.cyan, aura: '#b1592c', bg: 'boundary' },
  stage3: { name: '河岸段丘 — 時間を掘る', main: RAMP.green, sub: RAMP.gold, accent: RAMP.cyan, aura: '#2d7a4e', bg: 'terrace' },
  stage4: { name: '最後の地形図', main: RAMP.gold, sub: RAMP.honshitsu, accent: RAMP.navy, aura: '#c39a3c', bg: 'contour' },
  boss: { name: '✝', main: RAMP.honshitsu, sub: RAMP.crimson, accent: RAMP.cream, aura: '#f0cf6a', bg: 'contour' },
};

/** 汎用 UI 色 */
const UI = {
  bg: '#05060c',
  panel: '#0d1018',
  panelEdge: '#2a304a',
  ink: '#e8ecf7',
  dim: '#8b94ad',
  accent: '#f0cf6a',
  warn: '#e05575',
  ok: '#7fd6a0',
};

/* ------------------------------------------------------------------------- */
/** 弾のスプライト用配色を生成する（白コア＋指定色の外周） */
function bulletRamp(ramp) {
  return {
    core: '#ffffff',
    inner: ramp[3],
    outer: ramp[2],
    halo: ramp[1],
    dark: ramp[0],
  };
}

/** sRGB 相対輝度（コントラスト検証に使う） */
function luminance(hex) {
  const c = hexToRgb(hex);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
/** WCAG コントラスト比 */
function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

window.HN = window.HN || {};
Object.assign(window.HN, { RAMP, STAGE_THEME, UI_PALETTE: UI, bulletRamp, luminance, contrastRatio });
