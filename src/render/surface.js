/**
 * 低解像度バッファ (512x384) に描画し、それを拡大して表示する。
 * 表示前に軽いポストプロセス (簡易ブルーム / 走査線 / ビネット / 収差) をかける。
 *
 * すべてのゲームロジックは 512x384 の座標系で完結する。
 */
import { VIEW_W, VIEW_H } from '../core/const.js';

export class Surface {
  constructor(displayCanvas) {
    this.display = displayCanvas;
    this.dctx = displayCanvas.getContext('2d', { alpha: false });

    // ゲーム描画バッファ
    this.buf = document.createElement('canvas');
    this.buf.width = VIEW_W;
    this.buf.height = VIEW_H;
    this.ctx = this.buf.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;

    // ポストプロセス用 (縮小ミップ)
    this.mip = [];
    this.mipCtx = [];
    for (let i = 0; i < 3; i++) {
      const w = Math.max(1, VIEW_W >> (i + 1));
      const h = Math.max(1, VIEW_H >> (i + 1));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cc = c.getContext('2d');
      cc.imageSmoothingEnabled = true;
      this.mip.push(c); this.mipCtx.push(cc);
    }

    // 合成用
    this.out = document.createElement('canvas');
    this.out.width = VIEW_W;
    this.out.height = VIEW_H;
    this.octx = this.out.getContext('2d', { alpha: false });
    this.octx.imageSmoothingEnabled = false;

    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    /** ポストプロセスのパラメータ (ゲーム側から書き換える) */
    this.post = {
      bloom: 0.52,
      scanline: 0.14,
      vignette: 0.42,
      aberration: 0.0,
      saturation: 1.0,
      flash: 0,
      flashColor: '#ffffff',
      tint: null,        // {r,g,b,a}
      grain: 0.0,
      wobble: 0.0,
      invert: 0,
    };
    this.enabled = true;

    this._grainTiles = null;
    this.resize();
    addEventListener('resize', () => this.resize(), { passive: true });
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 60));
  }

  /** ウィンドウに合わせて表示キャンバスをリサイズ */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const fit = Math.min(vw / VIEW_W, vh / VIEW_H);
    // 整数倍率が 92% 以上の面積をカバーできるなら整数倍を優先 (にじみ防止)
    const intFit = Math.max(1, Math.floor(fit));
    const useInt = intFit >= 1 && intFit / fit >= 0.90;
    const s = useInt ? intFit : fit;

    const w = Math.max(1, Math.round(VIEW_W * s));
    const h = Math.max(1, Math.round(VIEW_H * s));

    this.display.width = Math.round(w * dpr);
    this.display.height = Math.round(h * dpr);
    this.display.style.width = w + 'px';
    this.display.style.height = h + 'px';

    this.dctx.imageSmoothingEnabled = false;
    this.scale = s * dpr;
    this.cssScale = s;
    return { s, useInt };
  }

  /** ゲーム描画前に呼ぶ。バッファをクリアして基準状態にする。 */
  begin(bg = '#050409') {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
    c.fillStyle = bg;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /**
   * バッファを表示キャンバスへ転送 (ポストプロセス込み)。
   * @param {{shakeX:number, shakeY:number}} opts
   */
  present(opts = {}) {
    const p = this.post;
    // 演出パラメータが非有限になっても壊れないように正規化する
    for (const k of ['bloom', 'scanline', 'vignette', 'aberration', 'flash', 'grain', 'wobble', 'invert']) {
      if (!Number.isFinite(p[k])) p[k] = 0;
    }
    if (!Number.isFinite(p.saturation)) p.saturation = 1;
    if (!Number.isFinite(opts.shakeX)) opts.shakeX = 0;
    if (!Number.isFinite(opts.shakeY)) opts.shakeY = 0;
    const oc = this.octx;
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.globalCompositeOperation = 'source-over';
    oc.globalAlpha = 1;
    oc.imageSmoothingEnabled = false;
    oc.clearRect(0, 0, VIEW_W, VIEW_H);

    // 色調補正が必要なときだけ中間バッファに描く
    let src = this.buf;
    const needGrade = p.saturation !== 1 || p.tint || p.invert > 0;
    if (needGrade) {
      oc.filter = `saturate(${p.saturation}) invert(${p.invert})`;
      oc.drawImage(this.buf, 0, 0);
      oc.filter = 'none';
      if (p.tint) {
        oc.globalCompositeOperation = 'source-atop';
        oc.globalAlpha = p.tint.a;
        oc.fillStyle = p.tint.c;
        oc.fillRect(0, 0, VIEW_W, VIEW_H);
        oc.globalAlpha = 1;
        oc.globalCompositeOperation = 'source-over';
      }
      src = this.out;
    } else {
      oc.drawImage(this.buf, 0, 0);
    }

    // ---- ブルーム: 縮小ミップを加算合成 ----
    if (p.bloom > 0.01) {
      let prev = src;
      for (let i = 0; i < this.mip.length; i++) {
        const mc = this.mipCtx[i];
        mc.setTransform(1, 0, 0, 1, 0, 0);
        mc.globalCompositeOperation = 'source-over';
        mc.globalAlpha = 1;
        mc.clearRect(0, 0, this.mip[i].width, this.mip[i].height);
        mc.drawImage(prev, 0, 0, this.mip[i].width, this.mip[i].height);
        prev = this.mip[i];
      }
      oc.globalCompositeOperation = 'lighter';
      for (let i = this.mip.length - 1; i >= 0; i--) {
        oc.globalAlpha = p.bloom * (i === 0 ? 0.30 : i === 1 ? 0.34 : 0.36);
        oc.drawImage(this.mip[i], 0, 0, VIEW_W, VIEW_H);
      }
      oc.globalAlpha = 1;
      oc.globalCompositeOperation = 'source-over';
    }

    // ---- 表示キャンバスへ ----
    const d = this.dctx;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalAlpha = 1;
    d.globalCompositeOperation = 'source-over';
    d.imageSmoothingEnabled = false;
    d.fillStyle = '#050409';
    d.fillRect(0, 0, this.display.width, this.display.height);

    const s = this.scale;
    const sx = (opts.shakeX ?? 0) * s;
    const sy = (opts.shakeY ?? 0) * s;

    d.drawImage(src, sx, sy, VIEW_W * s, VIEW_H * s);

    // 色収差 (被弾・狂信フェーズ用)
    if (p.aberration > 0.01) {
      const off = p.aberration * s * 2.2;
      d.globalCompositeOperation = 'lighter';
      d.globalAlpha = 0.30;
      d.drawImage(src, sx - off, sy, VIEW_W * s, VIEW_H * s);
      d.globalAlpha = 0.24;
      d.drawImage(src, sx + off, sy, VIEW_W * s, VIEW_H * s);
      d.globalAlpha = 1;
      d.globalCompositeOperation = 'source-over';
    }

    // ---- 走査線 ----
    if (p.scanline > 0.005) {
      const lh = Math.max(2, Math.round(s));
      if (!this._scan || this._scanH !== lh) {
        this._scan = this._makeScanline(lh);
        this._scanH = lh;
      }
      d.globalAlpha = p.scanline;
      d.fillStyle = this._scan;
      d.fillRect(0, 0, this.display.width, this.display.height);
      d.globalAlpha = 1;
    }

    // ---- ビネット ----
    if (p.vignette > 0.005) {
      if (!this._vig || this._vigW !== this.display.width) {
        const g = d.createRadialGradient(
          this.display.width / 2, this.display.height / 2,
          Math.min(this.display.width, this.display.height) * 0.28,
          this.display.width / 2, this.display.height / 2,
          Math.max(this.display.width, this.display.height) * 0.72
        );
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.65, 'rgba(0,0,0,0.30)');
        g.addColorStop(1, 'rgba(0,0,0,0.86)');
        this._vig = g;
        this._vigW = this.display.width;
      }
      d.globalAlpha = p.vignette;
      d.fillStyle = this._vig;
      d.fillRect(0, 0, this.display.width, this.display.height);
      d.globalAlpha = 1;
    }

    // ---- フラッシュ ----
    if (p.flash > 0.004) {
      d.globalCompositeOperation = 'lighter';
      d.globalAlpha = Math.min(1, p.flash);
      d.fillStyle = p.flashColor;
      d.fillRect(0, 0, this.display.width, this.display.height);
      d.globalAlpha = 1;
      d.globalCompositeOperation = 'source-over';
    }

    // ---- グレイン (紙/フィルムの質感) ----
    if (p.grain > 0.004) {
      if (!this._grainTiles) this._grainTiles = this._makeGrain();
      const g = this._grainTiles[(Math.random() * this._grainTiles.length) | 0];
      d.globalCompositeOperation = 'overlay';
      d.globalAlpha = p.grain;
      const pat = d.createPattern(g, 'repeat');
      d.fillStyle = pat;
      d.fillRect(0, 0, this.display.width, this.display.height);
      d.globalAlpha = 1;
      d.globalCompositeOperation = 'source-over';
    }
  }

  _makeScanline(h) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(0, 0, 4, Math.max(1, Math.round(h / 4)));
    return c;
  }

  _makeGrain() {
    const tiles = [];
    for (let t = 0; t < 4; t++) {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const x = c.getContext('2d');
      const img = x.createImageData(64, 64);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 110 + Math.random() * 36;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      tiles.push(c);
    }
    return tiles;
  }

  /** フルスクリーン切り替え */
  toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  }
}
