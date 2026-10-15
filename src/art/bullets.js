/* =============================================================================
 * src/art/bullets.js — 弾のスプライト定義と描画
 *
 *  各弾種は「中央 (0,0) を基準に w×h の箱へ描く」関数として定義する。
 *  描画は 2 パス:
 *    1) コア層  — 通常合成。くっきりした形と輪郭線。
 *    2) グロー層 — ctx.globalCompositeOperation = 'lighter' で加算合成。
 *                  'add' 色を指定した弾だけが光る。
 *
 *  【視認性の規則】すべての弾は『白いコア』を持つ。
 *  背景がどれだけ暗くても弾は白く光り、弾同士の識別は外周色で行う。
 * ========================================================================== */
'use strict';

const BULLET = {};

/** 弾種を登録する */
function defBullet(name, cfg) { cfg.name = name; BULLET[name] = cfg; }

/* ------------------------------------------------ 共通の下地ヘルパ -------- */
function circlePix(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}
function rectPix(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

/** 外縁→中間→白コア の三段円（もっとも基本的な弾） */
function orb(ctx, R, colOuter, colInner, colCore, coreR = 0.42) {
  circlePix(ctx, 0, 0, R, colOuter);
  circlePix(ctx, 0, 0, R * 0.74, colInner);
  circlePix(ctx, 0, 0, R * coreR, colCore);
  // 左上のハイライト
  circlePix(ctx, -R * 0.26, -R * 0.28, R * 0.19, 'rgba(255,255,255,0.75)');
}

/** 米弾（縦長のカプセル） */
function riceSprite(ctx, w, h, colOuter, colInner, colCore) {
  const rx = w / 2, ry = h / 2;
  ctx.fillStyle = colOuter;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colInner;
  ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.68, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colCore;
  ctx.beginPath(); ctx.ellipse(0, -ry * 0.12, rx * 0.3, ry * 0.42, 0, 0, Math.PI * 2); ctx.fill();
}

/* =========================================================================
 * 弾種定義
 * ======================================================================= */
const P = () => window.HN.RAMP;

/* --- 基本の米弾（原作の「×」印・米粒サイズ）--------------------------- */
defBullet('riceNavy', {
  w: 12, h: 12, add: null, radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().navy[1], P().navy[2], '#ffffff'); },
});
defBullet('riceEnji', {
  w: 12, h: 12, add: null, radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().tieEnji[0], P().tieEnji[2], '#ffffff'); },
});
defBullet('riceCream', {
  w: 12, h: 12, add: null, radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().cream[1], P().cream[2], '#ffffff'); },
});
defBullet('riceGold', {
  w: 12, h: 12, add: P().honshitsu[2], radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().honshitsu[1], P().honshitsu[2], '#ffffff'); },
});
defBullet('riceCyan', {
  w: 12, h: 12, add: P().cyan[2], radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().cyan[1], P().cyan[2], '#ffffff'); },
});
defBullet('riceGreen', {
  w: 12, h: 12, add: null, radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().green[1], P().green[2], '#ffffff'); },
});
defBullet('riceMiso', {
  w: 12, h: 12, add: null, radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().miso[1], P().miso[2], '#fff3e0'); },
});
defBullet('riceMagenta', {
  w: 12, h: 12, add: P().magenta[2], radius: 3.0, rotation: true,
  draw(ctx) { riceSprite(ctx, 6.5, 11.5, P().magenta[1], P().magenta[2], '#ffffff'); },
});

/* --- 大きな光球（遅く、美しく、密度の主役）--------------------------- */
defBullet('orbGold', {
  w: 26, h: 26, add: P().honshitsu[2], radius: 6.5, rotation: false, spin: 0.35,
  draw(ctx) { orb(ctx, 11, P().honshitsu[1], P().honshitsu[2], '#fffbe8', 0.44); },
  glow(ctx, r) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    g.addColorStop(0, 'rgba(255,235,180,0.55)');
    g.addColorStop(0.5, 'rgba(240,207,106,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
  },
});
defBullet('orbNavy', {
  w: 26, h: 26, add: P().navy[2], radius: 6.5, rotation: false, spin: 0.35,
  draw(ctx) { orb(ctx, 11, P().navy[1], P().navy[2], '#ffffff', 0.42); },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 17);
    g.addColorStop(0, 'rgba(160,190,255,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
  },
});
defBullet('orbEnji', {
  w: 26, h: 26, add: P().tieEnji[2], radius: 6.5, rotation: false, spin: 0.35,
  draw(ctx) { orb(ctx, 11, P().tieEnji[1], P().tieEnji[2], '#fff0f2', 0.42); },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 17);
    g.addColorStop(0, 'rgba(255,150,175,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
  },
});
defBullet('orbCyan', {
  w: 22, h: 22, add: P().cyan[2], radius: 5.5, rotation: false, spin: 0.3,
  draw(ctx) { orb(ctx, 9.5, P().cyan[1], P().cyan[2], '#f0ffff', 0.42); },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
    g.addColorStop(0, 'rgba(150,240,255,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- ✝本質✝ 弾: 十字が光る。原作の中心記号を弾にしたもの ------------ */
defBullet('crossHonshitsu', {
  w: 22, h: 22, add: P().honshitsu[2], radius: 5.0, rotation: false, spin: 0.6,
  draw(ctx) {
    window.HN.drawCross(ctx, 0, 0, {
      ramp: P().honshitsu, scale: 1, glow: 0, alpha: 1,
    });
    circlePix(ctx, 0, 0, 2.2, '#fffbe8');
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,245,200,0.62)');
    g.addColorStop(0.45, 'rgba(240,207,106,0.24)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- 等高線弾: 円の中に等高線が走る。勝也／地形図のテーマ ------------- */
defBullet('contour', {
  w: 30, h: 30, add: P().slate[2], radius: 7.0, rotation: false, spin: 0.15,
  draw(ctx) {
    circlePix(ctx, 0, 0, 12, P().slate[0]);
    // 等高線（同心の輪）
    ctx.strokeStyle = P().green[2]; ctx.lineWidth = 1.2;
    for (const r of [4.2, 7.0, 9.8]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = P().green[3]; ctx.lineWidth = 1.0;
    ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2); ctx.stroke();
    circlePix(ctx, 0, 0, 2.6, '#ffffff');
    circlePix(ctx, -3.6, -4.2, 1.4, 'rgba(255,255,255,0.7)');
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
    g.addColorStop(0, 'rgba(190,255,220,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- 味噌弾: 茶色の塊。火曜三限の味噌の地政学 ------------------------ */
defBullet('miso', {
  w: 20, h: 20, add: null, radius: 5.0, rotation: true, spin: 0.5,
  draw(ctx) {
    circlePix(ctx, 0, 0, 8.6, P().miso[0]);
    // 塊感のある不定形
    ctx.fillStyle = P().miso[1];
    ctx.beginPath();
    const rs = [8.0, 8.6, 8.2, 8.8, 8.1, 8.5];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = rs[i % rs.length] * (0.96 + 0.06 * Math.sin(i * 1.7));
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    circlePix(ctx, -1.6, -1.8, 3.4, P().miso[2]);
    circlePix(ctx, -2.2, -2.6, 1.7, '#ffe9c9');
  },
});

/* --- 段丘弾: 四角い階段状。河岸段丘のテーマ -------------------------- */
defBullet('terrace', {
  w: 20, h: 20, add: null, radius: 5.5, rotation: false, spin: 0.0,
  draw(ctx) {
    // 上から見た階段状の台地
    rectPix(ctx, -9, -9, 18, 18, P().green[0]);
    rectPix(ctx, -9, -9, 18, 18, P().green[1]);
    rectPix(ctx, -6, -6, 12, 12, P().green[2]);
    rectPix(ctx, -3, -3, 6, 6, P().gold[2]);
    rectPix(ctx, -1.5, -1.5, 3, 3, '#ffffff');
    ctx.strokeStyle = P().ink[3]; ctx.lineWidth = 1;
    ctx.strokeRect(-8.5, -8.5, 17, 17);
  },
});

/* --- 星弾: 天文学フォーラム／寺地の星空 ----------------------------- */
defBullet('star', {
  w: 18, h: 18, add: P().gold[3], radius: 4.5, rotation: true, spin: 0.2,
  draw(ctx) {
    ctx.fillStyle = P().gold[3];
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? 3.4 : 8.2;
      const x = Math.cos(a) * r * 0.78, y = Math.sin(a) * r * 0.78;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? 1.5 : 3.6;
      const x = Math.cos(a) * r * 0.78, y = Math.sin(a) * r * 0.78;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 13);
    g.addColorStop(0, 'rgba(255,246,200,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- 追尾弾: 矢印型。プレイヤーを緩やかに追う ----------------------- */
defBullet('chaser', {
  w: 20, h: 20, add: P().tieEnji[2], radius: 5.0, rotation: true, spin: 0,
  draw(ctx) {
    ctx.fillStyle = P().tieEnji[0];
    ctx.beginPath();
    ctx.moveTo(0, -9.5); ctx.lineTo(7.6, 7.0); ctx.lineTo(0, 4.0); ctx.lineTo(-7.6, 7.0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = P().tieEnji[2];
    ctx.beginPath();
    ctx.moveTo(0, -6.4); ctx.lineTo(5.0, 4.6); ctx.lineTo(0, 2.6); ctx.lineTo(-5.0, 4.6);
    ctx.closePath(); ctx.fill();
    circlePix(ctx, 0, -1.6, 1.9, '#ffffff');
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    g.addColorStop(0, 'rgba(255,160,185,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- 反射弾: 菱形。画面端で跳ね返る -------------------------------- */
defBullet('reflector', {
  w: 18, h: 18, add: P().cyan[2], radius: 5.0, rotation: false, spin: 0,
  draw(ctx) {
    ctx.fillStyle = P().cyan[0];
    ctx.beginPath();
    ctx.moveTo(0, -8.6); ctx.lineTo(8.6, 0); ctx.lineTo(0, 8.6); ctx.lineTo(-8.6, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = P().cyan[2];
    ctx.beginPath();
    ctx.moveTo(0, -5.4); ctx.lineTo(5.4, 0); ctx.lineTo(0, 5.4); ctx.lineTo(-5.4, 0);
    ctx.closePath(); ctx.fill();
    circlePix(ctx, 0, -1.0, 1.9, '#f0ffff');
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    g.addColorStop(0, 'rgba(150,240,255,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- 分裂前の大弾: 割れる寸前の亀裂が入った球 --------------------- */
defBullet('spliter', {
  w: 34, h: 34, add: P().magenta[2], radius: 8.5, rotation: true, spin: 0.4,
  draw(ctx) {
    circlePix(ctx, 0, 0, 14.5, P().magenta[0]);
    circlePix(ctx, 0, 0, 11.5, P().magenta[1]);
    circlePix(ctx, 0, 0, 7.0, P().magenta[2]);
    circlePix(ctx, -2.4, -2.8, 2.6, '#ffffff');
    // 亀裂
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-9, -4); ctx.lineTo(-2, 1); ctx.lineTo(-6, 7); ctx.lineTo(1, 10);
    ctx.moveTo(4, -10); ctx.lineTo(2, -3); ctx.lineTo(8, 1);
    ctx.stroke();
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
    g.addColorStop(0, 'rgba(255,160,225,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- 大玉（ボス用の重い弾）--------------------------------------- */
defBullet('orbBigCrimson', {
  w: 44, h: 44, add: P().crimson[2], radius: 11.0, rotation: false, spin: 0.2,
  draw(ctx) {
    circlePix(ctx, 0, 0, 19, P().crimson[0]);
    circlePix(ctx, 0, 0, 15.5, P().crimson[1]);
    circlePix(ctx, 0, 0, 10.5, P().crimson[2]);
    circlePix(ctx, 0, 0, 5.2, '#fff0f3');
    // 内側の十字
    ctx.globalAlpha = 0.75;
    window.HN.drawCross(ctx, 0, 0, { ramp: P().crimson, scale: 1, glow: 0, alpha: 0.8 });
    ctx.globalAlpha = 1;
    circlePix(ctx, -6.5, -7.5, 2.6, 'rgba(255,255,255,0.8)');
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
    g.addColorStop(0, 'rgba(255,140,170,0.5)');
    g.addColorStop(0.5, 'rgba(160,30,60,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
  },
});

/* --- 小粒弾（EASY〜HARD の密度調整用）----------------------------- */
defBullet('pellet', {
  w: 10, h: 10, add: null, radius: 2.4, rotation: false, spin: 0,
  draw(ctx) {
    circlePix(ctx, 0, 0, 4.0, P().slate[1]);
    circlePix(ctx, 0, 0, 2.7, P().slate[2]);
    circlePix(ctx, 0, -0.5, 1.5, '#ffffff');
  },
});

/* --- レーザー弾頭（見える光点。ビーム本体は別描画）---------------- */
defBullet('laserCore', {
  w: 22, h: 22, add: P().magenta[2], radius: 4.0, rotation: false, spin: 0,
  draw(ctx) {
    circlePix(ctx, 0, 0, 8.4, P().magenta[0]);
    circlePix(ctx, 0, 0, 5.6, P().magenta[2]);
    circlePix(ctx, 0, 0, 2.8, '#ffffff');
  },
  glow(ctx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,190,240,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
  },
});

/* =========================================================================
 * 弾きりエフェクト
 * ======================================================================= */
/** 弾消し時の輪（描画側で時間経過を渡す） */
function drawBulletPop(ctx, x, y, t, ramp) {
  const r = 4 + t * 22;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.max(0, 1 - t) * 0.8;
  ctx.strokeStyle = ramp ? ramp[3] : '#f0cf6a';
  ctx.lineWidth = 2 - t * 1.6;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = Math.max(0, 1 - t) * 0.4;
  ctx.fillStyle = ramp ? ramp[2] : '#c39a3c';
  ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

window.HN = window.HN || {};
Object.assign(window.HN, { BULLET, defBullet, drawBulletPop });
