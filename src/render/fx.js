/**
 * エフェクト層: パーティクル、衝撃波、フラッシュ、画面揺れ、残像、カットイン。
 * 弾の視認性を損なわないよう、すべて「弾より暗い or 加算だが小さい」範囲で使う。
 */
import { VIEW_W, VIEW_H } from '../core/const.js';
import { TAU, clamp, lerp, easeOutCubic } from '../core/util.js';

export class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.shake = { x: 0, y: 0, amp: 0, decay: 0.86 };
    this.flash = 0;
    this.flashColor = '#fff';
    this.chroma = 0;
    this.tint = null;
    this.slowmo = 1;
    this.hitStop = 0;
    this.time = 0;
  }

  reset() {
    this.parts.length = 0;
    this.rings.length = 0;
    this.shake.amp = 0;
    this.flash = 0;
    this.chroma = 0;
    this.tint = null;
    this.slowmo = 1;
    this.hitStop = 0;
  }

  /* ---------------- 基本 ---------------- */
  addShake(amp, decay = 0.86) {
    this.shake.amp = Math.max(this.shake.amp, amp);
    this.shake.decay = decay;
  }
  addFlash(amount, color = '#ffffff') {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }
  addChroma(amount) { this.chroma = Math.max(this.chroma, amount); }
  /** ヒットストップ (フレーム単位) */
  addHitStop(frames) { this.hitStop = Math.max(this.hitStop, frames); }

  /* ---------------- パーティクル ---------------- */
  spawn(x, y, opt = {}) {
    if (this.parts.length > 900) this.parts.shift();
    const {
      vx = 0, vy = 0, life = 0.6, size = 2, color = '#ffffff',
      gravity = 0, drag = 0.94, shape = 'px', fade = true, spin = 0,
      add = true, angle = 0, shrink = true,
    } = opt;
    this.parts.push({
      x, y, vx, vy, life, maxLife: life, size, color, gravity, drag,
      shape, fade, spin, rot: angle, add, shrink,
    });
  }

  /** 放射状バースト */
  burst(x, y, n, opt = {}) {
    const { speed = 90, spread = TAU, dir = 0, speedVar = 0.5, ...rest } = opt;
    for (let i = 0; i < n; i++) {
      const a = dir + (i / n) * spread + (Math.random() - 0.5) * 0.35;
      const s = speed * (1 - speedVar / 2 + Math.random() * speedVar);
      this.spawn(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        angle: a, ...rest,
      });
    }
  }

  /* ---------------- 衝撃波リング ---------------- */
  ring(x, y, opt = {}) {
    const {
      r0 = 4, r1 = 90, life = 0.5, color = '#ffffff', width = 3,
      fill = 0, ease = easeOutCubic, squash = 1, add = true, rot = 0,
    } = opt;
    this.rings.push({ x, y, r0, r1, life, maxLife: life, color, width, fill, ease, squash, add, rot });
  }

  /* ---------------- 更新 ---------------- */
  update(dt) {
    this.time += dt;
    if (this.hitStop > 0) { this.hitStop -= 1; }

    const shakeDecay = Math.pow(this.shake.decay, dt * 60);
    this.shake.amp *= shakeDecay;
    if (this.shake.amp < 0.06) this.shake.amp = 0;
    const a = this.shake.amp;
    this.shake.x = (Math.random() * 2 - 1) * a;
    this.shake.y = (Math.random() * 2 - 1) * a;

    this.flash = Math.max(0, this.flash - dt * 3.6);
    this.chroma = Math.max(0, this.chroma - dt * 2.4);

    // パーティクル
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.x < -20 || p.x > VIEW_W + 20 || p.y < -20 || p.y > VIEW_H + 20) {
        ps.splice(i, 1);
      }
    }
    // リング
    const rs = this.rings;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      r.life -= dt;
      if (r.life <= 0) rs.splice(i, 1);
    }

    // スローモーションから復帰
    this.slowmo = lerp(this.slowmo, 1, 1 - Math.pow(0.90, dt * 60));
  }

  /* ---------------- 描画 (ゲームバッファ内) ---------------- */
  draw(ctx) {
    // リング
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      const rad = lerp(r.r0, r.r1, r.ease(t));
      const alpha = 1 - t;
      // 非有限値・負の半径は描画系 (Canvas2D / skia) を壊すので必ず弾く
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(rad) || rad < 0) continue;
      ctx.save();
      ctx.translate(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5);
      if (r.rot) ctx.rotate(r.rot);
      ctx.scale(1, r.squash);
      ctx.globalCompositeOperation = r.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = alpha;
      if (r.fill > 0) {
        ctx.fillStyle = r.color;
        ctx.globalAlpha = alpha * r.fill;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(1, r.width * (1 - t * 0.6));
      ctx.strokeStyle = r.color;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // パーティクル
    ctx.save();
    for (const p of this.parts) {
      const t = p.life / p.maxLife;
      const alpha = p.fade ? clamp(t * 1.6, 0, 1) : 1;
      const size = p.shrink ? Math.max(1, p.size * (0.35 + t * 0.65)) : p.size;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(size) || !Number.isFinite(p.rot)) continue;
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'px') {
        const s = Math.max(1, Math.round(size));
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      } else if (p.shape === 'line') {
        const len = size * 3;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-len / 2, -size / 2, len, Math.max(1, size * 0.6));
        ctx.restore();
      } else if (p.shape === 'spark') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        const l = size * 2.4;
        ctx.moveTo(0, -l); ctx.lineTo(size * 0.5, 0); ctx.lineTo(0, l); ctx.lineTo(-size * 0.5, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** 表示側のポスト設定へ流し込む */
  applyPost(post) {
    post.flash = this.flash;
    post.flashColor = this.flashColor;
    post.aberration = this.chroma;
    post.tint = this.tint;
  }
}

/** 画面揺れ込みの描画ヘルパ */
export function withShake(ctx, fx, fn) {
  ctx.save();
  ctx.translate(Math.round(fx.shake.x), Math.round(fx.shake.y));
  fn();
  ctx.restore();
}
