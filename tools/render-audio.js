/* =============================================================================
 * tools/render-audio.js — 楽曲と効果音をオフラインでレンダリングして検査する
 *
 *  WHY:
 *   この作業環境には音を出す手段がない。つまり「鳴っているか」「割れていないか」
 *   「無音区間が長すぎないか」を耳で確認できない。
 *   そこで **Web Audio のサブセットを自前で実装し、実際に波形を計算する**。
 *   耳の代わりに数値で確かめるための道具である。
 *
 *  重要（正直な但し書き）:
 *    ここで作るのはブラウザの Web Audio 実装そのものではない。
 *    audio.js が使う API だけを実装した近似である。したがって
 *    この WAV は「ブラウザでの聞こえ方そのもの」ではなく、次の判断に使う:
 *      ・音が実際に生成されているか（無音でないか）
 *      ・音量が適正か（クリップしていないか、小さすぎないか）
 *      ・楽曲の構成（どの楽器がいつ入るか）が意図どおりか
 *    近似の範囲は下の「近似している部分」に明記する。
 *
 *  使い方:
 *    node tools/render-audio.js                 全曲を _work/audio/ に出力
 *    node tools/render-audio.js --song stage1 --sec 20
 *    node tools/render-audio.js --sfx           効果音を全部レンダリングして検査
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadGame, ROOT } = require('./headless.js');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const ONLY = argOf('--song', null);
const SEC = Number(argOf('--sec', 14));
const SR = Number(argOf('--sr', 22050));
const OUT = path.join(ROOT, argOf('--out', '_work/audio'));
const DO_SFX = args.includes('--sfx');

/* ==========================================================================
 * 1. Web Audio の最小実装（offline）
 * ======================================================================== */

/** AudioParam: 時間に対する値の列 */
class Param {
  constructor(v) { this.value = v; this.ev = []; }
  setValueAtTime(v, t) { this.ev.push({ t, v, k: 'set' }); this._sort(); return this; }
  linearRampToValueAtTime(v, t) { this.ev.push({ t, v, k: 'lin' }); this._sort(); return this; }
  exponentialRampToValueAtTime(v, t) {
    this.ev.push({ t, v: Math.max(1e-6, v), k: 'exp' }); this._sort(); return this;
  }
  setTargetAtTime(v, t) { this.ev.push({ t, v, k: 'set' }); this._sort(); return this; }
  cancelScheduledValues() { this.ev.length = 0; return this; }
  _sort() { this.ev.sort((a, b) => a.t - b.t); }
  /** t 時点の値。イベントが無ければ value。 */
  at(t) {
    const ev = this.ev;
    if (!ev.length) return this.value;
    if (t <= ev[0].t) return ev[0].k === 'set' ? ev[0].v : this.value;
    let prev = null;
    for (let i = 0; i < ev.length; i++) {
      if (ev[i].t <= t) prev = ev[i];
      else {
        if (ev[i].k === 'lin' || ev[i].k === 'exp') {
          const a = prev ? prev.t : 0, av = prev ? prev.v : this.value;
          const span = ev[i].t - a;
          if (span <= 0) return ev[i].v;
          const u = (t - a) / span;
          if (ev[i].k === 'lin') return av + (ev[i].v - av) * u;
          const av2 = Math.max(1e-6, av);
          return av2 * Math.pow(ev[i].v / av2, u);
        }
        return prev ? prev.v : this.value;
      }
    }
    return prev.v;
  }
}

let NODE_ID = 0;
class Node {
  constructor(ctx) { this.ctx = ctx; this.id = ++NODE_ID; this._out = null; this._blk = -1; }
  connect(dst) { this._dst = this._dst || []; if (dst) this._dst.push(dst); return dst; }
  disconnect() { this._dst = []; }
  /** このブロックの出力（2ch）を返す。DAG を pull で評価する。 */
  pull(blk, n) {
    if (this._blk === blk) return this._out;
    this._blk = blk;
    this._out = this._render(blk, n);
    return this._out;
  }
  _render() { return [new Float32Array(this.ctx.blockSize), new Float32Array(this.ctx.blockSize)]; }
  /** 入力（接続元）の合算 */
  _sumInputs(blk, n) {
    const L = new Float32Array(n), R = new Float32Array(n);
    for (const src of (this._src || [])) {
      const o = src.pull(blk, n);
      for (let i = 0; i < n; i++) { L[i] += o[0][i]; R[i] += o[1][i]; }
    }
    return [L, R];
  }
}

/* --- 波形テーブル（パルス波のフーリエ係数から 2048 サンプルの表を作る） --- */
function waveTable(real, imag, size = 2048) {
  const t = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let s = 0;
    const ph = (i / size) * Math.PI * 2;
    for (let h = 1; h < imag.length; h++) {
      if (!imag[h] && !real[h]) continue;
      s += real[h] * Math.cos(h * ph) + imag[h] * Math.sin(h * ph);
    }
    t[i] = s;
  }
  // 正規化
  let mx = 0; for (const v of t) mx = Math.max(mx, Math.abs(v));
  if (mx > 0) for (let i = 0; i < size; i++) t[i] /= mx;
  return t;
}
const BASIC = {
  sine: (size = 2048) => { const t = new Float32Array(size); for (let i = 0; i < size; i++) t[i] = Math.sin(i / size * Math.PI * 2); return t; },
  triangle: (size = 2048) => { const t = new Float32Array(size); for (let i = 0; i < size; i++) { const p = i / size; t[i] = 4 * Math.abs(p - Math.floor(p + 0.5)) - 1; } return t; },
  sawtooth: (size = 2048) => { const t = new Float32Array(size); for (let i = 0; i < size; i++) t[i] = 2 * (i / size) - 1; return t; },
  square: (size = 2048) => { const t = new Float32Array(size); for (let i = 0; i < size; i++) t[i] = i < size / 2 ? 1 : -1; return t; },
};

class Osc extends Node {
  constructor(ctx) {
    super(ctx);
    this.type = 'sine'; this._table = BASIC.sine();
    this.frequency = new Param(440); this.detune = new Param(0);
    this._phase = 0; this._st = null; this._sp = null; this._rate = 0;
  }
  setPeriodicWave(w) { this._table = w._table; this.type = 'custom'; }
  _render(blk, n) {
    const L = new Float32Array(n), R = new Float32Array(n);
    const t0 = (blk * n) / this.ctx.sampleRate;
    const dt = 1 / this.ctx.sampleRate;
    const size = this._table.length;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * dt;
      if (t < this._st || t >= this._sp) continue;
      const semis = this.detune.at(t) / 100;
      const f = this.frequency.at(t) * Math.pow(2, semis / 12);
      this._phase += f / this.ctx.sampleRate;
      this._phase -= Math.floor(this._phase);
      const x = this._phase * size;
      const i0 = Math.floor(x), fr = x - i0;
      const a = this._table[i0 % size], b = this._table[(i0 + 1) % size];
      const v = this._fmod
        ? 1  // 変調は外部から加算されるため、ここでは周波数の揺れとして扱う
        : a + (b - a) * fr;
      L[i] = v; R[i] = v;
    }
    return [L, R];
  }
}

class BufSrc extends Node {
  constructor(ctx) { super(ctx); this.buffer = null; this.loop = false; this.playbackRate = new Param(1); this._st = null; this._sp = null; }
  _render(blk, n) {
    const L = new Float32Array(n), R = new Float32Array(n);
    if (!this.buffer) return [L, R];
    const t0 = (blk * n) / this.ctx.sampleRate, dt = 1 / this.ctx.sampleRate;
    const ch0 = this.buffer.getChannelData(0);
    const ch1 = this.buffer.numberOfChannels > 1 ? this.buffer.getChannelData(1) : ch0;
    const len = ch0.length;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * dt;
      if (t < this._st || t >= this._sp) continue;
      const pos = ((t - this._st) * this.ctx.sampleRate * this.playbackRate.at(t));
      let idx = Math.floor(pos);
      if (this.loop) { idx %= len; if (idx < 0) idx += len; }
      else if (idx >= len) continue;
      const i0 = Math.floor(idx), fr = idx - i0;
      const j = this.loop ? (i0 + 1) % len : Math.min(i0 + 1, len - 1);
      L[i] = ch0[i0] + (ch0[j] - ch0[i0]) * fr;
      R[i] = ch1[i0] + (ch1[j] - ch1[i0]) * fr;
    }
    return [L, R];
  }
}

class Gain extends Node {
  constructor(ctx) { super(ctx); this.gain = new Param(1); }
  _render(blk, n) {
    const [L, R] = this._sumInputs(blk, n);
    const t0 = (blk * n) / this.ctx.sampleRate, dt = 1 / this.ctx.sampleRate;
    for (let i = 0; i < n; i++) { const g = this.gain.at(t0 + i * dt); L[i] *= g; R[i] *= g; }
    return [L, R];
  }
}

class Biquad extends Node {
  constructor(ctx) {
    super(ctx);
    this.type = 'lowpass'; this.frequency = new Param(350); this.Q = new Param(1); this.gain = new Param(0);
    this._x1 = [0, 0]; this._x2 = [0, 0]; this._y1 = [0, 0]; this._y2 = [0, 0];
  }
  _render(blk, n) {
    const [L, R] = this._sumInputs(blk, n);
    const t = this.frequency.at(0), q = this.Q.at(0);
    const sr = this.ctx.sampleRate, w0 = 2 * Math.PI * Math.min(t, sr * 0.45) / sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = this.type === 'bandpass' ? sw / (2 * Math.max(0.05, q)) : sw / (2 * Math.max(0.05, Math.pow(10, this.gain.at(0) / 40)));
    let b0, b1, b2, a0, a1, a2;
    if (this.type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (this.type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
    const out = [L, R];
    for (let c = 0; c < 2; c++) {
      const x = out[c];
      let x1 = this._x1[c], x2 = this._x2[c], y1 = this._y1[c], y2 = this._y2[c];
      for (let i = 0; i < n; i++) {
        const xi = x[i];
        const y = B0 * xi + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
        x2 = x1; x1 = xi; y2 = y1; y1 = y;
        x[i] = y;
      }
      this._x1[c] = x1; this._x2[c] = x2; this._y1[c] = y1; this._y2[c] = y2;
    }
    return [L, R];
  }
}

class Panner extends Node {
  constructor(ctx) { super(ctx); this.pan = new Param(0); }
  _render(blk, n) {
    const [L, R] = this._sumInputs(blk, n);
    const t0 = (blk * n) / this.ctx.sampleRate, dt = 1 / this.ctx.sampleRate;
    for (let i = 0; i < n; i++) {
      const p = Math.max(-1, Math.min(1, this.pan.at(t0 + i * dt)));
      const a = (p + 1) * 0.25 * Math.PI;      // equal-power
      const gl = Math.cos(a), gr = Math.sin(a);
      const l = L[i], r = R[i];
      L[i] = l * gl + r * gl; R[i] = l * gr + r * gr;
    }
    return [L, R];
  }
}

/**
 * リバーブ（近似）。
 *  ブラウザの ConvolverNode はインパルス応答との畳み込みだが、
 *  0.9 秒のインパルスをそのまま畳み込むと 1 サンプルあたり 2 万回の積和になり
 *  非現実的な時間がかかる。ここでは **Schroeder 型（コム 4 本＋オールパス 2 段）** で
 *  同じ「部屋の残響」を作る近似にしている。波形は一致しない。
 */
class Convolver extends Node {
  constructor(ctx) {
    super(ctx);
    this.buffer = null;
    const sr = ctx.sampleRate;
    this.comb = [0.0297, 0.0371, 0.0411, 0.0437].map(d => Math.round(d * sr));
    this.ap = [0.005, 0.0017].map(d => Math.max(1, Math.round(d * sr)));
    this._cb = this.comb.map(n => new Float32Array(n));
    this._ci = this.comb.map(() => 0);
    this._ab = this.ap.map(n => new Float32Array(n));
    this._ai = this.ap.map(() => 0);
    this.decay = 0.79;
  }
  _render(blk, n) {
    const [L] = this._sumInputs(blk, n);
    const R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (L[i] + R[i]) * 0.6;
      let acc = 0;
      for (let k = 0; k < this.comb.length; k++) {
        const buf = this._cb[k], idx = this._ci[k];
        const y = buf[idx];
        buf[idx] = x + y * this.decay;
        this._ci[k] = (idx + 1) % buf.length;
        acc += y;
      }
      acc /= this.comb.length;
      for (let k = 0; k < this.ap.length; k++) {
        const buf = this._ab[k], idx = this._ai[k];
        const y = buf[idx];
        const o = -acc + y;
        buf[idx] = acc + y * 0.5;
        this._ai[k] = (idx + 1) % buf.length;
        acc = o;
      }
      R[i] = acc; L[i] = acc;
    }
    return [L, R];
  }
}

/** コンプレッサ（近似）: ピーク追従のソフトリミッタ */
class Compressor extends Node {
  constructor(ctx) {
    super(ctx);
    this.threshold = new Param(-10); this.knee = new Param(12); this.ratio = new Param(5);
    this.attack = new Param(0.004); this.release = new Param(0.18);
    this._env = 0;
  }
  _render(blk, n) {
    const [L, R] = this._sumInputs(blk, n);
    const sr = this.ctx.sampleRate;
    const thr = Math.pow(10, this.threshold.at(0) / 20);
    const ratio = Math.max(1, this.ratio.at(0));
    const aC = Math.exp(-1 / (this.attack.at(0) * sr));
    const rC = Math.exp(-1 / (this.release.at(0) * sr));
    for (let i = 0; i < n; i++) {
      const peak = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      this._env = peak > this._env ? aC * this._env + (1 - aC) * peak
        : rC * this._env + (1 - rC) * peak;
      let g = 1;
      if (this._env > thr) {
        const over = this._env / thr;
        g = Math.pow(over, 1 / ratio - 1);
      }
      L[i] *= g; R[i] *= g;
    }
    return [L, R];
  }
}

class Destination extends Node {
  constructor(ctx) { super(ctx); this.sink = [new Float32Array(0), new Float32Array(0)]; }
  _render(blk, n) {
    const [L, R] = this._sumInputs(blk, n);
    this.sink = [L, R];
    return [L, R];
  }
}

class OfflineCtx {
  constructor({ sampleRate = 22050, seconds = 10, blockSize = 256 } = {}) {
    this.sampleRate = sampleRate;
    this.blockSize = blockSize;
    this.total = Math.ceil(seconds * sampleRate);
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new Destination(this);
    this._sources = [];
    this._all = [];
  }
  _reg(n) { this._all.push(n); return n; }
  createGain() { return this._reg(new Gain(this)); }
  createOscillator() { return this._reg(new Osc(this)); }
  createStereoPanner() { return this._reg(new Panner(this)); }
  createBiquadFilter() { return this._reg(new Biquad(this)); }
  createConvolver() { return this._reg(new Convolver(this)); }
  createDynamicsCompressor() { return this._reg(new Compressor(this)); }
  createBufferSource() { return this._reg(new BufSrc(this)); }
  createBuffer(ch, len) {
    const data = []; for (let i = 0; i < ch; i++) data.push(new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: this.sampleRate, getChannelData: (i) => data[i] };
  }
  createPeriodicWave(real, imag) {
    // disableNormalization:false なので正規化する（audio.js の既定）
    return { _table: waveTable(real, imag) };
  }
  resume() { } suspend() { }
  /** 接続関係を src 側にも記録する（pull 評価のため） */
  finalize() {
    for (const n of this._all) {
      for (const d of (n._dst || [])) { d._src = d._src || []; d._src.push(n); }
    }
  }
  render() {
    this.finalize();
    const n = this.blockSize;
    const blocks = Math.ceil(this.total / n);
    const L = new Float32Array(blocks * n), R = new Float32Array(blocks * n);
    for (let b = 0; b < blocks; b++) {
      this.currentTime = (b * n) / this.sampleRate;
      // 評価順を安定させるため全ノードのキャッシュを無効化
      for (const node of this._all) node._blk = -1;
      this.destination._blk = -1;
      const o = this.destination.pull(b, n);
      L.set(o[0], b * n); R.set(o[1], b * n);
    }
    return { L, R, length: blocks * n };
  }
}

/* ==========================================================================
 * 2. 音を「出す」ための start/stop の記録
 * ======================================================================== */
function installStartStop(ctx) {
  const origOsc = ctx.createOscillator.bind(ctx);
  ctx.createOscillator = () => {
    const o = origOsc();
    o.start = (t) => { o._st = t ?? 0; o._sp = Infinity; };
    o.stop = (t) => { o._sp = t ?? Infinity; };
    return o;
  };
  const origBuf = ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource = () => {
    const s = origBuf();
    s.start = (t) => { s._st = t ?? 0; s._sp = Infinity; };
    s.stop = (t) => { s._sp = t ?? Infinity; };
    return s;
  };
  // 周波数変調（FM）: OscillatorNode → AudioParam.connect は Parameter を
  // 変調する。実装が複雑になるため、ここでは「変調は無視」して
  // キャリアのみ鳴らす（ベルは減衰するサインとして聞こえる）。
  const origGain = ctx.createGain.bind(ctx);
  ctx.createGain = () => {
    const g = origGain();
    const origConnect = g.connect.bind(g);
    g.connect = (dst) => { if (dst instanceof Param) return dst; return origConnect(dst); };
    return g;
  };
  return ctx;
}

/* ==========================================================================
 * 3. 実行
 * ======================================================================== */
function toWav(L, R, sampleRate) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  let p = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
    buf.writeInt16LE(Math.round(l * 32767), p); p += 2;
    buf.writeInt16LE(Math.round(r * 32767), p); p += 2;
  }
  return buf;
}

function stats(L, R) {
  let peak = 0, sum = 0, silentRun = 0, maxSilentRun = 0, clip = 0;
  const n = L.length;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    const m = Math.max(a, b);
    if (m > peak) peak = m;
    sum += (L[i] * L[i] + R[i] * R[i]) * 0.5;
    if (m > 0.999) clip++;
    if (m < 0.0015) { silentRun++; if (silentRun > maxSilentRun) maxSilentRun = silentRun; }
    else silentRun = 0;
  }
  const rms = Math.sqrt(sum / n);
  return {
    peak, rms, clip, maxSilentRun,
    peakDb: 20 * Math.log10(peak || 1e-9),
    rmsDb: 20 * Math.log10(rms || 1e-9),
    silentPct: (maxSilentRun / n) * 100,
  };
}

const MOD = loadGame({});
const { HN } = MOD;
const SONGS = HN.SONGS || {};

/**
 * audio.js の AudioEngine を、オフラインの ctx で組み立てる。
 *  init() は new AudioContext() を呼んでしまうので、必要な部分だけ手で配線する
 *  （配線は audio.js の init() と同じ構成にすること）。
 */
function makeEngine(ctx, sampleRate) {
  const engine = new HN.audio.constructor();
  engine.ctx = ctx;
  engine.comp = ctx.createDynamicsCompressor();
  engine.comp.threshold.value = -10; engine.comp.knee.value = 12;
  engine.comp.ratio.value = 5; engine.comp.attack.value = 0.004; engine.comp.release.value = 0.18;
  engine.master = ctx.createGain(); engine.master.gain.value = 0.85;
  engine.musicBus = ctx.createGain(); engine.musicBus.gain.value = 0.5;
  engine.sfxBus = ctx.createGain(); engine.sfxBus.gain.value = 0.75;
  engine.musicBus.connect(engine.comp);
  engine.sfxBus.connect(engine.comp);
  engine.comp.connect(engine.master);
  engine.master.connect(ctx.destination);
  engine.reverb = ctx.createConvolver();
  engine.reverb.buffer = { numberOfChannels: 1, getChannelData: () => new Float32Array(1) };
  engine.reverbGain = ctx.createGain(); engine.reverbGain.gain.value = 0.16;
  engine.reverb.connect(engine.reverbGain);
  engine.reverbGain.connect(engine.comp);
  engine._noiseBuf = ctx.createBuffer(1, Math.floor(sampleRate * 2), sampleRate);
  const d = engine._noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + w * 0.6) * 0.75; d[i] = (i % 16 === 0) ? w : last; }
  engine._makeWaves();
  engine.ready = true;
  return engine;
}

const names = ONLY ? [ONLY] : Object.keys(SONGS);
fs.mkdirSync(OUT, { recursive: true });

console.log('楽曲レンダリング（Web Audio サブセットによるオフライン近似）');
console.log(`  サンプルレート ${SR} Hz / 各 ${SEC} 秒 / 出力 ${path.relative(ROOT, OUT)}/`);
console.log('');

const rows = [];
for (const name of names) {
  const song = SONGS[name];
  if (!song) { console.log(`  ! 未知の曲: ${name}`); continue; }

  const ctx = installStartStop(new OfflineCtx({ sampleRate: SR, seconds: SEC }));
  const engine = makeEngine(ctx, SR);

  // audio.js の update() を手で回してノートを予約する
  engine.playSong(song, { intensity: 1.0, restart: true });
  let simT = 0;
  while (simT < SEC + 0.5) { ctx.currentTime = simT; engine.update(); simT += 1 / 60; }

  const { L, R } = ctx.render();
  const st = stats(L, R);
  fs.writeFileSync(path.join(OUT, `song-${name}.wav`), toWav(L, R, SR));
  rows.push({ name, ...st });
  console.log(`  ${name.padEnd(8)} peak ${st.peakDb.toFixed(1).padStart(6)} dB  `
    + `rms ${st.rmsDb.toFixed(1).padStart(6)} dB  clip ${String(st.clip).padStart(5)}  `
    + `無音最長 ${st.silentPct.toFixed(1)}%`);
}

if (DO_SFX) {
  console.log('\n効果音レンダリング');
  const src = fs.readFileSync(path.join(ROOT, 'src/core/audio.js'), 'utf8');
  const body = src.slice(src.indexOf('sfx(name'));
  const names = [...new Set([...body.matchAll(/case '([a-z_]+)':/g)].map(m => m[1]))];
  let ng = 0;
  for (const s of names) {
    const ctx = installStartStop(new OfflineCtx({ sampleRate: SR, seconds: 1.8 }));
    const engine = makeEngine(ctx, SR);
    try { engine.sfx(s); } catch (e) { console.log(`  ! ${s}: ${e.message}`); ng++; continue; }
    const { L, R } = ctx.render();
    const st = stats(L, R);
    const bad = st.peak < 0.002;
    if (bad) ng++;
    console.log(`  ${s.padEnd(15)} peak ${st.peakDb.toFixed(1).padStart(6)} dB  `
      + `rms ${st.rmsDb.toFixed(1).padStart(6)} dB${bad ? '  ← 音が出ていない' : ''}`);
  }
  console.log(`  ${names.length} 種を確認`);

  /* ゲーム側が存在しない効果音名を呼んでいないか（無音の typo を検出） */
  console.log('\n効果音名の整合');
  const known = new Set(names);
  const used = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const q = path.join(dir, e.name);
      if (e.isDirectory()) walk(q);
      else if (e.name.endsWith('.js')) {
        const t = fs.readFileSync(q, 'utf8');
        for (const m of t.matchAll(/sfx\(\s*'([a-z_]+)'/g)) {
          if (!used.has(m[1])) used.set(m[1], path.relative(ROOT, q));
        }
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  let unknown = 0;
  for (const [n, where] of used) {
    if (!known.has(n)) { console.log(`  ✗ 未知の効果音名 '${n}'  → ${where}`); unknown++; }
  }
  console.log(unknown ? `  NG ${unknown} 件` : `  使用されている ${used.size} 種はすべて定義済み`);
  if (unknown) ng += unknown;
  if (ng) { console.log(`\n  効果音の NG ${ng} 件`); }
  else { console.log('\n  すべての効果音が音を出す'); }
  process.exit(ng ? 1 : 0);
}

console.log('\n判定:');
let bad = 0;
for (const r of rows) {
  if (r.peak < 0.01) { console.log(`  ✗ ${r.name}: 音がほぼ出ていない (peak ${r.peakDb.toFixed(1)} dB)`); bad++; }
  else if (r.clip > SR * 0.02) { console.log(`  ! ${r.name}: クリップが多い (${r.clip} サンプル)`); }
  else if (r.silentPct > 40) { console.log(`  ! ${r.name}: 無音区間が長い (${r.silentPct.toFixed(0)}%)`); }
}
console.log(bad ? `  NG ${bad} 件` : '  すべての曲で音が出ている');
process.exit(bad ? 1 : 0);
