/* =============================================================================
 * tools/render-frames.js — 実際のゲームフレームを PNG に書き出す検証ツール
 *
 *  ブラウザが使えない環境でも「本当に絵が出ているか」を確認するための装置。
 *  @napi-rs/canvas（Node 用の本物の Canvas 実装）を window に差し込み、
 *  ゲーム本体の描画コードをそのまま走らせて PNG 化する。
 *
 *  使い方:
 *    node tools/render-frames.js                 # 主要シーンのスクリーンショット
 *    node tools/render-frames.js --stage 2       # 第2章の各フェーズ
 *    node tools/render-frames.js --shots title,boss
 *    node tools/render-frames.js --out _work/frames
 *
 *  出力先は _work/frames/（.gitignore 済み。リポジトリには含めない）
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { createCanvas, Image, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { SOURCES, ROOT } = require('./headless');

/* --------------------------------------------------------------- 引数 ---- */
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const OUT = path.resolve(ROOT, argOf('--out', '_work/frames'));
const WANT_STAGE = argOf('--stage', null);
const SHOTS = (argOf('--shots', 'all') || 'all').split(',').map(s => s.trim()).filter(Boolean);

const FIELD_W = 640, FIELD_H = 480;

/** 登録できたフォント名（モジュールスコープ。makeBrowserShim 内では win が未定義のため） */
const REGISTERED_FONTS = [];

/* ====================================================== ブラウザ環境再現 == */
/**
 * @napi-rs/canvas を window に載せ、Canvas 2D API を持つ「本物の」環境を作る。
 * ゲーム側のコードは 1 行も書き換えない。
 */
function makeBrowserShim() {
  const listeners = {};
  const madeCanvases = [];
  const document = {
    createElement(tag) {
      if (tag === 'canvas') {
        const c = createCanvas(300, 150);
        patchCanvas(c);
        madeCanvases.push(c);
        return c;
      }
      return {
        style: {}, appendChild() { }, addEventListener() { }, removeEventListener() { },
        setAttribute() { }, classList: { add() { }, remove() { }, toggle() { } },
      };
    },
    getElementById: () => null,
    querySelector: () => null,
    documentElement: { requestFullscreen: () => Promise.resolve(), style: {} },
    body: { appendChild() { }, style: {} },
    addEventListener() { }, removeEventListener() { },
    fonts: { add() { }, ready: Promise.resolve() },
    fullscreenElement: null, exitFullscreen: () => Promise.resolve(),
    hidden: false,
  };
  // フォントは同梱の woff2 をそのまま登録する（ブラウザの FontFace と同じ実体）
  try {
    // 本番と同じ日本語ピクセルフォントを使う（フォント差で検証が嘘にならないように）
    const jp = path.join(ROOT, 'assets/fonts/FusionPixel12-japanese.woff2');
    const lat = path.join(ROOT, 'assets/fonts/Silkscreen-latin-400.woff2');
    const latB = path.join(ROOT, 'assets/fonts/Silkscreen-latin-700.woff2');
    const r = [];
    if (fs.existsSync(jp)) r.push(['FusionPixel12', GlobalFonts.registerFromPath(jp, 'FusionPixel12')]);
    if (fs.existsSync(lat)) r.push(['Silkscreen', GlobalFonts.registerFromPath(lat, 'Silkscreen')]);
    if (fs.existsSync(latB)) r.push(['SilkscreenBold', GlobalFonts.registerFromPath(latB, 'SilkscreenBold')]);
    REGISTERED_FONTS.push(...r.filter(x => x[1]).map(x => x[0]));
  } catch (e) { console.warn('font register:', e.message); }

  const win = {
    devicePixelRatio: 1,
    innerWidth: FIELD_W, innerHeight: FIELD_H,
    Image, createCanvas, document,
    __madeCanvases: madeCanvases,
    AudioContext: makeAudioStub(),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => { },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() { },
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { getGamepads: () => [], userAgent: 'node-canvas' },
    location: { search: '', href: 'http://localhost/' },
    localStorage: (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })(),
    screen: { orientation: null },
    performance: { now: () => Date.now() },
    console, DPR: 1,
  };
  win.window = win; win.self = win; win.globalThis = win;
  return { win, listeners };
}

/** 本物の canvas に、トラッキングのための識別子を足すだけ（挙動は変えない） */
function patchCanvas(c) {
  c.__napi = true;
  if (!c.style) c.style = {};
  return c;
}

function makeAudioStub() {
  const node = () => ({
    connect() { }, disconnect() { }, start() { }, stop() { },
    gain: { value: 0, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { }, setTargetAtTime() { } },
    frequency: { value: 0, setValueAtTime() { }, exponentialRampToValueAtTime() { } },
    detune: { value: 0 }, pan: { value: 0 }, Q: { value: 0 }, type: '', buffer: null,
    setPeriodicWave() { }, playbackRate: { value: 1 },
  });
  return function () {
    return {
      sampleRate: 44100, currentTime: 0, state: 'running', destination: node(),
      createGain: node, createOscillator: node, createBiquadFilter: node,
      createBufferSource: node, createConvolver: node, createDynamicsCompressor: node,
      createStereoPanner: node, createPeriodicWave: () => ({}), resume() { }, suspend() { },
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len), length: len, numberOfChannels: ch }),
    };
  };
}

/* ============================================================ 読み込み == */
const vm = require('vm');
const { win, listeners } = makeBrowserShim();
const ctxVm = vm.createContext(win);
for (const rel of SOURCES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.warn('skip (not found):', rel); continue; }
  try {
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctxVm, { filename: rel });
  } catch (e) {
    console.error(`読み込み失敗 ${rel}: ${e.message}`);
    process.exit(1);
  }
}
const HN = win.HN;
HN.audio.init = () => false;   // 音は鳴らさない

// フォントを「読み込み済み」にする（ブラウザでは FontFace API がやることの代替）
if (REGISTERED_FONTS.length) {
  HN.Fonts.jp = 'FusionPixel12';
  HN.Fonts.latin = 'Silkscreen';
  HN.Fonts.latinBold = REGISTERED_FONTS.includes('SilkscreenBold') ? 'SilkscreenBold' : 'Silkscreen';
  HN.Fonts.ready = true;
  console.log('fonts:', REGISTERED_FONTS.join(', '));
} else {
  console.warn('WARNING: フォント未登録。日本語は豆腐（□）になります。');
}

/* ゲームが使う「メインキャンバス」を用意する（document に無いので手で付ける） */
const main = patchCanvas(createCanvas(FIELD_W, FIELD_H));
main.style = { width: FIELD_W + 'px', height: FIELD_H + 'px' };
main.getBoundingClientRect = () => ({ left: 0, top: 0, width: FIELD_W, height: FIELD_H });
document0(win, main);

function document0(win, canvas) {
  win.document.createElement = (tag) => {
    if (tag === 'canvas') return patchCanvas(createCanvas(300, 150));
    return { style: {}, appendChild() { }, addEventListener() { }, removeEventListener() { }, setAttribute() { }, classList: { add() { }, remove() { }, toggle() { } } };
  };
  win.document.getElementById = () => canvas;
  win.__mainCanvas = canvas;
}

/* 立ち絵・顔アイコンを実際にファイルから読ませる（ブラウザと同じ経路） */
HN.IMG.cutin = {}; HN.IMG.face = {};
const assetDir = path.join(ROOT, 'assets');
/**
 * 立ち絵・顔アイコンを実際にデコードして読み込む。
 * 注意: @napi-rs/canvas は Image.src に Buffer / data URI を渡すと
 * 幅・高さだけ返してピクセルをデコードしない（drawImage が無描画になる）。
 * またパスを渡した場合はロード完了が非同期になる。
 * → 必ず await してから撮影する。ここで待たないと「読み込んだつもり」で
 *    空の絵を量産してしまうので、検証ツールとしては致命的。
 */
const assetPromise = (async () => {
  const keys = Object.keys(HN.CHARS);
  const jobs = [];
  for (const key of keys) {
    for (const kind of ['cutin', 'face']) {
      const f = path.join(assetDir, kind, `${key}.png`);
      jobs.push((async () => {
        if (!fs.existsSync(f)) { HN.IMG[kind][key] = null; HN.IMG.failed.push(f); return; }
        try {
          const img = await loadImage(f);
          HN.IMG[kind][key] = img;
          if (!img || !img.width) HN.IMG.failed.push(f);
        } catch (e) { HN.IMG[kind][key] = null; HN.IMG.failed.push(f); }
      })());
    }
  }
  await Promise.all(jobs);
})();
HN.buildShip();
HN.Render.build();

/* ============================================================== ゲーム == */
const game = new HN.Game();
HN.game = game;
const G = HN.G;
game.canvas = win.__mainCanvas;
game.ctx = game.canvas.getContext('2d');
game.ctx.imageSmoothingEnabled = false;
const buf = HN.makeCanvas(FIELD_W, FIELD_H);
game.buf = buf.canvas; game.bctx = buf.ctx;
game.bctx.imageSmoothingEnabled = false;

// Input の代わり: 何も押されていない入力スタブ
const noKeys = Object.create(null);
game.input = {
  keys: noKeys, pressed: noKeys, released: noKeys,
  ptr: { x: 0, y: 0, active: false, down: false, dx: 0, dy: 0, id: -1, isTouch: false },
  moveVec: () => ({ x: 0, y: 0, active: false }),
  focusHeld: () => false,
  down: () => false, hit: () => false, up: () => false,
  endFrame() { }, anyInput: false, lastDevice: 'keyboard',
};

game.sys = new HN.BulletSystem(FIELD_W, FIELD_H);
game.bg = new HN.Background();
game.fx = new HN.Effects(FIELD_W, FIELD_H);
game.player = new HN.Player(FIELD_W, FIELD_H);
game.sys.player = game.player;
game.sys.onCancel = (b, silent) => { if (!silent) game.fx.bulletPop(b.x, b.y, game.rampNow, true); };
game.boss = new HN.Boss('mie', FIELD_W, FIELD_H);
HN.HUD.init();
game.scale = 1;
game.opt = { masterVol: .8, musicVol: .7, sfxVol: .8, muted: true, scanlines: true, ambient: true };
game.save = { unlocked: 4, cleared: [1, 1, 1, 1], best: {}, seenTutorial: true, seenIntro: {} };

/* ============================================================ 保存 ==== */
fs.mkdirSync(OUT, { recursive: true });
const index = [];
function saveCanvas(c, name) {
  const p = path.join(OUT, name + '.png');
  fs.writeFileSync(p, c.toBuffer('image/png'));
  index.push(name);
  return p;
}

/** 描画結果が「空ではない」ことを数値で確認する（黒画面の見逃し防止） */
function pixelStats(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0, sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] + d[i + 1] + d[i + 2];
    sum += v;
    if (v > 24) lit++;
  }
  return { lit, ratio: lit / (d.length / 4), avg: sum / (d.length / 4) };
}

/** シーンを n 秒ぶん進めて描画する */
function simulate(seconds, seed = 1) {
  const dt = 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    // プレイヤーは回避 AI を動かす（弾が当たって破綻しないように）
    if (game.dodger) {
      const mv = game.dodger.step(game.player.x, game.player.y, game.sys, dt, 285, 2.0,
        { x0: 8, y0: 8, x1: FIELD_W - 8, y1: FIELD_H - 8 });
      game.player.x += (mv.x - game.player.x) * 0.5;
      game.player.y += (mv.y - game.player.y) * 0.5;
    }
    game.updateIngame(dt);
  }
}

/* ======================================================= スクリーンショット == */
const shots = [];

function want(name) { return SHOTS.includes('all') || SHOTS.includes(name); }

/* --- 起動画面 --- */
if (want('boot')) {
  game.loadProg = 0.62;
  game.drawBoot();
  shots.push(['00-boot', () => { game.loadProg = 0.62; game.drawBoot(); }]);
}

/* --- タイトル --- */
if (want('title')) {
  G.state = 'title';
  HN.Screens.reset(['title']);
  HN.Screens.t = 3.2;
  shots.push(['01-title', () => { HN.Screens.t = 3.2; HN.Screens.draw(game.bctx, game, G); game.present(); }]);
  shots.push(['02-title-diff', () => { HN.Screens.reset(['title', 'diff']); HN.Screens.idx = 1; HN.Screens.draw(game.bctx, game, G); game.present(); }]);
  shots.push(['03-help', () => { HN.Screens.reset(['title', 'help']); HN.Screens.t = 1.1; HN.Screens.draw(game.bctx, game, G); game.present(); }]);
  shots.push(['04-archive', () => { HN.Screens.reset(['title', 'archive']); HN.Screens.scroll = 0; HN.Screens.draw(game.bctx, game, G); game.present(); }]);
  shots.push(['05-credits', () => { HN.Screens.reset(['title', 'credits']); HN.Screens.scroll = 0; HN.Screens.draw(game.bctx, game, G); game.present(); }]);
  shots.push(['06-practice', () => { HN.Screens.reset(['title', 'practice']); HN.Screens.idx = 3; HN.Screens.draw(game.bctx, game, G); game.present(); }]);
  shots.push(['07-tutorial', () => { HN.Screens.reset(['title', 'tutorial']); HN.Screens.t = 2.0; HN.Screens.draw(game.bctx, game, G); game.present(); }]);
}

/* --- 章の扉と導入会話 --- */
if (want('door') || want('talk')) {
  shots.push(['10-door', () => {
    game.startRun('NORMAL', 0, 'story');
    game.phaseState = 'door'; game.phaseStateT = 1.2;
    game.drawStageIntro(); game.present();
  }]);
  shots.push(['11-talk', () => {
    game.phaseState = 'talk'; game.introIdx = 2; game.lineT = 2.0;
    game.drawStageIntro(); game.present();
  }]);
  shots.push(['12-talk2', () => {
    game.phaseState = 'talk'; game.introIdx = 4; game.lineT = 2.0;
    game.drawStageIntro(); game.present();
  }]);
}

/* --- 各章の各フェーズ --- */
const stageList = WANT_STAGE != null ? [Number(WANT_STAGE) - 1]
  : (SHOTS.includes('all') ? [0, 1, 2, 3] : []);

for (const si of stageList) {
  const st = HN.STAGES[si];
  for (const dk of ['NORMAL']) {
    for (let pi = 0; pi < st.phases.length; pi++) {
      const ph = st.phases[pi];
      const name = `2${si}${pi}-s${si + 1}p${pi + 1}-${ph.name}`;
      shots.push([name, () => {
        game.startRun(dk, si, 'story');
        G.state = 'ingame';
        game.phaseState = 'idle';
        game.beginPhase(pi);
        game.phaseState = 'active'; game.phaseStateT = 0;
        game.showQuote = false;
        game.dodger = new (require('./dodger-ai').DodgerAI)(G.dif);
        // フェーズ中盤まで進める（弾が十分に出た状態を見る）
        simulate(Math.min(ph.duration * 0.72, 17));
        // 残り時間を「途中」に見せる
        G.phaseRemain = Math.max(6.4, ph.duration * 0.28);
        game.drawWorld();
        HN.HUD.draw(game.bctx, G);
        game.present();
      }]);
    }
  }
}

/* --- ボス単体（各ポーズ） --- */
if (want('boss')) {
  for (const [tkey, type] of Object.entries(HN.BOSS_TYPES)) {
    shots.push([`30-boss-${tkey}`, () => {
      game.bg.setStage(HN.STAGES[type.key === 'honshitsu' ? 3 : type.key === 'kuraishi' ? 2 : type.key === 'katsuya' ? 1 : 0]);
      game.bg.update(1 / 60, 0.8, 1);
      game.bctx.setTransform(1, 0, 0, 1, 0, 0);
      game.bg.draw(game.bctx);
      game.boss.setType(tkey);
      game.boss.x = FIELD_W / 2; game.boss.y = FIELD_H * 0.32;
      game.boss.pose = 'idle'; game.boss.auraTarget = 0.9; game.boss.auraLevel = 0.9;
      game.boss.t = 1.7;
      game.boss.draw(game.bctx, 1.7);
      HN.drawText(game.bctx, `${type.name} — ${type.title}`, FIELD_W / 2, 12,
        { size: 13, color: '#fffbe8', align: 'center', outline: 3 });
      const lines = type.lines.phase;
      lines.forEach((l, i) => {
        HN.drawText(game.bctx, l, FIELD_W / 2, 436 + i * 16,
          { size: 11, color: '#c9cfe2', align: 'center', outline: 2 });
      });
      game.present();
    }]);
  }
}

/* --- 弾の一覧（読みやすさの確認） --- */
if (want('bullets') || want('all')) {
  shots.push(['40-bullets', () => {
    game.bctx.setTransform(1, 0, 0, 1, 0, 0);
    game.bctx.fillStyle = '#0a0c14';
    game.bctx.fillRect(0, 0, FIELD_W, FIELD_H);
    // 背景の暗さを再現した上で全弾種を並べる
    game.bg.setStage(HN.STAGES[2]);
    game.bg.update(1 / 60, 0.3, 1); game.bg.draw(game.bctx);
    const keys = Object.keys(HN.BULLET);
    const cols = 6;
    keys.forEach((k, i) => {
      const x = 60 + (i % cols) * 104, y = 70 + Math.floor(i / cols) * 88;
      const def = HN.BULLET[k];
      game.bctx.save();
      game.bctx.translate(x, y);
      game.bctx.rotate(0);
      HN.drawBulletGlow(game.bctx, HN.Render.atlas, k, 0.75, 2.2);
      HN.drawBulletSprite(game.bctx, HN.Render.atlas, k, 0, 1, 2.2);
      game.bctx.restore();
      HN.drawText(game.bctx, k, x, y + 34, { size: 9, color: '#8b94ad', align: 'center', latin: true, outline: 2 });
    });
    HN.drawText(game.bctx, `弾 全 ${keys.length} 種（等倍の 2.2 倍表示）`, FIELD_W / 2, 24,
      { size: 13, color: '#fffbe8', align: 'center', outline: 3 });
    game.present();
  }]);
}

/* --- プレイヤー機体・集中モード --- */
if (want('ship') || want('all')) {
  shots.push(['41-ship', () => {
    game.bctx.setTransform(1, 0, 0, 1, 0, 0);
    game.bctx.fillStyle = '#0a0c14';
    game.bctx.fillRect(0, 0, FIELD_W, FIELD_H);
    game.bg.setStage(HN.STAGES[0]);
    game.bg.update(1 / 60, 0.4, 1); game.bg.draw(game.bctx);
    HN.drawText(game.bctx, '自機 — 紙飛行機（原作に固有の設定は無く、本作の独自制作）', FIELD_W / 2, 20,
      { size: 12, color: '#fffbe8', align: 'center', outline: 3 });
    const keys = ['neutral', 'left', 'right'];
    keys.forEach((k, i) => {
      const x = 110 + i * 200, y = 150;
      const fr = HN.SHIP.frames[k];
      game.bctx.drawImage(fr.canvas, x - 40, y - 40, 80, 80);
      HN.drawText(game.bctx, k, x, y + 52, { size: 10, color: '#8b94ad', align: 'center', latin: true, outline: 2 });
    });
    ['neutral', 'left', 'right'].forEach((k, i) => {
      const x = 110 + i * 200, y = 300;
      const fr = HN.SHIP.focused[k];
      game.bctx.drawImage(fr.canvas, x - 40, y - 40, 80, 80);
      HN.drawText(game.bctx, `${k} (集中)`, x, y + 52, { size: 10, color: '#f0cf6a', align: 'center', outline: 2 });
    });
    HN.drawText(game.bctx, '当たり判定は中心の 2 px（集中時に赤い輪で可視化）', FIELD_W / 2, 400,
      { size: 10, color: '#8b94ad', align: 'center', outline: 2 });
    game.present();
  }]);
}

/* --- 背景 4 種 --- */
if (want('bg') || want('all')) {
  for (let i = 0; i < HN.STAGES.length; i++) {
    shots.push([`42-bg-stage${i + 1}`, () => {
      const st = HN.STAGES[i];
      game.bg.setStage(st);
      game.bg.update(1 / 60, 0.55, 1);
      game.bctx.setTransform(1, 0, 0, 1, 0, 0);
      game.bg.draw(game.bctx);
      HN.drawText(game.bctx, `背景 — 第${i + 1}章 ${st.title}（${st.bg}）`, FIELD_W / 2, 14,
        { size: 12, color: '#fffbe8', align: 'center', outline: 3 });
      game.present();
    }]);
  }
}

/* --- 一時停止・ゲームオーバー・リザルト --- */
if (want('ui') || want('camera') || want('all')) {
  shots.push(['50-pause', () => {
    game.startRun('HARD', 1, 'story');
    G.state = 'ingame'; game.phaseState = 'idle'; game.beginPhase(1);
    game.phaseState = 'active'; game.phaseStateT = 0;
    game.dodger = new (require('./dodger-ai').DodgerAI)(G.dif);
    simulate(9);
    game.pauseIdx = 1;
    game.drawPaused();
  }]);
  shots.push(['51-gameover', () => {
    game.startRun('HARD', 2, 'story');
    G.state = 'ingame'; game.phaseState = 'idle'; game.beginPhase(3);
    game.phaseState = 'active'; game.phaseStateT = 0;
    game.dodger = new (require('./dodger-ai').DodgerAI)(G.dif);
    simulate(12);
    G.lives = -1; game.goIdx = 0;
    game.setState('gameover');
    game.drawGameOver();
  }]);
  shots.push(['52-results', () => {
    game.startRun('NORMAL', 1, 'story');
    G.state = 'ingame'; game.phaseState = 'active';
    game.resultPhase = 'board'; game.idx2 = 0;
    game.results = {
      stage: HN.STAGES[1].title, score: 482300, graze: 612, misses: 0,
      observations: 3, noMiss: true, lives: 3, dif: 'NORMAL', time: 118.4,
      mode: 'story', phases: 4,
    };
    game.drawResults();
  }]);
  shots.push(['53-outro', () => {
    game.startRun('NORMAL', 3, 'story');
    game.resultPhase = 'talk'; game.resultIdx = 1; game.resultT = 1.4;
    game.outro = HN.OUTROS[4].slice();
    game.results = { stage: HN.STAGES[3].title, score: 1, graze: 1, dif: 'NORMAL' };
    game.drawResults();
  }]);
  shots.push(['54-allclear', () => {
    game.startRun('NORMAL', 3, 'story');
    game.acPhase = 'end'; game.results = { stage: HN.STAGES[3].title, score: 981240, graze: 2140, misses: 1, dif: 'NORMAL' };
    G.stateT = 1.0;
    G.state = 'allclear';
    game.drawAllClear();
  }]);
  shots.push(['55-quote', () => {
    game.startRun('NORMAL', 1, 'story');
    G.state = 'ingame'; game.phaseState = 'idle'; game.beginPhase(2);
    game.phaseState = 'intro'; game.phaseStateT = 0.9;
    game.dodger = new (require('./dodger-ai').DodgerAI)(G.dif);
    simulate(1.2);
    game.drawWorld();
    HN.HUD.draw(game.bctx, G);
    game.drawQuote();
    game.present();
  }]);

  /* フェーズ移行のカメラワーク。beginPhase 直後の 1 フレームを撮る
   * （simulate するとカメラが戻ってしまうため、ここだけは進めない）。 */
  shots.push(['56-camera', () => {
    game.startRun('NORMAL', 3, 'story');
    G.state = 'ingame'; game.phaseState = 'idle';
    game.beginPhase(3);
    game.drawWorld();
    HN.HUD.draw(game.bctx, G);
    game.present();
  }]);

  /* タッチ端末用の画面内ボタン。弾幕の上に出る唯一の UI なので、
   * 実際に HUD の上へ描いた状態を撮って、弾の視認性を損なわないか確かめる。 */
  shots.push(['57-touchui', () => {
    game.startRun('NORMAL', 0, 'story');
    G.state = 'ingame'; game.phaseState = 'idle'; game.beginPhase(1);
    const prev = HN.touchUsed; HN.touchUsed = true;
    const d = new (require('./dodger-ai').DodgerAI)(G.dif);
    const t0 = G.time;
    game.dodger = d;
    simulate(6.0);
    game.drawWorld();
    HN.HUD.draw(game.bctx, G);
    game.present();
    HN.touchUsed = prev;
  }]);

  /* ポーズ画面（タップで項目を選ぶ注記つき） */
  shots.push(['58-pause-touch', () => {
    game.startRun('NORMAL', 0, 'story');
    G.state = 'ingame'; game.phaseState = 'idle'; game.beginPhase(1);
    const prev = HN.touchUsed; HN.touchUsed = true;
    simulate(2.0);
    game.paused = true; game.pauseIdx = 2;
    game.drawPaused();
    HN.touchUsed = prev;
  }]);
}

/* --- 密度テスト: わざと最密状態を作って視認性を確かめる --- */
if (want('dense') || want('all')) {
  shots.push(['60-dense-easy', denseShot('EASY')]);
  shots.push(['61-dense-normal', denseShot('NORMAL')]);
  shots.push(['62-dense-hard', denseShot('HARD')]);
}
function denseShot(dk) {
  return () => {
    game.startRun(dk, 3, 'story');
    G.state = 'ingame';
    const list = HN.phasesFor(HN.STAGES[3], G.dif);
    const last = list.length - 1;   // EASY はフェーズ数が少ないので必ずフィルタ後を使う
    game.phaseState = 'idle';
    game.beginPhase(last);
    game.phaseState = 'active'; game.phaseStateT = 0;
    game.dodger = new (require('./dodger-ai').DodgerAI)(G.dif);
    simulate(24);
    game.phaseStateT = 26;   // 全てのレイヤーが同時に出ている状態
    simulate(2);
    G.phaseRemain = 5.9;
    game.drawWorld();
    HN.HUD.draw(game.bctx, G);
    game.present();
    // 検証用の注記（日本語を含むので latin を使わない）
    HN.drawText(game.ctx, `${dk}  弾数 ${game.sys.count}`, 160, 6,
      { size: 10, color: '#8b94ad', outline: 2 });
  };
}

/* ============================================================== 実行 ==== */
(async () => {
// 画像の読み込みを待つ（これを忘れると空の立ち絵を量産する）
await assetPromise;
const nChars = Object.keys(HN.CHARS).length;
const nCutin = Object.values(HN.IMG.cutin).filter(i => i && i.width).length;
const nFace = Object.values(HN.IMG.face).filter(i => i && i.width).length;
console.log(`立ち絵 ${nCutin}/${nChars} 枚 / 顔 ${nFace}/${nChars} 枚 を読み込み`);
if (nCutin < nChars || nFace < nChars) {
  console.error('WARNING: 読み込めなかった画像があります:', HN.IMG.failed);
}

console.log(`✝本質✝ フレーム書き出し → ${path.relative(ROOT, OUT)}/`);
let okCount = 0, failCount = 0;
for (const [name, fn] of shots) {
  let label = name;
  try {
    fn();
    const st = pixelStats(win.__mainCanvas);
    const p = saveCanvas(win.__mainCanvas, name);
    const kb = (fs.statSync(p).size / 1024).toFixed(1);
    // 「真っ黒なだけ」を成功扱いにしないための下限チェック
    const empty = st.ratio < 0.004;
    console.log(`  ${empty ? '!' : '✓'} ${name.padEnd(30)} ${kb.padStart(7)} KB  明点 ${(st.ratio * 100).toFixed(2)}%`);
    if (empty) { failCount++; console.error(`    ↑ ほぼ空の画面です（描画されていない可能性）`); }
    else okCount++;
  } catch (e) {
    failCount++;
    console.error(`  ✗ ${label.padEnd(30)} ${e.message}`);
    if (process.env.VERBOSE) console.error(e.stack);
  }
}
console.log(`\n完了: ${okCount} 枚 / 失敗 ${failCount} 件`);
console.log(`出力先: ${OUT}`);
if (index.length) {
  fs.writeFileSync(path.join(OUT, 'index.txt'), index.join('\n') + '\n');
}
process.exit(failCount ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
