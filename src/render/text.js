/**
 * ドットフォント描画。
 * DotGothic16 (SIL OFL 1.1, Fontworks) は 16px グリッド設計のドットフォントなので、
 * 16 の整数倍のサイズでのみ描画する。こうすると常にドットが潰れずにくっきり出る。
 */
const BASE_SIZE = 16;
const ALLOWED = [8, 16, 32, 48];   // 8 は 16px 描画の縮小ではなく別途処理

let fontLoaded = false;
let fontPromise = null;

/* ------------------------------------------------------------------ *
 * フォントに無い文字を「ドット絵グリフ」として自前で描く。
 *
 * DotGothic16 の cmap を実際に走査した結果、以下は収録されていない:
 *   U+271D ✝ (この作品の中心記号) / U+25B6 ▶ (メニューのカーソル)
 * そのまま描くと豆腐 (□) になるため、同じドット密度で自前描画する。
 * ・✝ … 縦棒と横棒で構成された十字。原作の記号をそのまま再現する。
 * ・▶ … 右向きの段状三角形 (メニューの選択マーカー)。
 * 幅は「全角 0.72em」として扱い、字送りが破綻しないようにする。
 * ------------------------------------------------------------------ */
const SPECIAL = {
  '\u271D': (ctx, gx, gy, s) => {
    const cell = s * 0.72;
    const th = Math.max(2, Math.round(s * 0.16));       // 線の太さ
    const top = Math.round(gy + s * 0.02);
    const h = Math.round(s * 0.96);
    const cx = Math.round(gx + cell / 2 - th / 2);
    // 縦棒
    ctx.fillRect(cx, top, th, h);
    // 横棒 (上から 1/3 の位置)
    const by = Math.round(top + h * 0.30);
    ctx.fillRect(Math.round(gx + cell * 0.06), by, Math.round(cell * 0.88), th);
  },
  '\u25B6': (ctx, gx, gy, s) => {
    const w = Math.round(s * 0.62);
    const h = Math.round(s * 0.78);
    const top = Math.round(gy + s * 0.10);
    for (let i = 0; i < w; i++) {
      const hh = Math.max(1, Math.round(h * (1 - i / w)));
      ctx.fillRect(Math.round(gx) + i, Math.round(top + (h - hh) / 2), 1, hh);
    }
  },
};

const hasSpecial = (str) => /[\u271D\u25B6]/.test(str);
const specialW = (ch, s) => (ch === '\u25B6' ? s * 0.62 : s * 0.72);

export function loadDotFont() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    try {
      const ff = new FontFace('DotGothic16', "url('./assets/fonts/DotGothic16-Regular.ttf')");
      await ff.load();
      document.fonts.add(ff);
      fontLoaded = true;
    } catch (e) {
      console.warn('[text] DotGothic16 の読み込みに失敗。フォールバックを使用します。', e);
    }
    return fontLoaded;
  })();
  return fontPromise;
}

export const isFontReady = () => fontLoaded;

/** 16 の倍数へ丸める */
const snapSize = (s) => {
  let best = ALLOWED[0], bd = Infinity;
  for (const a of ALLOWED) {
    const d = Math.abs(a - s);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
};

const fontStr = (size) =>
  `${size}px DotGothic16, "MS Gothic", "Hiragino Kaku Gothic ProN", monospace`;

/** 小数を含む座標をピクセルグリッドに載せる */
const px = (v) => Math.round(v) + 0.5;

/**
 * 文字列を描画する。
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawText(ctx, str, x, y, opt = {}) {
  const {
    size = 16,
    color = '#f4f0ff',
    outline = 1,
    outlineColor = '#0a0812',
    align = 'left',
    baseline = 'top',
    shadow = 0,
    shadowColor = 'rgba(0,0,0,0.6)',
    glow = 0,
    glowColor = null,
    alpha = 1,
    spacing = 0,
  } = opt;

  const s = snapSize(size);
  ctx.save();
  ctx.font = fontStr(s);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha = alpha;

  const draw = (ox, oy) => {
    if (spacing === 0 && !hasSpecial(str)) {
      ctx.fillText(str, px(x + ox), px(y + oy));
      return;
    }
    // 1 文字ずつ描く (字間指定 / 自前グリフがある場合)
    const chars = [...str];
    let cx = x + ox;
    if (hasSpecial(str) && align !== 'left') {
      // align を自前で解決する (1 文字送りにすると fillText の align が効かない)
      let total = 0;
      for (const ch of chars) {
        total += SPECIAL[ch] ? specialW(ch, s) : ctx.measureText(ch).width + spacing;
      }
      if (align === 'center') cx -= total / 2;
      else if (align === 'right') cx -= total;
    }
    for (const ch of chars) {
      if (SPECIAL[ch]) {
        SPECIAL[ch](ctx, cx, y + oy, s);
        cx += specialW(ch, s);
      } else {
        ctx.fillText(ch, px(cx), px(y + oy));
        cx += ctx.measureText(ch).width + spacing;
      }
    }
  };

  if (glow > 0) {
    ctx.shadowBlur = glow;
    ctx.shadowColor = glowColor || color;
    ctx.fillStyle = color;
    draw(0, 0);
    ctx.shadowBlur = 0;
  }
  if (shadow > 0) {
    ctx.fillStyle = shadowColor;
    draw(0, shadow);
  }
  if (outline > 0) {
    ctx.fillStyle = outlineColor;
    const o = outline;
    draw(-o, 0); draw(o, 0); draw(0, -o); draw(0, o);
    draw(-o, -o); draw(o, -o); draw(-o, o); draw(o, o);
  }
  ctx.fillStyle = color;
  draw(0, 0);
  ctx.restore();
}

/** 文字列の幅を測る (drawText と同じ条件で) */
export function measureText(ctx, str, size = 16, spacing = 0) {
  const s = snapSize(size);
  ctx.save();
  ctx.font = fontStr(s);
  let w;
  if (spacing === 0 && !hasSpecial(str)) {
    w = ctx.measureText(str).width;
  } else {
    w = 0;
    for (const ch of [...str]) {
      w += SPECIAL[ch] ? specialW(ch, s) : ctx.measureText(ch).width + spacing;
    }
    if (!hasSpecial(str)) w -= spacing;
  }
  ctx.restore();
  return w;
}

/** 折り返しテキスト。maxWidth を超えたら改行する。 */
export function wrapText(ctx, str, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(str).split('\n')) {
    let line = '';
    for (const ch of [...paragraph]) {
      const test = line + ch;
      if (measureText(ctx, test, size) > maxWidth && line.length > 0) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * タイプライタ表示。返り値は「表示し終わったか」。
 * @param {number} charsPerSec
 */
export function typewriter(full, elapsedSec, charsPerSec = 42) {
  const n = Math.floor(elapsedSec * charsPerSec);
  if (n >= full.length) return { text: full, done: true };
  return { text: full.slice(0, n), done: false };
}
