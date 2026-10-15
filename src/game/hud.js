// hud.js — the in-game overlay.
//
// Layout contract (never violated, the player must be able to read the
// remaining time without looking away from the field):
//   upper-right : countdown seconds, largest text on screen, always visible
//   upper-left  : boss name / title / phase pips
//   lower-left  : lives, ✝本質✝ gauge, score
//   lower-right : elapsed time, graze/dodge stats, control hint
//
// Everything is drawn from primitives (rects, triangles, crosses) so it stays
// crisp at any integer display scale.

import { VIEW_W, VIEW_H, COLORS, BOMB } from '../core/const.js';
import { drawText, measureText } from '../render/text.js';
import { clamp, fmtScore, fmtTime } from '../core/util.js';

const PAD = 8;
const TIMER_X = VIEW_W - PAD;      // right-aligned origin
const TIMER_Y = 6;
const BIG = 48;                    // the "large countdown" size

/** 十字 (✝) アイコン: 原作の「✝本質✝」を記号として使う */
function cross(ctx, x, y, s, color, hollow = false) {
  const arm = Math.max(1, Math.round(s * 0.28));
  ctx.save();
  if (hollow) {
    // 中抜き: 外側αを落として「空きスロット」に見せる (clearRect は使わない)
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.fillRect(x - arm / 2, y - s / 2, arm, s);
    ctx.fillRect(x - s / 2, y - s * 0.16, s, arm);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x - arm / 2, y - s / 2, arm, s);
    ctx.fillRect(x - s / 2, y - s * 0.16, s, arm);
  }
  ctx.restore();
}

/** 菱形 (フェーズピップ) */
function diamond(ctx, x, y, r, color, filled, pulse = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y - r + 0.5);
  ctx.lineTo(x + r + 0.5, y + 0.5);
  ctx.lineTo(x + 0.5, y + r + 0.5);
  ctx.lineTo(x - r + 0.5, y + 0.5);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (pulse > 0) {
    ctx.globalAlpha = pulse * 0.7;
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- timer --- */

/**
 * 残り時間。画面右上の最優先表示。
 *
 * 設計:
 *   ・数字は 48px ドットフォント (画面上で最大)。3桁 (100s) でも収まる幅を確保。
 *   ・数字の下に「時間のゲージ」を敷き、減っていく様子を常時見せる。
 *      弾幕を見ている最中でも、視界の端で残り時間が分かるようにするため。
 *   ・残り 10 秒から色が変わり、5 秒からは点滅 + 鼓動。
 *   ・左上のボス名バーとは重ならない。
 */
const PANEL_W = 132;
const PANEL_H = 70;
const PANEL_X = VIEW_W - PANEL_W;      // 角に付ける
const PANEL_Y = 0;

export function drawTimer(ctx, st, t) {
  const left = Math.max(0, st.timeLeft);
  const secs = Math.ceil(left - 1e-4);
  const warn = left <= 10.05;
  const crit = left <= 5.05;
  const k = st.phaseLen > 0 ? clamp(left / st.phaseLen, 0, 1) : 0;

  // パネル
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = '#05040c';
  ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
  ctx.globalAlpha = 1;
  ctx.fillStyle = crit ? '#ff5c7a' : warn ? '#ffd77a' : '#8fc2ff';
  ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, 2);           // 上辺のアクセント
  ctx.restore();

  drawText(ctx, '残り時間', PANEL_X + 8, PANEL_Y + 5, {
    size: 8, color: '#9c8fd0', outline: 0, alpha: 0.9,
  });

  // 数字 (3 桁でも右端が揃う)
  const pulse = crit ? (Math.sin(t * 22) * 0.5 + 0.5)
    : warn ? (Math.sin(t * 9) * 0.5 + 0.5) : 0;
  const color = crit ? '#ff5c7a' : warn ? '#ffd77a' : '#f4f0ff';
  const nudge = crit ? Math.round(Math.sin(t * 40) * 1.4) : 0;
  drawText(ctx, String(secs), VIEW_W - 14 + nudge, PANEL_Y + 14 - pulse * (crit ? 1.4 : 0.6), {
    size: BIG,
    color,
    outline: 2,
    outlineColor: '#0a0812',
    align: 'right',
    glow: crit ? 12 : warn ? 7 : 0,
    glowColor: color,
  });
  drawText(ctx, 's', VIEW_W - 10, PANEL_Y + 52, { size: 8, color: '#9c8fd0', outline: 0, align: 'right' });

  // 時間のゲージ (ドレイン式)
  const railX = PANEL_X + 8;
  const railW = PANEL_W - 16;
  const railY = PANEL_Y + 60;
  ctx.save();
  ctx.fillStyle = '#1a1430';
  ctx.fillRect(railX, railY, railW, 4);
  const wNow = Math.round(railW * k);
  ctx.fillStyle = crit ? '#ff5c7a' : warn ? '#ffd77a' : '#8fc2ff';
  ctx.fillRect(railX, railY, wNow, 4);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(railX + Math.max(0, wNow - 1), railY, 1, 4);
  // 10 秒 / 5 秒の目盛り
  if (st.phaseLen > 0) {
    const tickv = (v) => railX + Math.round(railW * clamp(v / st.phaseLen, 0, 1));
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0a0812';
    if (st.phaseLen > 12) ctx.fillRect(tickv(10), railY - 1, 1, 6);
    if (st.phaseLen > 6) ctx.fillRect(tickv(5), railY - 1, 1, 6);
  }
  ctx.restore();

  // フェーズ進行のパイプ (右上の下に小さく)
  const n = st.phaseTotal || 1;
  const cur = st.phaseIndex || 0;
  let px0 = VIEW_W - PAD - (n - 1) * 9;
  for (let i = 0; i < n; i++) {
    const done = i < cur;
    const now = i === cur;
    diamond(ctx, px0 + i * 9, PANEL_Y + PANEL_H + 7, 3.2,
      done ? '#6f66a8' : now ? '#ffffff' : '#b9a8ff', done,
      now ? (Math.sin(t * 6) * 0.5 + 0.5) * 0.6 : 0);
  }
  if (st.phaseLabel) {
    drawText(ctx, st.phaseLabel, px0 - 10, PANEL_Y + PANEL_H + 2, {
      size: 8, color: '#cfc4ff', outline: 1, align: 'right', alpha: 0.95,
    });
  }
}

/* ------------------------------------------------------------ boss plate --- */

export function drawBossPlate(ctx, st, t) {
  if (!st.bossName) return;
  drawText(ctx, '敵', PAD, PAD + 1, { size: 8, color: '#ff7fa0', outline: 1 });
  drawText(ctx, st.bossName, PAD + 14, PAD - 1, { size: 16, color: COLORS.paper, outline: 1 });
  if (st.bossTitle) {
    drawText(ctx, st.bossTitle, PAD + 15, PAD + 16, { size: 8, color: '#b9a8ff', outline: 1, alpha: 0.95 });
  }

  // phase pips (boss forms)
  const forms = st.formTotal || 0;
  if (forms > 0) {
    for (let i = 0; i < forms; i++) {
      const done = i < st.formIndex;
      const now = i === st.formIndex;
      diamond(ctx, PAD + 4 + i * 10, PAD + 30, 3.4,
        done ? '#6f66a8' : now ? '#ffd77a' : '#b9a8ff', done, now ? (Math.sin(t * 5) * 0.5 + 0.5) * 0.7 : 0);
    }
  }
  // phase time-remaining mini bar (mirrors the big timer, for when the player
  // is looking at the boss instead of the corner)
  if (st.phaseLen > 0) {
    const w = 88;
    const k = clamp(st.timeLeft / st.phaseLen, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#1a1430';
    ctx.fillRect(PAD, PAD + 38, w, 2);
    ctx.fillStyle = '#8fc2ff';
    ctx.fillRect(PAD, PAD + 38, Math.round(w * k), 2);
    ctx.restore();
  }
}

/* -------------------------------------------------------------- bottom row --- */

export function drawStats(ctx, st) {
  const y = VIEW_H - 22;

  // lives : ✝ marks
  const maxShow = Math.min(st.lives, 8);
  for (let i = 0; i < maxShow; i++) {
    cross(ctx, PAD + 5 + i * 12, y + 4, 11, '#ffe9a8', false);
  }
  if (st.lives > 8) drawText(ctx, `x${st.lives}`, PAD + 8 + 8 * 12, y - 1, { size: 8, color: '#ffe9a8', outline: 1 });

  // ✝本質✝ gauge (charge from grazing)
  const gy = y + 16;
  const gw = 76;
  const k = clamp((st.bombGauge ?? 0) / BOMB.max, 0, 1);
  ctx.save();
  ctx.fillStyle = '#0d0a1c';
  ctx.globalAlpha = 0.8;
  ctx.fillRect(PAD, gy, gw, 5);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a2246';
  ctx.fillRect(PAD, gy, gw, 5);
  if (k > 0) {
    ctx.fillStyle = k >= 1 ? '#ffd77a' : '#a98cff';
    ctx.fillRect(PAD, gy, Math.round(gw * k), 5);
  }
  ctx.restore();
  cross(ctx, PAD + 3, gy + 12, 8, '#a98cff', false);
  drawText(ctx, `x${st.bombs}`, PAD + 12, gy + 7, { size: 8, color: '#cfc4ff', outline: 1, alpha: 0.95 });

  // score + stats on the right
  const rx = VIEW_W - PAD;
  drawText(ctx, fmtScore(st.score), rx, y - 2, { size: 16, color: COLORS.gold, outline: 1, align: 'right' });
  const line2 = `回避 ${st.dodged}  グレイズ ${st.graze}  被弾 ${st.hits}`;
  drawText(ctx, line2, rx, y + 14, { size: 8, color: '#cfc4ff', outline: 1, align: 'right', alpha: 0.95 });
  if (st.noMiss) {
    drawText(ctx, 'NO MISS', rx - 92, y - 2, {
      size: 8, color: '#7ce0a0', outline: 1, align: 'right',
      glow: 4, glowColor: '#7ce0a0',
    });
  }

  // elapsed + hint
  drawText(ctx,
    st.practice ? `練習 ${fmtTime(st.elapsed)}` : fmtTime(st.elapsed),
    VIEW_W / 2, VIEW_H - 10,
    { size: 8, color: '#8b80b8', outline: 1, align: 'center', alpha: 0.85 });
}

/* ------------------------------------------------------------------ hints --- */

export function drawHint(ctx, text, y = VIEW_H - 40, alpha = 1) {
  const w = measureText(ctx, text, 8);
  ctx.save();
  ctx.globalAlpha = 0.45 * alpha;
  ctx.fillStyle = '#05040c';
  ctx.fillRect(VIEW_W / 2 - w / 2 - 5, y - 3, w + 10, 13);
  ctx.restore();
  drawText(ctx, text, VIEW_W / 2, y, { size: 8, color: '#cfc4ff', align: 'center', outline: 1, alpha });
}

/** 低リソース時などに出す小さな警告 */
export function drawPerfWarn(ctx, text) {
  drawText(ctx, text, VIEW_W / 2, 4, { size: 8, color: '#ff9d7a', align: 'center', outline: 1 });
}

/* ------------------------------------------------------------------ main --- */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} st  run state
 * @param {number} t   seconds since the stage started (for pulses)
 */
export function drawHud(ctx, st, t) {
  if (!st.hud) return;
  if (st.hud !== 'off') drawBossPlate(ctx, st, t);
  if (st.hud !== 'off') drawTimer(ctx, st, t);
  drawStats(ctx, st);
}
