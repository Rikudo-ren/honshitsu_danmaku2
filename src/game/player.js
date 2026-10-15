/**
 * player.js — 自機「観測者」
 *
 * 本作の自機は攻撃しない。避けることだけが仕事。
 *  - 移動: 8方向 + アナログ。Shift で低速移動 (精密回避)。
 *  - グレイズ: 弾の近くを掠めると ✝本質✝ ゲージが溜まる。
 *  - ✝本質✝ (ボム): ゲージを消費して全弾消去 + 無敵。1回の耐久で数回使える。
 *  - 被弾: 残機 -1、その場で復帰、一定時間無敵。
 *
 * 自機のドット絵は「観測者」をモチーフに、原作の理数科の制服
 * (えんじ色のネクタイ / 紺のブレザー) の配色を反映した 12x16px のスプライトを
 * コード内で生成する (外部アセットの取得ができないため自作)。
 */
import { PLAYER, FIELD, VIEW_W, VIEW_H, BOMB } from '../core/const.js';
import { TAU, clamp, lerp, easeOutCubic } from '../core/util.js';

/* ------------------------------------------------------------------ *
 * 自機スプライト (自作ドット絵)
 * 配色は原作の理数科の制服: 濃紺のブレザー / 白シャツ / えんじのネクタイ。
 * ------------------------------------------------------------------ */
const SPR = {
  '.': null,
  K: '#0a0812',            // 輪郭
  N: '#1b2138',            // ブレザー暗
  n: '#2b3358',            // ブレザー
  W: '#e8ecf8',            // シャツ
  T: '#8a1f38',            // ネクタイ (えんじ)
  t: '#b8324f',            // ネクタイ明
  S: '#9c8a80',            // 肌
  s: '#c4ad9f',            // 肌明
  H: '#14121f',            // 髪
  h: '#2c2a42',            // 髪ハイライト
  E: '#5aa8ff',            // 眼 (観測する瞳)
  G: '#7cf0ff',            // グレア
};

/** 上向き (正面) 12x16 */
const BODY = [
  '....KKKK....',
  '...KHHHHK...',
  '..KHHhhHHK..',
  '..KHsssSHK..',
  '..KsEsssEK..',
  '..KSSSSSSK..',
  '...KSSSSK...',
  '..KnWWWWnK..',
  '.KnnWTTWnnK.',
  '.KnnWtTWnnK.',
  '.KnnWTTWnnK.',
  'KnnnWTTWnnnK',
  'KnnnWWWWnnnK',
  '.Kn.KWWK.nK.',
  '....KnnK....',
  '...KK..KK...',
];

/** 左向き (移動中の見た目) 12x16 */
const BODY_SIDE = [
  '....KKKK....',
  '...KHHHHK...',
  '..KHHhhHHK..',
  '..KHsssSK...',
  '..KsEssSK...',
  '..KSSSSSK...',
  '...KSSSK....',
  '..KnWWWK....',
  '.KnnWTTWK...',
  '.KnnWtTWK...',
  'KnnnWTTWK...',
  'KnnnWWWWK...',
  'KnnnWWWK....',
  '.Kn.KWWK....',
  '....KnnK....',
  '...KK..KK...',
];

function buildSprite(rows, scale = 1) {
  const h = rows.length, w = rows[0].length;
  for (let i = 0; i < h; i++) {
    if (rows[i].length !== w) {
      console.error(`[player] スプライト定義 ${i} 行目の幅が ${rows[i].length} (期待 ${w})`);
    }
  }
  const cv = document.createElement('canvas');
  cv.width = w * scale; cv.height = h * scale;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = SPR[rows[y][x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return { canvas: cv, w: w * scale, h: h * scale, cw: w, ch: h };
}

let _front = null, _side = null;
export function playerSprites() {
  if (!_front) {
    _front = buildSprite(BODY, 1);
    _side = buildSprite(BODY_SIDE, 1);
  }
  return { front: _front, side: _side };
}

/**
 * 自機スプライトの単色シルエット (縁取り用)。
 * 形はそのまま、色だけ #05040c に置き換えたキャンバスを返す。
 */
const _silCache = new WeakMap();
function playerSilhouette(spr) {
  let c = _silCache.get(spr);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = spr.canvas.width; c.height = spr.canvas.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(spr.canvas, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#05040c';
  g.fillRect(0, 0, c.width, c.height);
  _silCache.set(spr, c);
  return c;
}

/* ------------------------------------------------------------------ */
export class Player {
  constructor(fx) {
    this.fx = fx;
    this.x = PLAYER.startX;
    this.y = PLAYER.startY;
    this.px = this.x; this.py = this.y;
    this.vx = 0; this.vy = 0;
    this.radius = PLAYER.radius;
    this.grazeRadius = PLAYER.grazeRadius;
    this.alive = true;
    this.vulnerable = true;
    this.invuln = 0;
    this.deathTimer = 0;
    this.hitFlash = 0;
    this.focus = false;
    this.facing = 'up';
    this.walkT = 0;
    this.tilt = 0;
    this.bombActive = 0;
    this.bombRadius = 0;
    this.trail = [];
    this.grazeCount = 0;
    this.z = 0;                 // 3D 時に浮遊して見せるための高さ
    this.animT = 0;
    this.bobT = 0;
  }

  reset(keepGraze = true) {
    this.x = PLAYER.startX; this.y = PLAYER.startY;
    this.px = this.x; this.py = this.y;
    this.vx = 0; this.vy = 0;
    this.alive = true; this.vulnerable = true;
    this.invuln = PLAYER.respawnInvuln;
    this.deathTimer = 0;
    this.hitFlash = 0;
    this.bombActive = 0; this.bombRadius = 0;
    this.trail.length = 0;
    if (!keepGraze) this.grazeCount = 0;
  }

  update(dt, input, ctxObj) {
    const { difficulty, camera } = ctxObj;
    this.animT += dt;
    this.bobT += dt;

    if (!this.alive) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.reset();
      return;
    }

    this.px = this.x; this.py = this.y;
    this.focus = input.focused;

    const speed = (this.focus ? PLAYER.focusSpeed : PLAYER.speed);
    const ax = input.axis.x, ay = input.axis.y;
    this.vx = ax * speed;
    this.vy = ay * speed;

    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;

    // フィールド内に制限
    const m = FIELD.margin;
    this.x = clamp(this.x, m, VIEW_W - m);
    this.y = clamp(this.y, m, VIEW_H - m);

    // 見た目の向き / 傾き
    if (Math.abs(ax) > 0.25) {
      this.facing = 'side';
      this.tilt = lerp(this.tilt, Math.sign(ax) * 0.22, 0.22);
      this.walkT += dt * 8;
    } else {
      this.facing = 'up';
      this.tilt = lerp(this.tilt, 0, 0.22);
      this.walkT += dt * 2.4;
    }
    // 3D 時は機体が浮遊しているように見せる
    const t3 = camera ? camera.t : 0;
    this.z = lerp(this.z, t3 * 12 + Math.sin(this.bobT * 3.1) * 1.6 * t3, 0.18);

    // 無敵時間
    if (this.invuln > 0) this.invuln -= dt;
    this.vulnerable = this.invuln <= 0 && this.bombActive <= 0;

    // ✝本質✝ 発動中
    if (this.bombActive > 0) {
      this.bombActive -= dt;
      this.bombRadius = 60 + (BOMB.duration - this.bombActive) / BOMB.duration * BOMB.clearRadius;
      if (this.bombActive <= 0) this.bombActive = 0;
    }

    // 残像
    if (this.invuln > 0 || this.bombActive > 0 || Math.hypot(this.vx, this.vy) > 2.2) {
      this.trail.push({ x: this.x, y: this.y, t: this.animT, face: this.facing });
      if (this.trail.length > 14) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      if (this.animT - this.trail[i].t > 0.22) this.trail.splice(i, 1);
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
  }

  /** 被弾 (bullets / lasers から呼ばれる) */
  onHit(bullet, source = 'bullet') {
    if (!this.alive || !this.vulnerable) return;
    this.alive = false;
    this.deathTimer = 1.15;
    this.hitFlash = 1;
    this.invuln = 0;
    this.fx?.addShake(4.2, 0.88);
    this.fx?.addFlash(0.34, '#ff5e8a');
    this.fx?.addChroma(0.7);
    this.fx?.ring(this.x, this.y, { r0: 3, r1: 78, life: 0.55, color: '#ffd0dc', width: 3 });
    this.fx?.burst(this.x, this.y, 30, {
      speed: 160, life: 0.7, size: 3, color: '#ff8fb0', drag: 0.90, gravity: 30,
    });
    this.fx?.burst(this.x, this.y, 16, {
      speed: 90, life: 1.0, size: 2, color: '#ffffff', drag: 0.93,
    });
  }

  /**
   * ✝本質✝ の発動。ゲージがあるときだけ成功する。
   * @returns {boolean} 発動したか
   */
  fireBomb(gauge) {
    if (!this.alive) return false;
    if (gauge.value < BOMB.max) return false;
    gauge.value = 0;
    this.bombActive = BOMB.duration;
    this.invuln = Math.max(this.invuln, BOMB.invuln);
    this.fx?.addFlash(0.55, '#ffffff');
    this.fx?.addShake(3.0, 0.9);
    this.fx?.ring(this.x, this.y, { r0: 4, r1: 300, life: 0.9, color: '#e8dcff', width: 4 });
    this.fx?.ring(this.x, this.y, { r0: 4, r1: 200, life: 0.65, color: '#a98cff', width: 6 });
    return true;
  }

  /** 描画 (バッファ座標、または 3D カメラ投影) */
  draw(ctx, camera) {
    const { front, side } = playerSprites();
    const spr = this.facing === 'side' ? side : front;
    let dx = this.x, dy = this.y, scale = 1;
    if (camera && camera.active) {
      const p = camera.project(this.x, this.y, this.z);
      dx = p.sx; dy = p.sy - (spr.h / 2) * p.scale;
      scale = p.scale;
    }

    // 背景との分離のための「墨だまり」: 自機の足元に常に暗い楕円を敷く。
    // 弾幕の上でも自機の位置が一目で分かるようにするための視認性処理。
    if (this.alive && !(camera && camera.active)) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#05040c';
      ctx.beginPath();
      ctx.ellipse(Math.round(this.x), Math.round(this.y) + 10, 12, 5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // グレイズの輪
    if (this.alive) {
      const t = (this.animT * 1.6) % 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 * (1 - t);
      ctx.strokeStyle = '#7cf0ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(dx, dy, PLAYER.grazeRadius * (0.55 + t * 0.5) * scale, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 残像
    for (let i = 0; i < this.trail.length; i++) {
      const tr = this.trail[i];
      const age = (this.animT - tr.t) / 0.22;
      if (age > 1) continue;
      ctx.globalAlpha = (1 - age) * 0.30;
      const s2 = this.bombActive > 0 ? '#a98cff' : this.invuln > 0 ? '#7cf0ff' : '#8fa0ff';
      ctx.fillStyle = s2;
      ctx.fillRect(Math.round(tr.x - 3), Math.round(dy + 2), 6, 8);
      void spr;
    }
    ctx.globalAlpha = 1;

    // 本体
    const blink = this.invuln > 0 && this.bombActive <= 0
      ? (Math.floor(this.animT * 22) % 2 === 0)
      : false;

    ctx.save();
    if (camera && camera.active) {
      const p = camera.project(this.x, this.y, this.z);
      ctx.translate(p.sx, p.sy);
      ctx.scale(p.scale, p.scale);
      ctx.translate(0, -spr.h / 2);
    } else {
      ctx.translate(Math.round(this.x), Math.round(this.y));
    }
    ctx.rotate(this.tilt * (this.facing === 'side' ? 1 : 0));

    // 接地影
    if (!camera || !camera.active) {
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(0, spr.h / 2 + 1, 7, 3, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (!blink) {
      const bob = Math.sin(this.bobT * 4.2) * (Math.abs(this.vx) + Math.abs(this.vy) > 0.6 ? 0.6 : 0.25);
      const ox = -Math.floor(spr.w / 2), oy = -Math.floor(spr.h / 2) + Math.round(bob);
      // 1px の墨縁取り: 明るい弾幕の中でも輪郭が潰れない
      if (!(camera && camera.active)) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.globalCompositeOperation = 'destination-over';
        const sil = playerSilhouette(spr);
        for (const [sx, sy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          ctx.drawImage(sil, ox + sx, oy + sy);
        }
        ctx.restore();
      }
      ctx.drawImage(spr.canvas, ox, oy);
    }
    ctx.restore();

    // 発動中のオーラ
    if (this.bombActive > 0) {
      const t = 1 - this.bombActive / BOMB.duration;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * 0.5;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 40);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#a98cff');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y, 40, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // 被弾フラッシュ
    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.x - 8, this.y - 12, 16, 24);
      ctx.restore();
    }

    // フォーカス中の当たり判定可視化 (原作弾幕ゲームの作法)
    if (this.focus && this.alive) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ff6f9a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(this.x) + 0.5, Math.round(this.y) + 0.5, this.radius + 3, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(this.x) - 0.5, Math.round(this.y) - 0.5, 2, 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
