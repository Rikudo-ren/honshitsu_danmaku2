/**
 * bullets.js — 弾の管理
 *
 * オブジェクトプール + 数値ベースの運動パラメータで動かす。
 * 複雑な軌道変化は「弾自身のロジック」ではなく pattern 層のイベントで組む方針。
 * ここが持つのは移動の原始要素だけ:
 *   加速度 / 旋回 / 追尾 / 速度変化 / 揺らぎ / 反射 / 遅延出現 / 寿命
 */
import { BULLET_CAP, FIELD, VIEW_W, VIEW_H } from '../core/const.js';
import { TAU, clamp, angleDiff } from '../core/util.js';
import { drawBullet, BULLET_RADIUS } from './bulletart.js';

/** 弾の生成数カウンタ (デバッグ / スコア用) */
export let bulletsSpawned = 0;

export class Bullet {
  constructor() { this.reset(); }
  reset() {
    this.alive = false;
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.ax = 0; this.ay = 0;
    this.angle = 0; this.spin = 0;
    this.turn = 0;              // rad/s の旋回
    this.speedAccel = 0;        // 進行方向への加減速 (px/s^2)
    this.homingRate = 0;        // 追尾の旋回速度 (rad/s)
    this.homingTime = 0;
    this.minSpeed = 0; this.maxSpeed = 1e9;
    this.wobbleAmp = 0; this.wobbleFreq = 0; this.wobblePhase = 0; this.wobbleT = 0;
    this.bounce = 0;
    this.delay = 0;
    this.fadeIn = 0;
    // 「一定時間その場に留まり、その後方向転換して飛ぶ」弾のための状態
    this.hold = 0;              // 残り停止時間 (秒)
    this.holdTotal = 0;
    this.afterHold = null;      // { speed, angleDelta } 停止終了時の速度と旋回
    this.holdPulse = 0;
    this.life = 6; this.maxLife = 6;
    this.type = 'orb'; this.color = 'white';
    this.r = 5; this.scale = 1;
    this.cancelable = true;
    this.grazed = false;
    this.spawnT = 0;
    this.seed = 0;
    this.trail = 0;
    this.glow = 0;
    this.flags = 0;
    this.spinVis = 0;           // 見た目の回転 (進行方向と別に回したいとき)
    this.visAngle = null;       // null なら進行方向を向く。数値なら固定表示角度
    this.width = 1;             // 弾の太さ倍率 (レーザー的な細長い弾用)
  }
}

export class Bullets {
  constructor() {
    this.list = [];
    for (let i = 0; i < 400; i++) this.list.push(new Bullet());
    this.active = 0;
    this.fx = null;      // 参照 (パーティクル用)
    this.player = null;
    this.rng = null;
    this.onGraze = null;
    this.onCancel = null;
  }

  attach({ fx, player, rng, onGraze, onCancel }) {
    this.fx = fx; this.player = player; this.rng = rng;
    this.onGraze = onGraze; this.onCancel = onCancel;
  }

  clear(cancel = false) {
    if (cancel) this.cancelAll();
    for (const b of this.list) b.alive = false;
    this.active = 0;
  }

  /** プールから取得。空きがなければ最も古い弾を再利用する。 */
  _alloc() {
    for (const b of this.list) {
      if (!b.alive) { b.reset(); b.alive = true; this.active++; return b; }
    }
    // 上限に達したら最古を奪う
    if (this.list.length >= BULLET_CAP) {
      let oldest = this.list[0], t = Infinity;
      for (const b of this.list) { if (b.spawnT < t) { t = b.spawnT; oldest = b; } }
      oldest.reset(); oldest.alive = true;
      return oldest;
    }
    const b = new Bullet();
    b.alive = true;
    this.list.push(b);
    this.active++;
    return b;
  }

  /**
   * 弾を発射する。
   * @param {object} o
   *   x,y,z      位置
   *   speed,angle 速度と向き
   *   type,color  見た目
   *   r           当たり半径 (省略時は形状から)
   */
  spawn(o) {
    const b = this._alloc();
    b.x = o.x; b.y = o.y; b.z = o.z ?? 0;
    const ang = o.angle ?? 0;
    const spd = o.speed ?? 0;
    b.vx = o.vx ?? Math.cos(ang) * spd;
    b.vy = o.vy ?? Math.sin(ang) * spd;
    b.vz = o.vz ?? 0;
    b.angle = Math.atan2(b.vy, b.vx);
    b.visAngle = o.visAngle ?? null;
    b.width = o.width ?? 1;
    b.type = o.type ?? 'orb';
    b.color = o.color ?? 'white';
    b.r = o.r ?? BULLET_RADIUS[b.type] ?? 5;
    b.scale = o.scale ?? 1;
    b.ax = o.ax ?? 0; b.ay = o.ay ?? 0;
    b.turn = o.turn ?? 0;
    b.spin = o.spin ?? 0;
    b.spinVis = o.spinVis ?? 0;
    b.speedAccel = o.speedAccel ?? 0;
    b.homingRate = o.homingRate ?? 0;
    b.homingTime = o.homingTime ?? 0;
    b.minSpeed = o.minSpeed ?? 0;
    b.maxSpeed = o.maxSpeed ?? 1e9;
    b.wobbleAmp = o.wobbleAmp ?? 0;
    b.wobbleFreq = o.wobbleFreq ?? 0;
    b.wobblePhase = o.wobblePhase ?? 0;
    b.wobbleT = 0;
    b.bounce = o.bounce ?? 0;
    b.delay = o.delay ?? 0;
    b.fadeIn = o.fadeIn ?? 0;
    b.hold = o.hold ?? 0;
    b.holdTotal = b.hold;
    b.afterHold = o.afterHold ?? null;
    b.holdPulse = 0; 
    b.life = o.life ?? 8;
    b.maxLife = b.life;
    b.cancelable = o.cancelable ?? true;
    b.grazed = false;
    b.spawnT = performance.now();
    b.trail = o.trail ?? 0;
    b.glow = o.glow ?? 0.0;
    b.seed = (Math.random() * 1000) | 0;
    bulletsSpawned++;
    return b;
  }

  /** 全弾消去 (✝本質✝の漏出) */
  cancelAll(scoreCb) {
    let n = 0;
    for (const b of this.list) {
      if (!b.alive || !b.cancelable) continue;
      b.alive = false;
      this.active--;
      n++;
      if (this.fx && n < 260) {
        this.fx.spawn(b.x, b.y, {
          vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
          life: 0.30 + Math.random() * 0.25, size: 2 + (Math.random() * 2 | 0),
          color: '#ffe9a8', add: true, drag: 0.90,
        });
      }
    }
    if (n > 0 && this.onCancel) this.onCancel(n, scoreCb);
    return n;
  }

  /* ------------------------------------------------------------------ */
  update(dt, ctxObj) {
    const { player, difficulty, bounds, camera } = ctxObj;
    const bx0 = bounds.x0, bx1 = bounds.x1, by0 = bounds.y0, by1 = bounds.y1;
    const homingMul = difficulty.homing;
    const list = this.list;

    /**
     * 当たり判定空間。
     * 2D ではワールド座標、擬似3D では「カメラ投影後のスクリーン座標」を使う。
     * 投影後に判定することで「見えている通りに当たる」= 理不尽さを排除できる。
     */
    const useScreen = camera && camera.active;
    let plx = player.x, ply = player.y, plr = player.radius, plg = player.grazeRadius;
    if (useScreen) {
      const pp = camera.project(player.x, player.y, player.z ?? 0);
      plx = pp.sx; ply = pp.sy;
      plr = player.radius * Math.max(0.5, pp.scale);
      plg = player.grazeRadius * Math.max(0.5, pp.scale);
      this._cam = camera;
    } else {
      this._cam = null;
    }

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) { b.alive = false; this.active--; continue; }

      if (b.delay > 0) { b.delay -= dt; continue; }

      // --- 停滞 (一定時間その場に留まる) ---
      if (b.hold > 0) {
        b.hold -= dt;
        b.holdPulse += dt;
        if (b.hold <= 0 && b.afterHold) {
          const a = b.angle + (b.afterHold.angleDelta ?? 0);
          b.angle = a;
          b.visAngle = b.afterHold.fixVisAngle ? a : b.visAngle;
          b.vx = Math.cos(a) * (b.afterHold.speed ?? 0);
          b.vy = Math.sin(a) * (b.afterHold.speed ?? 0);
          b.afterHold = null;
          if (this.fx) {
            this.fx.spawn(b.x, b.y, {
              vx: 0, vy: 0, life: 0.2, size: 3, color: '#ffffff', add: true,
            });
          }
        }
        // 停滞中も当たり判定は有効 (公平性のため)
        this._collide(b, player, plx, ply, plr, plg);
        continue;
      }

      // --- 旋回 ---
      if (b.turn !== 0) b.angle += b.turn * dt;

      // --- 追尾 ---
      if (b.homingTime > 0 && b.homingRate > 0) {
        b.homingTime -= dt;
        // 追尾の目標は「ワールド座標の自機」。判定だけをスクリーン空間で行うので
        // 追尾方向が投影に引きずられない。
        const want = Math.atan2(player.y - b.y, player.x - b.x);
        const d = angleDiff(b.angle, want);
        const step = b.homingRate * homingMul * dt;
        b.angle += clamp(d, -step, step);
      }

      // --- 速度変化 ---
      let spd = Math.hypot(b.vx, b.vy);
      if (b.speedAccel !== 0) {
        spd = clamp(spd + b.speedAccel * dt, b.minSpeed, b.maxSpeed);
      }
      if (b.turn !== 0 || b.homingRate > 0 || b.speedAccel !== 0) {
        b.vx = Math.cos(b.angle) * spd;
        b.vy = Math.sin(b.angle) * spd;
      } else {
        spd = Math.hypot(b.vx, b.vy);
        b.angle = Math.atan2(b.vy, b.vx);
      }

      // --- 加速度 ---
      if (b.ax || b.ay) { b.vx += b.ax * dt; b.vy += b.ay * dt; }

      let mx = b.x, my = b.y;
      // --- 揺らぎ (進行方向に対して垂直に位置を振る) ---
      if (b.wobbleAmp > 0) {
        b.wobbleT += dt;
        const w = Math.sin(b.wobbleT * b.wobbleFreq * TAU + b.wobblePhase) * b.wobbleAmp;
        mx += -Math.sin(b.angle) * w;
        my += Math.cos(b.angle) * w;
      }

      b.x = mx + b.vx * dt;
      b.y = my + b.vy * dt;
      b.z += b.vz * dt;

      // --- 壁反射 ---
      if (b.bounce > 0) {
        if (b.x < bx0 + b.r) { b.x = bx0 + b.r; b.vx = Math.abs(b.vx); b.bounce--; this._bounceHit(b); }
        else if (b.x > bx1 - b.r) { b.x = bx1 - b.r; b.vx = -Math.abs(b.vx); b.bounce--; this._bounceHit(b); }
        if (b.y < by0 + b.r) { b.y = by0 + b.r; b.vy = Math.abs(b.vy); b.bounce--; this._bounceHit(b); }
        else if (b.y > by1 - b.r) { b.y = by1 - b.r; b.vy = -Math.abs(b.vy); b.bounce--; this._bounceHit(b); }
        b.angle = Math.atan2(b.vy, b.vx);
      } else if (
        b.x < bx0 - 46 || b.x > bx1 + 46 ||
        b.y < by0 - 46 || b.y > by1 + 46
      ) {
        b.alive = false; this.active--; continue;
      }

      // --- 見た目の回転 ---
      if (b.spinVis) b.spin += b.spinVis * dt;

      // --- 当たり判定 ---
      this._collide(b, player, plx, ply, plr, plg);
    }
  }

  /**
   * 当たり判定。
   * 2D のときはワールド座標、擬似3D のときはスクリーン座標で判定する。
   * どちらの場合も「プレイヤーが見ている位置関係」と判定が一致するため、
   * 見た目と当たりが食い違うことがない。
   */
  _collide(b, player, plx, ply, plr, plg) {
    if (!player.alive || !player.vulnerable) return;
    let bx = b.x, by = b.y, br = b.r;
    if (this._cam) {
      const p = this._cam.project(b.x, b.y, b.z);
      if (p.behind) return;
      bx = p.sx; by = p.sy;
      br = b.r * Math.max(0.35, p.scale);
    }
    const dx = bx - plx, dy = by - ply;
    const d2 = dx * dx + dy * dy;
    const hr = plr + br;
    if (d2 < hr * hr) {
      player.onHit(b);
      return;
    }
    if (!b.grazed && d2 < (plg + br) * (plg + br)) {
      b.grazed = true;
      if (this.onGraze) this.onGraze(b);
    }
  }

  _bounceHit(b) {
    if (!this.fx) return;
    this.fx.spawn(b.x, b.y, {
      vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
      life: 0.22, size: 1, color: '#cfd8ff', add: true,
    });
  }

  /* ------------------------------------------------------------------ */
  /**
   * 描画。
   * @param {CanvasRenderingContext2D} ctx
   * @param {Camera} cam 3D 時は透視投影を行う
   */
  draw(ctx, cam) {
    const list = this.list;
    const persp = cam && cam.mode !== 'flat' && cam.t > 0.001;

    if (!persp) {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b.alive || b.delay > 0) continue;
        const a = (b.visAngle ?? b.angle) + b.spin;
        if (b.fadeIn > 0 && b.maxLife - b.life < b.fadeIn) {
          ctx.globalAlpha = (b.maxLife - b.life) / b.fadeIn;
        } else ctx.globalAlpha = 1;
        drawBullet(ctx, b.type, b.color, a, b.x, b.y, b.scale);
      }
      ctx.globalAlpha = 1;
      return;
    }

    // ---- 疑似3D: 奥から手前へソートして透視投影 ----
    const visible = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.alive || b.delay > 0) continue;
      const p = cam.project(b.x, b.y, b.z);
      if (p.behind || p.sy < -60 || p.sy > VIEW_H + 60 || p.sx < -80 || p.sx > VIEW_W + 80) continue;
      b._px = p.sx; b._py = p.sy; b._ps = p.scale;
      visible.push(b);
    }
    // 奥 (y が大きい) ほど先に描く
    visible.sort((p, q) => q.y - p.y);

    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < visible.length; i++) {
      const b = visible[i];
      const s = b.scale * b._ps * cam.scaleMul;
      if (s <= 0.05) continue;
      const fade = cam.depthFade(b.y);
      if (fade <= 0.02) continue;
      ctx.globalAlpha = fade;
      drawBullet(ctx, b.type, b.color, (b.visAngle ?? b.angle) + b.spin, b._px, b._py, s);
    }
    ctx.globalAlpha = 1;
  }

  /** 加算グロー (明るい弾だけを後段で光らせる) */
  stats() {
    return { active: this.active, cap: this.list.length };
  }
}
