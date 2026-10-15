/* =============================================================================
 * src/game/player.js — 自機（紙飛行機）
 *
 *  【設計】原作どおり「攻撃しない」。できるのは避けることだけ。
 *  ただし退屈にしないため、避けること自体に報酬と手触りを与える:
 *    ・かすり（グレイズ）…… 弾の縁を掠めると加点と音が鳴る
 *    ・集中モード…… 移動が遅くなり、当たり判定が可視化される
 *    ・紙吹雪／航跡…… 常に「紙が飛んでいる」手触りを出す
 *
 *  当たり判定は見た目より小さく、常に公平側に倒す（体感の理不尽さを排除）。
 * ========================================================================== */
'use strict';

const PLAYER_R = 2.1;          // 当たり半径（見た目の 1/5 以下。これが公平さの根拠）
const PLAYER_GRAZE_R = 12;     // かすり判定

class Player {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.reset();
  }

  reset() {
    this.x = this.W / 2; this.y = this.H - 76;
    this.vx = 0; this.vy = 0;
    this.r = PLAYER_R;
    this.grazeR = PLAYER_GRAZE_R;
    this.focus = false;
    this.focusT = 0;
    this.invuln = 0;           // 残り無敵時間
    this.dead = false;
    this.deadT = 0;
    this.respawnT = 0;
    this.bank = 0;             // -1..1（左右の傾き）
    this.tilt = 0;
    this.graze = 0;
    this.bob = 0;
    this.blink = 0;
    this.trail = [];
    this.trailT = 0;
    this.shake = 0;
    this.hitFlash = 0;
    this.speedNormal = 292;
    this.speedFocus = 132;
    this.lastMove = 0;
    this.moving = false;
    this.spawnGrace = 0.9;     // 出現直後の保護
    this.visible = true;
    this.hasHitThisLife = false;
  }

  get speed() { return this.focus ? this.speedFocus : this.speedNormal; }
  get invulnerable() { return this.invuln > 0 || this.spawnGrace > 0 || this.dead; }

  update(dt, input, sys, mods = {}) {
    // ---- 死亡中 ----
    if (this.dead) {
      this.deadT += dt;
      return;
    }
    if (this.spawnGrace > 0) this.spawnGrace -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.bob += dt;

    // ---- 移動 ----
    const mv = input.moveVec();
    const ptr = input.ptr;
    let tx = 0, ty = 0;

    if (mv.active) { tx = mv.x; ty = mv.y; }
    // タッチ/マウスドラッグ: 相対移動（指で自機が隠れないよう感度を調整）
    if (ptr.down && (ptr.dx || ptr.dy)) {
      const sens = this.focus ? 0.72 : 1.0;
      this.x += ptr.dx * sens;
      this.y += ptr.dy * sens;
      tx = 0; ty = 0;
    }

    this.focus = input.focusHeld();
    this.focusT += ((this.focus ? 1 : 0) - this.focusT) * Math.min(1, dt * 14);

    const sp = this.speed;
    this.vx += (tx * sp - this.vx) * Math.min(1, dt * 13);
    this.vy += (ty * sp - this.vy) * Math.min(1, dt * 13);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 壁（弾幕ゲームでは端に張り付き続けるのは不利なので、端は硬く制限）
    const m = 8;
    if (this.x < m) { this.x = m; this.vx = 0; }
    if (this.x > this.W - m) { this.x = this.W - m; this.vx = 0; }
    if (this.y < m + 14) { this.y = m + 14; this.vy = 0; }
    if (this.y > this.H - m) { this.y = this.H - m; this.vy = 0; }

    // ---- 見た目の傾き ----
    const bankTarget = window.HN.clamp(this.vx / sp, -1, 1);
    this.bank += (bankTarget - this.bank) * Math.min(1, dt * 9);
    this.moving = Math.abs(this.vx) > 4 || Math.abs(this.vy) > 4;

    // ---- 航跡（紙が舞う）----
    this.trailT += dt;
    if (this.trailT > 0.035 && this.moving) {
      this.trailT = 0;
      this.trail.push({
        x: this.x + (Math.random() - 0.5) * 5, y: this.y + 8,
        vx: -this.vx * 0.28 + (Math.random() - 0.5) * 14,
        vy: 42 + Math.random() * 26,
        life: 0, max: 0.42 + Math.random() * 0.3,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 5,
        s: 1 + (Math.random() < 0.3 ? 1 : 0),
      });
      if (this.trail.length > 90) this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i];
      p.life += dt;
      if (p.life >= p.max) { this.trail.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.vy += 30 * dt;
    }

    // 点滅（無敵時の視認性）
    this.blink += dt;
    this.visible = this.invuln <= 0 || (Math.floor(this.blink * 14) % 2 === 0);
  }

  /** 被弾処理。@returns true = 致命（残機を失う） */
  takeHit() {
    if (this.invulnerable) return false;
    this.hasHitThisLife = true;
    return true;
  }

  die() {
    this.dead = true; this.deadT = 0;
    this.invuln = 0;
  }

  respawn() {
    this.x = this.W / 2; this.y = this.H - 76;
    this.vx = 0; this.vy = 0;
    this.dead = false; this.deadT = 0;
    this.spawnGrace = 1.3;
    this.trail.length = 0;
  }

  /* -------------------------------------------------------------- 描画 --- */
  draw(ctx) {
    if (this.dead) return;
    const ship = window.HN.SHIP;
    if (!ship.built) window.HN.buildShip();

    // 航跡（機体より背面）
    ctx.save();
    for (const p of this.trail) {
      const t = 1 - p.life / p.max;
      ctx.globalAlpha = t * 0.5;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = '#c2cbe4';
      ctx.fillRect(-1, -1, 2 * p.s, 2 * p.s);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();

    if (!this.visible) return;

    // 集中モードの輪（当たり判定の可視化）
    if (this.focusT > 0.02) {
      ctx.save();
      ctx.globalAlpha = this.focusT * 0.9;
      ctx.translate(this.x, this.y);
      const a = performance.now() / 1000;
      for (let i = 0; i < 2; i++) {
        const R = 13 + i * 6 + Math.sin(a * 3 + i) * 1.5;
        ctx.strokeStyle = i ? 'rgba(200,215,255,0.5)' : 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a0 = a * 0.8 + i + (k / 4) * Math.PI * 2;
          ctx.arc(0, 0, R, a0, a0 + Math.PI * 0.36);
        }
        ctx.stroke();
      }
      // 当たり判定そのもの
      ctx.fillStyle = `rgba(255,120,150,${0.6 + 0.35 * Math.sin(a * 7)})`;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 機体
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y + Math.sin(this.bob * 3.1) * 0.5));
    // 傾きでフレームを選ぶ（滑らかに見えるよう角度的に補間）
    const b = this.bank;
    ctx.rotate(b * 0.30);
    ctx.scale(1 - Math.abs(b) * 0.12, 1);
    const frame = b < -0.28 ? 'left' : b > 0.28 ? 'right' : 'neutral';
    const useFocus = this.focusT > 0.5 && ship.focused[frame];
    const s = useFocus ? ship.focused[frame] : ship.frames[frame];
    if (s) ctx.drawImage(s.canvas, -Math.floor(s.w / 2), -Math.floor(s.h / 2));
    ctx.restore();

    // かすりエフェクト（直近）
    if (this.shake > 0) this.shake -= 0.06;
  }

  /** 被弾・死亡演出 */
  drawDeathFx(ctx) {
    if (!this.dead) return;
    const t = Math.min(1, this.deadT / 0.9);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.translate(this.x, this.y);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + this.deadT * 2;
      const d = 12 + t * 66;
      ctx.save();
      ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
      ctx.rotate(a + this.deadT * 5);
      ctx.fillStyle = i % 3 ? '#e9eefb' : '#f0cf6a';
      ctx.fillRect(-3, -2, 6, 4);
      ctx.restore();
    }
    ctx.restore();
  }
}

window.HN = window.HN || {};
Object.assign(window.HN, { Player, PLAYER_R, PLAYER_GRAZE_R });
