/* =============================================================================
 * src/art/sprites.js — スプライト・アトラス生成と弾の高速描画
 *
 *  弾は毎フレーム数百〜数千個描かれるため、canvas のパス描画を直接呼ぶのは遅い。
 *  起動時に各弾種を 2 枚（コア／グロー）のオフスクリーン canvas へ焼き、
 *  実行時は drawImage 1 回で描く。回転はスプライトを 32 方向ぶん事前生成して
 *  使い回すことで、回転コストもほぼゼロにする。
 * ========================================================================== */
'use strict';

const ROT_STEPS = 32;          // 回転スプライトの分割数（11.25° 刻み）
const ROT_TAU = Math.PI * 2;

class SpriteAtlas {
  constructor(defs) {
    this.defs = defs || {};
    this.core = {};     // name -> [rotationIndex] : {canvas, ox, oy, w, h}
    this.glow = {};     // name -> canvas (回転不要: 放射状のため)
    this.flat = {};     // name -> {canvas, ox, oy, w, h}  回転しない弾
    this.build();
  }

  build() {
    for (const [name, def] of Object.entries(this.defs)) {
      const pad = 4;
      const w = def.w + pad * 2, h = def.h + pad * 2;
      if (def.rotation) {
        const frames = [];
        for (let i = 0; i < ROT_STEPS; i++) {
          const { canvas, ctx } = window.HN.makeCanvas(w, h);
          ctx.translate(w / 2, h / 2);
          ctx.rotate(-Math.PI / 2 + (i / ROT_STEPS) * ROT_TAU); // 0番は上向き
          this._drawCore(ctx, def, name);
          frames.push(canvas);
        }
        this.core[name] = frames;
      } else {
        const { canvas, ctx } = window.HN.makeCanvas(w, h);
        ctx.translate(w / 2, h / 2);
        this._drawCore(ctx, def, name);
        this.flat[name] = { canvas, w, h };
      }
      // グロー（加算合成用。回転不要）
      if (def.glow || def.add) {
        const g = window.HN.makeCanvas(w, h);
        g.ctx.translate(w / 2, h / 2);
        if (def.glow) def.glow(g.ctx, def);
        this.glow[name] = g.canvas;
      }
      if (!def.radius) def.radius = Math.max(def.w, def.h) * 0.24;
    }
  }

  _drawCore(ctx, def, name) {
    ctx.save();
    try { def.draw(ctx); } catch (e) { console.error('bullet draw error:', name, e); }
    ctx.restore();
  }

  /** グロー色（加算時に乗算する色） */
  get(name) { return this.defs[name]; }
}

/** 個別弾の描画: すでに translate/rotate 済みの文脈へ、中心基準で描く */
function drawBulletSprite(ctx, atlas, type, angIdx, alpha, scale) {
  const def = atlas.defs[type];
  if (!def) return;
  const frames = atlas.core[type];
  const img = frames ? frames[angIdx] : (atlas.flat[type] && atlas.flat[type].canvas);
  if (!img) return;
  const pad = 4;
  const dw = (def.w + pad * 2), dh = (def.h + pad * 2);
  const sw = scale || 1;
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
  if (sw === 1) {
    ctx.drawImage(img, -dw / 2, -dh / 2);
  } else {
    ctx.drawImage(img, -dw * sw / 2, -dh * sw / 2, dw * sw, dh * sw);
  }
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = 1;
}

/** グローを加算合成で描く（add 色を乗せる） */
function drawBulletGlow(ctx, atlas, type, alpha, scale) {
  const img = atlas.glow[type];
  if (!img) return;
  const def = atlas.defs[type];
  const dw = def.w + 8, dh = def.h + 8;
  const sw = scale || 1;
  ctx.globalAlpha = alpha;
  if (sw === 1) ctx.drawImage(img, -dw / 2, -dh / 2);
  else ctx.drawImage(img, -dw * sw / 2, -dh * sw / 2, dw * sw, dh * sw);
  ctx.globalAlpha = 1;
}

/** 角度 → 回転フレーム番号 */
function angToFrame(ang) {
  // 0番が「上向き(-PI/2)」なので、角度を -PI/2 基準にオフセットして量子化
  const a = window.HN.mod(ang + Math.PI / 2, ROT_TAU);
  return Math.round(a / ROT_TAU * ROT_STEPS) % ROT_STEPS;
}

window.HN = window.HN || {};
Object.assign(window.HN, { SpriteAtlas, drawBulletSprite, drawBulletGlow, angToFrame, ROT_STEPS });
