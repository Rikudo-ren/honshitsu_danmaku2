/* =============================================================================
 * src/ui/hud.js — ゲーム内 HUD
 *
 *  原作のゲーム的核は「残り時間」と「密度」である。
 *  「残り時間が少ないほど、密度が上がる。等高線の間隔が狭いほど、傾斜が急になるように。」
 *  したがって HUD は残り時間を主役に据える。
 *
 *  配置（640×480 のプレイフィールド内）:
 *    右上 … 残り秒数（大）＋フェーズ進度バー＋フェーズ番号
 *    左上 … ステージ名（小）／難易度バッジ
 *    左下 … 残機（紙飛行機アイコン）／観測ゲージ
 *    右下 … かすり数／スコア
 *    下中央 … フェーズ名（切り替え時のみ、短く）
 *
 *  すべて半透明。弾幕の視認性を最優先し、HUD は弾より暗く描く。
 * ========================================================================== */
'use strict';

const HUD = {
  /* --------------------------------------------------------- 初期化 ----- */
  init() { this.banner = null; this.bannerT = 0; this.warnT = 0; },

  /** フェーズ名バナーを表示 */
  showBanner(name, subtitle, dur = 2.4) {
    this.banner = { name, subtitle };
    this.bannerT = dur;
  },

  update(dt) {
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.warnT > 0) this.warnT -= dt;
  },

  /* ----------------------------------------------------------- 描画 ----- */
  /**
   * @param ctx 2Dコンテキスト（プレイフィールド座標系）
   * @param g   ゲーム状態
   */
  draw(ctx, g) {
    const W = window.HN.BG_W, H = window.HN.BG_H;
    const { drawText, RAMP, UI_PALETTE: UI, clamp } = window.HN;

    /* ============================ 右上: 残り時間 ======================== */
    const remain = Math.max(0, g.phaseRemain);
    const urgency = 1 - clamp(remain / Math.max(1, g.phaseDuration), 0, 1);
    const timeCol = remain <= 5 ? '#e05575' : remain <= 10 ? '#f0cf6a' : '#e8ecf7';
    const pulse = remain <= 10 ? (0.5 + 0.5 * Math.sin(g.time * (remain <= 5 ? 14 : 8))) : 0;

    /* 縦積みの順序を厳密に固定する（重なりを構造的に防ぐ）:
     *   「残り」ラベル y=8..18 → 秒数 y=20..54 → 進度バー y=58..63 → フェーズ番号 y=66..78
     * 以前はラベルと数字を同じ y に右寄せで重ねていたため、数字の末尾と
     * 「残り」が衝突していた（実フレームで確認）。
     */
    const tx = W - 14;
    const numSize = remain >= 10 ? 32 : 30;
    // 「残り」ラベル（数字の上・右寄せ）
    drawText(ctx, '残り', tx, 8, {
      size: 10, color: '#8b94ad', align: 'right', outline: 2, outlineColor: '#05060c',
    });
    // 秒数（大きい数字はラテンフォントのピクセル書体）
    const secStr = remain >= 10 ? String(Math.ceil(remain)) : remain.toFixed(1);
    ctx.save();
    ctx.textAlign = 'right';
    drawText(ctx, secStr, tx, 20, {
      size: numSize, color: timeCol, align: 'right',
      outline: 4, outlineColor: '#05060c', latin: true, bold: true,
    });
    ctx.restore();

    // フェーズ進度バー（残り時間の下・右寄せ）
    const barW = 128, barH = 5, bx = W - 14 - barW, by = 58;
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,12,0.72)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    // 経過分を満たしていく（＝密度が上がっていく）
    const fill = 1 - clamp(remain / Math.max(0.001, g.phaseDuration), 0, 1);
    const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    grad.addColorStop(0, '#2a9dae');
    grad.addColorStop(0.55, '#f0cf6a');
    grad.addColorStop(1, '#e05575');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, Math.round(barW * fill), barH);
    ctx.strokeStyle = 'rgba(232,236,247,0.30)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);
    // フェーズ目盛り
    ctx.fillStyle = 'rgba(5,6,12,0.8)';
    for (let i = 1; i < g.phaseTotal; i++) {
      const px = bx + Math.round(barW * (i / g.phaseTotal));
      ctx.fillRect(px, by, 1, barH);
    }
    // フェーズ番号
    drawText(ctx, `PHASE ${Math.min(g.phaseIndex + 1, g.phaseTotal)} / ${g.phaseTotal}`,
      W - 14, by + 8, { size: 10, color: '#8b94ad', align: 'right', latin: true, outline: 2 });
    ctx.restore();

    // 残り時間警告の縁取り
    if (remain <= 10 && pulse > 0.05) {
      ctx.save();
      ctx.globalAlpha = pulse * 0.30;
      ctx.strokeStyle = remain <= 5 ? '#e05575' : '#f0cf6a';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.restore();
    }

    /* ============================ 左上: ステージ ======================== */
    ctx.save();
    drawText(ctx, g.stage.title, 14, 12, {
      size: 13, color: '#e8ecf7', outline: 3, outlineColor: '#05060c',
    });
    drawText(ctx, g.stage.subtitle, 14, 28, {
      size: 10, color: '#8b94ad', outline: 2, outlineColor: '#05060c',
    });
    // 難易度バッジ
    const dl = g.dif.label;
    const dw = 10 + dl.length * 7;
    ctx.fillStyle = 'rgba(5,6,12,0.66)';
    ctx.fillRect(13, 42, dw + 2, 14);
    ctx.strokeStyle = g.dif.d.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(13.5, 42.5, dw + 1, 13);
    drawText(ctx, dl, 19, 44, { size: 10, color: g.dif.d.color, latin: true, bold: true });
    ctx.restore();

    /* ========================= 左下: 残機・観測 ======================= */
    // 縦積みの順序を厳密に固定する（重なりを構造的に防ぐ）:
    //   残機ラベル (y=H-46) → 残機アイコン (中心 y=H-28) → 観測ゲージ (y=H-16..H-9)
    ctx.save();
    const ship = window.HN.SHIP;
    if (ship.built && ship.frames.neutral) {
      for (let i = 0; i < g.dif.lives; i++) {
        const on = i < g.lives;
        ctx.globalAlpha = on ? 0.95 : 0.18;
        const ix = 27 + i * 21, iy = H - 28;
        if (on) {
          ctx.drawImage(ship.frames.neutral.canvas, ix - 9, iy - 9);
        } else {
          // 失った残機は輪郭だけ
          ctx.strokeStyle = '#4a5578'; ctx.lineWidth = 1;
          ctx.strokeRect(ix - 5, iy - 5, 10, 10);
        }
      }
      ctx.globalAlpha = 1;
    }
    drawText(ctx, '残機', 13, H - 46, { size: 9, color: '#8b94ad', latin: false });

    // 観測ゲージ（✝ を溜める）
    const gx = 26, gy = H - 16;
    const gw = 92, gh = 7;
    ctx.fillStyle = 'rgba(5,6,12,0.72)';
    ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
    const gp = clamp(g.gauge / g.gaugeMax, 0, 1);
    const gg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    gg.addColorStop(0, '#6b5320');
    gg.addColorStop(0.5, '#c39a3c');
    gg.addColorStop(1, '#fffbe8');
    ctx.fillStyle = gg;
    ctx.fillRect(gx, gy, Math.round(gw * gp), gh);
    ctx.strokeStyle = gp >= 1 ? '#fffbe8' : 'rgba(232,236,247,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx - 0.5, gy - 0.5, gw + 1, gh + 1);
    // ✝ はゲージの左（x=11）に置き、ゲージ本体（x=26〜）と重ねない
    if (gp >= 1) {
      const pl = 0.5 + 0.5 * Math.sin(g.time * 8);
      window.HN.drawCross(ctx, 13, gy + gh / 2, { scale: 1, glow: 1.2, pulse: pl, alpha: 0.95 });
    } else {
      window.HN.drawCross(ctx, 13, gy + gh / 2, { scale: 1, glow: 0, pulse: 0, alpha: 0.45 });
    }
    drawText(ctx, `観測 ${g.observations}`, gx + gw + 8, gy - 3, {
      size: 9, color: gp >= 1 ? '#f0cf6a' : '#8b94ad', outline: 2, outlineColor: '#05060c',
    });

    /* ========================= 右下: かすり・点 ======================= */
    ctx.save();
    drawText(ctx, `かすり ${g.graze}`, W - 14, H - 20, {
      size: 12, color: '#8fe8f2', align: 'right', outline: 3, outlineColor: '#05060c',
    });
    drawText(ctx, `SCORE ${window.HN.fmtNum(g.score)}`, W - 14, H - 36, {
      size: 11, color: '#e8ecf7', align: 'right', outline: 3, outlineColor: '#05060c', latin: true,
    });
    ctx.restore();

    /* ==================== フェーズ名バナー（下中央） ================== */
    if (this.bannerT > 0 && this.banner) {
      const k = this.bannerT;
      const a = k > 2.1 ? (2.4 - k) / 0.3 : Math.min(1, k / 0.7);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      const cx = W / 2, cy = H * 0.60;
      // 下地
      ctx.fillStyle = 'rgba(5,6,12,0.55)';
      ctx.fillRect(cx - 150, cy - 16, 300, 34);
      ctx.strokeStyle = 'rgba(240,207,106,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 150, cy - 16); ctx.lineTo(cx - 90, cy - 16);
      ctx.moveTo(cx + 90, cy - 16); ctx.lineTo(cx + 150, cy - 16);
      ctx.moveTo(cx - 150, cy + 18); ctx.lineTo(cx - 90, cy + 18);
      ctx.moveTo(cx + 90, cy + 18); ctx.lineTo(cx + 150, cy + 18);
      ctx.stroke();
      drawText(ctx, this.banner.name, cx, cy - 12, {
        size: 20, color: '#fffbe8', align: 'center', outline: 4, outlineColor: '#05060c',
      });
      if (this.banner.subtitle) {
        drawText(ctx, this.banner.subtitle, cx, cy + 12, {
          size: 10, color: '#c9cfe2', align: 'center', outline: 2, outlineColor: '#05060c',
        });
      }
      ctx.restore();
    }
  },

  /** 短い注記（「フェーズ移行」など） */
  drawToast(ctx, text, x, y, alpha = 1, col = '#f0cf6a') {
    window.HN.drawText(ctx, text, x, y, {
      size: 13, color: col, align: 'center', outline: 3, outlineColor: '#05060c',
      alpha,
    });
  },
};

window.HN = window.HN || {};
Object.assign(window.HN, { HUD });
