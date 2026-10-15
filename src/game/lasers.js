/**
 * lasers.js — 回転レーザー / 収束ビーム
 *
 * 必ず「予告(細い線が伸びる) → 発射(太くなる) → 消滅」の 3 段階を踏む。
 * 予告段階では当たり判定がなく、発射段階でのみ有効。
 * さらに beam には「回転」を与えられるので、避けながら逃げる緊張感を作れる。
 */
import { VIEW_W, VIEW_H, LASER_CAP } from '../core/const.js';
import { TAU, clamp, rad } from '../core/util.js';

export class Laser {
  constructor() { this.reset(); }
  reset() {
    this.alive = false;
    this.x = 0; this.y = 0;
    this.angle = 0;
    this.width = 12;
    this.length = 900;
    this.state = 'warn';        // warn | fire | fade
    this.warnTime = 0.9;
    this.fireTime = 2.0;
    this.fadeTime = 0.28;
    this.t = 0;
    this.spin = 0;              // rad/s
    this.color = '#ffffff';
    this.colorCore = '#ffffff';
    this.origin = 'fixed';      // 'fixed' | 'boss' | 'player'
    this.follow = null;         // origin が boss/player のとき追従対象
    this.offsetX = 0; this.offsetY = 0;
    this.ignoreSafe = false;    // 発射中はプレイヤーに追従しない (理不尽回避)
    this.oscAmp = 0; this.oscFreq = 0; this.oscPhase = 0;
    this.origAngle = 0;
    this.count = 1;             // 同時に出す本数 (扇状)
    this.spread = 0;
    this.z = 0;
  }
}

export class Lasers {
  constructor() {
    this.list = [];
    this.fx = null;
    this.player = null;
    this.rng = null;
  }
  attach({ fx, player, rng }) { this.fx = fx; this.player = player; this.rng = rng; }
  clear() { for (const l of this.list) l.alive = false; }

  spawn(o) {
    let l = this.list.find((x) => !x.alive);
    if (!l) {
      if (this.list.length >= LASER_CAP) l = this.list[0];
      else { l = new Laser(); this.list.push(l); }
    }
    l.reset();
    Object.assign(l, o);
    l.alive = true;
    l.origAngle = l.angle;
    l.t = 0;
    return l;
  }

  update(dt, opts = {}) {
    const p = this.player;
    const cam = opts.camera ?? this.camera ?? null;
    for (const l of this.list) {
      if (!l.alive) continue;
      l.t += dt;

      if (l.follow === 'boss' || l.origin === 'boss') {
        if (l.follow && l.follow.alive) {
          l.x = l.follow.x + l.offsetX;
          l.y = l.follow.y + l.offsetY;
        }
      } else if (l.origin === 'player' && p) {
        l.x = p.x + l.offsetX;
        l.y = p.y + l.offsetY;
      }

      if (l.state === 'warn') {
        // 発射直前までプレイヤーを緩く追尾して「避けられる」ようにする
        if (!l.ignoreSafe && p && l.t < l.warnTime * 0.72 && l.spin === 0) {
          const want = Math.atan2(p.y - l.y, p.x - l.x);
          let d = (want - l.angle) % TAU;
          if (d > Math.PI) d -= TAU;
          if (d < -Math.PI) d += TAU;
          l.angle += clamp(d, -rad(48) * dt, rad(48) * dt);
        }
        if (l.t >= l.warnTime) {
          l.state = 'fire';
          l.t = 0;
          l.origAngle = l.angle;
          this.fx?.addFlash(0.10, l.color);
          this.fx?.addShake(1.4);
          this.fx?.ring(l.x, l.y, {
            r0: 6, r1: l.width * 5, life: 0.30, color: l.color, width: 2, add: true,
          });
        }
      } else if (l.state === 'fire') {
        l.angle += l.spin * dt;
        if (l.oscAmp) {
          l.angle = l.origAngle + Math.sin(l.t * l.oscFreq * TAU + l.oscPhase) * l.oscAmp;
        }
        if (l.t >= l.fireTime) { l.state = 'fade'; l.t = 0; }
      } else {
        if (l.t >= l.fadeTime) l.alive = false;
      }

      // ビーム本体の当たり判定 (fire 状態のみ)
      if (l.state === 'fire' && p && p.alive && p.vulnerable) {
        const count = l.count ?? 1;
        const use3D = cam && cam.active;
        for (let c = 0; c < count; c++) {
          const ang = l.angle + (count > 1 ? (c - (count - 1) / 2) * l.spread : 0);
          let d, half, rad, graze;
          if (use3D) {
            // 擬似3D: 描画と同じく投影後のスクリーン座標で判定する。
            // (ワールド座標で判定すると、見えている位置と当たりがずれる)
            const a = cam.project(l.x, l.y, l.z ?? 0);
            const b = cam.project(l.x + Math.cos(ang) * l.length, l.y + Math.sin(ang) * l.length, l.z ?? 0);
            const pp = cam.project(p.x, p.y, p.z ?? 0);
            if (a.behind || b.behind || pp.behind) continue;
            d = this._distToSeg(pp.sx, pp.sy, a.sx, a.sy, b.sx, b.sy);
            const sc = (a.scale + b.scale) / 2;
            half = (l.width / 2) * sc;
            rad = p.radius * Math.max(0.5, pp.scale);
            graze = p.grazeRadius * Math.max(0.5, pp.scale);
          } else {
            d = this._distToRay(p.x, p.y, l.x, l.y, ang, l.length);
            half = l.width / 2;
            rad = p.radius;
            graze = p.grazeRadius;
          }
          if (d < half + rad) { p.onHit(null, 'laser'); break; }
          if (!l._grazeMark && d < half + graze) {
            l._grazeMark = true;   // 1 本につき 1 回だけグレイズ
            this.fx?.spawn(p.x, p.y, { vx: 0, vy: -30, life: 0.3, size: 2, color: '#7cf0ff', add: true });
          }
        }
      }
    }
  }

  _distToSeg(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const L2 = vx * vx + vy * vy || 1;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1);
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }

  _distToRay(px, py, ox, oy, angle, len) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const t = (px - ox) * dx + (py - oy) * dy;
    const tc = clamp(t, 0, len);
    const cx = ox + dx * tc, cy = oy + dy * tc;
    return Math.hypot(px - cx, py - cy);
  }

  /** カメラ対応の描画 */
  draw(ctx, cam) {
    const use3D = cam && cam.active;
    for (const l of this.list) {
      if (!l.alive) continue;
      let alpha = 1, w = l.width;
      if (l.state === 'warn') {
        const t = l.t / l.warnTime;
        alpha = 0.24 + t * 0.5;
        w = Math.max(1, l.width * (0.12 + t * 0.30));
      } else if (l.state === 'fire') {
        const t = l.t / l.fireTime;
        // 発射直後に最大太さ、終盤で少し細る
        alpha = 1 - Math.max(0, (t - 0.75)) * 1.6;
        w = l.width * (1 - Math.max(0, t - 0.85) * 0.6);
      } else {
        const t = l.t / l.fadeTime;
        alpha = 1 - t;
        w = l.width * (1 - t) * 1.5;
      }
      if (alpha <= 0.01) continue;

      const count = l.count ?? 1;
      for (let c = 0; c < count; c++) {
        const ang = l.angle + (count > 1 ? (c - (count - 1) / 2) * l.spread : 0);
        this._drawBeam(ctx, cam, use3D, l, ang, w, alpha);
      }
    }
  }

  _drawBeam(ctx, cam, use3D, l, ang, w, alpha) {
    ctx.save();
    if (use3D) {
      // 3D 中はビームの始点と終点を投影して線を引く。
      // 「奥から迫るビーム」として見える。
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const ex = l.x + nx * l.length, ey = l.y + ny * l.length;
      const p0 = cam.project(l.x, l.y, l.z ?? 0);
      const p1 = cam.project(ex, ey, l.z ?? 0);
      if (p0.behind && p1.behind) { ctx.restore(); return; }
      const grad = ctx.createLinearGradient(p0.sx, p0.sy, p1.sx, p1.sy);
      grad.addColorStop(0, this._rgba(l.colorCore, alpha));
      grad.addColorStop(0.65, this._rgba(l.color, alpha * 0.8));
      grad.addColorStop(1, this._rgba(l.color, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, w * 0.9 * (p0.scale + p1.scale) / 2);
      ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.translate(Math.round(l.x) + 0.5, Math.round(l.y) + 0.5);
    ctx.rotate(ang);
    const len = l.length;
    // 外側の光
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, this._rgba(l.color, alpha * 0.85));
    g.addColorStop(0.7, this._rgba(l.color, alpha * 0.35));
    g.addColorStop(1, this._rgba(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, -w / 2, len, w);
    // 中心の白い芯
    const g2 = ctx.createLinearGradient(0, 0, len, 0);
    g2.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g2.addColorStop(0.55, this._rgba(l.colorCore, alpha * 0.7));
    g2.addColorStop(1, this._rgba(l.colorCore, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, -Math.max(1, w * 0.22) / 2, len, Math.max(1, w * 0.22));
    ctx.restore();
  }

  _rgba(hex, a) {
    if (!hex.startsWith('#')) return `rgba(255,255,255,${a})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}
