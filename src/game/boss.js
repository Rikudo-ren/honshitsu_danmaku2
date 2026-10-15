// boss.js — boss actor: sprite-sheet faces, animation states, phase machine,
// movement, damage/defeat artwork and colour cast per phase.
//
// The boss body is assembled from the pixel-adapted bust portraits (px/boss,
// 176px tall, drawn 1:1).  Expressions are packed into ONE horizontal sprite
// sheet per boss, so a face swap is nothing but a source-rect change: no
// allocation and no hitch on a phase change.
//
// States: intro / idle / float / windup / attack / hurt / transition / defeat
//         / dissolve / gone

import { rng } from '../core/rng.js';
import { clamp, lerp, smoothstep, TAU } from '../core/util.js';
import { PORTRAITS as manifest } from './portraits.js';

/**
 * portrait key -> URL of its px/boss variant.  Built from the manifest that
 * tools/make_portraits.py emits so the two can never drift apart.
 */
export const FACE_FILES = Object.fromEntries(
  Object.entries(manifest).map(([k, v]) => [k, v.boss.file]),
);

export const STATE = {
  INTRO: 'intro',
  IDLE: 'idle',
  FLOAT: 'float',
  WINDUP: 'windup',
  ATTACK: 'attack',
  HURT: 'hurt',
  TRANSITION: 'transition',
  DEFEAT: 'defeat',
  DISSOLVE: 'dissolve',
  GONE: 'gone',
};

// semantic row indices inside a boss sheet (see portrait_faces.js)
export const FACE = { NORMAL: 0, SMIRK: 1, FOCUS: 2, CRY: 3 };

// ---------------------------------------------------------------------------
// sheet building
// ---------------------------------------------------------------------------

/**
 * Pack the faces of one boss into a single horizontal sheet.
 * Each frame is centred inside its own cell so a centre pivot keeps the
 * silhouette stable across a face swap; if a frame is shorter than the box it
 * is bottom-aligned so the chin stays put.
 */
function makeSheet(sources) {
  const cw = Math.max(1, ...sources.map(s => s.naturalWidth));
  const ch = Math.max(1, ...sources.map(s => s.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = cw * sources.length;
  cv.height = ch;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  sources.forEach((s, i) => {
    const dx = i * cw + ((cw - s.naturalWidth) >> 1);
    const dy = Math.max(0, ch - s.naturalHeight);
    g.drawImage(s, dx, dy);
  });
  return { canvas: cv, cw, ch };
}

export function buildBossSheet(sheetDef) {
  const files = sheetDef.faces.map(k => FACE_FILES[k]);
  if (files.some(f => !f)) {
    throw new Error('boss: unknown face key in ' + JSON.stringify(sheetDef.faces));
  }
  const out = { id: sheetDef.id, rows: [], cw: 0, ch: 0, files };
  const done = { n: 0 };
  out.ready = new Promise((res, rej) => {
    files.forEach((f, i) => {
      const img = new Image();
      img.onload = () => {
        out.rows[i] = img;
        if (++done.n === files.length) {
          const sheet = makeSheet(out.rows);
          out.canvas = sheet.canvas;
          out.cw = sheet.cw;
          out.ch = sheet.ch;
          res(out);
        }
      };
      img.onerror = () => rej(new Error('boss face load failed: ' + f));
      img.src = f;
    });
  });
  return out;
}

const SHEET_CACHE = new Map();
export function getSheet(sheetDef) {
  if (!SHEET_CACHE.has(sheetDef.id)) SHEET_CACHE.set(sheetDef.id, buildBossSheet(sheetDef));
  return SHEET_CACHE.get(sheetDef.id);
}

// ---------------------------------------------------------------------------
// tinted sprite blit
// ---------------------------------------------------------------------------

/**
 * Blit one sheet cell, optionally colour-cast (CSS filter for phases that go
 * monochrome / over-saturated) and tinted.  The tint is a `source-atop` fill
 * clipped to the sprite box, so the black ink outline stays black and the
 * silhouette never dissolves into the background.
 *
 * NOTE: `source-atop` + `clip` is only safe because the clip confines the fill
 * to the sprite's own box; two sprites drawn in the same box (cross-fade) are
 * tinted by the same amount, so nothing double-darkens.
 */
export function drawSprite(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, o = {}) {
  const { alpha = 1, tint = null, tintA = 0.32, cast = null, highlight = 0 } = o;
  if (alpha <= 0.004) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (cast) ctx.filter = cast;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();

  if (tint && tintA > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    ctx.globalAlpha = clamp(alpha * tintA, 0, 1);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.fillRect(dx, dy, dw, dh);
    ctx.restore();
  }
  if (highlight > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    ctx.globalAlpha = clamp(alpha * highlight, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Boss
// ---------------------------------------------------------------------------

export class Boss {
  /**
   * @param {object} def  boss definition from stages.js
   * @param {object} ctxg { s:Surface, fx:FX, audio, bullets, spawn }
   */
  constructor(def, ctxg) {
    this.def = def;
    this.c = ctxg;
    this.sheet = getSheet(def.sheet);
    this.name = def.name;
    this.title = def.title || '';

    this.x = def.home?.x ?? 256;
    this.y = def.home?.y ?? 128;
    this.baseY = this.y;

    this.baseH = def.height ?? 148;   // drawn height in pixels (176px sheet)
    this.scale = 0;
    this.targetScale = 1;
    this.w = 140;
    this.h = this.baseH;

    this.state = STATE.INTRO;
    this.stateT = 0;
    this.face = FACE.NORMAL;
    this.faceShown = FACE.NORMAL;
    this.faceFade = 1;

    this.phase = -1;
    this.form = 0;
    this.tint = null;
    this.cast = null;
    this.hp = 1;
    this.maxHp = 1;
    this.hurtFlash = 0;
    this.hitShakeAmp = 0;
    this._driftDir = 1;
    this._hurtJitter = 0;

    this.move = null;
    this.bob = { amp: def.bobAmp ?? 2.5, freq: def.bobFreq ?? 0.42, t: rng.range(0, TAU) };
    this.sway = { amp: def.swayAmp ?? 0, freq: 0.31, t: rng.range(0, TAU) };
    this.speedMul = 1;

    this.ghosts = [];
    this.visible = true;
    this.auraT = 0;
    this.deathT = 0;
    this.dissolve = 0;
    this.fade = 1;                 // 0..1 overall alpha (used by cut-ins)

    // muzzle / windup bookkeeping (driven by the pattern runtime)
    this.charge = 0;               // 0..1.4 windup strength, decays every frame
    this.chargeT = 0;
    this.attackPulse = 0;
    this.attackHoldT = 0;
    this.muzzleFlash = 0;
    this._pts = [];
    this._buildPoints();
  }

  /* ------------------------------------------------------------------ *
   * 発射点 (attack points)
   *   ボスの見た目上の「手・口・額」に発射点を置く。弾幕は常にこの点から
   *   出るので、プレイヤーは「どこから来るか」を目で追える。
   * ------------------------------------------------------------------ */
  _buildPoints() {
    const w = Math.max(60, this.sprW);
    const h = Math.max(60, this.sprH);
    const defs = this.def.attackPoints ?? [
      { dx: 0, dy: -0.46, name: 'core' },
      { dx: -0.30, dy: -0.16, name: 'left' },
      { dx: 0.30, dy: -0.16, name: 'right' },
      { dx: 0, dy: 0.06, name: 'crown' },
    ];
    this._ptDefs = defs;
    this._pts.length = 0;
    for (const d of defs) {
      this._pts.push({
        name: d.name,
        x: this.x + d.dx * w,
        y: this.y + d.dy * h,
      });
    }
  }

  /** 各発射点のフィールド座標 (毎フレーム再計算) */
  get attackPointsWorld() { return this._pts; }
  get pointCount() { return this._ptDefs.length; }
  point(i) {
    const n = this._ptDefs.length;
    const idx = ((i % n) + n) % n;
    return this._pts[idx];
  }

  /** 予備動作。弾幕ランタイムが発射の 0.2〜0.5 秒前に呼ぶ。 */
  onCharge(v = 1) {
    this.charge = Math.max(this.charge, clamp(v, 0, 1.5));
    this.chargeT = 0;
    if (this.state === STATE.IDLE || this.state === STATE.FLOAT || this.state === STATE.ATTACK) {
      this.to(STATE.WINDUP);
    }
  }

  /** 発射。反動とマズルフラッシュ。 */
  onFire(pulse = 0.7) {
    this.attackPulse = clamp(pulse, 0, 1.5);
    this.muzzleFlash = 1;
    this.attackHoldT = 0;
    this.charge = 0;
    if (this.state === STATE.WINDUP || this.state === STATE.IDLE || this.state === STATE.FLOAT) {
      this.to(STATE.ATTACK);
    }
  }

  /**
   * 1 スプライト pixel あたりの描画倍率。
   * 立ち絵シートの読み込みが終わるまで sheet.ch は 0 なので、
   * その間は 0 を返す (0 除算で scale が Infinity → NaN になるのを防ぐ)。
   */
  get unit() { return this.sheet.ch > 0 ? this.baseH / this.sheet.ch : 0; }

  get sprH() { return this.sheet.ch * this.scale; }
  get sprW() { return this.sheet.cw * this.scale; }

  rowRect(row) { return { sx: row * this.sheet.cw, sy: 0, sw: this.sheet.cw, sh: this.sheet.ch }; }

  // -- lifecycle ------------------------------------------------------------
  setPhase(i, phase) {
    this.phase = i;
    this.maxHp = phase.hp ?? 1000;
    this.hp = this.maxHp;
    this.tint = phase.tint ?? this.def.tint ?? null;
    this.cast = phase.cast ?? null;
    this.targetScale = phase.bossScale ?? 1;
    this.speedMul = phase.speedMul ?? 1;
    if (phase.bobAmp != null) this.bob.amp = phase.bobAmp;
    if (phase.swayAmp != null) this.sway.amp = phase.swayAmp;
    if (phase.move) this.move = { ...phase.move, t: 0 };
    if (phase.home) { this.x = phase.home.x; this.y = phase.home.y; this.baseY = this.y; }
    if (phase.face != null) this.setFace(phase.face);
  }

  setFace(f) {
    if (this.face === f) return;
    this.face = f;
    this.faceFade = 0.0001;
  }

  to(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateT = 0;
    this._hurtJitter = 0;
  }

  /** form-change production; ends when the director calls finishTransition() */
  startTransition() {
    this.form++;
    this.to(STATE.TRANSITION);
    const p = this.projected();
    const fx = this.c.fx;
    if (fx) {
      fx.ring(p.sx, p.sy, { r0: 6, r1: 96 * p.scale, life: 0.72, color: '#ffffff', width: 3 });
      fx.ring(p.sx, p.sy, { r0: 2, r1: 58 * p.scale, life: 0.5, color: this.tint || '#ffd9a0', width: 2 });
      fx.burst(p.sx, p.sy, 26, { speed: 110, spread: TAU, color: this.tint || '#ffd9a0', life: 0.55, size: 2 });
    }
  }

  finishTransition() { this.to(STATE.IDLE); }

  startDefeat() {
    this.to(STATE.DEFEAT);
    this.deathT = 0;
    this.ghosts.length = 0;
  }

  startDissolve() { this.to(STATE.DISSOLVE); this.dissolve = 0; }

  hurt(amount, head = false) {
    this.hp = Math.max(0, this.hp - amount);
    if (head) {
      this.hurtFlash = 1;
      this.hitShakeAmp = Math.min(7, this.hitShakeAmp + 3.0);
    }
  }

  get hpRatio() { return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0; }

  // -- movement -------------------------------------------------------------
  /**
   * Scripted movement.  The boss never dives into the bottom third of the
   * field and always settles before the next windup, so the muzzle position
   * stays trackable — that is what makes a dense pattern feel fair.
   */
  _stepMove(dt) {
    const m = this.move;
    if (!m) {
      const speed = (this.def.drift ?? 16) * this.speedMul;
      this.x += this._driftDir * speed * dt;
      if (this.x < 104) { this.x = 104; this._driftDir = 1; }
      if (this.x > 408) { this.x = 408; this._driftDir = -1; }
      this.baseY = clamp(this.baseY, 44, 178);
      return;
    }
    m.t = (m.t ?? 0) + dt;
    switch (m.kind) {
      case 'patrol': {
        const sp = (m.speed ?? 22) * this.speedMul;
        this.x += (m.dir ?? 1) * sp * dt;
        const a = m.min ?? 92, b = m.max ?? 420;
        if (this.x <= a) { this.x = a; m.dir = 1; }
        if (this.x >= b) { this.x = b; m.dir = -1; }
        break;
      }
      case 'orbit': {
        const w = m.w ?? 70;
        const s = (m.speed ?? 0.7) * this.speedMul;
        this.x = (m.cx ?? 256) + Math.cos(m.t * s * TAU / 6) * w;
        this.baseY = (m.cy ?? 116) + Math.sin(m.t * s * TAU / 6) * (m.h ?? 24);
        break;
      }
      case 'lissajous': {
        const s = this.speedMul;
        this.x = (m.cx ?? 256) + Math.sin(m.t * (m.fx ?? 0.33) * TAU * s) * (m.ax ?? 108);
        this.baseY = (m.cy ?? 108) + Math.sin(m.t * (m.fy ?? 0.21) * TAU * s) * (m.ay ?? 32);
        break;
      }
      case 'moveTo': {
        const k = clamp(dt * (m.rate ?? 1.1), 0, 1);
        this.x = lerp(this.x, m.x, k);
        this.baseY = lerp(this.baseY, m.y, k);
        break;
      }
      case 'hold':
      default:
        break;
    }
    this.baseY = clamp(this.baseY, 40, 182);
    this.x = clamp(this.x, 74, 438);
  }

  _stepIntro(dt) {
    const d = this.def.intro ?? {};
    const from = d.from ?? { x: 256, y: -230 };
    const to = d.to ?? { x: 256, y: 128 };
    const dur = d.dur ?? 2.2;
    const k = clamp(this.stateT / dur, 0, 1);
    const e = 1 - Math.pow(1 - k, 3);
    this.x = lerp(from.x, to.x, e);
    this.baseY = lerp(from.y, to.y, e);
    const u = this.unit || 1;
    this.scale = lerp(u * 0.5, u, e);
    this.y = this.baseY;
    // dust trail while flying in
    if (this.stateT < dur && this.c.fx && Math.random() < dt * 26) {
      this.c.fx.spawn(this.x + rng.range(-26, 26), this.baseY + rng.range(-8, 8), {
        vx: rng.range(-14, 14), vy: rng.range(-6, 22), life: rng.range(0.25, 0.6),
        size: rng.pick([1, 2]), color: rng.pick(['#8f7bd8', '#c9a2ff', '#5d4f8c']), drag: 0.9,
      });
    }
  }

  // -- per-frame ------------------------------------------------------------
  update(dt) {
    this.stateT += dt;
    this.auraT += dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.4);
    if (this.hitShakeAmp > 0) this.hitShakeAmp = Math.max(0, this.hitShakeAmp - dt * 9);
    if (this.faceFade < 1) this.faceFade = Math.min(1, this.faceFade + dt * 5.5);
    if (this.charge > 0) { this.chargeT += dt; this.charge = Math.max(0, this.charge - dt * 1.9); }
    if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 4.5);

    // 発射点を再計算 (スプライトの実寸に対して)
    const pw = Math.max(60, this.sheet.cw * this.scale);
    const ph = Math.max(60, this.sheet.ch * this.scale);
    for (let i = 0; i < this._ptDefs.length; i++) {
      const d = this._ptDefs[i];
      const q = this._pts[i];
      q.x = this.x + d.dx * pw;
      q.y = this.y + d.dy * ph;
    }

    const want = this.unit * this.targetScale;
    if (want > 0) this.scale = lerp(this.scale, want, clamp(dt * 2.6, 0, 1));
    else this.scale = 0;              // 読み込み待ち

    switch (this.state) {
      case STATE.INTRO:
        this._stepIntro(dt);
        break;
      case STATE.TRANSITION: {
        this._stepMove(dt);
        this.y = this.baseY + Math.sin(this.stateT * 2.4) * 3.2;
        break;
      }
      case STATE.HURT: {
        const j = this.hitShakeAmp;
        this.x += Math.sin(this.stateT * 61) * j * dt * 3;
        this.y = this.baseY + Math.sin(this.stateT * 47) * j * 0.6;
        break;
      }
      case STATE.DEFEAT: {
        const d = this.def.defeat ?? {};
        this.deathT += dt;
        this.baseY -= (d.rise ?? 16) * dt * clamp(this.deathT, 0, 1);
        this.scale *= 1 - dt * 0.05;
        this.y = this.baseY;
        if (this.deathT > (d.dissolveAt ?? 1.5)) this.startDissolve();
        break;
      }
      case STATE.DISSOLVE: {
        this.dissolve += dt;
        this.baseY -= 10 * dt;
        this.scale *= 1 - dt * 0.16;
        this.ghosts.push({ x: this.x, y: this.baseY, s: this.scale, a: 0.5 });
        while (this.ghosts.length > 7) this.ghosts.shift();
        for (const g of this.ghosts) g.a = Math.max(0, g.a - dt * 1.1);
        if (this.dissolve > (this.def.defeat?.endAt ?? 2.4)) this.to(STATE.GONE);
        break;
      }
      case STATE.GONE:
        this.visible = false;
        return false;
      default: {
        // 予備動作中は移動を大きく落とす (発射点が読めるようにする)
        const mdt = dt * (this.state === STATE.WINDUP ? 0.28 : this.state === STATE.ATTACK ? 0.55 : 1);
        this._stepMove(mdt);
        this.bob.t += dt;
        this.sway.t += dt;
        let windY = 0, windX = 0;
        if (this.state === STATE.WINDUP) {
          const k = clamp(this.stateT / 0.34, 0, 1);
          windY = -Math.sin(k * Math.PI) * 4.5;
          windX = -Math.sin(k * Math.PI) * 6;
        }
        let attackDrift = 0;
        if (this.state === STATE.ATTACK) attackDrift = Math.sin(this.stateT * 5.2) * 1.6;
        const jitter = this.state === STATE.HURT ? this.hitShakeAmp : 0;
        this.x += Math.cos(this.stateT * 53) * jitter * dt * 2.5;
        this.x += this.sway.amp ? Math.sin(this.sway.t * this.sway.freq * TAU) * this.sway.amp : 0;
        this.x += windX + attackDrift;
        this.y = this.baseY + Math.sin(this.bob.t * this.bob.freq * TAU) * this.bob.amp + windY;
        break;
      }
    }
    // 状態の自動遷移: 予備動作 → 発射 → 待機
    if (this.state === STATE.WINDUP && this.chargeT > 0.30) {
      this.attackPulse = 0.55;
      this.to(STATE.ATTACK);
    } else if (this.state === STATE.ATTACK) {
      this.attackHoldT += dt;
      if (this.attackHoldT > 0.26) this.to(STATE.IDLE);
    }

    this.h = this.sprH;
    this.w = this.sprW;
    return true;
  }

  /** field-space position projected through the camera */
  projected() { return this.c.s.cam.project(this.x, this.y, 0); }

  // -- drawing --------------------------------------------------------------
  draw(s) {
    if (!this.visible) return;
    // 立ち絵スプライトの読み込みが終わるまでは描画しない。
    // (準備中の drawImage は例外になり、非有限の座標は描画系を壊すため必ずガードする)
    if (!this.sheet.canvas || !(this.scale > 0)) return;
    const cam = s.cam;
    const p = cam.project(this.x, this.y, 0);
    if (p.behind) return;
    const sc = p.scale;
    const w = Math.max(2, Math.round(this.sprW * sc));
    const h = Math.max(2, Math.round(this.sprH * sc));
    const dx = Math.round(p.sx - w / 2);
    const dy = Math.round(p.sy - h);   // pivot: bottom-centre of the bust
    const ctx = s.ctx;
    const sheet = this.sheet.canvas;
    const alpha = this.fade;

    const opt = {
      alpha,
      tint: this.tint,
      tintA: this.tint ? 0.30 : 0,
      cast: this.cast,
      highlight: this.hurtFlash * 0.4,
    };

    for (const g of this.ghosts) {
      const gp = cam.project(g.x, g.y, 0);
      const gw = Math.max(2, Math.round(sheet.cw * g.s * gp.scale));
      const gh = Math.max(2, Math.round(sheet.ch * g.s * gp.scale));
      const r = this.rowRect(FACE.NORMAL);
      drawSprite(ctx, sheet, r.sx, 0, r.sw, r.sh,
        Math.round(gp.sx - gw / 2), Math.round(gp.sy - gh), gw, gh,
        { alpha: g.a * 0.55, tint: this.tint || '#ffd9f0', tintA: 0.75 });
    }

    const a = this.rowRect(this.faceShown);
    if (this.faceShown !== this.face) {
      const k = smoothstep(this.faceFade);
      const b = this.rowRect(this.face);
      drawSprite(ctx, sheet, a.sx, 0, a.sw, a.sh, dx, dy, w, h, { ...opt, alpha: alpha * (1 - k) });
      drawSprite(ctx, sheet, b.sx, 0, b.sw, b.sh, dx, dy, w, h, { ...opt, alpha: alpha * k });
      if (this.faceFade >= 1) this.faceShown = this.face;
    } else {
      drawSprite(ctx, sheet, a.sx, 0, a.sw, a.sh, dx, dy, w, h, opt);
    }

    // 予備動作のオーラ (発射点が光る = 視覚的な予告)
    if (this.charge > 0.02) {
      const cp = cam.project(this._pts[0].x, this._pts[0].y, 0);
      const r = 5 + this.charge * 20;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cp.sx, cp.sy, 0, cp.sx, cp.sy, r);
      const c = this.def.chargeColor || (this.tint ? this.tint : '#ffffff');
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.45, c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = clamp(this.charge, 0, 1) * 0.85;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cp.sx, cp.sy, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // マズルフラッシュ: すべての発射点に一瞬の十字
    if (this.muzzleFlash > 0.05) {
      const col = this.def.muzzleColor || (this.tint ? this.tint : '#fff3c0');
      ctx.save();
      ctx.globalAlpha = this.muzzleFlash * 0.85;
      ctx.globalCompositeOperation = 'lighter';
      for (const q of this._pts) {
        const pp = cam.project(q.x, q.y, 0);
        const len = 4 + this.muzzleFlash * 9;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(pp.sx) - len, Math.round(pp.sy), len * 2 + 1, 2);
        ctx.fillRect(Math.round(pp.sx), Math.round(pp.sy) - len, 2, len * 2 + 1);
      }
      ctx.restore();
    }

    // transition halo: two expanding rings, drawn directly so it is visible
    // even when FX rings are culled
    if (this.state === STATE.TRANSITION) {
      const k = clamp(this.stateT / 1.5, 0, 1);
      const cx = dx + w / 2, cy = dy + h * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 1; i++) {
        const r = 12 + k * 120 + i * 16;
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.strokeStyle = this.tint || '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export default Boss;
