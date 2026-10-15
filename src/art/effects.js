/* =============================================================================
 * src/art/effects.js — パーティクルと画面演出
 *
 *  【原則】エフェクトは弾幕の視認性を損なってはいけない。
 *   ・加算合成で光らせるが、alpha は控えめ（合計が画面を白飛びさせない）
 *   ・寿命を短くし、同時数を上限で制限する
 *   ・弾と同程度の明度を持つ粒子は「弾ではない」と分かる形（四角・線）にする
 * ========================================================================== */
'use strict';

const FX_LIMITS = { particles: 520, rings: 40, texts: 24 };

class Effects {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.p = [];              // particles
    this.rings = [];          // expanding rings / crosses
    this.texts = [];          // floating score/words
    this.shake = 0;
    this.shakeDecay = 2.6;
    this.flash = 0; this.flashColor = '#fffbe8';
    this.slowmo = 0;
    this._pool = [];
    this.time = 0;
  }

  clear() { this.p.length = 0; this.rings.length = 0; this.texts.length = 0; this.shake = 0; this.flash = 0; }

  /* --------------------------------------------------------- 生成 -------- */
  spawn(o) {
    if (this.p.length >= FX_LIMITS.particles) this.p.shift();
    let q = this._pool.pop();
    if (!q) q = {};
    q.x = o.x; q.y = o.y; q.vx = o.vx ?? 0; q.vy = o.vy ?? 0;
    q.life = 0; q.max = o.max ?? 0.5;
    q.col = o.col ?? '#f0cf6a';
    q.col2 = o.col2 ?? null;
    q.size = o.size ?? 2;
    q.shape = o.shape ?? 'sq';       // sq | line | cross | petal | ring
    q.rot = o.rot ?? 0; q.spin = o.spin ?? 0;
    q.g = o.g ?? 0;
    q.drag = o.drag ?? 0;
    q.add = o.add !== false;
    q.fade = o.fade ?? 'out';
    q.shrink = o.shrink !== false;
    q.glow = o.glow ?? 0;
    this.p.push(q);
    return q;
  }

  ring(o) {
    if (this.rings.length >= FX_LIMITS.rings) this.rings.shift();
    this.rings.push({
      x: o.x, y: o.y, life: 0, max: o.max ?? 0.6,
      r0: o.r0 ?? 4, r1: o.r1 ?? 90,
      col: o.col ?? '#f0cf6a', width: o.width ?? 3,
      kind: o.kind ?? 'ring',           // ring | cross | burst
      add: o.add !== false, alpha: o.alpha ?? 0.9,
    });
  }

  text(x, y, str, o = {}) {
    if (this.texts.length >= FX_LIMITS.texts) this.texts.shift();
    this.texts.push({
      x, y, str, life: 0, max: o.max ?? 0.9,
      col: o.col ?? '#f0cf6a', size: o.size ?? 12,
      vy: o.vy ?? -34, vx: o.vx ?? 0, latin: o.latin ?? false, outline: o.outline ?? 2,
    });
  }

  /* ------------------------------------------------------- 複合演出 ------ */
  /** 弾が消えたときの小さな爆ぜ */
  bulletPop(x, y, ramp, big = false) {
    const n = big ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * (big ? 110 : 60);
      this.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: 0.22 + Math.random() * 0.2,
        col: (ramp && ramp[3]) || '#fffbe8',
        col2: (ramp && ramp[2]) || '#f0cf6a',
        size: big ? 3 : 2, shape: 'sq', drag: 2.4, shrink: true,
      });
    }
    this.ring({
      x, y, r0: 2, r1: big ? 26 : 12, max: 0.22,
      col: (ramp && ramp[3]) || '#fffbe8', width: 1.5, alpha: 0.55,
    });
  }

  /** かすり（グレイズ） */
  graze(x, y, col = '#8fe8f2') {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 70;
      this.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        max: 0.24, col, size: 1, shape: 'line', rot: a, drag: 4,
      });
    }
    this.ring({ x, y, r0: 8, r1: 20, max: 0.18, col, width: 1, alpha: 0.6 });
  }

  /** 被弾 */
  playerHit(x, y) {
    this.shake = 1.0;
    this.flash = 0.18; this.flashColor = '#e05575';
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 210;
      this.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        max: 0.4 + Math.random() * 0.4,
        col: i % 3 === 0 ? '#fffbe8' : (i % 3 === 1 ? '#e05575' : '#f0cf6a'),
        size: 2 + (i % 3), shape: i % 4 === 0 ? 'cross' : 'sq',
        drag: 2.0, spin: (Math.random() - 0.5) * 12,
      });
    }
    this.ring({ x, y, r0: 6, r1: 140, max: 0.5, col: '#ffffff', width: 4 });
    this.ring({ x, y, r0: 4, r1: 90, max: 0.6, col: '#e05575', width: 3 });
  }

  /** 観測（重ね合わせの収束）発動 */
  observation(x, y) {
    this.shake = 0.55;
    this.flash = 0.22; this.flashColor = '#fffbe8';
    this.ring({ x, y, r0: 10, r1: 320, max: 0.75, col: '#f0cf6a', width: 5 });
    this.ring({ x, y, r0: 10, r1: 220, max: 0.6, col: '#fffbe8', width: 3 });
    this.ring({ x, y, r0: 10, r1: 150, max: 0.45, col: '#8fe8f2', width: 2 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      this.spawn({
        x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20,
        vx: Math.cos(a) * 190, vy: Math.sin(a) * 190,
        max: 0.55, col: '#f0cf6a', col2: '#fffbe8', size: 4, shape: 'cross', drag: 1.6,
      });
    }
  }

  /** フェーズ移行 */
  phaseShift(cx, cy, ramp, accent = '#fffbe8') {
    this.shake = 0.7;
    this.flash = 0.3; this.flashColor = accent;
    this.ring({ x: cx, y: cy, r0: 8, r1: 460, max: 0.95, col: accent, width: 6 });
    this.ring({ x: cx, y: cy, r0: 8, r1: 330, max: 0.8, col: (ramp && ramp[2]) || '#c39a3c', width: 4 });
    this.ring({ x: cx, y: cy, r0: 8, r1: 210, max: 0.6, col: (ramp && ramp[3]) || '#f0cf6a', width: 3 });
    this.ring({ x: cx, y: cy, r0: 8, r1: 470, max: 1.1, col: accent, width: 2, kind: 'cross' });
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2, s = 110 + Math.random() * 280;
      this.spawn({
        x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        max: 0.6 + Math.random() * 0.6,
        col: i % 4 === 0 ? accent : ((ramp && ramp[3]) || '#f0cf6a'),
        size: 2 + (i % 3), shape: i % 5 === 0 ? 'cross' : 'sq',
        drag: 1.5, spin: (Math.random() - .5) * 10, glow: 0.5,
      });
    }
  }

  /** ボス登場 */
  bossAppear(cx, cy, ramp) {
    this.flash = 0.35; this.flashColor = '#fffbe8';
    this.ring({ x: cx, y: cy, r0: 4, r1: 420, max: 1.2, col: (ramp && ramp[3]) || '#f0cf6a', width: 6 });
    for (let i = 0; i < 30; i++) {
      this.spawn({
        x: cx + (Math.random() - 0.5) * 120,
        y: cy - 260 + Math.random() * 300,
        vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 130,
        max: 0.9 + Math.random() * 0.8,
        col: (ramp && ramp[3]) || '#f0cf6a',
        size: 2 + (i % 2), shape: 'line', glow: 0.6,
      });
    }
  }

  /** ボス撃破 */
  bossBreak(cx, cy, ramp) {
    this.shake = 1.5;
    this.flash = 0.6; this.flashColor = '#fffbe8';
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 340;
      this.spawn({
        x: cx + (Math.random() - 0.5) * 60, y: cy + (Math.random() - 0.5) * 60,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        max: 0.7 + Math.random() * 1.1,
        col: i % 3 === 0 ? '#fffbe8' : ((ramp && ramp[i % ramp.length]) || '#f0cf6a'),
        size: 2 + (i % 4), shape: i % 6 === 0 ? 'cross' : (i % 3 === 0 ? 'line' : 'sq'),
        drag: 1.1, spin: (Math.random() - .5) * 16, glow: 0.7,
      });
    }
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.ring({
          x: cx + (Math.random() - 0.5) * 90, y: cy + (Math.random() - 0.5) * 90,
          r0: 4, r1: 130 + Math.random() * 110, max: 0.6, col: '#fffbe8', width: 4,
        });
      }, i * 90);
    }
  }

  /** ステージクリアの祝福 */
  stageClear(W, H) {
    this.flash = 0.5; this.flashColor = '#fffbe8';
    for (let i = 0; i < 100; i++) {
      this.spawn({
        x: Math.random() * W, y: H + 20 + Math.random() * 200,
        vx: (Math.random() - 0.5) * 50, vy: -110 - Math.random() * 190,
        max: 1.4 + Math.random() * 1.4,
        col: i % 4 === 0 ? '#8fe8f2' : (i % 4 === 1 ? '#f0cf6a' : '#fffbe8'),
        size: 2 + (i % 3), shape: i % 5 === 0 ? 'petal' : 'sq',
        drag: 0.4, spin: (Math.random() - .5) * 8, glow: 0.6,
      });
    }
  }

  /** 舞う埃（常時） */
  ambient(W, H, dt) {
    if (Math.random() < dt * 4) {
      this.spawn({
        x: Math.random() * W, y: H + 6,
        vx: (Math.random() - 0.5) * 14, vy: -12 - Math.random() * 22,
        max: 3.5 + Math.random() * 3,
        col: '#8f9ab8', size: 1, shape: 'sq', fade: 'inout', drag: 0, add: false,
      });
    }
  }

  /* ---------------------------------------------------------- 更新 ------- */
  update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * this.shakeDecay * (0.4 + this.shake));
    if (this.flash > 0) this.flash -= dt;
    if (this.slowmo > 0) this.slowmo -= dt;

    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life += dt;
      if (q.life >= q.max) { this.p.splice(i, 1); this._pool.push(q); continue; }
      if (q.drag) { const f = Math.max(0, 1 - q.drag * dt); q.vx *= f; q.vy *= f; }
      if (q.g) q.vy += q.g * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.rot += q.spin * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      if (r.life >= r.max) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      if (t.life >= t.max) { this.texts.splice(i, 1); continue; }
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.vy += 42 * dt;
    }
  }

  /* ---------------------------------------------------------- 描画 ------- */
  draw(ctx) {
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 13 : 0;
    ctx.save();
    ctx.translate(sh, sh * 0.62);

    // 粒子（加算と通常を分けて描く）
    for (const q of this.p) {
      const t = q.life / q.max;
      let a = q.fade === 'inout' ? Math.sin(t * Math.PI) : (1 - t);
      a *= 0.95;
      if (a <= 0.01) continue;
      const sz = q.shrink ? Math.max(1, Math.round(q.size * (1 - t * 0.7))) : q.size;
      ctx.save();
      ctx.globalAlpha = a;
      if (q.add) ctx.globalCompositeOperation = 'lighter';
      ctx.translate(q.x, q.y);
      if (q.rot) ctx.rotate(q.rot);
      ctx.fillStyle = q.col;
      switch (q.shape) {
        case 'line': ctx.fillRect(-sz * 2, 0, sz * 4, 1); break;
        case 'cross':
          ctx.fillRect(-sz, -1, sz * 2, 2); ctx.fillRect(-1, -sz, 2, sz * 2);
          if (q.col2) { ctx.fillStyle = q.col2; ctx.fillRect(-1, -1, 2, 2); }
          break;
        case 'petal':
          ctx.fillRect(-sz, -sz * 0.6, sz * 2, sz * 1.2);
          ctx.fillRect(-sz * 0.4, -sz, sz * 0.8, sz * 2);
          break;
        default: ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      }
      ctx.restore();
    }

    // リング
    for (const r of this.rings) {
      const t = r.life / r.max;
      const e = window.HN.ease.outCubic(t);
      const R = window.HN.lerp(r.r0, r.r1, e);
      const a = (1 - t) * r.alpha;
      if (a <= 0.01 || R < 0.5) continue;
      ctx.save();
      ctx.globalAlpha = a;
      if (r.add) ctx.globalCompositeOperation = 'lighter';
      if (r.kind === 'ring') {
        ctx.strokeStyle = r.col;
        ctx.lineWidth = Math.max(1, r.width * (1 - t));
        ctx.beginPath(); ctx.arc(r.x, r.y, R, 0, Math.PI * 2); ctx.stroke();
      } else if (r.kind === 'cross') {
        ctx.strokeStyle = r.col;
        ctx.lineWidth = Math.max(1, r.width);
        ctx.beginPath();
        ctx.moveTo(r.x - R, r.y); ctx.lineTo(r.x + R, r.y);
        ctx.moveTo(r.x, r.y - R); ctx.lineTo(r.x, r.y + R);
        ctx.stroke();
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.moveTo(r.x - R * 0.7, r.y - R * 0.7); ctx.lineTo(r.x + R * 0.7, r.y + R * 0.7);
        ctx.moveTo(r.x + R * 0.7, r.y - R * 0.7); ctx.lineTo(r.x - R * 0.7, r.y + R * 0.7);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 浮き文字
    for (const t of this.texts) {
      const k = t.life / t.max;
      ctx.save();
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : (1 - Math.max(0, (k - 0.5) / 0.5));
      window.HN.drawText(ctx, t.str, t.x, t.y, {
        size: t.size, color: t.col, align: 'center', outline: t.outline,
        outlineColor: '#05060c', latin: t.latin,
      });
      ctx.restore();
    }

    ctx.restore();

    // 画面フラッシュ
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.7, this.flash) * 0.9;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-30, -30, this.W + 60, this.H + 60);
      ctx.restore();
    }
  }
}

window.HN = window.HN || {};
Object.assign(window.HN, { Effects, FX_LIMITS });
