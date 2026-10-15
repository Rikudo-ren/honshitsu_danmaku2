/* =============================================================================
 * src/art/bosses.js — ボス造形とアニメーション
 *
 *  【方針】原作は「敵のいない」学園日常小説である。したがってボスは悪役ではない。
 *  各ボスは「その人物が体現しているもの」を巨大化した存在として造形する。
 *  プレイヤーは撃破するのではなく、その人の「時間」を耐えきる。
 *
 *  【造形手法】
 *  すべてのボスは共通の骨格関数（drawHead / drawBody）で描く。
 *  小さな手描きピクセルマップで「顔」を作り、体・腕・小道具・オーラは
 *  パラメータで動かす。こうすることで
 *    ・ポーズ数（待機/浮遊/予備動作/攻撃/被弾/移行/敗北）を増やしても破綻しない
 *    ・全ボスが同じ画風に揃う（＝統一感）
 *  という 2 点を同時に満たす。px 単位ですべての矩形を配置するため、
 *  拡大しても常にドットが崩れない。
 *
 *  ボス一覧:
 *   mie      三重県臣  ── 冷笑。えんじのネクタイ。組んだ腕。隙間から光が漏れる。
 *   katsuya  塀勝也   ── 地理教師。地形図を広げたまま、窓の外を見ている。
 *   kuraishi 倉石暁   ── 狂信者。✝のノート。髪が逆立つ。後光が回る。
 *   honshitsu 塀勝也・最終 ── 「地形図の向こう側」。等高線が体を成す。
 * ========================================================================== */
'use strict';

/* ---------------------------------------------------------------- 色 ------- */
const BOSS_PAL = {
  skin_light: '#f6d5be', skin: '#e8b494', skin_shade: '#c98a6a', skin_dark: '#9c6046',
  hair_dark: '#1c1a24', hair: '#2b2733', hair_light: '#413b4c',
  hair_brown: '#3a2a24', hair_brown_lt: '#57402f',
  hair_gray: '#5c5a66', hair_gray_lt: '#83808f',
  suit: '#1b2233', suit_lt: '#2a3348', suit_shade: '#12161f',
  cardigan: '#4a4432', cardigan_lt: '#63603f', cardigan_shade: '#2e2b20',
  shirt: '#d8dcea', shirt_shade: '#a8adbf',
  tie_enji: '#94203c', tie_enji_lt: '#c9556e', tie_enji_dk: '#5e0f22',
  tie_navy: '#2f4fa0', tie_navy_lt: '#5f7fd0', tie_navy_dk: '#1d3370',
  eye_cold: '#7b85a8', eye_warm: '#8a6a4e', eye_fire: '#d4701a',
  eye_glow: '#f0cf6a', eye_sky: '#8fe8f2',
  glass: '#c9cfe2', glass_edge: '#7d849e', glass_dark: '#2b2f42',
  white: '#ffffff', ink: '#05060c',
  gold: '#f0cf6a', gold_dk: '#c39a3c', gold_dp: '#6b5320',
  crimson: '#a82244', crimson_lt: '#e05575', crimson_dp: '#5c1226',
  green: '#2d7a4e', green_lt: '#7fd6a0', green_dp: '#17402a',
  cyan: '#2a9dae', cyan_lt: '#8fe8f2',
  paper: '#e9eefb', paper_mid: '#c2cbe4', paper_shade: '#8f9ab8', paper_line: '#4a5578',
};

/* =========================================================================
 * 顔（小さな手描きピクセルマップ）
 *   'h'=髪 'H'=髪の明部 'd'=髪の暗部 's'=肌 'S'=肌の影 'e'=目 'E'=目の光
 *   'g'=眼鏡 'w'=白目 'm'=口 'n'=輪郭線 '.'=透明
 *  左右対称なので左半分（8 文字、末尾が中心列）を定義して鏡像展開する。
 * ======================================================================= */
const HEADS = {
  /* 三重県臣 — 整った短髪、角張った眼鏡、冷たい目 */
  mie: {
    pal: { h: BOSS_PAL.hair, H: BOSS_PAL.hair_light, d: '#141118', s: BOSS_PAL.skin, S: BOSS_PAL.skin_shade, e: BOSS_PAL.eye_cold, E: '#ffffff', g: BOSS_PAL.glass, n: BOSS_PAL.ink, m: '#a05a56' },
    half: [
      '.....nnn',
      '...nnhhh',
      '..nnhhhh',
      '.nnhhhhh',
      '.nhhhhhh',
      '.nhhhhhh',
      '.nhsssss',
      '.nhsssss',
      '.nhssggg',
      '.nhssggg',
      '.nhsssss',
      '.nhsssss',
      '.nnhssss',
      '..nsssss',
      '...sssss',
      '....ssss',
    ],
    eyes: [[4, 8], [4, 9]],
    mouth: [6, 13, 2],
    glasses: [3, 2, 7, 3],
  },
  /* 塀勝也 — 無造作な黒髪、疲れた目、角眼鏡。地理教師 */
  katsuya: {
    pal: { h: BOSS_PAL.hair, H: BOSS_PAL.hair_light, d: '#141118', s: BOSS_PAL.skin_light, S: BOSS_PAL.skin, e: BOSS_PAL.eye_warm, E: '#ffffff', g: BOSS_PAL.glass, n: BOSS_PAL.ink, m: '#a05a56' },
    half: [
      '...nnhhh',
      '..nhhhhh',
      '.nhhhhhh',
      '.nhhhhhh',
      'nhhhhhhh',
      'nhhhhhhh',
      'nhhsssss',
      'nhssssss',
      'nghhssss',
      'nghhssss',
      'nhssssss',
      '.nhsssss',
      '.nnhssss',
      '..nsssss',
      '...sssss',
      '...sssss',
    ],
    eyes: [[5, 8], [5, 9]],
    mouth: [6, 13, 2],
    glasses: [3, 3, 7, 3],
  },
  /* 倉石暁 — 逆立った髪、ぎらつく目、✝の気配 */
  kuraishi: {
    pal: { h: BOSS_PAL.hair_dark, H: '#584f66', d: '#0d0b12', s: BOSS_PAL.skin_light, S: BOSS_PAL.skin, e: BOSS_PAL.eye_fire, E: '#fffbe8', g: BOSS_PAL.glass, n: BOSS_PAL.ink, m: '#8c4a4a' },
    half: [
      '.n.nhhhh',
      'nnnhhhhh',
      '.nnnhhhh',
      '.nnhhhhh',
      '.nnhhhhh',
      '.nhhhhhh',
      '.nhhhssss',
      '.nhssssss',
      '.nggsssss',
      '.nggsssss',
      '.nhssssss',
      '..nhsssss',
      '..nnhssss',
      '...nsssss',
      '....sssss',
      '....sssss',
    ],
    eyes: [[4, 8], [4, 9]],
    mouth: [6, 13, 2],
    glasses: [2, 2, 7, 3],
  },
  /* 零 — 静かな目。髪は短く整い、眼鏡なし */
  rei: {
    pal: { h: BOSS_PAL.hair, H: BOSS_PAL.hair_light, d: '#141118', s: BOSS_PAL.skin_light, S: BOSS_PAL.skin, e: '#4a5578', E: '#ffffff', g: null, n: BOSS_PAL.ink, m: '#a05a56' },
    half: [
      '....nhhh',
      '..nhhhhh',
      '.nhhhhhh',
      '.nhhhhhh',
      'nhhhhhhh',
      'nhhhhhhh',
      'nhhsssss',
      'nhssssss',
      'nhssssss',
      'nhssssss',
      '.nhsssss',
      '.nhsssss',
      '.nnhssss',
      '..nsssss',
      '...sssss',
      '...sssss',
    ],
    eyes: [[4, 8], [4, 9]],
    mouth: [6, 13, 2],
    glasses: null,
  },
};

function mirrorRowN(half, w) {
  const rev = half.slice(0, half.length - 1).split('').reverse().join('');
  const row = half + rev;
  return row.length >= w ? row : row + '.'.repeat(w - row.length);
}

/** 顔を描く（マップ + 目 + 口 + 眼鏡） */
function drawHeadMap(ctx, key, x, y, px, o = {}) {
  const def = HEADS[key] || HEADS.mie;
  const halfW = def.half[0].length;
  const w = halfW * 2 - 1;
  const pal = def.pal;
  const expr = o.expr || 'idle';

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  // マップ本体
  for (let r = 0; r < def.half.length; r++) {
    const row = mirrorRowN(def.half[r], w);
    for (let c = 0; c < w; c++) {
      const ch = row[c];
      let col = pal[ch];
      if (ch === 'g' && !pal.g) col = null;
      if (!col) continue;
      // 眼鏡レンズ部分は目を描くときに上書きするので、ここでは髪/肌/輪郭のみ
      if (ch === 'g') continue;
      ctx.fillStyle = col;
      ctx.fillRect(c * px, r * px, px, px);
    }
  }
  // 目（表情で高さ・大きさが変わる）
  const eyeCol = expr === 'fire' ? BOSS_PAL.eye_glow : pal.e;
  const eyeW = expr === 'wide' ? 2 : 1;
  const eyeH = expr === 'closed' ? 1 : (expr === 'wide' ? 2 : 1);
  for (const [ex, ey] of def.eyes) {
    for (const side of [0, 1]) {
      const cx = (side ? (w - 1 - ex) : ex);
      const blinkMid = o.blink ? 1 : 0;
      if (expr === 'closed' || blinkMid) {
        ctx.fillStyle = pal.n;
        ctx.fillRect((cx - Math.floor(eyeW / 2)) * px, (ey + eyeH - 1) * px, (eyeW + 1) * px, px);
        continue;
      }
      ctx.fillStyle = pal.n;
      ctx.fillRect((cx - Math.floor(eyeW / 2)) * px, ey * px, (eyeW + 1) * px, eyeH * px);
      ctx.fillStyle = eyeCol;
      ctx.fillRect((cx - Math.floor(eyeW / 2)) * px, ey * px, eyeW * px, eyeH * px);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect((cx - Math.floor(eyeW / 2)) * px, ey * px, px, px);
    }
  }
  // 眼鏡
  if (def.glasses && pal.g) {
    const [gx, gy, gw, gh] = def.glasses;
    ctx.fillStyle = pal.g;
    for (const side of [0, 1]) {
      const bx = side ? (w - gx - gw) : gx;
      // レンズは輪郭のみ（目が透ける）
      ctx.fillRect(bx * px, gy * px, gw * px, px);
      ctx.fillRect(bx * px, (gy + gh - 1) * px, gw * px, px);
      ctx.fillRect(bx * px, gy * px, px, gh * px);
      ctx.fillRect((bx + gw - 1) * px, gy * px, px, gh * px);
    }
    // ブリッジ
    ctx.fillRect((Math.floor(w / 2) - 1) * px, (gy + 1) * px, 2 * px, px);
    // レンズの反射（光源は左上）
    ctx.globalAlpha = (o.glassGlint ?? 0.35);
    ctx.fillStyle = '#ffffff';
    for (const side of [0, 1]) {
      const bx = side ? (w - gx - gw) : gx;
      ctx.fillRect((bx + 1) * px, (gy + 1) * px, px, px);
      ctx.fillRect((bx + gw - 2) * px, (gy + gh - 2) * px, px, px);
    }
    ctx.globalAlpha = 1;
  }
  // 口
  if (def.mouth && expr !== 'closed') {
    const [mx, my, mw] = def.mouth;
    ctx.fillStyle = pal.m;
    let mw2 = mw, my2 = my;
    if (expr === 'open') { mw2 = mw + 1; my2 = my - 1; }
    if (expr === 'grim') { mw2 = mw + 1; }
    ctx.fillRect((mx - Math.floor(mw2 / 2)) * px, my2 * px, mw2 * px, px);
  }
  ctx.restore();
}

/* =========================================================================
 * 体・腕・小道具
 * ======================================================================= */
/** スーツの胴体。tieColor で内進(紺)/理数科(えんじ)を切り替える。 */
function drawBodySuit(ctx, px, o = {}) {
  const P = BOSS_PAL;
  const suit = o.suit || P.suit, suitLt = o.suitLt || P.suit_lt, suitDk = o.suitShade || P.suit_shade;
  const tie = o.tie || P.tie_enji, tieLt = o.tieLt || P.tie_enji_lt, tieDk = o.tieDk || P.tie_enji_dk;
  const shoulder = o.shoulder ?? 13;
  const height = o.height ?? 26;
  const lean = o.lean ?? 0;
  const breathe = o.breathe ?? 0;

  ctx.save();
  ctx.translate(lean * px * 2, breathe * px);
  // 胴（肩幅 → 裾へ広がる台形）
  for (let r = 0; r < height; r++) {
    const t = r / height;
    const halfW = Math.round(shoulder * (1 - 0.10 * t) + (o.waist ?? -1) * t);
    for (let c = -halfW; c <= halfW; c++) {
      let col = suit;
      if (c <= -halfW + 1 || c >= halfW - 1) col = suitDk;      // 輪郭
      else if (c > -3 && c < 3) col = suitLt;                    // 前立て
      if ((r + c + 64) % 7 === 0) col = (col === suit) ? suitLt : col;  // 織り目
      ctx.fillStyle = col;
      ctx.fillRect(c * px, r * px, px, px);
    }
  }
  // シャツ（V 字）
  for (let r = 0; r < 8; r++) {
    const halfW = Math.max(0, 4 - Math.floor(r * 0.5));
    for (let c = -halfW; c <= halfW; c++) {
      ctx.fillStyle = (c === -halfW || c === halfW) ? P.shirt_shade : P.shirt;
      ctx.fillRect(c * px, r * px, px, px);
    }
  }
  // ネクタイ（先端は揺れる）
  const tieW = 2;
  for (let r = 2; r < height - 4; r++) {
    const w = r < 8 ? tieW : tieW + 1;
    for (let c = -w; c <= w; c++) {
      ctx.fillStyle = (c <= -w + 1 || c >= w - 1) ? tieDk : (c === 0 ? tieLt : tie);
      const sway = Math.round(Math.sin((r * 0.24) + (o.wind ?? 0)) * 0.6);
      ctx.fillRect((c + sway) * px, r * px, px, px);
    }
  }
  ctx.restore();
}

/** カーディガン姿（塀勝也） */
function drawBodyCardigan(ctx, px, o = {}) {
  const P = BOSS_PAL;
  const height = o.height ?? 26, shoulder = o.shoulder ?? 13;
  ctx.save();
  ctx.translate((o.lean ?? 0) * px * 2, (o.breathe ?? 0) * px);
  for (let r = 0; r < height; r++) {
    const t = r / height;
    const halfW = Math.round(shoulder * (1 - 0.08 * t) + (o.waist ?? -1) * t);
    for (let c = -halfW; c <= halfW; c++) {
      let col = P.cardigan;
      if (c <= -halfW + 1 || c >= halfW - 1) col = P.cardigan_shade;
      else if (c > -4 && c < 4) col = P.cardigan_lt;
      if ((r * 3 + c + 64) % 9 === 0) col = P.cardigan_lt;   // 編み目
      ctx.fillStyle = col; ctx.fillRect(c * px, r * px, px, px);
    }
  }
  // 中はシャツ
  for (let r = 0; r < 9; r++) {
    const halfW = Math.max(0, 3 - Math.floor(r * 0.4));
    for (let c = -halfW; c <= halfW; c++) {
      ctx.fillStyle = (c <= -halfW || c >= halfW) ? P.shirt_shade : P.shirt;
      ctx.fillRect(c * px, r * px, px, px);
    }
  }
  // 派手でないネクタイ（暗い茶）
  for (let r = 3; r < 14; r++) {
    for (let c = -1; c <= 1; c++) {
      ctx.fillStyle = c === 0 ? '#5a4430' : '#3d2d20';
      ctx.fillRect(c * px, r * px, px, px);
    }
  }
  ctx.restore();
}

/** 腕。angle(rad) で肩から伸びる。hand:'open'|'clasp'|'point'|'hold' */
function drawArm(ctx, px, sx, sy, len, angle, o = {}) {
  const P = BOSS_PAL;
  const dark = o.dark ? BOSS_PAL.suit_shade : BOSS_PAL.suit;
  const light = o.dark ? BOSS_PAL.suit : BOSS_PAL.suit_lt;
  let x = Math.round(sx), y = Math.round(sy);
  const step = 1;
  for (let i = 0; i < len; i++) {
    const nx = Math.round(sx + Math.cos(angle) * i);
    const ny = Math.round(sy + Math.sin(angle) * i);
    for (let w = -1; w <= 1; w++) {
      const ox = Math.round(Math.cos(angle + Math.PI / 2) * w);
      const oy = Math.round(Math.sin(angle + Math.PI / 2) * w);
      ctx.fillStyle = (w === 0) ? light : dark;
      ctx.fillRect((nx + ox) * px, (ny + oy) * px, px, px);
    }
  }
  // 手
  const hx = Math.round(sx + Math.cos(angle) * len), hy = Math.round(sy + Math.sin(angle) * len);
  ctx.fillStyle = BOSS_PAL.skin;
  ctx.fillRect((hx - 1) * px, (hy - 1) * px, 2 * px, 2 * px);
  return { hx, hy };
}

/** 地形図（塀勝也の小道具）。等高線が描かれた紙。 */
function drawMapProp(ctx, px, cx, cy, w, h, o = {}) {
  const P = BOSS_PAL;
  const rot = o.rot ?? 0;
  ctx.save();
  ctx.translate(Math.round(cx * px), Math.round(cy * px));
  ctx.rotate(rot);
  // 紙
  for (let r = -h / 2; r < h / 2; r++) {
    for (let c = -w / 2; c < w / 2; c++) {
      let col = P.paper;
      if (c <= -w / 2 + 1 || c >= w / 2 - 1 || r <= -h / 2 + 1 || r >= h / 2 - 1) col = P.paper_shade;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(c * px), Math.round(r * px), px, px);
    }
  }
  // 等高線（楕円の入れ子）
  ctx.strokeStyle = P.paper_line;
  ctx.lineWidth = Math.max(1, px * 0.5);
  for (let i = 1; i <= 4; i++) {
    const rr = (Math.min(w, h) / 2 - 2) * (i / 4.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(1, rr * 0.86) * px, Math.max(1, rr) * px, o.lineRot ?? 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 川（一本の線）
  ctx.strokeStyle = BOSS_PAL.cyan;
  ctx.beginPath();
  ctx.moveTo(-w * 0.36 * px, h * 0.34 * px);
  ctx.quadraticCurveTo(0, 0, w * 0.36 * px, -h * 0.34 * px);
  ctx.stroke();
  // 座標の十字
  ctx.strokeStyle = BOSS_PAL.crimson;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.42 * px); ctx.lineTo(0, h * 0.42 * px);
  ctx.moveTo(-w * 0.42 * px, 0); ctx.lineTo(w * 0.42 * px, 0);
  ctx.stroke();
  if (o.glow) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = o.glow * 0.25;
    ctx.fillStyle = BOSS_PAL.gold;
    ctx.fillRect(-w / 2 * px, -h / 2 * px, w * px, h * px);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/* =========================================================================
 * ボス本体
 * ======================================================================= */
/**
 * ボスを描く
 * o: {
 *   head,            顔マップのキー
 *   body: 'suit'|'cardigan',
 *   px,              1 ドットの大きさ
 *   pose,            'idle'|'float'|'charge'|'attack'|'hit'|'shift'|'defeat'|'appear'
 *   t,               アニメ時間（秒）
 *   tie, tieLt, tieDk,
 *   aura,            オーラ色
 *   expr,            表情
 *   heldMap,         地形図を出すか {w,h,rot}
 *   halo,            ✝ の後光
 *   contour,         等高線が体を成す（最終形態）
 * }
 */
function drawBoss(ctx, o) {
  const px = o.px ?? 3;
  const t = o.t ?? 0;
  const pose = o.pose || 'idle';
  const P = BOSS_PAL;
  const aura = o.aura || P.gold;

  // ポーズごとの身体パラメータ
  let breathe = 0, lean = 0, armAngL = 2.2, armAngR = 0.94, headDy = 0, hpScale = 1;
  switch (pose) {
    case 'idle': breathe = Math.sin(t * 1.6) * 0.5; headDy = Math.sin(t * 1.2) * 0.4; break;
    case 'float': breathe = Math.sin(t * 1.1) * 1.2; headDy = Math.sin(t * 0.9) * 1.6; break;
    case 'appear': breathe = -2 + Math.sin(t * 2) * 0.3; break;
    case 'charge':                       // 予備動作: 後ろに反り、腕を広げる
      breathe = -Math.sin(Math.min(1, t * 1.4) * Math.PI) * 1.6;
      armAngL = 2.5 - t * 0.5; armAngR = 0.64 + t * 0.5;
      break;
    case 'attack':                       // 攻撃: 前へ踏み込み、腕を突き出す
      lean = Math.min(1.6, t * 6);
      armAngL = 2.9; armAngR = 0.24;
      break;
    case 'hit':                          // 被弾: 後ろへ仰け反る
      lean = -1.4; headDy = -1.2; hpScale = 0.96;
      break;
    case 'shift':                        // フェーズ移行: 浮き上がり、光をまとう
      breathe = -Math.sin(Math.min(1, t) * Math.PI) * 2.4;
      armAngL = 2.6; armAngR = 0.54;
      break;
    case 'defeat':
      breathe = t * 2.6; lean = Math.sin(t * 5) * 1.6;
      break;
  }

  ctx.save();
  ctx.translate(0, 0);

  // --- 背後の暗い下地 ---
  // ボスと弾が視覚的に溶け合わないように、シルエットの後ろだけ落とす。
  // 「ボスが背景に溶けない」「エフェクトが視認性を損なわない」の両方を満たす。
  {
    const cy = 40 * px / 3, R = 74 * px / 3;
    const bg = ctx.createRadialGradient(0, cy, R * 0.18, 0, cy, R);
    bg.addColorStop(0, 'rgba(5,6,12,0.62)');
    bg.addColorStop(0.62, 'rgba(5,6,12,0.34)');
    bg.addColorStop(1, 'rgba(5,6,12,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0, cy, R, 0, Math.PI * 2); ctx.fill();
  }

  /* --- フェーズ形態（form）--- 
   * フェーズが進むごとに「地形図の層」が増える。
   *   1: 等高線リング 1 枚（その人物の輪郭が滲み出す）
   *   2: リング 2 枚 + 周回する破片
   *   3: リング 3 枚 + 破片 + 外周の計器リング（＝✝本質✝の記述）
   * 色はフェーズ固有の accent を使うので、同じボスでも章の進み具合で
   * 「別の形態」に見える。弾幕の色と揃うため画面の統一感も出る。
   */
  const form = o.form ?? 0;
  const accent = o.accent || aura;
  if (form > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cy = 40 * px / 3;
    for (let i = 0; i < Math.min(form, 3); i++) {
      const k = i + 1;
      const wob = 1 + Math.sin(t * (0.9 + k * 0.25) + i * 2.1) * 0.035;
      const rx = (58 + k * 22) * px / 3 * wob;
      const ry = (16 + k * 7) * px / 3 * wob;
      ctx.globalAlpha = 0.20 - i * 0.04;
      ctx.strokeStyle = i === 0 ? accent : '#fffbe8';
      ctx.lineWidth = Math.max(1, px * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, cy + i * 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 周回する破片（地形図の記号が舞う）
    const shardN = form >= 3 ? 10 : form >= 2 ? 6 : 0;
    for (let i = 0; i < shardN; i++) {
      const a = t * (0.35 + (i % 3) * 0.12) + (i / shardN) * Math.PI * 2;
      const rr = (72 + (i % 4) * 9) * px / 3;
      const sx = Math.cos(a) * rr, sy = cy + Math.sin(a) * rr * 0.42;
      ctx.globalAlpha = 0.42 + 0.28 * Math.sin(t * 2 + i);
      ctx.fillStyle = i % 2 ? accent : '#fffbe8';
      const ss = (i % 3 === 0) ? px * 1.4 : px * 0.9;
      ctx.fillRect(Math.round(sx - ss / 2), Math.round(sy - ss / 2), Math.round(ss), Math.round(ss));
    }
    // 最上位形態の外周リング（目盛り付き）
    if (form >= 3) {
      const R = 104 * px / 3;
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, px * 0.5);
      ctx.beginPath(); ctx.arc(0, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.30;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 - t * 0.12;
        const r0 = R - px * 0.6, r1 = R + px * (i % 6 === 0 ? 2.4 : 1.1);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- 後光（✝）---
  if (o.halo) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 弾を白飛びさせないよう控えめにする（輪郭の主張で存在感を出す）
    ctx.globalAlpha = 0.14 + pulse * 0.14;
    const R = (o.haloR ?? 96) * (1 + pulse * 0.06);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, aura);
    g.addColorStop(0.42, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 回転する放射
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 + pulse * 0.10;
    ctx.strokeStyle = aura; ctx.lineWidth = px * 0.7;
    for (let i = 0; i < 12; i++) {
      const a = t * 0.5 + (i / 12) * Math.PI * 2;
      const r0 = 40 * px / 3, r1 = (58 + Math.sin(t * 3 + i) * 8) * px / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- ✝ マーク（出現・移行時に大きく光る）---
  if (o.showCross) {
    window.HN.drawCross(ctx, 0, -22 * px, {
      ramp: P.gold ? [P.gold_dp, P.gold_dk, P.gold, '#fffbe8'] : null,
      scale: (o.crossScale ?? 2) * px * 0.85, glow: 1.1,
      pulse: 0.5 + 0.5 * Math.sin(t * 3),
      alpha: o.crossAlpha ?? 1,
      rot: o.crossRot ?? 0,
    });
  }

  // --- 大地形図（塀勝也）---
  if (o.heldMap) {
    const m = o.heldMap;
    drawMapProp(ctx, px, m.dx ?? 20, (m.dy ?? -6) + Math.sin(t * 1.3) * 0.8, m.w ?? 34, m.h ?? 24,
      { rot: (m.rot ?? 0) + Math.sin(t * 0.7) * 0.05, glow: m.glow ?? 0, lineRot: t * 0.1 });
  }

  ctx.save();
  ctx.scale(hpScale, hpScale);

  // --- 体 ---
  const bodyTopY = 8 + headDy + breathe;   // 胴の開始（px 単位）
  if (o.contourBody) {
    // 最終形態: 体が等高線でできている
    drawContourBody(ctx, px, bodyTopY, o.height ?? 30, o.shoulder ?? 15, t, accent,
      o.form ?? 0);
  } else if (o.body === 'cardigan') {
    ctx.save(); ctx.translate(0, bodyTopY * px);
    drawBodyCardigan(ctx, px, { height: o.height ?? 28, shoulder: o.shoulder ?? 14, lean, breathe: 0, waist: 0 });
    ctx.restore();
  } else {
    ctx.save(); ctx.translate(0, bodyTopY * px);
    drawBodySuit(ctx, px, {
      height: o.height ?? 28, shoulder: o.shoulder ?? 14, lean, breathe: 0, waist: 0,
      tie: o.tie, tieLt: o.tieLt, tieDk: o.tieDk, wind: t * 1.6,
    });
    ctx.restore();
  }

  // --- 腕 ---
  const shoulderY = bodyTopY + 2;
  const shL = -((o.shoulder ?? 14) - 1), shR = ((o.shoulder ?? 14) - 1);
  if (o.contourBody) {
    // 最終形態は腕を描かない（人型を保たない）
  } else {
    const hand = drawArm(ctx, px, shL, shoulderY, o.armLen ?? 13, armAngL, { dark: o.body === 'cardigan' });
    const hand2 = drawArm(ctx, px, shR, shoulderY, o.armLen ?? 13, armAngR, {});
    if (o.onHands) o.onHands(hand, hand2);
  }

  // --- 頭 ---
  drawHeadMap(ctx, o.head || 'mie', 0, headDy * px, px, {
    expr: o.expr || (pose === 'hit' ? 'closed' : pose === 'attack' ? 'grim' : 'idle'),
    blink: o.blink, glassGlint: o.glassGlint,
  });
  ctx.restore();
  ctx.restore();
}

/** 最終形態: 等高線でできた体 */
/**
 * 最終形態の体 — 「最後の地形図」
 *
 * 設計: 人の形を等高線で描く。塗りつぶさず、線の間から背景が見えるようにする。
 *  ・輪郭（肩→胴→裾）は通常形態と同じ人体プロファイルを使い、人の形だと分かるようにする
 *  ・横方向の等高線を 3px 間隔で置き、線の太さは 1px（＝地図の等高線）
 *  ・「間隔が狭い＝傾斜が急」を左右の端で表現し、右肩上がりに詰めていく
 *  ・中央のコアは光るが小さく（弾の視認性を奪わない）
 */
function drawContourBody(ctx, px, topPx, height, shoulder, t, aura, form = 0) {
  const P = BOSS_PAL;
  ctx.save();
  // 背後の暗いシルエット（線だけだと背景に負けるため、ごく薄く敷く）
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#07130f';
  for (let r = 0; r <= height; r++) {
    const t01 = r / height;
    let halfW = Math.round(shoulder * Math.sin(Math.min(1, t01 * 1.15) * Math.PI * 0.85) + 3);
    if (t01 > 0.75) halfW = Math.round(halfW * (1 - (t01 - 0.75) * 1.7));
    halfW = Math.max(1, halfW);
    ctx.fillRect(Math.round(-halfW * px), Math.round((topPx + r) * px), Math.round(halfW * 2 * px), Math.ceil(px));
  }
  ctx.globalAlpha = 1;

  // 等高線本体。form が上がるほど間隔が詰まる（＝傾斜が急になる）。
  // 原作の「残り時間が少ないほど密度が上がる」と同じ理屈を、ボスの姿で示す。
  const step = form >= 3 ? 2 : 3;
  for (let r = 0; r <= height; r += step) {
    const t01 = r / height;
    let halfW = Math.round(shoulder * Math.sin(Math.min(1, t01 * 1.15) * Math.PI * 0.85) + 3);
    if (t01 > 0.75) halfW = Math.round(halfW * (1 - (t01 - 0.75) * 1.7));
    halfW = Math.max(1, halfW);
    const y = Math.round((topPx + r) * px);
    const x0 = Math.round(-halfW * px), wpx = Math.round(halfW * 2 * px);
    // 中央線（金）と外側（緑）を重ね、等高線の「主曲線／補助曲線」を作る
    const main = (r % 21 === 0);
    ctx.fillStyle = main ? aura : P.green_lt;
    ctx.globalAlpha = main ? 0.95 : 0.62;
    ctx.fillRect(x0, y, wpx, main ? 2 : 1);

    // 左右の端を濃くする（線が密なところ＝傾斜が急）
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = main ? '#fffbe8' : P.cyan;
    ctx.fillRect(x0, y, px, main ? 2 : 1);
    ctx.fillRect(x0 + wpx - px, y, px, main ? 2 : 1);

    // 右側だけ補助線を詰める（等高線の間隔で傾斜を描く）
    if (!main && r % (form >= 2 ? 4 : 6) === 0) {
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = P.cyan;
      ctx.fillRect(x0, y + 1, Math.round(wpx * 0.62), 1);
    }
  }
  ctx.globalAlpha = 1;

  // 中央の光る核（小さく）
  const cyy = (topPx + height * 0.42) * px;
  const g = ctx.createRadialGradient(0, cyy, 0, 0, cyy, px * 6);
  g.addColorStop(0, 'rgba(255,251,232,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, cyy, px * 6, 0, Math.PI * 2); ctx.fill();

  // 足元から立ち上る等高線（浮遊感）
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = P.cyan;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const rr = (shoulder + 6 + i * 7) * px;
    const yy = (topPx + height + 4 + i * 3) * px;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + i);
    ctx.globalAlpha = 0.12 + pulse * 0.18;
    ctx.beginPath();
    ctx.ellipse(0, yy, rr, rr * 0.14, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.restore();
}

window.HN = window.HN || {};
Object.assign(window.HN, {
  BOSS_PAL, HEADS, drawBoss, drawHeadMap, drawBodySuit, drawBodyCardigan,
  drawArm, drawMapProp, drawContourBody, mirrorRowN,
});
