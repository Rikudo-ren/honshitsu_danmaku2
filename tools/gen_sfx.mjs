/**
 * gen_sfx.mjs — 効果音ジェネレータ
 *
 * 外部アセット:
 *   grumdrig/jsfxr (https://github.com/grumdrig/jsfxr) の `sfxr.js` を使用。
 *   同ファイルは UNLICENSE (パブリックドメイン) で公開されている。
 *   リポジトリ同梱の `riffwave.js` は GPL-2.0 のため **使用していない**。
 *   WAV コンテナ書き出しは本スクリプトで独自実装 (16bit PCM mono)。
 *
 * ライセンス詳細は CREDITS.md を参照。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets', 'sfx');

/* ------------------------------------------------------------------ *
 * sfxr.js をサンドボックスで読み込み、音声生成に必要な部分だけ取り出す
 * ------------------------------------------------------------------ */
function loadSfxr() {
  const src = fs.readFileSync(path.join(__dirname, 'jsfxr.js'), 'utf8');
  const sandbox = {
    // 自前 WAV 書き出し用のダミー。GPL の riffwave.js には依存しない。
    RIFFWAVE: class {
      constructor() {
        this.header = {};
        this.data = null;
      }
      Make(buffer) {
        this.data = buffer;
      }
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    src + '\n;this.SoundEffect = SoundEffect; this.Params = Params;',
    ctx
  );
  return sandbox;
}

/* ------------------------------------------------------------------ *
 * 16bit PCM mono WAV ライタ (独自実装 / GPL 非依存)
 * ------------------------------------------------------------------ */
function writeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);      // fmt チャンクサイズ
  buf.writeUInt16LE(1, 20);       // PCM
  buf.writeUInt16LE(1, 22);       // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);       // block align
  buf.writeUInt16LE(16, 34);      // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

/* ------------------------------------------------------------------ *
 * sfxr の UI 単位は「二乗スケール」なので、秒から逆算するヘルパを用意する。
 *   seconds = unit^2 * 100000 / 44100      (attack / sustain / decay)
 *   frequency(Hz) = 8 * 441 * (unit^2 + 0.001)
 * ------------------------------------------------------------------ */
const K = 100000 / 44100;
/** 秒 -> envelope UI 単位 */
const T = (sec) => Math.sqrt(Math.max(0, sec) / K);
/** 周波数(Hz) -> p_base_freq の UI 単位 */
const F = (hz) => Math.sqrt(Math.max(0, hz / (8 * 441)) - 0.001);

/* ------------------------------------------------------------------ *
 * パラメータ定義
 * wave: 0=square 1=sawtooth 2=sine 3=noise
 * env : [attack秒, hold秒, punch, decay秒]
 * Hz  : [開始Hz, 終了下限Hz|null, スライド量, スライド加速]
 * duty: [デューティ, スイープ]   vib: [深さ, 速さ]
 * lpf : [カットオフ, スイープ, レゾナンス]   hpf: [カットオフ, スイープ]
 * ------------------------------------------------------------------ */
const PRESETS = {
  // ── 発射系 (弾幕の発射ごとに鳴るので短く、耳に刺さらない音色) ──
  shot_small: {
    wave: 0, env: [0, 0.028, 0.18, 0.055], hz: [1650, null, -0.16, 0],
    duty: [0.28, 0.06], lpf: [0.62, 0.05, 0.05], vol: 0.30, peak: 0.62,
  },
  shot_medium: {
    wave: 0, env: [0, 0.040, 0.26, 0.090], hz: [1150, null, -0.13, 0],
    duty: [0.34, 0.10], lpf: [0.55, 0.03, 0.08], vol: 0.34, peak: 0.72,
  },
  shot_heavy: {
    wave: 1, env: [0.008, 0.060, 0.30, 0.150], hz: [820, null, -0.10, 0.02],
    duty: [0.5, 0], lpf: [0.42, 0.03, 0.14], vol: 0.38, peak: 0.82,
  },
  // ── 予告 / チャージ ─────────────────────────────────────
  charge: {
    wave: 2, env: [0.28, 0.22, 0, 0.16], hz: [280, null, 0.30, 0],
    vib: [0.14, 0.42], lpf: [0.70, 0.12, 0.22], vol: 0.34, peak: 0.78,
  },
  warn: {
    wave: 0, env: [0, 0.16, 0.22, 0.16], hz: [700, null, 0, 0],
    vib: [0.30, 0.30], duty: [0.5, 0], lpf: [0.80, 0, 0.16], vol: 0.32, peak: 0.80,
  },
  beam_start: {
    wave: 1, env: [0.05, 0.42, 0.16, 0.34], hz: [420, null, 0.20, -0.01],
    vib: [0.10, 0.30], lpf: [0.48, 0.02, 0.26], vol: 0.32, peak: 0.85,
  },
  // ── 被弾 / ミス ────────────────────────────────────────
  player_hit: {
    wave: 3, env: [0, 0.08, 0.30, 0.22], hz: [600, null, -0.30, 0],
    lpf: [0.34, -0.02, 0.24], hpf: [0.06, 0.03], vol: 0.44, peak: 0.95,
  },
  player_death: {
    wave: 3, env: [0, 0.30, 0.40, 0.46], hz: [460, null, -0.22, 0.02],
    lpf: [0.30, -0.03, 0.30], hpf: [0.03, 0.02], vol: 0.48, peak: 0.98,
  },
  // ── グレイズ / キャンセル ───────────────────────────────
  graze: {
    wave: 2, env: [0, 0.020, 0.10, 0.045], hz: [2100, null, 0.22, 0],
    lpf: [0.95, 0, 0.05], vol: 0.13, peak: 0.34,
  },
  cancel: {
    wave: 2, env: [0, 0.10, 0.10, 0.20], hz: [1400, null, 0.30, 0],
    vib: [0.08, 0.34], lpf: [0.90, 0.02, 0.10], vol: 0.24, peak: 0.58,
  },
  // ── フェーズ / 進行 ────────────────────────────────────
  phase_in: {
    wave: 0, env: [0.02, 0.30, 0.26, 0.34], hz: [560, null, 0.26, 0],
    duty: [0.5, 0], lpf: [0.58, 0.05, 0.20], vol: 0.34, peak: 0.88,
  },
  phase_break: {
    wave: 1, env: [0, 0.22, 0.34, 0.34], hz: [980, null, -0.32, 0.03],
    vib: [0.12, 0.24], lpf: [0.52, -0.04, 0.26], vol: 0.40, peak: 0.92,
  },
  boss_appear: {
    wave: 1, env: [0.08, 0.50, 0.30, 0.60], hz: [360, null, 0.14, -0.01],
    vib: [0.18, 0.16], lpf: [0.40, 0.06, 0.28], vol: 0.42, peak: 0.96,
  },
  stage_clear: {
    wave: 0, env: [0, 0.16, 0.24, 0.48], hz: [880, null, 0.34, 0],
    duty: [0.5, 0], lpf: [0.72, 0.06, 0.14], vol: 0.34, peak: 0.86,
  },
  fanfare: {
    wave: 0, env: [0, 0.46, 0.30, 0.90], hz: [720, null, 0.30, 0],
    arp: [0.42, 0.09], duty: [0.5, 0], lpf: [0.70, 0.04, 0.16], vol: 0.34, peak: 0.90,
  },
  gameover: {
    wave: 1, env: [0.02, 0.60, 0.20, 0.80], hz: [520, null, -0.20, 0],
    vib: [0.10, 0.10], lpf: [0.38, -0.03, 0.20], vol: 0.38, peak: 0.88,
  },
  time_low: {
    wave: 0, env: [0, 0.030, 0.22, 0.055], hz: [1300, null, 0, 0],
    duty: [0.5, 0], lpf: [0.85, 0, 0.10], vol: 0.26, peak: 0.60,
  },
  extend: {
    wave: 0, env: [0, 0.09, 0.26, 0.28], hz: [900, null, 0.32, 0],
    arp: [0.50, 0.07], duty: [0.5, 0], lpf: [0.80, 0.04, 0.10], vol: 0.32, peak: 0.84,
  },
  // ── UI ────────────────────────────────────────────────
  ui_move: {
    wave: 0, env: [0, 0.022, 0.14, 0.038], hz: [1250, null, 0, 0],
    duty: [0.5, 0], lpf: [0.90, 0, 0.05], vol: 0.20, peak: 0.42,
  },
  ui_select: {
    wave: 0, env: [0, 0.055, 0.22, 0.110], hz: [980, null, 0.30, 0],
    duty: [0.5, 0], lpf: [0.85, 0.03, 0.08], vol: 0.26, peak: 0.64,
  },
  ui_cancel: {
    wave: 0, env: [0, 0.048, 0.16, 0.090], hz: [820, null, -0.32, 0],
    duty: [0.5, 0], lpf: [0.80, -0.03, 0.08], vol: 0.24, peak: 0.58,
  },
  // ── 環境 / 演出 ────────────────────────────────────────
  bell: {
    wave: 2, env: [0, 0.10, 0.10, 1.10], hz: [1560, null, 0.05, 0],
    vib: [0.05, 0.10], lpf: [0.92, 0, 0.06], vol: 0.26, peak: 0.70,
  },
  noise_sweep: {
    wave: 3, env: [0.18, 0.34, 0.30, 0.50], hz: [320, null, -0.55, 0],
    lpf: [0.20, 0.30, 0.34], hpf: [0.02, 0.10], vol: 0.30, peak: 0.80,
  },
  glitch: {
    wave: 3, env: [0, 0.055, 0.34, 0.130], hz: [2400, null, -0.55, 0.10],
    lpf: [0.60, 0.10, 0.34], hpf: [0.10, 0], vol: 0.28, peak: 0.72,
  },
  tick: {
    wave: 2, env: [0, 0.012, 0.10, 0.022], hz: [3200, null, 0, 0],
    lpf: [0.98, 0, 0.02], vol: 0.14, peak: 0.30,
  },
  // ── 3D フェーズ用 ──────────────────────────────────────
  warp_in: {
    wave: 1, env: [0.30, 0.40, 0.24, 0.50], hz: [140, null, 0.55, 0],
    vib: [0.16, 0.20], lpf: [0.34, 0.14, 0.30], vol: 0.36, peak: 0.92,
  },
  warp_out: {
    wave: 1, env: [0.05, 0.30, 0.20, 0.45], hz: [900, null, -0.42, 0],
    vib: [0.10, 0.18], lpf: [0.50, -0.10, 0.26], vol: 0.34, peak: 0.86,
  },
};


/* ------------------------------------------------------------------ */
function buildOne(sfxr, def) {
  const ps = new sfxr.Params();
  const [a, s, p, d] = def.env;
  ps.p_env_attack = T(a);
  ps.p_env_sustain = T(s);
  ps.p_env_punch = p;
  ps.p_env_decay = T(d);
  const [hz, lim, ramp, dramp] = def.hz;
  ps.p_base_freq = F(hz);
  ps.p_freq_limit = lim != null ? F(lim) : 0;
  ps.p_freq_ramp = ramp;
  ps.p_freq_dramp = dramp;
  ps.wave_type = def.wave;
  if (def.duty) { ps.p_duty = def.duty[0]; ps.p_duty_ramp = def.duty[1]; }
  else { ps.p_duty = 0.5; }
  if (def.vib) { ps.p_vib_strength = def.vib[0]; ps.p_vib_speed = def.vib[1]; }
  if (def.arp) { ps.p_arp_mod = def.arp[0]; ps.p_arp_speed = def.arp[1]; }
  if (def.lpf) { ps.p_lpf_freq = def.lpf[0]; ps.p_lpf_ramp = def.lpf[1]; ps.p_lpf_resonance = def.lpf[2]; }
  if (def.hpf) { ps.p_hpf_freq = def.hpf[0]; ps.p_hpf_ramp = def.hpf[1]; }
  if (def.pha) { ps.p_pha_offset = def.pha[0]; ps.p_pha_ramp = def.pha[1]; }
  if (def.repeat) { ps.p_repeat_speed = def.repeat; }
  ps.sound_vol = def.vol ?? 0.3;
  ps.sample_rate = 44100;
  ps.sample_size = 16;

  const se = new sfxr.SoundEffect(ps);
  const wave = se.generate();

  // RIFFWAVE ダミーから 16bit LE バイト列を取り出して float に戻す
  const data = wave.data;
  const n = data.length / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = data[i * 2], hi = data[i * 2 + 1];
    let v = (hi << 8) | lo;
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 簡易ポスト処理: フェードイン/アウトで耳障りなクリックを除去、
 * ノーマライズで音量を揃える。
 * ------------------------------------------------------------------ */
function polish(samples, { fadeIn = 0.0015, fadeOut = 0.02, targetPeak = null } = {}) {
  const sr = 44100;
  const n = samples.length;
  const fi = Math.max(1, Math.floor(fadeIn * sr));
  const fo = Math.max(1, Math.floor(fadeOut * sr));
  for (let i = 0; i < fi && i < n; i++) samples[i] *= i / fi;
  for (let i = 0; i < fo && i < n; i++) samples[n - 1 - i] *= i / fo;
  // DC オフセット除去
  let mean = 0;
  for (let i = 0; i < n; i++) mean += samples[i];
  mean /= n;
  for (let i = 0; i < n; i++) samples[i] -= mean;
  if (targetPeak) {
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(samples[i]));
    if (peak > 0) {
      const g = Math.min(4, targetPeak / peak);
      for (let i = 0; i < n; i++) samples[i] *= g;
    }
  }
  return samples;
}

/* ------------------------------------------------------------------ */
function main() {
  const sfxr = loadSfxr();
  fs.mkdirSync(OUT, { recursive: true });
  let total = 0;

  for (const [name, def] of Object.entries(PRESETS)) {
    const samples = buildOne(sfxr, def);
    polish(samples, {
      fadeOut: Math.min(0.03, samples.length / 44100 / 4),
      targetPeak: def.peak ?? 0.9,
    });
    const wav = writeWav(samples, 44100);
    const file = path.join(OUT, `${name}.wav`);
    fs.writeFileSync(file, wav);
    total += wav.length;
    const prev = fs.existsSync(file) ? '' : '';
    console.log(
      `  ${name.padEnd(14)} ${String(Math.round((samples.length / 44100) * 1000)).padStart(5)}ms  ${String(Math.round(wav.length / 1024)).padStart(4)}KB${prev}`
    );
  }
  console.log(`\n${Object.keys(PRESETS).length} SFX -> ${path.relative(ROOT, OUT)}  (total ${(total / 1024).toFixed(0)}KB)`);
}

main();
