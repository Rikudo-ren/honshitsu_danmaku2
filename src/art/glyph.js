/* =============================================================================
 * src/art/glyph.js — ✝ のピクセル・グリフとテキスト描画
 *
 *  ✝ (U+271D) は本作の中心記号でありながら、日本語ピクセルフォントに存在しない。
 *  そこで独自のピクセルグリフとして定義し、光・脈動・回転を加えて描く。
 *  原作の「見えないが、ある」を、光る十字として可視化する。
 *
 *  文字は Fusion Pixel 12px（日本語ピクセルフォント）と Silkscreen（ラテン数字）で描画。
 *  Fusion Pixel は 1px 格子でデザインされた本物のピクセルフォントなので、
 *  ドット絵の弾・自機・背景と同じ解像度の粒で文字が並ぶ。
 *  （旧: DotGothic16。アウトラインフォントのためドット絵と質感が揃わなかった）
 *  本文中の ✝ は自動的にこのグリフへ差し替わる。
 * ========================================================================== */
'use strict';

/* --------------------------------------------------------------- ✝ 定義 --- */
/*  記号: '#'=明部  '+'=中間 ':'=暗部  '.'=透明  (左が光源)  */
const CROSS_BITMAP = [
  '....#....',
  '....#....',
  '....#....',
  '...:+:...',
  '.#######.',
  '.:+###+:.',
  '....#....',
  '....#....',
  '....#....',
  '....#....',
  '....:....',
];
const CROSS_W = 9, CROSS_H = CROSS_BITMAP.length;

/** ランプ（4段）からビットマップ色を解決する */
function crossColor(ch, ramp) {
  switch (ch) {
    case '#': return ramp[3];
    case '+': return ramp[2];
    case ':': return ramp[1];
    default: return null;
  }
}

/**
 * ✝ を描く
 * o: { ramp, scale, glow, pulse(0..1), rot, alpha, halo }
 */
function drawCross(ctx, cx, cy, o = {}) {
  const ramp = o.ramp || (window.HN.RAMP.honshitsu);
  const s = o.scale || 1;
  const pulse = o.pulse ?? 0;
  const rot = o.rot || 0;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  // 後光
  if (o.glow !== 0) {
    const g = o.glow ?? 1;
    const R = (CROSS_H * s) * (0.85 + pulse * 0.35);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, ramp[3]);
    grad.addColorStop(0.35, ramp[2]);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = (o.alpha ?? 1) * (0.22 + pulse * 0.3) * g;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = o.alpha ?? 1;
  }
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  const ox = -(CROSS_W * s) / 2, oy = -(CROSS_H * s) / 2;
  if (s === 1) {
    // 等倍は fillRect 1px ずつ（最もクリスプ）
    for (let y = 0; y < CROSS_H; y++) {
      const row = CROSS_BITMAP[y];
      for (let x = 0; x < CROSS_W; x++) {
        const col = crossColor(row[x], ramp);
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(ox + x), Math.round(oy + y), 1, 1);
      }
    }
  } else {
    for (let y = 0; y < CROSS_H; y++) {
      const row = CROSS_BITMAP[y];
      for (let x = 0; x < CROSS_W; x++) {
        const col = crossColor(row[x], ramp);
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(ox + x * s), Math.round(oy + y * s), s, s);
      }
    }
  }
  ctx.restore();
}

/** ✝ の論理サイズ（フォントと同じ行送りに載せるための寸法） */
function crossMetrics(scale = 1, fontSize = 16) {
  const w = CROSS_W * scale, h = CROSS_H * scale;
  return { w, h, advance: w + Math.round(scale * 2), baseline: Math.round((fontSize - h) / 2) };
}

/* ------------------------------------------------------------- フォント --- */
const Fonts = {
  jp: null, latin: null, latinBold: null, ready: false, _loading: null,
  /**
   * @param {object} src {jp, latin, latinBold} — URL もしくは data URI
   */
  async load(src) {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const defs = [['FusionPixel12', src.jp], ['Silkscreen', src.latin], ['SilkscreenBold', src.latinBold]];
      const jobs = defs.map(async ([name, url]) => {
        if (!url) return;
        try {
          const ff = new FontFace(name, `url(${url})`, { style: 'normal', weight: name === 'SilkscreenBold' ? '700' : '400' });
          await ff.load();
          document.fonts.add(ff);
        } catch (e) {
          console.warn('font load failed:', name, e.message);
        }
      });
      await Promise.all(jobs);
      try { await document.fonts.ready; } catch (e) { /* noop */ }
      this.jp = 'FusionPixel12'; this.latin = 'Silkscreen'; this.latinBold = 'SilkscreenBold';
      this.ready = true;
      return true;
    })();
    return this._loading;
  },
};

const JP_FONT = () => (Fonts.jp ? `"${Fonts.jp}", monospace` : 'monospace');
const LAT_FONT = (b) => (Fonts.latin ? `"${b ? Fonts.latinBold : Fonts.latin}", monospace` : 'monospace');

/* ----------------------------------------------------------- テキスト描画 - */
const CROSS_CH = '\u271D';   // ✝

/** 文字列に ✝ が含まれるか */
const hasCross = (s) => s.indexOf(CROSS_CH) >= 0;

/**
 * テキストを行内に描く。✝ は独自グリフに差し替える。
 * o: {size, font, color, align, baseline, outline, outlineColor, alpha, shadow,
 *     crossRamp, crossGlow, crossPulse, letterSpacing, maxWidth}
 */
function drawText(ctx, str, x, y, o = {}) {
  if (str == null) str = '';
  str = String(str);
  const size = o.size ?? 16;
  const useLatin = o.latin ?? false;
  ctx.save();
  ctx.font = `${useLatin ? (o.bold ? '700 ' : '') : ''}${size}px ${useLatin ? LAT_FONT(true) : JP_FONT()}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'top';
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.imageSmoothingEnabled = false;

  const crossScale = o.crossScale ?? Math.max(1, Math.round(size / 16));
  const cm = crossMetrics(crossScale, size);

  // ✝ を含む場合は手動レイアウト（フォントにグリフが無いため）
  if (hasCross(str)) {
    drawTextWithCross(ctx, str, x, y, o, size, crossScale, cm, useLatin);
    ctx.restore();
    return;
  }

  if (o.outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.outline;
    ctx.strokeStyle = o.outlineColor || '#05060c';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color || '#e8ecf7';
  ctx.fillText(str, x, y);
  ctx.restore();
}

function drawTextWithCross(ctx, str, x, y, o, size, crossScale, cm, useLatin) {
  const align = o.align || 'left';
  const total = measureMixed(ctx, str, o, size, cm, useLatin);
  let cx = x;
  if (align === 'center') cx = x - total / 2;
  else if (align === 'right') cx = x - total;

  const parts = str.split(CROSS_CH);
  const baseY = y + (o.baseline === 'middle' ? size / 2
    : o.baseline === 'bottom' ? -size * 0.75 : 0);
  ctx.textAlign = 'left';
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length) {
      const w = ctx.measureText(parts[i]).width;
      if (o.outline) {
        ctx.lineJoin = 'round'; ctx.lineWidth = o.outline;
        ctx.strokeStyle = o.outlineColor || '#05060c';
        ctx.strokeText(parts[i], cx, baseY);
      }
      ctx.fillStyle = o.color || '#e8ecf7';
      ctx.fillText(parts[i], cx, baseY);
      cx += w;
    }
    if (i < parts.length - 1) {
      const gx = cx + cm.advance / 2;
      const gy = baseY + (o.baseline === 'middle' ? 0 : size / 2) - 1;
      drawCross(ctx, gx, gy, {
        scale: crossScale,
        ramp: o.crossRamp,
        glow: o.crossGlow ?? 1,
        pulse: o.crossPulse ?? 0,
        rot: o.crossRot || 0,
        alpha: (o.alpha ?? 1) * (o.crossAlpha ?? 1),
      });
      cx += cm.advance;
    }
  }
}

function measureMixed(ctx, str, o, size, cm, useLatin) {
  const parts = str.split(CROSS_CH);
  let w = 0;
  for (let i = 0; i < parts.length; i++) {
    w += ctx.measureText(parts[i]).width;
    if (i < parts.length - 1) w += cm.advance;
  }
  return w;
}

/** 文字列の幅（✝ を含んでも正しい） */
function textWidth(ctx, str, o = {}) {
  const size = o.size ?? 16;
  const useLatin = o.latin ?? false;
  const prev = ctx.font;
  ctx.font = `${useLatin ? (o.bold ? '700 ' : '') : ''}${size}px ${useLatin ? LAT_FONT(true) : JP_FONT()}`;
  const crossScale = o.crossScale ?? Math.max(1, Math.round(size / 16));
  const w = measureMixed(ctx, String(str), o, size, crossMetrics(crossScale, size), useLatin);
  ctx.font = prev;
  return w;
}

/** 日本語対応の折り返し（禁則の簡易版: 行頭に来てはいけない文字を考慮） */
const NO_LINE_START = '、。，．・？！ー）〕〉》」』】〕｝』）:;,.!?)]}';
const NO_LINE_END = '（〔〈《「『【｛([{';

function wrapText(ctx, str, maxWidth, o = {}) {
  const lines = [];
  for (const paragraph of String(str).split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const ch of paragraph) {
      const test = line + ch;
      if (textWidth(ctx, test, o) > maxWidth && line.length) {
        // 行頭禁則: 次が禁則文字なら、1 文字だけ繰り下げる
        if (NO_LINE_START.includes(ch) && line.length > 1) {
          const head = line.slice(0, -1), tail = line.slice(-1);
          lines.push(head);
          line = tail + ch;
        } else if (NO_LINE_END.includes(line[line.length - 1])) {
          const head = line.slice(0, -1), tail = line.slice(-1);
          lines.push(head);
          line = tail + ch;
        } else {
          lines.push(line);
          line = ch;
        }
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

window.HN = window.HN || {};
Object.assign(window.HN, {
  CROSS_BITMAP, CROSS_W, CROSS_H, CROSS_CH, drawCross, crossMetrics,
  Fonts, drawText, textWidth, wrapText, hasCross, JP_FONT, LAT_FONT,
});
