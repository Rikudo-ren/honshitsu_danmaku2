/* =============================================================================
 * src/core/audio.js — Web Audio チップチューン・エンジン
 *
 *  ・Pulse(デューティ可変) / Triangle / Noise / FM Bell の発音器を内蔵
 *  ・ルックアヘッド・スケジューラでサンプル精度のシーケンス再生
 *  ・「強度レイヤー」によりフェーズ進行で BGM が段階的に変化する
 *  ・全 SFX を合成（外部音源に依存しない = オフラインでも完全動作）
 * ========================================================================== */
'use strict';

const NOTE_OFF = -1;
const A4 = 440;
/** MIDI ノート番号 → 周波数 */
const mtof = (m) => A4 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.masterVol = 0.85;
    this.musicVol = 0.5;
    this.sfxVol = 0.75;
    this._noiseBuf = null;
    this._waves = {};
    this.song = null;
    this.songName = null;
    this._step = 0;
    this._nextStepTime = 0;
    this._intensity = 0;
    this._targetIntensity = 0;
    this._intensityChan = null;
    this._fade = 1;
    this._pending = null;
    this.listener = null;
  }

  /* ------------------------------------------------------------- 初期化 --- */
  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;

    // マスター: コンプレッサで歪みを防ぎつつ音量を稼ぐ
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;

    this.master = c.createGain();
    this.master.gain.value = this.masterVol;

    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol;
    this.musicBus.connect(this.comp);
    this.sfxBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(c.destination);

    // 軽いリバーブ（教会でなく「教室の残響」程度）
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._makeImpulse(0.9, 2.4);
    this.reverbGain = c.createGain(); this.reverbGain.gain.value = 0.16;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.comp);

    this._noiseBuf = this._makeNoise(2);
    this._makeWaves();
    this.ready = true;
    return true;
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
  }

  _makeNoise(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    // 白色ノイズ（少しだけ高域を丸めた「ファミコン噪声」寄り）
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + w * 0.6) * 0.75;
      d[i] = (i % 16 === 0) ? w : last;
    }
    return b;
  }

  _makeImpulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return b;
  }

  /** デューティ比からパルス波の PeriodicWave を作る */
  _pulseWave(duty, n = 24) {
    const key = 'd' + duty;
    if (this._waves[key]) return this._waves[key];
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      // パルス波のフーリエ係数
      imag[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
    }
    const w = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this._waves[key] = w;
    return w;
  }

  _makeWaves() {[0.5, 0.25, 0.125, 0.375].forEach(d => this._pulseWave(d)); }

  /* --------------------------------------------------------- 基本発音器 --- */
  /**
   * パルス波（メロディ／和音）
   * o: {duty,gain,a,d,s,r,detune,slide,vib,vibDepth,vibRate,pan,reverb}
   */
  pulse(freq, when, dur, o = {}) {
    if (!this.ready || freq <= 0) return;
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.setPeriodicWave(this._pulseWave(o.duty ?? 0.5));
    osc.frequency.setValueAtTime(freq, when);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), when + dur);
    if (o.detune) osc.detune.value = o.detune;

    const g = c.createGain();
    const peak = (o.gain ?? 0.22);
    const a = o.a ?? 0.005, d = o.d ?? 0.03, s = o.s ?? 0.7, r = o.r ?? 0.06;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.linearRampToValueAtTime(peak * s, when + a + d);
    g.gain.setValueAtTime(peak * s, when + Math.max(a + d, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    let node = g;
    osc.connect(g);
    if (o.pan !== undefined && c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = o.pan;
      g.connect(p); node = p;
    }
    node.connect(this.musicBus);
    if (o.reverb) { const rg = c.createGain(); rg.gain.value = o.reverb; node.connect(rg); rg.connect(this.reverb); }
    osc.start(when); osc.stop(when + dur + 0.03);
  }

  /** 三角波（ベース／柔らかい音） */
  tri(freq, when, dur, o = {}) {
    if (!this.ready || freq <= 0) return;
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), when + dur);
    const g = c.createGain();
    const peak = o.gain ?? 0.25;
    const a = o.a ?? 0.006, r = o.r ?? 0.08;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.setValueAtTime(peak, when + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    let node = g;
    if (o.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); node = p; }
    node.connect(o.bus || this.musicBus);
    osc.start(when); osc.stop(when + dur + 0.03);
  }

  /** FM ベル（本質モチーフ・キラキラした音） */
  bell(freq, when, dur, o = {}) {
    if (!this.ready || freq <= 0) return;
    const c = this.ctx;
    const car = c.createOscillator(); car.type = 'sine';
    car.frequency.setValueAtTime(freq, when);
    const mod = c.createOscillator(); mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * (o.ratio ?? 3.01), when);
    const modGain = c.createGain();
    const idx = (o.index ?? 340);
    modGain.gain.setValueAtTime(idx, when);
    modGain.gain.exponentialRampToValueAtTime(1, when + dur * 0.8);
    mod.connect(modGain); modGain.connect(car.frequency);
    const g = c.createGain();
    const peak = o.gain ?? 0.14;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    car.connect(g);
    let node = g;
    if (o.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); node = p; }
    node.connect(o.bus || this.musicBus);
    const rg = c.createGain(); rg.gain.value = o.reverb ?? 0.35;
    node.connect(rg); rg.connect(this.reverb);
    car.start(when); car.stop(when + dur + 0.02);
    mod.start(when); mod.stop(when + dur + 0.02);
  }

  /** ノイズ（ドラム／ヒット音） */
  noise(when, dur, o = {}) {
    if (!this.ready) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate ?? 1;
    let node = src;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q ?? 1; node.connect(f); node = f; }
    if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
    if (o.bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q ?? 3; node.connect(f); node = f; }
    const g = c.createGain();
    const peak = o.gain ?? 0.2;
    const a = o.a ?? 0.002;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    node.connect(g);
    let out = g;
    if (o.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
    out.connect(o.bus || this.musicBus);
    src.start(when); src.stop(when + dur + 0.02);
  }

  /* ---------------------------------------------------------------- BGM --- */
  /**
   * 楽曲を再生。song = {bpm, rowsPerBeat, tracks:[{inst,vol,pan,steps:[]}], }
   * steps は 行ごとの {n:midi|NOTE_OFF, d:dur(行), v:vel}
   */
  playSong(song, { intensity = 0, restart = true } = {}) {
    if (!this.ready) return;
    if (this.song === song && !restart) { this.setIntensity(intensity, true); return; }
    this.song = song;
    this._step = 0;
    this._nextStepTime = this.ctx.currentTime + 0.06;
    this._intensity = intensity;
    this._targetIntensity = intensity;
  }

  stopSong(fade = 0.35) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    this.song = null;
  }

  setIntensity(v, immediate = false) {
    this._targetIntensity = v;
    if (immediate) this._intensity = v;
  }

  get intensity() { return this._intensity; }

  /** 毎フレーム呼ぶ。ルックアヘッドでノートを予約する。 */
  update() {
    if (!this.ready || !this.song) return;
    const c = this.ctx;
    const spb = 60 / this.song.bpm;
    const rowDur = spb / (this.song.rowsPerBeat || 4);
    // 強度をなめらかに追従（フェーズ移行時のクロスフェード）
    this._intensity += (this._targetIntensity - this._intensity) * 0.06;

    const lookahead = 0.25;
    while (this._nextStepTime < c.currentTime + lookahead) {
      this._scheduleRow(this._step, this._nextStepTime, rowDur);
      this._step++;
      this._nextStepTime += rowDur;
      // ループ
      if (this.song.loopLength && this._step >= this.song.loopLength) {
        this._step = this.song.loopStart || 0;
      }
    }
  }

  _scheduleRow(row, when, rowDur) {
    const song = this.song;
    if (!song) return;
    for (const tr of song.tracks) {
      // 強度ゲート: tr.min 以上の強度でのみ鳴る。min が未指定なら常時。
      const minI = tr.min ?? 0;
      if (this._intensity + 1e-4 < minI) continue;
      // 強度による音量補正（入ってきたレイヤーが自然に立ち上がる）
      const fadeIn = tr.min ? clamp((this._intensity - tr.min) / 0.35 + 0.35, 0, 1) : 1;
      const st = tr.steps[row % tr.steps.length];
      if (!st) continue;
      const list = Array.isArray(st) ? st : [st];
      for (const n of list) {
        if (n.n === NOTE_OFF || n.n == null) continue;
        const dur = (n.d ?? 1) * rowDur;
        const vol = (tr.vol ?? 0.2) * (n.v ?? 1) * fadeIn;
        const pan = n.p ?? tr.pan;
        switch (tr.inst) {
          case 'pulse': this.pulse(mtof(n.n), when, dur, { duty: n.duty ?? tr.duty ?? 0.5, gain: vol, pan, a: n.a, d: n.d, s: n.s, r: n.r ?? 0.03, reverb: n.reverb ?? tr.reverb, slide: n.slide ? mtof(n.slide) : 0 }); break;
          case 'tri': this.tri(mtof(n.n), when, dur, { gain: vol, pan, r: n.r ?? 0.06 }); break;
          case 'bell': this.bell(mtof(n.n), when, dur, { gain: vol, pan, ratio: n.ratio ?? tr.ratio, index: n.index ?? tr.index, reverb: n.reverb ?? tr.reverb ?? 0.35 }); break;
          case 'noise': {
            // ドラム・プリセット（'K'=キック 'S'=スネア 'H'=ハット 'O'=開ハット）
            let no = { gain: vol, pan, lp: n.lp ?? tr.lp, hp: n.hp ?? tr.hp, bp: n.bp ?? tr.bp, q: n.q ?? tr.q, rate: n.rate ?? tr.rate };
            if (typeof n.n === 'string') {
              const DR = {
                K: { lp: 200, rate: .55, gain: (vol) * 1.5, dur: .16 },
                S: { bp: 1900, q: 1.1, rate: 1.35, gain: vol * 1.15, dur: .13 },
                H: { hp: 7200, rate: 1.9, gain: vol * .5, dur: .035 },
                O: { hp: 5200, rate: 1.5, gain: vol * .5, dur: .17 },
              }[n.n];
              if (!DR) break;
              this.noise(when, DR.dur * (tr.groove ?? 1), { ...no, ...DR, gain: (DR.gain) * (n.v ?? 1) });
              break;
            }
            this.noise(when, dur, no);
            break;
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- SFX --- */
  /** o: {gain, pan, rate} */
  sfx(name, o = {}) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime + 0.001;
    const b = this.sfxBus;
    const G = (g) => (o.gain ?? 1) * g;
    const pan = o.pan ?? 0;
    const R = o.rate ?? 1;
    switch (name) {
      /* -- メニュー -- */
      case 'ui_move':
        this.pulse(mtof(78) * R, t, .05, { duty: .25, gain: G(.1), bus: b, pan, a: .002, r: .02, reverb: .1 }); break;
      case 'ui_ok':
        this.pulse(mtof(81) * R, t, .07, { duty: .5, gain: G(.13), bus: b, pan, a: .002, r: .03 });
        this.pulse(mtof(88) * R, t + .05, .1, { duty: .5, gain: G(.11), bus: b, pan, a: .002, r: .04 }); break;
      case 'ui_back':
        this.pulse(mtof(76) * R, t, .06, { duty: .25, gain: G(.1), bus: b, pan, slide: mtof(69), a: .002, r: .03 }); break;
      case 'ui_credit': // ✝ が光る
        this.bell(mtof(84) * R, t, .5, { gain: G(.11), bus: b, pan, reverb: .5 }); break;

      /* -- 弾 -- */
      case 'shot': // 敵の発射
        this.pulse(mtof(70) * R, t, .045, { duty: .125, gain: G(.055), bus: b, pan, slide: mtof(64), a: .001, r: .02 }); break;
      case 'shot_big':
        this.pulse(mtof(58) * R, t, .09, { duty: .25, gain: G(.09), bus: b, pan, slide: mtof(46), a: .001, r: .05 });
        this.noise(t, .06, { bp: 900, gain: G(.05), bus: b, q: 1.4, pan }); break;
      case 'charge': // 予備動作（溜め）
        this.pulse(mtof(48) * R, t, .5, { duty: .5, gain: G(.07), bus: b, pan, slide: mtof(72) * R, a: .2, r: .2, reverb: .3 }); break;
      case 'warn':
        this.pulse(mtof(85) * R, t, .1, { duty: .5, gain: G(.1), bus: b, pan, a: .002, r: .04 });
        this.pulse(mtof(85) * R, t + .16, .1, { duty: .5, gain: G(.1), bus: b, pan, a: .002, r: .04 }); break;
      case 'laser':
        this.noise(t, .3 * R, { bp: 2400, q: 6, gain: G(.09), bus: b, pan });
        this.pulse(mtof(52) * R, t, .22, { duty: .125, gain: G(.06), bus: b, pan, slide: mtof(76), a: .01, r: .1 }); break;
      case 'bullet_cancel': // 弾消し
        this.noise(t, .18, { hp: 900, gain: G(.07), bus: b, pan });
        this.bell(mtof(88) * R, t, .25, { gain: G(.05), bus: b, pan, reverb: .4 }); break;

      /* -- 自機 -- */
      case 'graze': // かすり
        this.noise(t, .035, { hp: 4200, gain: G(.05), bus: b, pan });
        this.pulse(mtof(96) * R, t, .03, { duty: .125, gain: G(.035), bus: b, pan, a: .001, r: .015 }); break;
      case 'hit': // 被弾
        this.noise(t, .22, { lp: 1400, gain: G(.2), bus: b, pan });
        this.pulse(mtof(64) * R, t, .16, { duty: .25, gain: G(.15), bus: b, pan, slide: mtof(33), a: .001, r: .1 });
        this.noise(t + .05, .3, { lp: 500, gain: G(.1), bus: b, pan }); break;
      case 'death':
        this.pulse(mtof(69), t, .9, { duty: .5, gain: G(.12), bus: b, pan, slide: mtof(33), a: .002, r: .5, reverb: .5 });
        this.noise(t, .7, { lp: 900, gain: G(.1), bus: b, pan }); break;
      case 'extend': // 残機増加
        [72, 76, 79, 84].forEach((n, i) => this.pulse(mtof(n) * R, t + i * .07, .22, { duty: .25, gain: G(.09), bus: b, pan, a: .003, r: .1, reverb: .25 })); break;
      case 'bomb':
        this.noise(t, .8, { lp: 2600, gain: G(.22), bus: b, pan });
        this.pulse(mtof(45), t, .5, { duty: .5, gain: G(.1), bus: b, pan, slide: mtof(28), a: .005, r: .3 }); break;

      /* -- ステージ進行 -- */
      case 'phase_change': // フェーズ移行
        this.bell(mtof(81), t, .7, { gain: G(.11), bus: b, pan, reverb: .55 });
        this.bell(mtof(88), t + .1, .8, { gain: G(.08), bus: b, pan, reverb: .6 });
        this.noise(t, .5, { hp: 1200, gain: G(.05), bus: b, pan }); break;
      case 'phase_warn': // 移行前の予告
        this.pulse(mtof(79), t, .14, { duty: .5, gain: G(.1), bus: b, pan, a: .003, r: .05 });
        this.pulse(mtof(86), t + .2, .14, { duty: .5, gain: G(.1), bus: b, pan, a: .003, r: .05 }); break;
      case 'boss_appear':
        this.noise(t, 1.3, { lp: 700, gain: G(.24), bus: b, pan });
        this.pulse(mtof(38), t, 1.1, { duty: .5, gain: G(.13), bus: b, pan, a: .02, r: .5 });
        this.bell(mtof(69), t + .35, 1.6, { gain: G(.1), bus: b, pan, reverb: .6 }); break;
      case 'last_phase':
        this.bell(mtof(76), t, 1.6, { gain: G(.13), bus: b, pan, reverb: .7 });
        this.bell(mtof(83), t + .12, 1.6, { gain: G(.09), bus: b, pan, reverb: .7 });
        this.noise(t, 1.2, { lp: 1800, gain: G(.09), bus: b, pan }); break;
      case 'boss_break': // 撃破
        this.noise(t, 1.6, { lp: 3200, gain: G(.26), bus: b, pan });
        for (let i = 0; i < 5; i++) this.noise(t + i * .11, .5, { lp: 1400, gain: G(.12), bus: b, pan: pan + (i - 2) * .2 });
        this.pulse(mtof(45), t, .9, { duty: .5, gain: G(.11), bus: b, pan, slide: mtof(26), a: .003, r: .5 }); break;
      case 'stage_clear':
        [72, 76, 79, 84, 88].forEach((n, i) => this.bell(mtof(n), t + i * .11, 1.1, { gain: G(.1), bus: b, pan, reverb: .6 })); break;
      case 'gameover':
        [72, 68, 65, 60].forEach((n, i) => this.tri(mtof(n), t + i * .28, .7, { gain: G(.14), bus: b, pan, r: .3 })); break;
      case 'time_warning': // 残り時間わずか
        this.pulse(mtof(88), t, .08, { duty: .5, gain: G(.08), bus: b, pan, a: .002, r: .03 }); break;
      case 'graze_milestone':
        this.bell(mtof(93), t, .3, { gain: G(.06), bus: b, pan, reverb: .4 }); break;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : this.masterVol, this.ctx.currentTime, 0.05);
  }
  setMusicVol(v) { this.musicVol = v; if (this.ready) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, .05); }
  setSfxVol(v) { this.sfxVol = v; if (this.ready) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, .05); }
}

const HN_audio = new AudioEngine();

window.HN = window.HN || {};
Object.assign(window.HN, { AudioEngine, audio: HN_audio, mtof, NOTE_OFF });
