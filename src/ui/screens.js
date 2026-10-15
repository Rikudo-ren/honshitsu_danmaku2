/**
 * screens.js — 画面 (タイトル / 難易度選択 / 練習選択 / ポーズ / リザルト / ゲームオーバー)
 *
 * すべて「ゲーム内バッファ (512x384) に直接描く」関数として実装する。
 * 画面遷移のアニメーションもここで完結させ、main.js は状態機械に徹する。
 */
import { VIEW_W, VIEW_H, COLORS, DIFFICULTIES, DIFFICULTY_ORDER } from '../core/const.js';
import { drawText, measureText, wrapText } from '../render/text.js';
import { clamp, fmtScore, fmtTime } from '../core/util.js';

/* ------------------------------------------------------------ 共通 ------ */

function panel(ctx, x, y, w, h, { fill = 'rgba(8,6,20,0.86)', edge = '#4b3f78' } = {}) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}

/** ✝ を大きく薄く敷く (画面のモチーフ) */
export function drawCrossMotif(ctx, x, y, s, alpha, color = '#ffd77a') {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const arm = Math.max(2, Math.round(s * 0.26));
  ctx.fillRect(Math.round(x - arm / 2), Math.round(y - s / 2), arm, s);
  ctx.fillRect(Math.round(x - s / 2), Math.round(y - s * 0.16), s, arm);
  ctx.restore();
}

function scanGlow(ctx, t, color = '#ffb066') {
  ctx.save();
  ctx.globalAlpha = 0.06 + Math.sin(t * 1.4) * 0.02;
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.42, 10, VIEW_W / 2, VIEW_H * 0.42, 300);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}

function menuList(ctx, items, x, y, cur, t, opt = {}) {
  const { size = 16, gap = 24, align = 'left', color = COLORS.paper, hi = '#ffe9a8' } = opt;
  items.forEach((it, i) => {
    const sel = i === cur;
    const label = typeof it === 'string' ? it : it.label;
    const sub = typeof it === 'string' ? null : it.sub;
    const xx = align === 'center' ? x : x;
    if (sel) {
      const w = measureText(ctx, label, size) + 20;
      ctx.save();
      ctx.globalAlpha = 0.22 + Math.sin(t * 5) * 0.06;
      ctx.fillStyle = hi;
      ctx.fillRect(xx - 10, y + i * gap - 3, w, size + 6);
      ctx.restore();
      drawText(ctx, '▶', xx - 22, y + i * gap, { size: 8, color: hi, outline: 1, align: 'left' });
    }
    drawText(ctx, label, xx, y + i * gap, {
      size, color: sel ? hi : color, outline: 1,
      align, alpha: sel ? 1 : 0.82,
    });
    if (sub) {
      drawText(ctx, sub, xx + 4, y + i * gap + size - 2, { size: 8, color: '#8b80b8', outline: 1, alpha: 0.9 });
    }
  });
}

function footer(ctx, text, t) {
  const a = 0.5 + Math.sin(t * 4) * 0.3;
  drawText(ctx, text, VIEW_W / 2, VIEW_H - 18, {
    size: 8, color: '#cfc4ff', align: 'center', outline: 1, alpha: a,
  });
}

/* ------------------------------------------------------------ タイトル --- */

export function drawTitle(ctx, t, save) {
  ctx.save();
  ctx.fillStyle = '#05040c';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  scanGlow(ctx, t, '#7c6bd6');

  drawCrossMotif(ctx, VIEW_W / 2, 108, 150, 0.10, '#ffd77a');
  drawCrossMotif(ctx, 78, 300, 60, 0.07, '#8fc2ff');
  drawCrossMotif(ctx, 440, 268, 74, 0.07, '#ff9d7a');

  const bob = Math.sin(t * 1.2) * 2;
  drawText(ctx, '✝ 本 質 ✝', VIEW_W / 2, 52 + bob, {
    size: 48, color: '#ffe9a8', align: 'center', outline: 2, glow: 14, glowColor: '#ff9a3c',
  });
  drawText(ctx, '偏 差 値 六 十 の 教 室 か ら', VIEW_W / 2, 106, {
    size: 16, color: '#cfc4ff', align: 'center', outline: 1, letterSpacing: 0,
  });
  drawText(ctx, '── 耐久型 弾幕 ✝本質✝ ──', VIEW_W / 2, 128, {
    size: 8, color: '#9c8fd0', align: 'center', outline: 1,
  });

  panel(ctx, 96, 168, VIEW_W - 192, 96);
  drawText(ctx, '自機は攻撃しない。避けて、耐えるだけ。', VIEW_W / 2, 178, {
    size: 8, color: '#cfc4ff', align: 'center', outline: 1,
  });
  drawText(ctx, '4幕 / 全17フェーズ / 難易度3段階', VIEW_W / 2, 192, {
    size: 16, color: COLORS.paper, align: 'center', outline: 1,
  });
  drawText(ctx, '各フェーズの残り時間は右上に大きく表示される', VIEW_W / 2, 214, {
    size: 8, color: '#8fc2ff', align: 'center', outline: 1,
  });
  drawText(ctx, '全フェーズを生き延びれば STAGE CLEAR', VIEW_W / 2, 228, {
    size: 8, color: '#7ce0a0', align: 'center', outline: 1,
  });
  drawText(ctx, 'Z / Enter … 開始　　X … 戻る　　P … ポーズ　F … 全画面', VIEW_W / 2, 246, {
    size: 8, color: '#8b80b8', align: 'center', outline: 1,
  });

  drawText(ctx, '原作: 「偏差値60の教室から✝本質✝が漏れ出している件について」', VIEW_W / 2, 272, {
    size: 8, color: '#7f76a8', align: 'center', outline: 1, alpha: 0.9,
  });
  if (save && save.best) {
    drawText(ctx, `最高記録　${save.best.stage}幕 / ${save.best.phases}フェーズ　${fmtScore(save.best.score)}`, VIEW_W / 2, 288, {
      size: 8, color: '#ffd77a', align: 'center', outline: 1,
    });
  }

  footer(ctx, 'PRESS  Z  /  ENTER', t);
}

/* ------------------------------------------------------------ 難易度 ---- */

export function drawDifficulty(ctx, menu, t) {
  ctx.save();
  ctx.fillStyle = '#05040c';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  scanGlow(ctx, t, '#8fc2ff');
  drawCrossMotif(ctx, VIEW_W / 2, 190, 240, 0.05, '#8fc2ff');

  drawText(ctx, '難易度選択', VIEW_W / 2, 22, { size: 32, color: COLORS.paper, align: 'center', outline: 2 });
  drawText(ctx, '弾数だけでなく、同時発射数・発射間隔・持続時間・安全地帯の広さ・ボスの機動力が変わる', VIEW_W / 2, 58, {
    size: 8, color: '#9c8fd0', align: 'center', outline: 1,
  });

  DIFFICULTY_ORDER.forEach((k, i) => {
    const d = DIFFICULTIES[k];
    const sel = menu.cur === i;
    const y = 76 + i * 68;
    panel(ctx, 40, y, VIEW_W - 80, 60, { fill: sel ? 'rgba(20,15,44,0.94)' : 'rgba(8,6,20,0.8)', edge: sel ? d.color : '#3a3355' });
    drawText(ctx, `${d.label}　${d.jp}`, 56, y + 8, {
      size: 32, color: sel ? d.color : '#b9a8ff', outline: 1, alpha: sel ? 1 : 0.8,
    });
    drawText(ctx, d.desc, 176, y + 12, { size: 8, color: '#cfc4ff', outline: 1, alpha: 0.95 });
    const stats = `弾数x${d.density.toFixed(2)}  弾速x${d.speed.toFixed(2)}  隙間x${d.safe.toFixed(2)}  ` +
      `誘導x${d.homing.toFixed(2)}  ボス機動x${d.boss.toFixed(2)}  耐久x${d.phaseLen.toFixed(2)}`;
    drawText(ctx, stats, 176, y + 27, { size: 8, color: '#8b80b8', outline: 1 });
    const stats2 = `残機 ${d.lives}　無敵 ${d.invuln.toFixed(2)}s　✝本質✝ゲージ x${d.bomb}　グレイズ倍率 x${d.grazeGain.toFixed(2)}`;
    drawText(ctx, stats2, 176, y + 41, { size: 8, color: '#8b80b8', outline: 1 });
    if (sel) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = d.color;
      ctx.fillRect(40, y, 3, 60);
      ctx.restore();
    }
  });

  footer(ctx, '↑↓ で選択　Z で決定　X で戻る', t);
}

/* ------------------------------------------------------------ 練習選択 --- */

export function drawPractice(ctx, menu, t, stages) {
  ctx.save();
  ctx.fillStyle = '#05040c';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  scanGlow(ctx, t, '#7ce0a0');
  drawText(ctx, '練習 (フェーズ選択)', VIEW_W / 2, 16, { size: 32, color: COLORS.paper, align: 'center', outline: 2 });
  drawText(ctx, '選んだ幕のフェーズから開始する。強化はされない。', VIEW_W / 2, 48, {
    size: 8, color: '#9c8fd0', align: 'center', outline: 1,
  });

  // 左: 幕
  panel(ctx, 24, 66, 210, 250);
  stages.forEach((s, i) => {
    const sel = menu.col === 0 && menu.row === i;
    drawText(ctx, `${s.act}`, 38, 78 + i * 52, {
      size: 16, color: sel ? '#ffe9a8' : '#b9a8ff', outline: 1,
    });
    drawText(ctx, s.name, 42, 98 + i * 52, { size: 8, color: '#8b80b8', outline: 1 });
    if (sel) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(24, 72 + i * 52, 210, 44);
      ctx.restore();
    }
  });

  // 右: フェーズ
  const st = stages[menu.row];
  panel(ctx, 246, 66, VIEW_W - 270, 250);
  if (st) {
    st.phases.forEach((p, i) => {
      const sel = menu.col === 1 && menu.idx === i;
      drawText(ctx, `${i + 1}. ${p.n}`, 260, 78 + i * 26, {
        size: 8, color: sel ? '#7ce0a0' : '#cfc4ff', outline: 1, alpha: sel ? 1 : 0.86,
      });
      drawText(ctx, `${p.len}s${p.cam === 'pseudo3d' ? ' / 擬似3D' : ''}`, 470, 78 + i * 26, {
        size: 8, color: sel ? '#7ce0a0' : '#8b80b8', outline: 1, align: 'right',
      });
    });
  }

  footer(ctx, '←→ で幕/フェーズ切り替え　↑↓ で移動　Z で開始　X で戻る', t);
}

/* ------------------------------------------------------------ ポーズ ---- */

export function drawPause(ctx, menu, t, st) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,3,10,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  panel(ctx, VIEW_W / 2 - 120, 78, 240, 210, { fill: 'rgba(8,6,20,0.96)' });
  drawText(ctx, 'PAUSE', VIEW_W / 2, 90, { size: 32, color: '#ffe9a8', align: 'center', outline: 1 });
  drawText(ctx, `${st.act || ''} ${st.phaseLabel || ''}`, VIEW_W / 2, 126, {
    size: 8, color: '#cfc4ff', align: 'center', outline: 1,
  });
  drawText(ctx, `残り ${st.timeLeft.toFixed(1)}s　被弾 ${st.hits}　グレイズ ${st.graze}`, VIEW_W / 2, 140, {
    size: 8, color: '#8b80b8', align: 'center', outline: 1,
  });
  menuList(ctx, menu.items, VIEW_W / 2 - 66, 168, menu.cur, t, { size: 16, gap: 24 });
  drawText(ctx, 'P / Esc で再開', VIEW_W / 2, 262, { size: 8, color: '#7f76a8', align: 'center', outline: 1 });
}

/* ------------------------------------------------------------ リザルト -- */

function statRow(ctx, label, value, x, y, w, color = COLORS.paper) {
  drawText(ctx, label, x, y, { size: 8, color: '#8b80b8', outline: 1 });
  drawText(ctx, value, x + w, y, { size: 8, color, outline: 1, align: 'right' });
}

export function drawResult(ctx, menu, t, r) {
  ctx.save();
  ctx.fillStyle = '#04060c';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  scanGlow(ctx, t, '#7ce0a0');

  const pop = clamp(t / 0.5, 0, 1);
  const y0 = 22 - (1 - pop) * 10;
  drawText(ctx, r.allClear ? 'ALL STAGE CLEAR' : 'STAGE CLEAR', VIEW_W / 2, y0, {
    size: 48, color: r.allClear ? '#ffe9a8' : '#7ce0a0', align: 'center', outline: 2,
    glow: 16, glowColor: r.allClear ? '#ff9a3c' : '#3cd87c',
  });
  drawText(ctx, `${r.act}　──　${r.stageName}`, VIEW_W / 2, y0 + 52, {
    size: 16, color: COLORS.paper, align: 'center', outline: 1,
  });
  drawText(ctx, `${r.diff}　/　${r.phasesCleared}フェーズ　/　${fmtTime(r.elapsed)}`, VIEW_W / 2, y0 + 72, {
    size: 8, color: '#cfc4ff', align: 'center', outline: 1,
  });

  panel(ctx, 46, 116, VIEW_W - 92, 168, { fill: 'rgba(8,6,20,0.88)' });
  const X = 62, W = VIEW_W - 124;
  statRow(ctx, 'SCORE', fmtScore(r.score), X, 128, W, COLORS.gold);
  statRow(ctx, '最大回避数 (NO MISS 継続)', String(r.maxDodge), X, 144, W);
  statRow(ctx, 'グレイズ', String(r.graze), X, 160, W);
  statRow(ctx, '被弾', String(r.hits), X, 176, W, r.hits === 0 ? '#7ce0a0' : '#ff9d7a');
  statRow(ctx, '使用した✝本質✝', String(r.bombsUsed), X, 192, W);
  statRow(ctx, '残機', String(r.lives), X, 208, W);
  statRow(ctx, 'フェーズ最速クリア', r.fastestPhase || '—', X, 224, W);
  statRow(ctx, 'NO MISS', r.hits === 0 ? '達成' : '未達', X, 240, W, r.hits === 0 ? '#7ce0a0' : '#8b80b8');

  drawText(ctx, r.rank, VIEW_W / 2, 258, {
    size: 32, color: r.rankColor || '#ffd77a', align: 'center', outline: 1, glow: 8, glowColor: r.rankColor || '#ffd77a',
  });

  menuList(ctx, menu.items, 96, 300, menu.cur, t, { size: 16, gap: 22 });
  if (r.quote) {
    drawText(ctx, r.quote, VIEW_W / 2 + 40, 296, {
      size: 8, color: '#cfc4ff', align: 'center', outline: 1, alpha: 0.9,
    });
    drawText(ctx, r.quoteTag || '', VIEW_W / 2 + 40, 310, {
      size: 8, color: r.quoteV ? '#7ce0a0' : '#ffd77a', align: 'center', outline: 1, alpha: 0.9,
    });
  }
}

export function drawGameOver(ctx, menu, t, r) {
  ctx.save();
  ctx.fillStyle = '#0a0308';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.1;
  const g = ctx.createRadialGradient(VIEW_W / 2, 120, 8, VIEW_W / 2, 120, 260);
  g.addColorStop(0, '#ff3b6b');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();

  drawCrossMotif(ctx, VIEW_W / 2, 150, 200, 0.07, '#ff3b6b');
  drawText(ctx, 'GAME OVER', VIEW_W / 2, 52, {
    size: 48, color: '#ff5c7a', align: 'center', outline: 2, glow: 14, glowColor: '#ff3b6b',
  });
  drawText(ctx, `${r.act}　${r.phaseLabel}`, VIEW_W / 2, 108, {
    size: 16, color: '#ffc2cd', align: 'center', outline: 1,
  });
  drawText(ctx, '✝本質✝は、まだ教室にいる。', VIEW_W / 2, 132, {
    size: 8, color: '#b9a8ff', align: 'center', outline: 1,
  });

  panel(ctx, 96, 156, VIEW_W - 192, 84, { fill: 'rgba(10,4,10,0.9)', edge: '#6a2038' });
  const X = 112, W = VIEW_W - 224;
  statRow(ctx, '到達', `${r.stageNo}幕 ${r.phaseIndex + 1}/${r.phaseTotal}`, X, 168, W);
  statRow(ctx, 'SCORE', fmtScore(r.score), X, 184, W, COLORS.gold);
  statRow(ctx, 'グレイズ', String(r.graze), X, 200, W);
  statRow(ctx, '被弾', String(r.hits), X, 216, W);

  menuList(ctx, menu.items, 120, 252, menu.cur, t, { size: 16, gap: 22 });
  footer(ctx, 'R … 同じ幕をやり直す　Z … 決定', t);
}

/* ------------------------------------------------------------ ヘルプ ---- */

export function drawHelp(ctx, t, credits) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,3,10,0.94)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  drawText(ctx, '操作 / クレジット', VIEW_W / 2, 12, { size: 16, color: '#ffe9a8', align: 'center', outline: 1 });

  const keys = [
    '移動 … 矢印 / WASD / スティック (画面ドラッグ可)',
    '低速移動 … Shift (喰らい判定が見える)',
    '✝本質✝ (弾消し) … X または Ctrl',
    'ポーズ … P / Esc　　全画面 … F　　スキップ … Q / Tab',
    '戻る … X (タイトルでは終了)',
  ];
  keys.forEach((k, i) => drawText(ctx, k, 26, 34 + i * 14, { size: 8, color: COLORS.paper, outline: 1 }));

  drawText(ctx, 'この作品について', 26, 114, { size: 8, color: '#ffd77a', outline: 1 });
  const notes = [
    '自機は攻撃しません。弾を避けて、フェーズの残り時間を耐えきるゲームです。',
    '残り時間は常に画面右上に大きく表示されます。',
    '弾幕は全て「隙間 / 安全地帯 / 予告」を持ち、理不尽な即死はありません。',
    '途中の幕から練習できます (タイトル → 練習)。',
  ];
  notes.forEach((k, i) => drawText(ctx, k, 26, 128 + i * 14, { size: 8, color: '#cfc4ff', outline: 1, alpha: 0.95 }));

  drawText(ctx, 'アセット / ライセンス', 26, 194, { size: 8, color: '#7ce0a0', outline: 1 });
  (credits || []).slice(0, 9).forEach((c, i) => {
    drawText(ctx, c, 26, 208 + i * 11, { size: 8, color: '#b9c8ff', outline: 1, alpha: 0.94 });
  });

  footer(ctx, 'X / Esc で閉じる', t);
}
