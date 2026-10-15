/* =============================================================================
 * tools/headless.js — Node 上でゲーム・ロジックを読み込むための最小シム
 *
 *  ブラウザ無しで「弾幕パターン」「フェーズ進行」「衝突判定」を実際に走らせて
 *  検証するための環境。描画系（Canvas）はスタブ化し、ロジックは本物を使う。
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/** Canvas 2D コンテキストのスタブ（描画結果は検証対象外なので no-op） */
function makeCtxStub() {
  const noop = () => { };
  const ctx = {
    canvas: null,
    imageSmoothingEnabled: false, globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top',
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, transform: noop, setTransform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, rect: noop,
    ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, clip: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop, drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: noop, setLineDash: noop, measureText: (t) => ({ width: (t || '').length * 6 }),
  };
  return ctx;
}

function makeCanvasStub(w = 300, h = 150) {
  const c = { width: w, height: h, style: {}, getContext: () => makeCtxStub() };
  c.getContext = () => { const x = makeCtxStub(); x.canvas = c; return x; };
  c.toDataURL = () => 'data:,';
  c.addEventListener = () => { };
  c.removeEventListener = () => { };
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: c.width, height: c.height });
  c.setPointerCapture = () => { };
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
  const AC = function () {
    return {
      sampleRate: 44100, currentTime: 0, state: 'running', destination: node(),
      createGain: node, createOscillator: node, createBiquadFilter: node,
      createBufferSource: node, createConvolver: node, createDynamicsCompressor: node,
      createStereoPanner: node, createPeriodicWave: () => ({}), resume() { }, suspend() { },
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    };
  };
  return AC;
}

/** 依存順に読み込むソース一覧 */
const SOURCES = [
  'src/core/util.js',
  'src/core/input.js',
  'src/core/audio.js',
  'src/audio/music.js',
  'src/art/palette.js',
  'src/art/glyph.js',
  'src/art/bullets.js',
  'src/art/sprites.js',
  'src/art/render.js',
  'src/art/characters.js',
  'src/art/bosses.js',
  'src/art/backgrounds.js',
  'src/art/effects.js',
  'src/game/difficulty.js',
  'src/game/bulletsys.js',
  'src/game/patterns.js',
  'src/game/player.js',
  'src/game/boss.js',
  'src/game/stages.js',
  'src/game/game.js',
  'src/data/script.js',
  'src/ui/hud.js',
  'src/ui/screens.js',
];

function createSandbox(extra = {}) {
  const listeners = {};
  const document = {
    createElement: (tag) => {
      if (tag === 'canvas') return makeCanvasStub();
      return { style: {}, appendChild() { }, addEventListener() { }, removeEventListener() { }, setAttribute() { }, classList: { add() { }, remove() { }, toggle() { } } };
    },
    getElementById: () => makeCanvasStub(),
    querySelector: () => makeCanvasStub(),
    documentElement: { requestFullscreen: () => Promise.resolve(), style: {} },
    body: { appendChild() { }, style: {} },
    addEventListener() { }, removeEventListener() { },
    fullscreenElement: null, exitFullscreen: () => Promise.resolve(),
  };
  const win = {
    devicePixelRatio: 1,
    innerWidth: 1280, innerHeight: 720,
    document,
    AudioContext: makeAudioStub(),
    requestAnimationFrame: (cb) => 0,
    cancelAnimationFrame: () => { },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() { },
    setTimeout, clearTimeout, setInterval, clearInterval,
    navigator: { getGamepads: () => [], userAgent: 'node' },
    location: { search: '', href: 'http://localhost/' },
    localStorage: (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })(),
    screen: { orientation: null },
    performance: { now: () => Date.now() },
    console,
    DPR: 1,
    ...extra,
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  const ctx = vm.createContext(win);
  return { win, ctx, listeners };
}

/** ソース群を順に評価して window.HN を構築する */
function loadGame(opts = {}) {
  const { win, ctx } = createSandbox(opts.globals || {});
  const loaded = [];
  for (const rel of (opts.sources || SOURCES)) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { continue; }
    const code = fs.readFileSync(p, 'utf8');
    try {
      vm.runInContext(code, ctx, { filename: rel });
      loaded.push(rel);
    } catch (e) {
      throw new Error(`読み込み失敗 ${rel}: ${e.message}\n${e.stack}`);
    }
  }
  return { HN: win.HN, win, ctx, loaded };
}

module.exports = { loadGame, createSandbox, makeCanvasStub, SOURCES, ROOT };
