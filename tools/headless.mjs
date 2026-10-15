/**
 * tools/headless.mjs — 開発用ヘッドレステストハーネス
 *
 * ブラウザを使わずに、ゲーム本体 (src/**) をそのまま Node 上で走らせる。
 *  ・canvas は @napi-rs/canvas (npm) を使用
 *  ・DOM / AudioContext / localStorage は最小限のスタブ
 *  ・描画結果を PNG で書き出すので、弾幕・背景・HUD を目視確認できる
 *
 * 使い方:
 *   node tools/headless.mjs shot   … 全フェーズのスクリーンショットを撮る
 *   node tools/headless.mjs sim    … 全フェーズ×全難易度を自動プレイして集計
 *   node tools/headless.mjs main   … main.js の状態遷移を通しで走らせる
 *
 * 注意: これは「動作確認用の開発ツール」であり、ゲーム本体の依存ではない。
 * 出力先は playtest/ (Git 管理外)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIEW_W, VIEW_H } from '../src/core/const.js';
import { createCanvas, Image as NImage, ImageData as NImageData, GlobalFonts } from '@napi-rs/canvas';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'playtest');
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ *
 * スタブ: canvas / Image / DOM / Audio / storage
 * ------------------------------------------------------------------ */

export function makeCanvas(w = 1, h = 1) {
  const c = createCanvas(w, h);
  c.style = {};
  c.addEventListener = () => {};
  c.removeEventListener = () => {};
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: c.width, height: c.height });
  return c;
}

function resolveAsset(src) {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return path.join(PUBLIC, String(src).replace(/^\.?\//, ''));
}

class FakeImage extends NImage {
  set src(v) { super.src = resolveAsset(v); }
  get src() { return super.src; }
}

const ELEMENTS = {
  screen: makeCanvas(512, 384),
  boot: { classList: { add() {}, remove() {} }, remove() {} },
  bootbar: { style: {} },
  bootmsg: { textContent: '' },
};

let rafQueue = [];
globalThis.window = globalThis;
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return { style: {}, appendChild() {}, remove() {}, classList: { add() {}, remove() {} } };
  },
  getElementById(id) { return ELEMENTS[id] || null; },
  addEventListener() {}, removeEventListener() {},
  fonts: { add() {}, ready: Promise.resolve() },
  documentElement: { requestFullscreen() {}, style: {} },
};
globalThis.Image = FakeImage;
globalThis.ImageData = NImageData;
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1024;
globalThis.innerHeight = 768;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
globalThis.cancelAnimationFrame = () => {};
try { globalThis.navigator.getGamepads = () => []; } catch { /* node 22 では navigator が取得専用 */ }
globalThis.location = { reload() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

// fetch: public/ 配下のローカルパスを解決する (音声はデコードしない)
globalThis.fetch = async (url) => {
  const p = resolveAsset(url);
  if (fs.existsSync(p)) {
    const b = fs.readFileSync(p);
    return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  }
  throw new Error('headless fetch: not found ' + p);
};

// font: DotGothic16 を登録して pixel フォントとして描けるようにする
const FONT_PATH = path.join(PUBLIC, 'assets/fonts/DotGothic16-Regular.ttf');
if (fs.existsSync(FONT_PATH)) {
  try { GlobalFonts.registerFromPath(FONT_PATH, 'DotGothic16'); } catch (e) { console.warn('font register failed', e.message); }
}

// localStorage
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

// AudioContext (音は鳴らさない。API シグネチャだけ満たす)
const param = () => ({
  value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {},
});
const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = node(); }
  resume() { return Promise.resolve(); }
  createGain() { return node({ gain: param() }); }
  createDynamicsCompressor() {
    return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  }
  createBufferSource() { return node({ buffer: null, playbackRate: param(), detune: param(), start() {}, stop() {} }); }
  createBuffer(ch = 1, len = 1) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { length: len, sampleRate: this.sampleRate, numberOfChannels: ch, getChannelData: (i) => data[i] };
  }
  createOscillator() { return node({ type: 'sine', frequency: param(), detune: param(), start() {}, stop() {} }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param(), gain: param() }); }
  createStereoPanner() { return node({ pan: param() }); }
  decodeAudioData() {
    const len = 4410;
    return Promise.resolve({
      duration: len / this.sampleRate, length: len, sampleRate: this.sampleRate,
      numberOfChannels: 1, getChannelData: () => new Float32Array(len),
    });
  }
}
globalThis.AudioContext = FakeAudioContext;
globalThis.webkitAudioContext = FakeAudioContext;

/* ------------------------------------------------------------------ *
 * イベント / 入力のシミュレーション
 * ------------------------------------------------------------------ */
export const inputSim = {
  keys: new Set(),
  held: new Set(),
  press(name) { this.keys.add(name); },
  hold(name) { this.held.add(name); },
  release(name) { this.held.delete(name); },
  /** input.update() の前に呼ぶ: 押下エッジを流し込む */
  apply(input) {
    for (const k of this.keys) input.pressed.add(k);
    this.keys.clear();
    input.keys = new Set(this.held);
  },
};

/* ------------------------------------------------------------------ *
 * スクリーンショット
 * ------------------------------------------------------------------ */
export async function shot(canvas, name) {
  const buf = await canvas.encode('png');
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, buf);
  return file;
}

/* ------------------------------------------------------------------ *
 * モード 1: 各フェーズの見た目を1枚ずつ撮る
 * ------------------------------------------------------------------ */
async function runShots() {
  const { Surface } = await import('../src/render/surface.js');
  const { FX } = await import('../src/render/fx.js');
  const { Camera } = await import('../src/render/camera.js');
  const { Background } = await import('../src/render/background.js');
  const { Bullets } = await import('../src/game/bullets.js');
  const { Lasers } = await import('../src/game/lasers.js');
  const { Player } = await import('../src/game/player.js');
  const { Boss } = await import('../src/game/boss.js');
  const { Diff, PhaseRunner } = await import('../src/game/patterns.js');
  const { STAGES } = await import('../src/game/stages.js');
  const { drawHud } = await import('../src/game/hud.js');
  const { RNG } = await import('../src/core/rng.js');
  const { DIFFICULTIES } = await import('../src/core/const.js');

  const scene = buildScene({ Surface, FX, Camera, Background, Bullets, Lasers, Player, Boss, Diff, PhaseRunner, RNG });
  const made = [];
  for (let si = 0; si < STAGES.length; si++) {
    for (let pi = 0; pi < STAGES[si].phases.length; pi++) {
      const phase = STAGES[si].phases[pi];
      const at = phase.len * 0.55;
      const info = await simulate(scene, { stageIndex: si, phaseIndex: pi, diffKey: 'NORMAL', until: at, bot: true, renderEvery: 1 });
      const file = await shot(scene.s.display, `s${si + 1}_p${pi + 1}_${phase.cam || 'flat'}`);
      made.push(`${path.basename(file)}  ${phase.n}  弾=${info.maxBullets} 被弾=${info.hits}`);
    }
  }
  console.log(made.join('\n'));
}

/* ------------------------------------------------------------------ *
 * シーン生成 (メインループと同じ構成)
 * ------------------------------------------------------------------ */
function buildScene(mods) {
  const { Surface, FX, Camera, Background, Bullets, Lasers, Player, Boss } = mods;
  const display = ELEMENTS.screen;
  const s = new Surface(display);
  s.cam = new Camera();
  const fx = new FX();
  const audio = { play() {}, playSong() {}, setIntensity() {}, stopSong() {}, resume() { return Promise.resolve(); } };
  const scene = {
    s, fx, cam: s.cam, audio,
    bg: new Background(),
    bullets: new Bullets(),
    lasers: new Lasers(),
    player: new Player(fx),
    sim: { keys: new Set(), axis: { x: 0, y: 0 }, focus: false, hit() { return false; }, down() { return false; } },
  };
  scene.bg.setTheme('stage1', { instant: true });
  return scene;
}

/** 1 フェーズを走らせる */
async function simulate(scene, o) {
  const { STAGES } = await import('../src/game/stages.js');
  const { Diff, PhaseRunner } = await import('../src/game/patterns.js');
  const { Boss, STATE: BS } = await import('../src/game/boss.js');
  const { DIFFICULTIES, BULLET_CAP, VIEW_W, VIEW_H } = await import('../src/core/const.js');
  const { RNG } = await import('../src/core/rng.js');
  const { drawHud } = await import('../src/game/hud.js');

  const { stageIndex, phaseIndex, diffKey, until, bot = true, renderEvery = 1 } = o;
  const stage = STAGES[stageIndex];
  const phase = stage.phases[phaseIndex];
  const diff = DIFFICULTIES[diffKey];

  const rng = new RNG(0x1234 + phaseIndex * 7919);
  const runner = new PhaseRunner();
  runner.rnd = () => rng.next();
  const d = new Diff(diff);

  const boss = new Boss({ ...stage.boss, sheet: stage.sheet }, { s: scene.s, fx: scene.fx, audio: scene.audio });
  await boss.sheet.ready;
  scene.boss = boss;
  boss.to(BS.INTRO);
  boss.setPhase(phaseIndex, { ...stage.forms[phase.form], move: phase.move ?? stage.forms[phase.form].move });

  scene.bullets.clear(); scene.lasers.clear(); scene.fx.reset();
  scene.player.reset(false);
  scene.player.invuln = 0;
  scene.cam.reset();
  scene.cam.setMode(phase.cam === 'pseudo3d' ? 'pseudo3d' : 'flat', { instant: false, speed: 1.2 });
  scene.bg.setTheme(stage.bg, { instant: true });

  scene.bullets.attach({
    fx: scene.fx, player: scene.player, rng,
    onGraze: () => { },
    onCancel: () => { },
  });
  scene.lasers.attach({ fx: scene.fx, player: scene.player, rng });
  runner.reset(phase.actions);

  const S = runner.spawner;
  S.boss = boss; S.player = scene.player; S.bullets = scene.bullets;
  S.lasers = scene.lasers; S.d = d; S.fx = scene.fx; S.audio = scene.audio; S.phase = phase;

  const dt = 1 / 60;
  const limit = until ?? phase.len * diff.phaseLen + 1.2;
  let t = 0;
  let hits = 0, deaths = 0, maxBullets = 0, events = 0, frames = 0;
  let prevAlive = true;
  const hud = {
    hud: 'on', act: stage.act, stageName: stage.name, phaseLabel: phase.n, phaseIndex,
    phaseTotal: stage.phases.length, timeLeft: phase.len * diff.phaseLen, phaseLen: phase.len * diff.phaseLen,
    bossName: stage.boss.name, bossTitle: stage.boss.title, lives: diff.lives, bombs: diff.bomb,
    bombGauge: 0, score: 0, graze: 0, dodged: 0, hits: 0, noMiss: true, elapsed: 0,
    practice: false, formIndex: phase.form, formTotal: stage.forms.length,
  };

  // 導入 (ボス登場) を先に消化
  for (let i = 0; i < Math.round((stage.boss.intro?.dur ?? 2.0) * 60); i++) { boss.update(dt); t += dt; }

  while (t < limit) {
    if (bot) (process.env.BOT === 'old' ? steerBot : steerLook)(scene, dt);
    boss.update(dt);
    if (t < limit - 0.6) { S.t = t; runner.update(dt, S); events += 1; }
    scene.bullets.update(dt, {
      player: scene.player, difficulty: diff,
      bounds: { x0: -48, x1: VIEW_W + 48, y0: -80, y1: VIEW_H + 80 },
      camera: scene.cam,
    });
    scene.lasers.update(dt, { camera: scene.cam });
    scene.player.update(dt, scene.sim, { difficulty: diff, camera: scene.cam });
    if (prevAlive && !scene.player.alive) {
      hits += 1;
      if (process.env.DEBUG_HITS) {
        const pl = scene.player;
        const near = scene.bullets.list.filter((b) => b.alive || b._hitRecent)
          .map((b) => ({ d: Math.hypot(b.x - pl.x, b.y - pl.y), type: b.type, color: b.color, z: +(b.z ?? 0).toFixed(0), vz: +(b.vz ?? 0).toFixed(0), r: b.r }))
          .sort((a, b) => a.d - b.d).slice(0, 3);
        const lz = scene.lasers.list.filter((l) => l.alive && l.state === 'fire')
          .map((l) => ({ x: +l.x.toFixed(0), y: +l.y.toFixed(0), ang: +(l.angle * 180 / Math.PI).toFixed(0), len: l.length, w: l.width, origin: l.origin, count: l.count ?? 1 }));
        console.log(`  [hit ${hits}] t=${t.toFixed(2)} phase=${phaseIndex + 1} pos=(${pl.x.toFixed(0)},${pl.y.toFixed(0)}) nearest=`, JSON.stringify(near), 'firingLasers=', JSON.stringify(lz));
      }
      if (hits > diff.lives) { deaths = 1; break; }
      scene.bullets.clear();
      scene.lasers.clear();
      scene.player.reset();
      scene.player.invuln = diff.invuln;
      scene.player.vulnerable = false;
    }
    prevAlive = scene.player.alive;
    scene.fx.update(dt);
    scene.cam.update(dt);
    scene.bg.update(dt, { camera: scene.cam, intensity: (phase.level ?? 0) / 3 });
    maxBullets = Math.max(maxBullets, scene.bullets.active);
    t += dt;
    frames += 1;
    if (frames % renderEvery === 0) {
      const s = scene.s;
      s.begin('#050409');
      scene.bg.draw(s.ctx, scene.cam);
      boss.draw(s);
      scene.lasers.draw(s.ctx, scene.cam);
      scene.bullets.draw(s.ctx, scene.cam);
      scene.player.draw(s.ctx, scene.cam);
      scene.fx.draw(s.ctx);
      hud.timeLeft = Math.max(0, limit - t);
      drewHud = true;
      drawHud(s.ctx, hud, t);
    }
    hud.timeLeft = Math.max(0, limit - t);
  }
  scene.s.present({ shakeX: scene.fx.shake.x, shakeY: scene.fx.shake.y });
  if (maxBullets > BULLET_CAP) throw new Error('bullet cap exceeded: ' + maxBullets);
  return { hits, deaths, maxBullets, events, frames, seconds: t };
}
let drewHud = false;

/** ごく簡単な回避ボット (最も近い弾から逃げる + 画面下寄りを好む) */
function steerBot(scene, dt) {
  const p = scene.player;
  if (!p.alive) { scene.sim.axis.x = 0; scene.sim.axis.y = 0; return; }
  let fx = 0, fy = 0;
  const list = scene.bullets.list;
  const R = 74;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.alive) continue;
    const dx = p.x - b.x, dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > R * R || d2 < 0.0001) continue;
    const d = Math.sqrt(d2);
    const w = (1 - d / R) * (1 - d / R) * 3.2;
    fx += (dx / d) * w; fy += (dy / d) * w;
  }
  // レーザーの警告線からも逃げる
  for (const l of scene.lasers.list) {
    if (!l.alive || l.state === 'fire') continue;
    const dx = p.x - l.x, dy = p.y - l.y;
    const perp = Math.sin(l.angle) * dx - Math.cos(l.angle) * dy;
    if (Math.abs(perp) < 26 && Math.hypot(dx, dy) < 300) {
      const w = (1 - Math.abs(perp) / 26) * 2.4;
      fx += Math.sin(l.angle + Math.PI / 2) * w * Math.sign(perp || 1);
      fy += -Math.cos(l.angle + Math.PI / 2) * w * Math.sign(perp || 1);
    }
  }
  // 画面下寄り・中央寄りを好む (逃げ場を確保)
  fx += clampf((256 - p.x) / 256, -1, 1) * 0.35;
  fy += clampf((300 - p.y) / 240, -1, 1) * 0.9;

  // 弾が無いときは少しだけ左右に揺れる (棒立ちを避ける)
  if (Math.abs(fx) < 0.05 && Math.abs(fy) < 0.05) fx = Math.sin(p.animT * 1.7) * 0.4;

  const m = Math.hypot(fx, fy) || 1;
  scene.sim.axis.x = fx / m;
  scene.sim.axis.y = fy / m;
  scene.sim.focused = false;
}

/**
 * 先読みボット: 9 方向 (停止含む) の候補位置を、0.7 秒先の弾位置 (等速近似) で評価する。
 * 弾の当たり半径 + 自機半径より近い候補は大きく減点。画面外・警告線も減点。
 * 同点の時は画面中央下寄りを選ぶ。
 */
function steerLook(scene, dt) {
  const p = scene.player;
  if (!p.alive) { scene.sim.axis.x = 0; scene.sim.axis.y = 0; return; }
  const H = 0.7, STEP = 0.1;
  const PLAYER_R_HINT = 2 + 4;   // 自機の当たり半径の目安 (+ 余裕)
  const speed = 150;                    // 通常移動の目安 (px/s)
  const bl = scene.bullets.list.filter((b) => b.alive);
  const lasers = scene.lasers.list.filter((l) => l.alive);
  // 3D 中は当たり判定がスクリーン座標 (投影後) なので、ボットも投影で予測する
  const cam = scene.cam && scene.cam.active ? scene.cam : null;
  const proj = (x, y, z) => {
    if (!cam) return { sx: x, sy: y, scale: 1 };
    const q = cam.project(x, y, z ?? 0);
    return { sx: q.sx, sy: q.sy, scale: q.scale ?? 1, behind: q.behind };
  };
  const dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]];
  let best = null, bestScore = -Infinity;
  for (const [dx, dy] of dirs) {
    const nx = clampf(p.x + dx * speed * H * 0.6, 24, VIEW_W - 24);
    const ny = clampf(p.y + dy * speed * H * 0.6, 40, VIEW_H - 24);
    let minClear = 1e9;
    // 0..H を STEP 刻みで評価
    for (let t = 0; t <= H + 1e-6; t += STEP) {
      const px = p.x + (nx - p.x) * (t / H), py = p.y + (ny - p.y) * (t / H);
      const pq = proj(px, py, p.z ?? 0);
      // 発射中のビームは時刻 t の角度 (回転) で評価する
      for (const l of lasers) {
        if (l.state !== 'fire') continue;
        const cnt = l.count ?? 1;
        for (let c = 0; c < cnt; c++) {
          const a = (l.angle + (l.spin || 0) * t) + (cnt > 1 ? (c - (cnt - 1) / 2) * l.spread : 0);
          const ex = l.x + Math.cos(a) * l.length, ey = l.y + Math.sin(a) * l.length;
          let d, half;
          if (cam) {
            const A = proj(l.x, l.y, l.z ?? 0), B = proj(ex, ey, l.z ?? 0);
            if (A.behind || B.behind) continue;
            const vx = B.sx - A.sx, vy = B.sy - A.sy, L2 = vx * vx + vy * vy || 1;
            const q = clampf(((pq.sx - A.sx) * vx + (pq.sy - A.sy) * vy) / L2, 0, 1);
            d = Math.hypot(pq.sx - (A.sx + vx * q), pq.sy - (A.sy + vy * q));
            half = (l.width / 2) * ((A.scale + B.scale) / 2);
          } else {
            const dx = Math.cos(a), dy = Math.sin(a);
            const tt = clampf((px - l.x) * dx + (py - l.y) * dy, 0, l.length);
            d = Math.hypot(px - (l.x + dx * tt), py - (l.y + dy * tt));
            half = l.width / 2;
          }
          const gap = d - half - PLAYER_R_HINT * (cam ? pq.scale : 1);
          if (gap < minClear) minClear = gap;
        }
      }
      for (const b of bl) {
        const bq = proj(b.x + b.vx * t, b.y + b.vy * t, (b.z ?? 0) + (b.vz ?? 0) * t);
        const rr = (b.r ?? 4) * bq.scale + (PLAYER_R_HINT) * pq.scale;
        const d = Math.hypot(pq.sx - bq.sx, pq.sy - bq.sy) - rr;
        if (d < minClear) minClear = d;
      }
    }
    let score = 0;
    if (minClear < 0) score -= 1000 + (-minClear) * 20; // 当たる
    else score += Math.min(minClear, 60) * 2;           // 余裕
    for (const l of lasers) {
      const ang = l.angle;
      const cnt = l.count ?? 1;
      for (let c = 0; c < cnt; c++) {
        const a = ang + (cnt > 1 ? (c - (cnt - 1) / 2) * l.spread : 0);
        const ex = l.x + Math.cos(a) * l.length, ey = l.y + Math.sin(a) * l.length;
        let d, half;
        if (cam) {
          const A = proj(l.x, l.y, l.z ?? 0), B = proj(ex, ey, l.z ?? 0), P = proj(nx, ny, p.z ?? 0);
          if (A.behind || B.behind) continue;
          const vx = B.sx - A.sx, vy = B.sy - A.sy, L2 = vx * vx + vy * vy || 1;
          const t = clampf(((P.sx - A.sx) * vx + (P.sy - A.sy) * vy) / L2, 0, 1);
          d = Math.hypot(P.sx - (A.sx + vx * t), P.sy - (A.sy + vy * t));
          half = (l.width / 2) * ((A.scale + B.scale) / 2);
        } else {
          d = Math.abs(Math.sin(a) * (nx - l.x) - Math.cos(a) * (ny - l.y));
          half = l.width / 2;
        }
        if (l.state !== 'fire' && d < half + 22) score -= (half + 22 - d) * 12;   // 警告線は避ける
      }
    }
    score -= Math.hypot(nx - VIEW_W / 2, ny - VIEW_H * 0.75) * 0.02;
    if (dx === 0 && dy === 0) score += 2;                 // 同点ならじっとする
    if (score > bestScore) { bestScore = score; best = [dx, dy]; }
  }
  scene.sim.axis.x = best[0];
  scene.sim.axis.y = best[1];
  scene.sim.focused = false;
}
const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ *
 * モード 2: 全フェーズ × 全難易度の自動プレイ集計
 * ------------------------------------------------------------------ */
async function runSim() {
  const { Surface } = await import('../src/render/surface.js');
  const { FX } = await import('../src/render/fx.js');
  const { Camera } = await import('../src/render/camera.js');
  const { Background } = await import('../src/render/background.js');
  const { Bullets } = await import('../src/game/bullets.js');
  const { Lasers } = await import('../src/game/lasers.js');
  const { Player } = await import('../src/game/player.js');
  const { Boss } = await import('../src/game/boss.js');
  const { Diff, PhaseRunner } = await import('../src/game/patterns.js');
  const { STAGES } = await import('../src/game/stages.js');
  const { DIFFICULTIES, DIFFICULTY_ORDER } = await import('../src/core/const.js');
  const { RNG } = await import('../src/core/rng.js');

  const scene = buildScene({ Surface, FX, Camera, Background, Bullets, Lasers, Player, Boss, Diff, PhaseRunner, RNG });
  const rows = [];
  let worst = 0;
  for (const diffKey of DIFFICULTY_ORDER) {
    for (let si = 0; si < STAGES.length; si++) {
      for (let pi = 0; pi < STAGES[si].phases.length; pi++) {
        const phase = STAGES[si].phases[pi];
        const info = await simulate(scene, { stageIndex: si, phaseIndex: pi, diffKey, renderEvery: 4 });
        const len = phase.len * DIFFICULTIES[diffKey].phaseLen;
        rows.push({
          diff: diffKey, stage: si + 1, phase: pi + 1, name: phase.n,
          len: len.toFixed(1), hits: info.hits, dead: info.deaths ? 'YES' : '',
          maxBullets: info.maxBullets,
        });
        worst = Math.max(worst, info.maxBullets);
      }
    }
  }
  const pad = (v, n) => String(v).padEnd(n);
  console.log(pad('DIFF', 7) + pad('幕', 4) + pad('PH', 4) + pad('len', 6) + pad('被弾', 5) + pad('全滅', 5) + pad('最大弾数', 9) + 'フェーズ名');
  for (const r of rows) {
    console.log(pad(r.diff, 7) + pad(r.stage, 4) + pad(r.phase, 4) + pad(r.len, 6) + pad(r.hits, 5) + pad(r.dead, 5) + pad(r.maxBullets, 9) + r.name);
  }
  console.log(`\n全体の最大同時弾数: ${worst}`);
  fs.writeFileSync(path.join(OUT, 'sim_report.txt'), rows.map((r) => JSON.stringify(r)).join('\n'));
}

/* ------------------------------------------------------------------ *
 * モード 3: main.js の状態遷移を通しで走らせる
 * ------------------------------------------------------------------ */
async function runMain() {
  const { STAGES: ST } = await import('../src/game/stages.js');
  // テストを短時間で回すため、フェーズ耐久時間を一時的に短縮する
  // (ゲーム本編のデータには影響しない。このプロセス内だけの書き換え)
  const SHRINK = Number(process.env.SHRINK || 0.12);
  for (const st of ST) for (const ph of st.phases) ph.len = Math.max(3, Math.round(ph.len * SHRINK));

  const g = await import('../src/main.js');
  const game = globalThis.__game;
  if (!game) throw new Error('main.js から game が公開されていません');
  // boot() は requestAnimationFrame を要求するが、こちらで手動ループを回す
  await new Promise((r) => setTimeout(r, 900));

  const frames = (n, fn) => {
    for (let i = 0; i < n; i++) {
      inputSim.held.clear();
      fn?.(i);
      inputSim.apply(game.input);
      game.update(1 / 60);
      game.render();
      game.input.update();      // 実機のループと同じ順序で入力バッファを消化する
    }
  };
  const tap = (key) => { inputSim.press(key); };

  const log = [];
  const step = async (label, n, extra) => {
    for (let i = 0; i < n; i += 30) {
      frames(Math.min(30, n - i), (k) => extra?.(i + k));
      console.log(`  ..${label} ${i + 30}/${n} mode=${game.mode} sub=${game.sub} 弾=${game.bullets.active}`);
    }
    log.push(`${label}  mode=${game.mode}  phase=${game.phaseIndex + 1}  sub=${game.sub}  弾=${game.bullets.active}  FPS=${game.fps.toFixed(0)}`);
  };

  await step('title', 30, (i) => { if (i === 10) tap('confirm'); });     // はじめから
  await step('difficulty', 20, (i) => { if (i === 6) tap('down'); if (i === 12) tap('confirm'); }); // NORMAL
  await step('story(intro)', 220, (i) => { if (i % 30 === 0) tap('confirm'); });
  for (let p = 0; p < 4; p++) {
    // フェーズを強制的に早送り (時間を進める)
    const len = game.stage.phases[game.phaseIndex]?.len ?? 20;
    await step(`play p${game.phaseIndex + 1}`, Math.round((len * 1.1 + 4) * 60), (i) => {
      if (i % 7 === 0) inputSim.hold('left');
      else if (i % 7 === 3) inputSim.hold('right');
      else if (i % 7 === 5) inputSim.hold('up');
    });
    await shot(game.s.display, `main_s1_p${p + 1}`);
  }
  await step('result', 30);
  await shot(game.s.display, 'main_result');
  console.log(log.join('\n'));
  console.log('final mode:', game.mode, 'result:', JSON.stringify(game.result && {
    act: game.result.act, score: game.result.score, hits: game.result.hits, rank: game.result.rank,
  }));
}

/* ------------------------------------------------------------------ *
 * モード 4: UI 画面のキャプチャ
 * ------------------------------------------------------------------ */
async function runUi() {
  const { STAGES: ST } = await import('../src/game/stages.js');
  for (const st of ST) for (const ph of st.phases) ph.len = Math.max(3, Math.round(ph.len * 0.1));
  await import('../src/main.js');
  const game = globalThis.__game;
  await new Promise((r) => setTimeout(r, 700));
  const frames = (n, fn) => {
    for (let i = 0; i < n; i++) {
      inputSim.held.clear();
      fn?.(i);
      inputSim.apply(game.input);
      game.update(1 / 60);
      game.render();
      game.input.update();
    }
  };
  const tap = (k) => inputSim.press(k);
  const say = async (name) => console.log(await shot(game.s.display, `ui_${name}`));

  frames(40); await say('title');
  frames(6, () => tap('down')); frames(6, () => tap('down')); frames(6, () => tap('down'));
  frames(4, () => tap('confirm')); await say('help');
  frames(4, () => tap('cancel'));
  frames(4, () => tap('confirm'));                              // はじめから → 難易度
  await say('difficulty');
  frames(4, () => tap('confirm'));                              // NORMAL → 導入会話
  frames(40, (i) => { if (i % 20 === 0) tap('confirm'); }); await say('story');
  frames(200, (i) => { if (i % 25 === 0) tap('confirm'); });    // 会話を送る
  frames(200, (i) => { if (i % 20 === 0) tap('confirm'); });    // ボス登場 → フェーズ
  await say('play');
  frames(4, () => tap('pause')); await say('pause');
  frames(4, () => tap('pause'));
  // 進行を強制してリザルトまで持っていく
  for (let p = 0; p < 6 && game.mode === 'play'; p++) {
    frames(Math.round((game.phaseLen + 3) * 60 + 120), (i) => {
      if (i % 9 === 0) inputSim.hold('left');
      else if (i % 9 === 4) inputSim.hold('right');
      else if (i % 9 === 7) inputSim.hold('down');
    });
  }
  frames(120, (i) => { if (i % 20 === 0) tap('confirm'); });    // 締めの会話 → リザルト
  frames(30); await say('result');
  // ゲームオーバー画面
  game._startRun(0, 0, { skipStory: true });
  frames(200, (i) => { if (i % 20 === 0) tap('confirm'); });
  game.lives = -1; game._gameOver(); frames(30); await say('gameover');
  console.log('final mode', game.mode);
}

/* ------------------------------------------------------------------ *
 * エントリ
 * ------------------------------------------------------------------ */
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const mode = process.argv[2] || 'shot';
  try {
    if (mode === 'shot') await runShots();
    else if (mode === 'sim') await runSim();
    else if (mode === 'main') await runMain();
    else if (mode === 'ui') await runUi();
    else console.log('usage: node tools/headless.mjs [shot|sim|main|ui]');
    process.exit(0);
  } catch (e) {
    console.error('FAILED:', e);
    process.exit(1);
  }
}

export { runShots, runSim, runMain, runUi, buildScene, simulate, ELEMENTS, OUT };
