/* =============================================================================
 * src/art/backgrounds.js — 多層スクロール背景
 *
 *  【視認性の絶対規則】
 *   背景は「明度 40% 以下・低彩度」で統一する。弾は白いコアを持つため、
 *   背景が暗く抑えられている限り、どんな場面でも弾が必ず読める。
 *   明るい要素（地図の等高線・窓の光）は細い線か低 alpha に限定する。
 *
 *  【構成】4 層のパララックス
 *    L0 地（ほぼ静止） …  ステージ基調色のグラデーション
 *    L1 遠景（0.08x）  …  大きな構造物／山並み／入れ子の等高線
 *    L2 中景（0.30x）  …  地形図の格子・記号・教科書的な文字
 *    L3 近景（0.85x）  …  埃・花びら・紙片（速く流れる）
 *  すべて起動時にオフスクリーンへ焼き、実行時は drawImage のタイル描画のみ。
 * ========================================================================== */
'use strict';

const BG_W = 640, BG_H = 480;   // 論理解像度

/* --------------------------------------------------------------- 補助 ---- */
function noiseRect(ctx, x, y, w, h, col, density, rng) {
  ctx.fillStyle = col;
  for (let i = 0; i < density; i++) {
    const px = x + rng.next() * w, py = y + rng.next() * h;
    ctx.fillRect(px | 0, py | 0, 1, 1);
  }
}

/* =========================================================================
 * L0: 地
 * ======================================================================= */
function makeSky(theme) {
  const { canvas, ctx } = window.HN.makeCanvas(BG_W, BG_H);
  const g = ctx.createLinearGradient(0, 0, 0, BG_H);
  g.addColorStop(0, window.HN.mixHex('#05060c', theme[0], 0.5));
  g.addColorStop(0.5, '#08090f');
  g.addColorStop(1, window.HN.mixHex('#05060c', theme[1], 0.35));
  ctx.fillStyle = g; ctx.fillRect(0, 0, BG_W, BG_H);
  return canvas;
}

/* =========================================================================
 * L1: 遠景 — ステージごとの大きな構造
 * ======================================================================= */
function makeFar(style, theme, seed = 1) {
  const W = 960, H = BG_H;
  const { canvas, ctx } = window.HN.makeCanvas(W, H);
  const rng = new window.HN.RNG(seed * 7919);
  const c1 = window.HN.mixHex('#0b0d16', theme[1], 0.42);
  const c2 = window.HN.mixHex('#0b0d16', theme[2], 0.30);

  if (style === 'geometric') {
    // 南棟と北棟。左右で色が変わる二つの校舎ブロック。
    for (const side of [-1, 1]) {
      const col = side < 0 ? window.HN.mixHex('#0b0d16', '#30509f', 0.34)
        : window.HN.mixHex('#0b0d16', '#a82244', 0.30);
      const x0 = side < 0 ? 0 : W / 2;
      // 校舎のシルエット（窓の格子）
      for (let b = 0; b < 5; b++) {
        const bw = 90 + rng.next() * 70;
        const bh = 130 + rng.next() * 150;
        const bx = x0 + rng.next() * (W / 2 - bw);
        const by = H - bh - 24;
        ctx.fillStyle = col;
        ctx.fillRect(bx | 0, by | 0, bw | 0, bh | 0);
        // 窓（LED 照明の点）
        ctx.fillStyle = window.HN.mixHex('#0b0d16', '#e8ecf7', 0.20);
        for (let wy = by + 10; wy < H - 30; wy += 16) {
          for (let wx = bx + 7; wx < bx + bw - 10; wx += 14) {
            if (rng.next() < 0.42) ctx.fillRect(wx | 0, wy | 0, 6, 7);
          }
        }
      }
    }
    // 中央の境界線（見えない壁を可視化する細い線）
    ctx.strokeStyle = window.HN.mixHex('#05060c', '#f2e8cd', 0.28);
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);
  } else if (style === 'boundary') {
    // 地質境界。斜めに走る線の左右で色が違う（味噌の東西）。
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(-0.42); ctx.translate(-W / 2, -H / 2);
    ctx.fillStyle = window.HN.mixHex('#0b0d16', '#b1592c', 0.24);
    ctx.fillRect(-200, 0, W + 400, H + 200);
    ctx.fillStyle = window.HN.mixHex('#0b0d16', '#2a261c', 0.34);
    ctx.fillRect(-200, -H - 200, W + 400, H + 200);
    // 地層の縞
    for (let i = 0; i < 22; i++) {
      const y = -H - 200 + i * 26;
      ctx.fillStyle = i % 2 ? window.HN.mixHex('#0b0d16', theme[2], 0.10)
        : window.HN.mixHex('#0b0d16', theme[0], 0.13);
      ctx.fillRect(-200, y, W + 400, 9 + (i % 3) * 3);
    }
    ctx.strokeStyle = window.HN.mixHex('#05060c', '#e29b64', 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-200, 0); ctx.lineTo(W + 200, 0); ctx.stroke();
    ctx.restore();
  } else if (style === 'terrace') {
    // 河岸段丘。階段状の台地。
    for (let step = 0; step < 5; step++) {
      const y = H - 40 - step * 62;
      const inset = step * 46;
      ctx.fillStyle = window.HN.mixHex('#0b0d16', theme[1], 0.16 + step * 0.045);
      ctx.fillRect((inset * 0.5) | 0, y | 0, (W - inset) | 0, 64);
      // 段丘崖
      ctx.fillStyle = window.HN.mixHex('#05060c', theme[2], 0.30);
      ctx.fillRect((inset * 0.5) | 0, y | 0, (W - inset) | 0, 2);
      // 段の上の集落（小さな家）
      ctx.fillStyle = window.HN.mixHex('#0b0d16', '#f2e8cd', 0.16);
      for (let i = 0; i < 7; i++) {
        const hx = (inset * 0.5 + 20 + rng.next() * (W - inset - 60)) | 0;
        ctx.fillRect(hx, (y - 9) | 0, 7, 9);
        ctx.fillRect((hx - 1) | 0, (y - 11) | 0, 9, 2);
      }
    }
  } else {
    // contour: 地形図そのもの。入れ子の等高線と水系。
    const cx = W * 0.5, cy = H * 0.52;
    for (let i = 0; i < 16; i++) {
      const rr = 26 + i * 22;
      const a = 0.055 + (i < 4 ? 0.05 : 0);
      ctx.strokeStyle = window.HN.mixHex('#0b0d16', theme[2], a + 0.10);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const th = (k / 72) * Math.PI * 2;
        const wob = 1 + Math.sin(th * 3 + i * 0.7) * 0.10 + Math.sin(th * 5 - i) * 0.05;
        const x = cx + Math.cos(th) * rr * wob * 1.5;
        const y = cy + Math.sin(th) * rr * wob * 0.9;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // 水系
    ctx.strokeStyle = window.HN.mixHex('#0b0d16', '#2a9dae', 0.34);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 340, cy + 150);
    ctx.bezierCurveTo(cx - 120, cy + 60, cx - 40, cy - 40, cx + 60, cy - 110);
    ctx.bezierCurveTo(cx + 140, cy - 170, cx + 240, cy - 120, cx + 360, cy - 200);
    ctx.stroke();
  }
  return canvas;
}

/* =========================================================================
 * L2: 中景 — 地形図の格子・記号
 * ======================================================================= */
function makeMid(style, theme, seed = 2) {
  const W = 640, H = BG_H;
  const { canvas, ctx } = window.HN.makeCanvas(W, H);
  const rng = new window.HN.RNG(seed * 104729);
  const line = window.HN.mixHex('#05060c', theme[2], 0.22);
  // 方眼
  ctx.strokeStyle = line; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 32) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
  }
  // 太い経線
  ctx.strokeStyle = window.HN.mixHex('#05060c', theme[3], 0.16);
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 128) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
  }
  // 地形図の記号（三角点・神社・田・畑）
  const sym = (x, y, kind) => {
    ctx.strokeStyle = window.HN.mixHex('#05060c', theme[3], 0.30);
    ctx.fillStyle = window.HN.mixHex('#05060c', theme[3], 0.22);
    ctx.lineWidth = 1;
    if (kind === 0) {              // 三角点
      ctx.beginPath();
      ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4);
      ctx.closePath(); ctx.stroke();
      ctx.fillRect(x - 1, y - 1, 2, 2);
    } else if (kind === 1) {        // 田（区画）
      ctx.strokeRect(x - 6, y - 4, 12, 8);
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.stroke();
    } else if (kind === 2) {        // 神社（鳥居）
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 4); ctx.lineTo(x + 5, y - 4);
      ctx.moveTo(x - 4, y - 1); ctx.lineTo(x + 4, y - 1);
      ctx.moveTo(x - 3, y - 4); ctx.lineTo(x - 3, y + 4);
      ctx.moveTo(x + 3, y - 4); ctx.lineTo(x + 3, y + 4);
      ctx.stroke();
    } else {                        // 等高線の小片
      ctx.beginPath();
      ctx.arc(x, y, 7, 0.4, 2.4); ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 12, 0.6, 2.2); ctx.stroke();
    }
  };
  for (let i = 0; i < 26; i++) {
    sym(Math.floor(rng.next() * W), Math.floor(rng.next() * H), i % 4);
  }
  const lm = new window.HN.RNG(seed * 7717);
  noiseRect(ctx, 0, 0, W, H, window.HN.mixHex('#05060c', theme[2], 0.16), 420, lm);
  return canvas;
}

/* =========================================================================
 * L3: 近景 — 舞う粒（埃・花びら・紙片）
 * ======================================================================= */
function makeNearParticles(style, theme, seed = 3) {
  const W = 480, H = BG_H;
  const { canvas, ctx } = window.HN.makeCanvas(W, H);
  const rng = new window.HN.RNG(seed * 31337);
  const n = style === 'boundary' ? 90 : 70;
  for (let i = 0; i < n; i++) {
    const x = rng.next() * W, y = rng.next() * H;
    const t = rng.next();
    if (t < 0.5) {           // 埃
      ctx.fillStyle = window.HN.mixHex('#05060c', '#e8ecf7', 0.10 + rng.next() * 0.14);
      const s = rng.next() < 0.7 ? 1 : 2;
      ctx.fillRect(x | 0, y | 0, s, s);
    } else if (t < 0.8) {    // 花びら
      ctx.fillStyle = window.HN.mixHex('#05060c', '#cf8199', 0.16 + rng.next() * 0.16);
      ctx.fillRect(x | 0, y | 0, 3, 2);
      ctx.fillRect((x + 1) | 0, (y + 2) | 0, 1, 1);
    } else {                 // 紙片
      ctx.fillStyle = window.HN.mixHex('#05060c', '#e9eefb', 0.16 + rng.next() * 0.18);
      ctx.fillRect(x | 0, y | 0, 3, 4);
      ctx.fillStyle = window.HN.mixHex('#05060c', '#8f9ab8', 0.2);
      ctx.fillRect(x | 0, (y + 3) | 0, 3, 1);
    }
  }
  return canvas;
}

/* =========================================================================
 * 背景本体
 * ======================================================================= */
class Background {
  constructor() {
    this.layers = null;
    this.stageKey = null;
    this.t = 0;
    this.state = 0;          // 0..1 フェーズ進行度（テンション）
    this.stateSmooth = 0;
    this.scroll = [0, 0, 0];
    this.pulse = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.built = false;
  }

  setStage(stage) {
    this.stage = stage;
    const style = stage.bg;
    const theme = stage.theme;
    const seed = stage.id * 131;
    this.sky = makeSky(theme);
    this.far = makeFar(style, theme, seed);
    this.mid = makeMid(style, theme, seed + 1);
    this.near = [makeNearParticles(style, theme, seed + 2),
    makeNearParticles(style, theme, seed + 3)];
    this.theme = theme;
    this.accent = stage.accent;
    this.style = style;
    this.stageKey = stage.key;
    this.built = true;
    this.state = this.stateSmooth = 0;
    this.scroll = [0, 0, 0];
  }

  update(dt, state, speedMul = 1) {
    if (!this.built) return;
    this.t += dt;
    this.state = state;
    this.stateSmooth += (state - this.stateSmooth) * Math.min(1, dt * 1.4);
    // 進行度が上がるほど流れが速くなる（＝「残り時間が少ないほど密度が上がる」）
    const sp = (1 + this.stateSmooth * 1.5) * speedMul;
    this.scroll[0] += 6 * sp * dt;
    this.scroll[1] += 17 * sp * dt;
    this.scroll[2] += 46 * sp * dt;
    if (this.pulse > 0) this.pulse -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.shake > 0) this.shake -= dt * 2.4;
    for (let i = 0; i < 3; i++) {
      const lim = i === 0 ? this.far.width : i === 1 ? 640 : 480;
      if (this.scroll[i] >= lim) this.scroll[i] -= lim;
    }
  }

  flashScreen(color = '#fffbe8', dur = 0.25) { this.flash = dur; this.flashColor = color; }
  pulseOnce() { this.pulse = 0.5; }
  shakeScreen(amount = 0.5) { this.shake = Math.max(this.shake, amount); }

  /** タイル状に横スクロール描画する */
  _tile(ctx, img, off, y) {
    const w = img.width;
    let x = -off;
    while (x < BG_W) {
      ctx.drawImage(img, Math.round(x), y);
      x += w;
    }
  }

  draw(ctx) {
    if (!this.built) return;
    const s = this.stateSmooth;
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 6 : 0;

    ctx.save();
    ctx.translate(sh, sh * 0.5);

    // L0
    ctx.drawImage(this.sky, 0, 0);

    // L1 遠景（暗く沈める）
    ctx.save();
    ctx.globalAlpha = 0.62 + s * 0.24;
    ctx.translate(0, Math.sin(this.t * 0.22) * 3);
    this._tile(ctx, this.far, this.scroll[0], 0);
    ctx.restore();

    // L2 中景
    ctx.save();
    ctx.globalAlpha = 0.34 + s * 0.30;
    this._tile(ctx, this.mid, this.scroll[1], 0);
    ctx.restore();

    // 中央の航路帯（弾幕の視認性を確保するための暗い縦帯）
    const vg = ctx.createLinearGradient(0, 0, BG_W, 0);
    vg.addColorStop(0, 'rgba(5,6,12,0.55)');
    vg.addColorStop(0.5, 'rgba(5,6,12,0.10)');
    vg.addColorStop(1, 'rgba(5,6,12,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, BG_W, BG_H);

    // L3 近景（2 枚重ねて奥行き）
    ctx.save();
    ctx.globalAlpha = 0.38 + s * 0.34;
    this._tile(ctx, this.near[0], this.scroll[2], 0);
    ctx.globalAlpha = 0.22 + s * 0.22;
    this._tile(ctx, this.near[1], this.scroll[2] * 0.55 + 120, 0);
    ctx.restore();

    // フェーズ進行に応じた緊張の表現: 走査線が細かくなる
    if (s > 0.05) {
      ctx.save();
      ctx.globalAlpha = s * 0.16;
      ctx.fillStyle = '#05060c';
      const gap = Math.round(window.HN.lerp(6, 3, s));
      for (let y = 0; y < BG_H; y += gap) ctx.fillRect(0, y, BG_W, 1);
      ctx.restore();
    }

    // ビネット（周辺を落として中央の弾を目立たせる）
    const rad = ctx.createRadialGradient(BG_W / 2, BG_H / 2, BG_H * 0.22, BG_W / 2, BG_H / 2, BG_H * 0.78);
    rad.addColorStop(0, 'rgba(0,0,0,0)');
    rad.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, BG_W, BG_H);

    ctx.restore();

    // 画面フラッシュ（フェーズ移行など）
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, this.flash * 2.4) * 0.55;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(-20, -20, BG_W + 40, BG_H + 40);
      ctx.restore();
    }
  }
}

window.HN = window.HN || {};
Object.assign(window.HN, { Background, BG_W, BG_H });
