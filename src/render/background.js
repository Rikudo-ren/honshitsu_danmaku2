/**
 * background.js — 多層スクロール背景
 *
 * 原作の舞台「桐葉高校・北棟 理数科B組の教室」をドット絵で描く。
 * すべて手続き的に生成するので追加アセットは不要で、色調を完全に管理できる。
 *
 * 構成 (奥→手前):
 *   0 天井/空      … ステージごとの色調。フェーズで変化。
 *   1 黒板/窓      … 教室の主背景。ステージ 1〜2
 *   2 掲示板/配管   … 中景。視差スクロール
 *   3 机・椅子      … 近景。強く視差スクロール
 *   4 手前の暗がり   … 弾の視認性を上げるための暗い縁
 *
 * 視認性の設計:
 *   弾が飛ぶ中央領域は「低彩度・低輝度・低コントラスト」に保ち、
 *   弾（彩度が高い）とのコントラストを常に確保する。
 *   明るい部分（蛍光灯・窓の光）は画面の端と上にのみ置く。
 */

import { VIEW_W, VIEW_H } from '../core/const.js';
import { TAU, clamp, lerp } from '../core/util.js';

/** ステージごとの背景テーマ */
export const BACKDROPS = {
  stage1: {
    name: '北棟 理数科B組',
    sky: ['#141026', '#1d1836'],
    wallTop: '#3a3355', wallBottom: '#241f3d',
    floor: '#1a1628', floorLine: '#2a2440',
    accent: '#7c6bd6',
    boardBg: '#15201b', boardEdge: '#5a4a32', boardLine: 'rgba(200,235,215,0.14)',
    light: '#ffe9b0',
    props: 'classroom',
    fog: '#0d0a18',
  },
  stage2: {
    name: '星と地面とせいちちゃんねる',
    sky: ['#060a1c', '#101a3a'],
    wallTop: '#1b2a4a', wallBottom: '#0b1226',
    floor: '#0a0f22', floorLine: '#182a4a',
    accent: '#5f8fd6',
    boardBg: '#0a1024', boardEdge: '#2c3f6a', boardLine: 'rgba(150,200,255,0.16)',
    light: '#cfe6ff',
    props: 'stars',
    fog: '#050a18',
  },
  stage3: {
    name: '本質配信',
    sky: ['#160610', '#2a0a1c'],
    wallTop: '#3d1226', wallBottom: '#220a16',
    floor: '#170711', floorLine: '#331226',
    accent: '#ff5c8a',
    boardBg: '#1c0812', boardEdge: '#6a2038', boardLine: 'rgba(255,160,190,0.18)',
    light: '#ffb0c8',
    props: 'broadcast',
    fog: '#12040a',
  },
  stage4: {
    name: '観測されない教室',
    sky: ['#04060e', '#0a1020'],
    wallTop: '#111a2c', wallBottom: '#070b16',
    floor: '#050810', floorLine: '#101a2e',
    accent: '#7fe3ff',
    boardBg: '#03050c', boardEdge: '#1c3a52', boardLine: 'rgba(140,230,255,0.18)',
    light: '#e8fbff',
    props: 'void',
    fog: '#01030a',
  },
};

export class Background {
  constructor() {
    this.theme = BACKDROPS.stage1;
    this.nextTheme = null;
    this.blend = 1;              // テーマ間のブレンド 0..1
    this.t = 0;
    this.scrollX = 0;
    this.scrollY = 0;
    this.speedX = 6;
    this.speedY = 2.4;
    this.pulse = 0;              // フェーズ切替の脈動
    this.glitch = 0;             // 崩壊演出
    this.layerCache = new Map();
    this.starField = null;
    this.parallax = 1;
    /** 3D フェーズで使う「奥へ流れる格子」 */
    this.gridZ = 0;
    this.gridSpeed = 0;
  }

  setTheme(key, { instant = false } = {}) {
    const t = BACKDROPS[key] || BACKDROPS.stage1;
    if (instant) { this.theme = t; this.nextTheme = null; this.blend = 1; return; }
    if (this.theme === t) return;
    this.nextTheme = t;
    this.blend = 0;
  }

  update(dt, { camera = null, intensity = 0 } = {}) {
    this.t += dt;
    this.scrollX += this.speedX * dt * (1 + intensity * 0.6);
    this.scrollY += this.speedY * dt;
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
    this.glitch = Math.max(0, this.glitch - dt * 1.2);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * 0.55);
      if (this.blend >= 1 && this.nextTheme) {
        this.theme = this.nextTheme;
        this.nextTheme = null;
      }
    }
    // 3D 時は格子が奥から手前へ流れる
    const tgt = camera && camera.t > 0.02 ? 1 : 0;
    this.gridSpeed = lerp(this.gridSpeed, tgt, 1 - Math.pow(0.94, dt * 60));
    this.gridZ = (this.gridZ + dt * 120 * this.gridSpeed) % 160;
  }

  /** テーマ色をブレンドして取得 */
  _col(key, idx = 0) {
    const a = this.theme[key];
    const b = this.nextTheme ? this.nextTheme[key] : a;
    const av = Array.isArray(a) ? a[idx] : a;
    const bv = Array.isArray(b) ? b[idx] : b;
    return mixColor(av, bv, this.blend);
  }

  /* ================================================================ *
   * 描画
   * ================================================================ */
  draw(ctx, camera) {
    const three = camera && camera.active;
    if (three) {
      this._draw3D(ctx, camera);
      return;
    }
    const th = this.theme;
    const sky = this._col('sky', 0);
    const sky2 = this._col('sky', 1);

    // --- 層0: 天井〜壁のグラデーション ---
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, sky);
    g.addColorStop(0.45, this._col('wallTop'));
    g.addColorStop(0.78, this._col('wallBottom'));
    g.addColorStop(1, this._col('floor'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // --- 層1: 窓 / 光 ---
    this._drawWindows(ctx);

    // --- 層2: 壁のパネル目地 (中景・視差) ---
    this._drawPanels(ctx);

    // --- 層3: ステージ固有の小物 ---
    const props = this.nextTheme && this.blend < 0.5 ? this.nextTheme.props : th.props;
    if (props === 'stars') this._drawStars(ctx);
    else if (props === 'broadcast') this._drawBroadcast(ctx);
    else if (props === 'void') this._drawVoid(ctx);
    else this._drawClassroom(ctx);

    // --- 層4: 床と机 ---
    this._drawFloorAndDesks(ctx);

    // --- フォグ (奥行き感 / 弾とのコントラスト確保) ---
    const fog = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    fog.addColorStop(0, hexA(this._col('fog'), 0.30));
    fog.addColorStop(0.5, hexA(this._col('fog'), 0.10));
    fog.addColorStop(1, hexA(this._col('fog'), 0.42));
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.glitch > 0.01) this._drawGlitch(ctx);
    if (this.pulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.pulse * 0.30;
      ctx.fillStyle = this._col('accent');
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------------- 窓 ---------------- */
  _drawWindows(ctx) {
    const accent = this._col('accent');
    const light = this._col('light');
    const oy = -(this.scrollY * 0.35) % 64;
    for (let i = 0; i < 5; i++) {
      const x = 26 + i * 104;
      if (x > VIEW_W) break;
      // 窓枠
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(x - 3, oy + 30, 74, 96);
      const wg = ctx.createLinearGradient(x, oy + 30, x, oy + 126);
      wg.addColorStop(0, hexA(light, 0.20));
      wg.addColorStop(0.55, hexA(accent, 0.10));
      wg.addColorStop(1, hexA(light, 0.03));
      ctx.fillStyle = wg;
      ctx.fillRect(x, oy + 33, 68, 90);
      // 桟
      ctx.fillStyle = 'rgba(10,8,20,0.75)';
      ctx.fillRect(x + 32, oy + 33, 3, 90);
      ctx.fillRect(x, oy + 74, 68, 3);
      // 蛍光灯のにじみ
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = light;
      ctx.fillRect(x - 6, oy + 26, 80, 10);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------------- パネル目地 ---------------- */
  _drawPanels(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    const off = (this.scrollX * 0.20) % 64;
    for (let x = -off; x < VIEW_W + 64; x += 64) {
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, VIEW_H); ctx.stroke();
    }
    const offY = (this.scrollY * 0.20) % 48;
    for (let y = -offY; y < VIEW_H + 48; y += 48) {
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(VIEW_W, Math.round(y) + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 黒板 + 掲示板 + 自販機 (ステージ1) ---------------- */
  _drawClassroom(ctx) {
    const px = -((this.scrollX * 0.42) % (VIEW_W + 300));
    const bx = 40 + px * 0.0;
    // 黒板
    const boardY = 62;
    ctx.fillStyle = this._col('boardEdge');
    ctx.fillRect(bx - 4, boardY - 4, 344, 112);
    ctx.fillStyle = this._col('boardBg');
    ctx.fillRect(bx, boardY, 336, 104);
    // チョークの走り書き (原作の「✝本質✝」)
    ctx.strokeStyle = this._col('boardLine');
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = boardY + 14 + i * 13;
      const w = 60 + ((i * 47) % 190);
      ctx.beginPath(); ctx.moveTo(bx + 14, y + 0.5); ctx.lineTo(bx + 14 + w, y + 0.5); ctx.stroke();
    }
    // ✝ のマーク
    ctx.strokeStyle = hexA(this._col('light'), 0.42);
    ctx.lineWidth = 2;
    const cx = bx + 274, cy = boardY + 40;
    ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 9, cy - 3); ctx.lineTo(cx + 9, cy - 3); ctx.stroke();

    // 掲示板
    const nx = 400 - ((this.scrollX * 0.30) % (VIEW_W + 260));
    ctx.fillStyle = 'rgba(20,16,34,0.92)';
    ctx.fillRect(nx, 74, 118, 84);
    ctx.fillStyle = 'rgba(240,236,255,0.86)';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(nx + 8 + (i % 2) * 54, 82 + Math.floor(i / 2) * 26, 44, 20);
    }
    ctx.fillStyle = 'rgba(120,110,160,0.55)';
    for (let i = 0; i < 5; i++) {
      for (let l = 0; l < 3; l++) {
        ctx.fillRect(nx + 11 + (i % 2) * 54, 86 + Math.floor(i / 2) * 26 + l * 5, 30 - l * 6, 1);
      }
    }

    // 自販機 (「コーンスープの不在」)
    const vx = VIEW_W - 92 - ((this.scrollX * 0.5) % (VIEW_W + 400));
    ctx.fillStyle = '#1c1a2e';
    ctx.fillRect(vx, 96, 66, 128);
    ctx.fillStyle = '#2a2740';
    ctx.fillRect(vx + 3, 99, 60, 60);
    // 売り切れランプ列
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const on = !(r === 0 && c === 2);   // 1つだけ点灯していない = 在庫なし
        ctx.fillStyle = on ? 'rgba(255,120,120,0.5)' : 'rgba(60,58,80,0.9)';
        ctx.fillRect(vx + 7 + c * 11, 104 + r * 14, 7, 9);
      }
    }
    ctx.fillStyle = '#12101f';
    ctx.fillRect(vx + 3, 164, 60, 52);
    ctx.fillStyle = hexA(this._col('light'), 0.16);
    ctx.fillRect(vx + 8, 162, 50, 3);
  }

  /* ---------------- 星空 (ステージ2) ---------------- */
  _drawStars(ctx) {
    if (!this.starField) {
      this.starField = [];
      // 決定的な擬似乱数で星を配置
      let s = 12345;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      for (let i = 0; i < 190; i++) {
        this.starField.push({
          x: rnd() * VIEW_W,
          y: rnd() * VIEW_H * 0.85,
          z: 0.2 + rnd() * 0.8,
          tw: rnd() * TAU,
          c: rnd(),
        });
      }
    }
    ctx.save();
    for (const st of this.starField) {
      const depth = st.z;
      const x = (st.x - this.scrollX * depth * 0.14) % VIEW_W;
      const xx = x < 0 ? x + VIEW_W : x;
      const tw = 0.55 + 0.45 * Math.sin(this.t * (0.6 + depth * 1.2) + st.tw);
      const size = depth > 0.75 ? 2 : 1;
      ctx.globalAlpha = tw * (0.25 + depth * 0.6);
      ctx.fillStyle = st.c > 0.72 ? '#ffd9a8' : st.c > 0.42 ? '#cfe0ff' : '#ffffff';
      ctx.fillRect(xx | 0, st.y | 0, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // 天の川
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 3; i++) {
      const y = 120 + i * 34 + Math.sin(this.t * 0.12 + i) * 8;
      const gg = ctx.createLinearGradient(0, y - 26, 0, y + 26);
      gg.addColorStop(0, 'rgba(0,0,0,0)');
      gg.addColorStop(0.5, i === 1 ? '#6f8cff' : '#405090');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, y - 26, VIEW_W, 52);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------------- 配信画面 (ステージ3) ---------------- */
  _drawBroadcast(ctx) {
    const accent = this._col('accent');
    ctx.save();
    // モニタの枠
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 120 - ((this.scrollX * 0.5) % 480);
      ctx.fillStyle = 'rgba(8,4,12,0.85)';
      ctx.fillRect(x, 68, 96, 74);
      ctx.fillStyle = hexA(accent, 0.14);
      ctx.fillRect(x + 4, 72, 88, 66);
      // 走査線
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let l = 0; l < 66; l += 3) ctx.fillRect(x + 4, 72 + l, 88, 1);
      // 波形
      ctx.strokeStyle = hexA(accent, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let px = 0; px < 88; px++) {
        const v = Math.sin((px + this.t * 60) * 0.16 + i * 1.7) * 12
          * Math.sin((px + this.t * 20) * 0.05);
        const py = 105 + v;
        px === 0 ? ctx.moveTo(x + 4, py) : ctx.lineTo(x + 4 + px, py);
      }
      ctx.stroke();
      // LIVE の赤丸
      ctx.fillStyle = 'rgba(255,60,90,0.9)';
      ctx.fillRect(x + 8, 76, 6, 6);
    }
    // 天井の配管
    ctx.fillStyle = 'rgba(30,10,22,0.7)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(0, 16 + i * 9, VIEW_W, 3);
    }
    ctx.restore();
  }

  /* ---------------- 崩壊した空間 (ステージ4) ---------------- */
  _drawVoid(ctx) {
    ctx.save();
    // 浮遊する「観測」の象徴 (輪郭だけの四角)
    ctx.strokeStyle = hexA(this._col('accent'), 0.14);
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const seed = i * 97;
      const x = ((seed * 37) % VIEW_W) - ((this.scrollX * (0.1 + (i % 3) * 0.08)) % (VIEW_W + 160));
      const y = (seed * 53) % VIEW_H;
      const s = 18 + (i % 5) * 16;
      const xx = x < -160 ? x + VIEW_W + 160 : x;
      ctx.globalAlpha = 0.06 + (i % 4) * 0.03;
      ctx.strokeRect(xx | 0, y | 0, s, s * 0.7);
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(xx, y); ctx.lineTo(xx + s, y + s * 0.7);
        ctx.moveTo(xx + s, y); ctx.lineTo(xx, y + s * 0.7);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // 地震計のような走査線
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16;
    const y0 = 150 + Math.sin(this.t * 0.4) * 40;
    const gg = ctx.createLinearGradient(0, y0 - 3, 0, y0 + 3);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(0.5, this._col('accent'));
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, y0 - 3, VIEW_W, 6);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------------- 床と机 ---------------- */
  _drawFloorAndDesks(ctx) {
    const floorY = 286;
    ctx.fillStyle = this._col('floor');
    ctx.fillRect(0, floorY, VIEW_W, VIEW_H - floorY);
    // 床のタイル
    ctx.strokeStyle = hexA(this._col('floorLine'), 0.55);
    ctx.lineWidth = 1;
    const off = (this.scrollX * 0.9) % 40;
    for (let x = -off; x < VIEW_W + 40; x += 40) {
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, floorY); ctx.lineTo(Math.round(x) + 0.5, VIEW_H); ctx.stroke();
    }
    for (let y = floorY; y < VIEW_H; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(VIEW_W, Math.round(y) + 0.5); ctx.stroke();
    }

    // 机 (近景・視差)
    const desks = [[70, 0.95], [230, 1.0], [378, 0.92], [486, 1.05]];
    for (const [dx0, par] of desks) {
      const x = (dx0 - this.scrollX * par * 1.2) % (VIEW_W + 220);
      const xx = x < -180 ? x + VIEW_W + 220 : x;
      const y = floorY + 40;
      ctx.fillStyle = 'rgba(8,6,16,0.55)';
      ctx.fillRect(xx, y + 26, 96, 6);
      ctx.fillStyle = 'rgba(46,40,68,0.9)';
      ctx.fillRect(xx, y, 92, 9);          // 天板
      ctx.fillStyle = 'rgba(30,26,48,0.9)';
      ctx.fillRect(xx + 6, y + 9, 5, 26);
      ctx.fillRect(xx + 81, y + 9, 5, 26);
      // 椅子
      ctx.fillStyle = 'rgba(24,20,40,0.8)';
      ctx.fillRect(xx + 30, y + 14, 30, 16);
      ctx.fillRect(xx + 42, y + 30, 6, 10);
    }

    // 手前の暗がり (弾の視認性のため画面下端を強制的に落とす)
    const g = ctx.createLinearGradient(0, VIEW_H - 44, 0, VIEW_H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(2,1,6,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, VIEW_H - 44, VIEW_W, 44);
  }

  /* ---------------- 崩壊ノイズ ---------------- */
  _drawGlitch(ctx) {
    const n = Math.floor(this.glitch * 14);
    for (let i = 0; i < n; i++) {
      const y = (Math.random() * VIEW_H) | 0;
      const h = 1 + ((Math.random() * 5) | 0);
      const x = ((Math.random() - 0.5) * 60 * this.glitch) | 0;
      try {
        const slice = ctx.getImageData(0, y, VIEW_W, h);
        ctx.putImageData(slice, x, y);
      } catch { break; }
    }
  }

  /* ================================================================ *
   * 擬似3D背景
   * 奥へ延びるトンネル/格子。地平線は画面外 (HORIZON=-6) なので、
   * 空は「上端にわずかに見える色」として扱う。
   * ================================================================ */
  _draw3D(ctx, cam) {
    const fog = hexA(this._col('fog'), 0.86);
    const accent = this._col('accent');
    const light = this._col('light');

    // ベース: 奥はフォグ色、手前は暗く
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, hexA(this._col('sky', 1), 0.9));
    g.addColorStop(0.35, hexA(this._col('wallTop'), 0.75));
    g.addColorStop(1, hexA(this._col('floor'), 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // --- 奥へ流れる格子 (床) ---
    const spanX = 1200;
    const zLine = 160;
    ctx.save();
    ctx.strokeStyle = hexA(accent, 0.30);
    ctx.lineWidth = 1;

    // 進行方向のライン (奥へ収束)
    for (let x = -spanX / 2; x <= spanX / 2; x += 100) {
      const a = cam.projectFree(x, 384, -120);
      const b = cam.projectFree(x, -400, -120);
      if (!a || !b) continue;
      ctx.globalAlpha = 0.34;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
    // 横方向のライン (手前へ流れてくる)
    for (let i = 0; i < 14; i++) {
      const z = -400 + ((i * zLine + this.gridZ) % 1400);
      const a = cam.projectFree(-spanX / 2, z, -120);
      const b = cam.projectFree(spanX / 2, z, -120);
      if (!a || !b) continue;
      const near = clamp(1 - (z + 400) / 1400, 0, 1);
      ctx.globalAlpha = 0.10 + near * 0.34;
      ctx.strokeStyle = hexA(near > 0.6 ? light : accent, 0.5);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
    ctx.restore();

    // --- 両側の壁 (教室のロッカー/窓を奥へ並べる) ---
    ctx.save();
    for (let i = 0; i < 22; i++) {
      const z = -380 + ((i * 90 + this.gridZ * 1.4) % 1900);
      const dz = 90;
      const near = clamp(1 - (z + 380) / 1900, 0, 1);
      for (const side of [-1, 1]) {
        const wx = side * 470;
        const a = cam.projectFree(wx, z, -120);
        const b = cam.projectFree(wx, z, 250);
        const c = cam.projectFree(wx, z + dz, 250);
        const d = cam.projectFree(wx, z + dz, -120);
        if (!a || !b || !c || !d) continue;
        const alpha = 0.05 + near * 0.22;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = side < 0 ? '#0d1024' : '#0b0e1e';
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
        ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
        ctx.closePath(); ctx.fill();
        // 窓明かり
        ctx.globalAlpha = alpha * (0.7 + 0.3 * Math.sin(this.t * 1.6 + i));
        ctx.fillStyle = light;
        ctx.fillRect(b.sx - 8, (b.sy + b.sy) / 2 - 40, 16, 40);
      }
    }
    ctx.restore();

    // --- 手前の暗がり ---
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.72, 40, VIEW_W / 2, VIEW_H * 0.72, VIEW_W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.6, hexA(fog, 0.25));
    vg.addColorStop(1, hexA(fog, 0.92));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

/* ------------------------------------------------------------------ */
function hexToRgb(h) {
  if (h.startsWith('rgba') || h.startsWith('rgb')) return null;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function hexA(h, a) {
  const c = hexToRgb(h);
  if (!c) return h;
  return `rgba(${c[0]},${c[1]},${c[2]},${clamp(a, 0, 1)})`;
}
function mixColor(a, b, t) {
  if (a === b || t >= 1) return b;
  const ca = hexToRgb(a), cb = hexToRgb(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return `rgb(${r},${g},${bl})`;
}
