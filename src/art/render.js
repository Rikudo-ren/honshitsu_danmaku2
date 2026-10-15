/* =============================================================================
 * src/art/render.js — 弾・レーザー・予告マーカーの描画
 *
 *  【描画順】視認性を最優先に固定する。
 *    1. レーザーの予告線（細い破線。まだ当たらない）
 *    2. 弾のグロー（加算合成。まとめて描いてからコアを重ねる）
 *    3. 弾のコア（白コア＋外周色。輪郭はスプライト自体が持つ）
 *    4. レーザーの発射（加算・半透明。弾は透けて見える）
 *    5. 画面外からの予告マーカー
 *
 *  【性能】弾はすべて事前焼きスプライトの drawImage で描く。
 *  パス生成は行わない。1400 発でも 1 フレーム 1400 回の drawImage で済む。
 * ========================================================================== */
'use strict';

class Render {
  static atlas = null;
  static ready = false;

  /** スプライトアトラスを構築する（起動時に 1 回） */
  static build() {
    if (this.ready) return;
    this.atlas = new window.HN.SpriteAtlas(window.HN.BULLET);
    this.ready = true;
  }

  /* ------------------------------------------------------------ 弾 ----- */
  static _bulletAlpha(b) {
    let a = b.alpha ?? 1;
    if (b.fadeIn > 0 && b.life < b.fadeIn) a *= b.life / b.fadeIn;
    const left = b.maxLife - b.life;
    if (b.fadeOut > 0 && left < b.fadeOut) a *= Math.max(0, left / b.fadeOut);
    if (b.startAfter > 0 && b.life < b.startAfter) a *= 0.55;   // 発射待ちは半透明
    return a < 0 ? 0 : (a > 1 ? 1 : a);
  }

  static drawBullets(ctx, sys, time) {
    if (!this.ready) this.build();
    const A = this.atlas;
    const list = sys.bullets;

    /* --- 1) グロー（加算） --- */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active) continue;
      const a = this._bulletAlpha(b) * (b.glow ?? 1);
      if (a <= 0.02) continue;
      ctx.save();
      ctx.translate(b.x | 0, b.y | 0);
      window.HN.drawBulletGlow(ctx, A, b.type, a * 0.75, b.scale);
      ctx.restore();
    }
    ctx.restore();

    /* --- 2) コア --- */
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active) continue;
      const a = this._bulletAlpha(b);
      if (a <= 0.03) continue;
      const def = window.HN.BULLET[b.type];
      if (!def) continue;
      let sc = b.scale;
      // 出現時の「にじみ」から実体化するアニメーション（唐突な出現を避ける）
      if (b.startAfter > 0 && b.life < b.startAfter) sc *= 0.72 + 0.28 * (b.life / b.startAfter);
      ctx.save();
      ctx.translate(b.x | 0, b.y | 0);
      if (def.rotation) ctx.rotate(b.rot);
      window.HN.drawBulletSprite(ctx, A, b.type, 0, a, sc);
      ctx.restore();
    }
  }

  /* -------------------------------------------------------- レーザー --- */
  /**
   * @param phase 'warn' = 弾より下に描く予告線 / 'fire' = 弾より上に描く光条
   */
  static drawLasers(ctx, sys, time, phase) {
    const ls = sys.lasers;
    if (phase !== 'warn') return;
    // --- 予告（当たらない。ここを通っても安全） ---
    for (const l of ls) {
      if (!l.active || l.phase !== 'warn') continue;
      const k = l.t / Math.max(1e-6, l.warnDur);
      const ramp = l.ramp || window.HN.RAMP.navy;
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.30 * k;
      ctx.translate(l.x, l.y);
      ctx.rotate(l.ang);
      // 中心線
      ctx.fillStyle = l.color || ramp[3];
      ctx.fillRect(0, -1, l.length, 2);
      // 幅の予告（発射時の太さを先に見せる）
      ctx.globalAlpha = 0.10 + 0.16 * k;
      ctx.fillRect(0, -l.width / 2, l.length, l.width);
      ctx.globalAlpha = 0.35 + 0.5 * k;
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(0, -1, 26, 2);
      ctx.restore();
      // 発射元の点滅
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 22);
      ctx.fillStyle = l.color || ramp[3];
      ctx.beginPath(); ctx.arc(l.x, l.y, 3 + k * 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  /* --- 発射されているレーザー（弾の上に描く） --- */
  static drawLaserFire(ctx, sys, time) {
    const ls = sys.lasers;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of ls) {
      if (!l.active || l.phase === 'warn') continue;
      const ramp = l.ramp || window.HN.RAMP.navy;
      let a = l.alpha ?? 1;
      if (l.phase === 'fade') a *= Math.max(0, 1 - l.t / Math.max(1e-6, l.fadeDur));
      const w = l.width * (l.phase === 'fire' ? (0.35 + 0.65 * Math.min(1, l.t / 0.09)) : 1);
      ctx.save();
      ctx.globalAlpha = a * 0.30;
      ctx.translate(l.x, l.y);
      ctx.rotate(l.ang);
      ctx.fillStyle = l.color || ramp[2];
      ctx.fillRect(0, -w * 0.85, l.length, w * 1.7);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = l.color || ramp[3];
      ctx.fillRect(0, -w * 0.42, l.length, w * 0.84);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -w * 0.16, l.length, Math.max(2, w * 0.32));
      ctx.restore();
      // 発射点
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(l.x, l.y, w * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }


  /* --------------------------------------------------- 予告マーカー ---- */
  static drawWarns(ctx, sys, time) {
    for (const m of sys.warns) {
      if (!m.active) continue;
      const k = m.life / Math.max(1e-6, m.dur);
      const ramp = m.ramp || window.HN.RAMP.navy;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.ang);
      ctx.globalAlpha = 0.35 + 0.45 * Math.sin(k * Math.PI);
      // 矢印（進入方向を示す）
      ctx.fillStyle = '#fffbe8';
      for (let i = 0; i < 3; i++) {
        const d = i * 7;
        ctx.fillRect(2 + d, -3, 3, 6);
      }
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.fillStyle = ramp[2];
      ctx.fillRect(0, -8, 42, 16);
      ctx.restore();
      // 画面端の警告リング
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 18);
      ctx.strokeStyle = ramp[3];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, 6 + (1 - k) * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /** フィールド全体の弾描画（描画順はヘッダの規則に従う） */
  static drawField(ctx, sys, time) {
    this.drawLasers(ctx, sys, time, 'warn');
    this.drawBullets(ctx, sys, time);
    this.drawLaserFire(ctx, sys, time);
    this.drawWarns(ctx, sys, time);
  }

  /** 弾数を画面に出す（デバッグ表示。既定はオフ） */
  static drawStats(ctx, sys, fps) {
    window.HN.drawText(ctx, `B:${sys.count} F:${fps.toFixed(0)}`, 6, 6,
      { size: 9, color: '#8b94ad', latin: true, outline: 2 });
  }
}

window.HN = window.HN || {};
Object.assign(window.HN, { Render });
