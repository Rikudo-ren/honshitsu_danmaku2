/**
 * オーディオ。
 *  - SFX: tools/gen_sfx.mjs が生成した WAV を decode して再生
 *  - BGM: Web Audio によるチップチューン・トラッカー (実行時合成)
 *
 * BGM はステージ/フェーズごとに「レイヤー(トラック)の有効/無効」を切り替える。
 * これによりフェーズ移行で曲が変化する = 弾幕と音楽が連動する。
 */

import { SONGS } from './songs.js';

const NOTE_RE = /^([a-g])([#b]?)(-?\d)$/;
const BASE_SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteToFreq(tok) {
  const m = NOTE_RE.exec(tok);
  if (!m) return 0;
  let semi = BASE_SEMITONE[m[1]];
  if (m[2] === '#') semi += 1;
  else if (m[2] === 'b') semi -= 1;
  const oct = parseInt(m[3], 10);
  const midi = (oct + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** シーケンス文字列をトークン配列へ (1トークン = 16分音符1つ) */
const seq = (s) => s.trim().split(/\s+/);

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buffers = new Map();
    this.sfxGain = null;
    this.bgmGain = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.85;
    this.sfxVolume = 0.9;
    this.bgmVolume = 0.42;
    this._lastPlay = new Map();
    this._voices = 0;

    /* --- BGM ステート --- */
    this.song = null;
    this.songName = null;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.intensity = 0;         // 0..3 : 有効トラック数
    this.targetIntensity = 0;
    this._timer = null;
    this._muteTracks = new Set();
    this.trackGains = {};
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.bgmVolume;
    this.bgmGain.connect(this.master);
  }

  async resume() {
    if (!this.ctx) await this.init();
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* 無視 */ }
    }
    return this.ctx.state === 'running';
  }

  /** WAV を読み込む */
  async loadSfx(names, onProgress) {
    if (!this.ctx) await this.init();
    let done = 0;
    await Promise.all(names.map(async (n) => {
      try {
        const res = await fetch(`./assets/sfx/${n}.wav`);
        const buf = await res.arrayBuffer();
        this.buffers.set(n, await this.ctx.decodeAudioData(buf));
      } catch (e) {
        console.warn('[audio] SFX 読み込み失敗:', n, e);
      }
      done++;
      onProgress?.(done / names.length);
    }));
  }

  /** 効果音を鳴らす。同一音の連打は最低間隔を空ける。 */
  play(name, { vol = 1, rate = 1, pan = 0, minGap = 0.012 } = {}) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const now = this.ctx.currentTime;
    if (minGap > 0) {
      const last = this._lastPlay.get(name) ?? -9;
      if (now - last < minGap) return;
      this._lastPlay.set(name, now);
    }
    // 発音数の上限 (音割れ・負荷防止)
    if (this._voices > 26) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g); g.connect(p); p.connect(this.sfxGain);
    src.start(now);
    this._voices++;
    src.onended = () => { this._voices--; try { src.disconnect(); g.disconnect(); p.disconnect(); } catch { } };
  }

  /* ================================================================== *
   * BGM トラッカー
   * ================================================================== */
  playSong(name, { intensity = 3, fade = 0.8, restart = false } = {}) {
    if (this.songName === name && this.playing && !restart) {
      this.setIntensity(intensity, fade);
      return;
    }
    this.stopSong(fade * 0.6);
    this.song = SONGS[name];
    this.songName = name;
    if (!this.song) { console.warn('[audio] 未知の曲:', name); return; }
    this.songName = name;
    this.step = 0;
    this.intensity = 0;
    this.targetIntensity = intensity;
    this.nextTime = (this.ctx?.currentTime ?? 0) + 0.06;
    this.playing = true;
    if (this.bgmGain) {
      this.bgmGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.bgmGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      this.bgmGain.gain.linearRampToValueAtTime(this.bgmVolume, this.ctx.currentTime + fade);
    }
    this._startScheduler();
  }

  stopSong(fade = 0.4) {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.bgmGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(t);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value || 0.0001, t);
      this.bgmGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    }
    this.songName = null;
    this.song = null;
  }

  /** フェーズに応じてレイヤーを増減 (0=静か … 3=全開) */
  setIntensity(v, fade = 1.2) {
    this.targetIntensity = Math.max(0, Math.min(3, v));
  }

  /** 一時的に特定トラックを消す (フェーズ切替の「間」用) */
  muteTrack(name, on) { if (on) this._muteTracks.add(name); else this._muteTracks.delete(name); }

  _startScheduler() {
    if (this._timer) clearInterval(this._timer);
    const LOOKAHEAD = 0.14;   // 先読み秒
    this._timer = setInterval(() => {
      if (!this.playing || !this.song) return;
      const spb = 60 / this.song.bpm / 4;  // 16分音符の長さ
      while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
        this._scheduleStep(this.step, this.nextTime);
        this.step++;
        this.nextTime += spb;
      }
    }, 25);
  }

  _scheduleStep(step, t) {
    const song = this.song;
    // インテンシティは徐々に追従
    if (this.intensity !== this.targetIntensity) {
      if (Math.random() < 0.10) this.intensity += Math.sign(this.targetIntensity - this.intensity);
    }
    for (const track of song.tracks) {
      if (this._muteTracks.has(track.name)) continue;
      const lvl = track.level ?? 0;
      // intensity が低いときは level の高いトラックを間引く (リズムを崩さず薄くする)
      const audible = this.intensity >= lvl;
      const i = step % track.seq.length;
      const tok = track.seq[i];
      if (!tok || tok === '-' || tok === '.') continue;
      if (!audible && lvl > 0) continue;
      const gain = (track.gain ?? 0.2) * (audible ? 1 : 0.0);
      if (gain <= 0) continue;
      if (track.drum) {
        this._playDrum(tok, t, gain, track);
      } else {
        const f = noteToFreq(tok);
        if (f > 0) this._playNote(f, t, track, gain, song.bpm);
      }
    }
  }

  _playNote(freq, t, track, gain, bpm) {
    const ctx = this.ctx;
    const spb = (60 / bpm / 4);
    const dur = (track.gate ?? 1.7) * spb;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const wave = track.wave ?? 'square';
    osc.type = wave === 'pulse' ? 'square' : wave;
    osc.frequency.setValueAtTime(freq, t);
    if (track.detune) osc.detune.setValueAtTime(track.detune, t);
    if (track.slide) {
      osc.frequency.linearRampToValueAtTime(freq * track.slide, t + dur * 0.5);
    }

    let node = osc;
    if (track.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(track.filter, t);
      f.frequency.linearRampToValueAtTime(track.filter * (track.filterEnd ?? 1), t + dur);
      if (track.q) f.Q.value = track.q;
      node.connect(f);
      node = f;
    }
    node.connect(g);

    const atk = track.attack ?? 0.004;
    const rel = track.release ?? 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + atk);
    g.gain.setTargetAtTime(0.0001, t + dur - rel * 0.5, rel * 0.5 + 0.004);

    const out = track.pan != null ? this._panner(track.pan) : this.bgmGain;
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.08);
    osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch { } };
  }

  _panner(pan) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.bgmGain);
    return p;
  }

  _playDrum(tok, t, gain, track) {
    const ctx = this.ctx;
    if (tok === 'k') {         // キック
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.10);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(this.bgmGain);
      o.start(t); o.stop(t + 0.2);
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { } };
    } else {                    // 's' スネア / 'h' ハット
      const dur = tok === 'h' ? 0.045 : 0.16;
      const buf = this._noiseBuffer();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = tok === 'h' ? 'highpass' : 'bandpass';
      f.frequency.value = tok === 'h' ? 7200 : 1750;
      f.Q.value = tok === 'h' ? 0.7 : 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain * (tok === 'h' ? 0.5 : 1), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.bgmGain);
      src.start(t, Math.random() * 0.4);
      src.stop(t + dur + 0.02);
      src.onended = () => { try { src.disconnect(); f.disconnect(); g.disconnect(); } catch { } };
    }
  }

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = b;
    return b;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }
}

export const audio = new Audio();
export { seq, noteToFreq };
