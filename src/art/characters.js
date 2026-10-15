/* =============================================================================
 * src/art/characters.js — 自機（紙飛行機）・立ち絵システム・人物データ
 *
 *  ■自機について
 *   原作は「攻撃しない」物語である。弾幕ゲームの自機もまた攻撃しない。
 *   そこで自機は「紙飛行機」とした。生徒が授業中に折って飛ばす紙。
 *   寺地が紙に書いて読み上げ、勝也が地形図を広げ、両馬が掲示板に書く——
 *   この物語はすべて「紙」の上で起きている。紙飛行機はその象徴であり、
 *   武器を持たないという本作の設計と一致する。
 *
 *   スプライトは ASCII ピクセルマップから生成する。左半分だけ定義して
 *   鏡像展開するため、必ず左右対称になる（機体として自然に見える）。
 *
 *  ■立ち絵について
 *   原作立ち絵（作者提供）は「カットイン」として原画のまま活かす。
 *   方針の詳細は docs/ART-DIRECTION.md を参照。
 * ========================================================================== */
'use strict';

/* ==========================================================================
 * 自機: 紙飛行機
 * ======================================================================= */
const SHIP_PAL = {
  '.': null,
  'N': '#e9eefb',   // 紙の明部（ほぼ白）
  'W': '#c2cbe4',   // 紙の中間
  'w': '#8f9ab8',   // 紙の陰
  'n': '#4a5578',   // 折り目の線
  'G': '#f0cf6a',   // ✝本質✝ の光（機首の印）
  'g': '#fffbe8',   // 光の芯
};

/** 左半分（10 文字。末尾が中心列）。鏡像展開して 19 桁になる。 */
const SHIP_HALF = {
  neutral: [
    '.........g',
    '.........G',
    '........NG',
    '........WN',
    '.......WWn',
    '.......WWn',
    '......WWWn',
    '......WWWn',
    '.....WWWWn',
    '.....WWWWn',
    '....WWWWWn',
    '...WWWWWWn',
    '..WWWWWWWn',
    '..WWWWWWWn',
    '.WWWWWWWWn',
    '.WWWnnWWWn',
    '.WWn..WWnn',
    '.Wn...WWnn',
    '.n....WWnn',
  ],
  left: [
    '.........g',
    '.........G',
    '........NG',
    '........WN',
    '.......WWn',
    '......WWWn',
    '.....WWWWn',
    '....WWWWWn',
    '...WWWWWWn',
    '..WWWWWWWn',
    '..WWWWWWWn',
    '.WWWWWWWWn',
    '.WWWWWWWWn',
    'WWWWWWWWWn',
    'WWWWWWWWWn',
    'WWWWnWWWWn',
    'WWn...WWnn',
    'Wn....WWnn',
    '.n....WWnn',
  ],
  right: [
    '.........g',
    '.........G',
    '........NG',
    '........WN',
    '.......WWn',
    '.......WWn',
    '......WWWn',
    '......WWWn',
    '.......WWn',
    '.......WWn',
    '......WWWn',
    '.....WWWWn',
    '....WWWWWn',
    '...WWWWWWn',
    '..WWWWWWWn',
    '.WWWnnWWWn',
    '....WWWWWn',
    '....WWWWnn',
    '....WWWWnn',
  ],
};

function mirrorRow(left) {
  return left + left.slice(0, 9).split('').reverse().join('');
}

/** ASCII マップ → オフスクリーン canvas */
function pixelsFromMap(rows, pal, px = 1) {
  const w = rows[0].length, h = rows.length;
  const { canvas, ctx } = window.HN.makeCanvas(w * px, h * px);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = pal[rows[y][x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  return { canvas, w: w * px, h: h * px };
}

const SHIP = { w: 19, h: 19, frames: {}, built: false, focused: {} };

function buildShip() {
  if (SHIP.built) return;
  for (const [key, half] of Object.entries(SHIP_HALF)) {
    const rows = half.map(mirrorRow);
    SHIP.frames[key] = pixelsFromMap(rows, SHIP_PAL, 1);
    // 「集中」時は機体の縁が光る（同一形状で発光色に差し替えたもの）
    const glowRows = rows.map(r => r.replace(/[Ww]/g, 'W').replace(/N/g, 'g'));
    SHIP.focused[key] = pixelsFromMap(glowRows, SHIP_PAL, 1);
  }
  SHIP.built = true;
}

/* ==========================================================================
 * 立ち絵（カットイン）・表情アイコン・人物データ
 * ======================================================================= */
const CHARS = {
  ryoma: { name: '両馬 二郎', short: '両馬', tie: 'enji', role: '✝本質✝を撒く男', face: 'face' },
  terachi: { name: '寺地 星', short: '寺地', tie: 'enji', role: '本質配信の配信者', face: 'face' },
  satou: { name: '砂糖 東洋', short: '砂糖', tie: 'enji', role: '窓の外を見ない男', face: 'face' },
  mie: { name: '三重 県臣', short: '三重', tie: 'enji', role: '冷笑系', face: 'face' },
  rei: { name: '零', short: '零', tie: 'enji', role: '全科目学年首席', face: 'face' },
  kuraishi: { name: '倉石 暁', short: '倉石', tie: 'enji', role: '✝本質✝の狂信者', face: 'face' },
  katsuya: { name: '塀 勝也', short: 'ヘイカツ', tie: null, role: '地理教師', face: 'face' },
  sakura: { name: '櫻 優', short: '櫻', tie: 'navy', role: '恋愛学の研究者', face: 'face' },
  naitou: { name: '内藤 蘭', short: '内藤', tie: 'navy', role: '休み時間は本を読む', face: 'face' },
  mitsumine: { name: '三峰', short: '三峰', tie: 'navy', role: '質問が直球', face: 'face' },
  meshino: { name: '召野 カイト', short: '召野', tie: 'enji', role: '英語が急上昇', face: 'face' },
  izumi: { name: '伊豆見', short: '伊豆見', tie: 'enji', role: '半歩ずれる', face: 'face' },
  izaki: { name: '伊崎', short: '伊崎', tie: 'enji', role: 'まとめ役', face: 'face' },
  futami: { name: '二見', short: '二見', tie: null, role: '英語教師', face: 'face' },
  inaba: { name: '稲葉', short: '稲葉', tie: null, role: '（原作 三年生編）', face: 'face' },
};

/** 画像キャッシュ（実体は assets/ から読み込む） */
const IMG = {
  cutin: {},      // key -> HTMLImageElement
  face: {},
  loaded: false,
  pending: 0,
  failed: [],
};

function loadImage(src, cache, key) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { cache[key] = img; resolve(img); };
    img.onerror = () => { IMG.failed.push(key); resolve(null); };
    img.src = src;
  });
}

/**
 * 素材を読み込む。読み込みに失敗してもゲームは動く（描画側で代替表示）。
 * @param {(p:number)=>void} onProgress
 */
async function loadAssets(onProgress) {
  const jobs = [];
  for (const key of Object.keys(CHARS)) {
    jobs.push(loadImage(`assets/cutin/${key}.png`, IMG.cutin, key));
    jobs.push(loadImage(`assets/face/${key}.png`, IMG.face, key));
  }
  let done = 0;
  await Promise.all(jobs.map(p => p.then(() => { done++; onProgress?.(done / jobs.length); })));
  IMG.loaded = true;
  buildShip();
  return IMG.failed.length;
}

/** カットイン（原画をそのまま使う。原作の印象を最優先する場面で使用） */
function drawCutin(ctx, key, x, y, o = {}) {
  const img = IMG.cutin[key];
  const sc = o.scale ?? 1;
  if (!img) {
    // 代替: 名前だけでも出す（素材欠損時に無言で消えないように）
    const c = CHARS[key];
    if (c) window.HN.drawText(ctx, c.name, x, y, { size: 14 * sc, color: '#8b94ad', align: 'center' });
    return;
  }
  const w = img.width * sc, h = img.height * sc;
  const ax = x - w * (o.anchorX ?? 0.5);
  const ay = y - h * (o.anchorY ?? 1);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.side === 'right') {   // 右側に出すときは反転
    ctx.translate(ax + w / 2, ay);
    ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, 0, w, h);
  } else {
    ctx.drawImage(img, ax, ay, w, h);
  }
  ctx.restore();
  return { x: ax, y: ay, w, h };
}

/** 表情アイコン（48px）。会話ウィンドウの左に置く。 */
function drawFace(ctx, key, x, y, o = {}) {
  const img = IMG.face[key];
  const sc = o.scale ?? 1;
  const s = 48 * sc;
  if (!img) {
    ctx.fillStyle = '#141728';
    ctx.fillRect(x, y, s, s);
    return;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.drawImage(img, x, y, s, s);
  ctx.restore();
}

window.HN = window.HN || {};
Object.assign(window.HN, {
  SHIP, buildShip, pixelsFromMap, mirrorRow, SHIP_PAL,
  CHARS, IMG, loadAssets, drawCutin, drawFace, loadImage,
});
