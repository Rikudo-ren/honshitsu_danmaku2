/**
 * songs.js — BGM データ
 *
 * 手打ちの音符列ではなく、コード進行とリズムパターンから
 * トラックを組み立てる小さなコンポーザ DSL で記述している。
 * 各トラックには level (0..3) があり、audio.setIntensity() で
 * フェーズに応じてレイヤーが増減する = 弾幕と音楽が連動する。
 */

/* ------------------------------------------------------------------ *
 * 音名ユーティリティ
 * ------------------------------------------------------------------ */
const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const midiToName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** ルート音名 ("d") を MIDI ノート番号へ (オクターブ 3 基準) */
function rootMidi(name) {
  const i = NAMES.indexOf(name);
  if (i < 0) throw new Error('unknown root: ' + name);
  return (3 + 1) * 12 + i;   // octave 3 基準
}

/** スケール度数(0始まり, オクターブ外も可) -> 音名トークン */
function deg(scaleRoot, scale, d, oct = 0) {
  const len = scale.length;
  let idx = d % len; if (idx < 0) idx += len;
  const octShift = Math.floor(d / len);
  return midiToName(scaleRoot + scale[idx] + 12 * (oct + octShift));
}

/* 休符と保持 */
const R = '-';
const H = '.';

function rep(pattern, times) {
  return Array.from({ length: times }, () => pattern).flat();
}

/* ------------------------------------------------------------------ *
 * トラック生成ヘルパ
 * ------------------------------------------------------------------ */

/**
 * ベースライン。prog の各コードについて rhythm を 1 小節(16step)として展開。
 * rhythm: 'x'=ルート, 'o'=5度, '.'=休符 を 16 文字 (足りなければ繰り返し)
 */
function bass(scaleRoot, scale, prog, rhythm, oct = 1) {
  const seq = [];
  for (const chord of prog) {
    for (let i = 0; i < 16; i++) {
      const c = rhythm[i % rhythm.length];
      if (c === '.') seq.push(R);
      else if (c === 'o') seq.push(deg(scaleRoot, scale, chord + 4, oct));
      else if (c === '5') seq.push(deg(scaleRoot, scale, chord + 2, oct));
      else if (c === '8') seq.push(deg(scaleRoot, scale, chord + 7, oct + 1));
      else seq.push(deg(scaleRoot, scale, chord, oct));
    }
  }
  return seq;
}

/**
 * アルペジオ。shape はコード内の音の順番 (0=root,1=3rd,2=5th,3=octave)
 * rhythm は 16step あたりの文字列で '0'..'3' を並べる。'.' は休符。
 */
function arp(scaleRoot, scale, prog, shape, oct = 3) {
  const INTERVALS = [0, 2, 4, 7, 9, 11];
  const seq = [];
  for (const chord of prog) {
    for (let i = 0; i < 16; i++) {
      const c = shape[i % shape.length];
      if (c === '.') { seq.push(R); continue; }
      const k = parseInt(c, 10);
      if (isNaN(k)) { seq.push(R); continue; }
      seq.push(deg(scaleRoot, scale, chord + INTERVALS[k % INTERVALS.length], oct));
    }
  }
  return seq;
}

/**
 * メロディ。トークン列を 1step=1トークンでそのまま使い、足りない分は
 * 自動で休符を足して小節に合わせる。
 */
function melody(scaleRoot, scale, degrees, oct = 4, len = 64) {
  const seq = degrees.map((d) => {
    if (d === '.' || d === null) return H;
    if (typeof d === 'string' && d.startsWith('~')) return NAMES.includes(d.slice(1, -1))
      ? d.slice(1) : R;
    return deg(scaleRoot, scale, d, oct);
  });
  while (seq.length < len) seq.push(R);
  return seq.slice(0, len);
}

/** パッド (長い持続和音)。1小節 = 16step で頭だけ鳴らす。 */
function pad(scaleRoot, scale, prog, oct = 3) {
  const seq = [];
  for (const chord of prog) {
    seq.push(deg(scaleRoot, scale, chord, oct));
    for (let i = 1; i < 16; i++) seq.push(chord % 2 === 0 ? H : R);
  }
  return seq;
}

/** ドラム。'k'=キック 's'=スネア 'h'=ハット '.'=休符 */
function drums(pattern, len = 64) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(pattern[i % pattern.length]);
  return out;
}

/* ------------------------------------------------------------------ *
 * 曲定義
 * ------------------------------------------------------------------ */
function song(bpm, tracks) { return { bpm, tracks }; }

const T = (name, seq, opts) => ({ name, seq, ...opts });

/* ============================ TITLE =============================== *
 * 静かで不穏。理数科の教室に何かが「漏れ出している」気配。
 * ================================================================= */
const A_MIN = rootMidi('a');
const titleProg = [0, 0, 5, 4];          // Am - Am - F - E(ハーモニック)
const title = song(94, [
  T('pad', pad(A_MIN, SCALES.minor, titleProg, 3), {
    level: 0, wave: 'triangle', gain: 0.16, attack: 0.25, release: 0.4, filter: 1400, q: 0.7,
  }),
  T('arp', arp(A_MIN, SCALES.minor, titleProg, '0.1.2.3.2.1.0.3.2.1.3.2.1.0.1.2', 4), {
    level: 1, wave: 'sine', gain: 0.075, gate: 1.1, release: 0.09, pan: -0.25,
  }),
  T('bass', bass(A_MIN, SCALES.minor, titleProg, 'x......x..x.....', 1), {
    level: 2, wave: 'triangle', gain: 0.24, gate: 3.2, attack: 0.02,
  }),
  T('lead', melody(A_MIN, SCALES.minor, [
    4, R, R, R, 6, R, 7, R, R, R, 11, R, R, 9, R, R,
    7, R, R, R, R, R, 6, R, 4, R, R, R, R, R, R, R,
    4, R, R, R, 7, R, 9, R, R, R, 11, R, R, 12, R, R,
    11, R, R, R, 7, R, R, R, 9, R, R, R, R, R, R, R,
  ], 4, 64), {
    level: 3, wave: 'square', gain: 0.11, gate: 2.4, release: 0.16, filter: 3600, q: 1.1, pan: 0.15,
  }),
]);

/* ============================ STAGE 1 ============================= *
 * 「北棟・コーンスープの不在」
 * 両馬二郎 / ✝本質✝の発生源。速く、陽気で、少し狂っている。
 * D ドリアン。16分のベースがずっと走る。
 * ================================================================= */
const D_DORIAN = rootMidi('d');
const s1Prog = [0, 0, 3, 6];             // i - i - IV - VII
const stage1 = song(152, [
  T('drums', drums('k.h.khs.h.k.h.khs.hh', 64), { level: 0, drum: true, gain: 0.34 }),
  T('bass', bass(D_DORIAN, SCALES.dorian, s1Prog,
    'x.xx..x.xx.x..x.', 1), {
    level: 0, wave: 'square', gain: 0.26, gate: 0.9, attack: 0.002, filter: 900, q: 0.9,
  }),
  T('arp', arp(D_DORIAN, SCALES.dorian, s1Prog, '0.1.2.3.2.1.0.3.2.1.3.2.1.0.1.2', 4), {
    level: 1, wave: 'square', gain: 0.075, gate: 1.0, release: 0.04, pan: -0.34,
  }),
  T('lead', melody(D_DORIAN, SCALES.dorian, [
    0, R, 2, R, 4, R, R, 2, 4, R, 7, R, R, R, R, R,
    4, R, R, R, 2, R, 4, R, 0, R, R, R, R, R, R, R,
    7, R, 9, R, 11, R, R, 9, 7, R, 4, R, R, R, R, R,
    9, R, 7, R, 4, R, 2, R, 0, R, R, 2, 4, R, R, R,
  ], 4, 64), {
    level: 2, wave: 'square', gain: 0.135, gate: 2.0, release: 0.08, filter: 4200, q: 1.3, pan: 0.2,
  }),
  T('pad', pad(D_DORIAN, SCALES.dorian, s1Prog, 3), {
    level: 3, wave: 'triangle', gain: 0.085, attack: 0.12, release: 0.3, filter: 2000, pan: 0,
  }),
]);

/* ============================ STAGE 2 ============================= *
 * 「星と地面とせいちちゃんねる」
 * 寺地星 / 登録者150人、再生50回、うち10回は自分。
 * 広がる星空のアルペジオ。F#m → A。 擬似3Dフェーズの主舞台。
 * ================================================================= */
const FS_MIN = rootMidi('f#');
const s2Prog = [0, 4, 5, 3];             // i - VI - VII - V
const stage2 = song(138, [
  T('drums', drums('k.hhs.h.k.h.s.hh', 64), { level: 0, drum: true, gain: 0.30 }),
  T('bass', bass(FS_MIN, SCALES.minor, s2Prog, 'x...x...x...x...', 1), {
    level: 0, wave: 'sawtooth', gain: 0.22, gate: 3.0, attack: 0.01, filter: 700, q: 1.0,
    filterEnd: 1.4,
  }),
  T('arp', arp(FS_MIN, SCALES.minor, s2Prog, '0.2.1.3.2.0.3.1.0.2.3.1.2.0.1.3', 4), {
    level: 0, wave: 'sine', gain: 0.115, gate: 1.3, release: 0.10, pan: -0.3,
  }),
  T('lead', melody(FS_MIN, SCALES.minor, [
    7, R, R, 9, R, R, 11, R, R, R, 9, R, 7, R, R, R,
    9, R, R, 11, R, R, 12, R, R, R, 11, R, 9, R, R, R,
    11, R, R, 12, R, R, 14, R, R, R, 12, R, 11, R, R, R,
    9, R, R, 7, R, R, 6, R, 4, R, R, R, R, R, R, R,
  ], 4, 64), {
    level: 2, wave: 'square', gain: 0.115, gate: 2.6, release: 0.14, filter: 5000, q: 0.9, pan: 0.25,
  }),
  T('pad', pad(FS_MIN, SCALES.minor, s2Prog, 3), {
    level: 1, wave: 'triangle', gain: 0.07, attack: 0.3, release: 0.5, filter: 2400,
  }),
]);

/* ============================ STAGE 3 ============================= *
 * 「本質配信 #4 —— 倉石暁」
 * ✝本質✝の狂信者。反復、反復、反復。E ハーモニックマイナー。
 * 半音階的なベースと執拗な16分。
 * ================================================================= */
const E_HARM = rootMidi('e');
const s3Prog = [0, 0, 5, 6];             // i - i - VI - VII(ハーモニックの魅力)
const stage3 = song(160, [
  T('drums', drums('k.hks.hhk.hks.hh', 64), { level: 0, drum: true, gain: 0.36 }),
  T('bass', bass(E_HARM, SCALES.harm, s3Prog, 'x.x.x.xx.x.x.x.x', 1), {
    level: 0, wave: 'square', gain: 0.25, gate: 0.85, filter: 800, q: 1.4,
  }),
  T('arp', arp(E_HARM, SCALES.harm, s3Prog, '0.1.2.3.2.1.0.1.2.3.2.1.0.1.2.3', 4), {
    level: 1, wave: 'square', gain: 0.085, gate: 0.95, release: 0.03, pan: 0.36,
  }),
  T('lead', melody(E_HARM, SCALES.harm, [
    0, R, 1, R, 2, R, R, 0, 2, R, 4, R, R, R, R, R,
    4, R, R, R, 7, R, R, 6, 4, R, R, R, 2, R, R, R,
    7, R, 8, R, 9, R, R, 7, 9, R, 11, R, R, R, R, R,
    12, R, R, 11, R, 9, R, 8, 7, R, R, R, R, R, R, R,
  ], 4, 64), {
    level: 2, wave: 'square', gain: 0.125, gate: 1.8, release: 0.06, filter: 4800, q: 1.6, pan: -0.2,
  }),
  T('pad', pad(E_HARM, SCALES.harm, s3Prog, 3), {
    level: 3, wave: 'sawtooth', gain: 0.055, attack: 0.10, release: 0.26, filter: 1500, q: 1.2,
  }),
]);

/* ============================ STAGE 4 ============================= *
 * 「観測されないもの」—— 數理零
 * 静けさ、完璧さ、そして崩壊。C#m。少ない音で大きく鳴らす。
 * ================================================================= */
const CS_MIN = rootMidi('c#');
const s4Prog = [0, 3, 4, 5];
const stage4 = song(126, [
  T('drums', drums('k...h...s...h...', 64), { level: 0, drum: true, gain: 0.26 }),
  T('bass', bass(CS_MIN, SCALES.minor, s4Prog, 'x.......x.......', 1), {
    level: 0, wave: 'triangle', gain: 0.30, gate: 3.4, attack: 0.012, filter: 620, q: 1.0,
  }),
  T('arp', arp(CS_MIN, SCALES.minor, s4Prog, '0.3.1.3.2.3.1.3.0.3.2.3.1.3.2.3', 5), {
    level: 1, wave: 'sine', gain: 0.085, gate: 1.2, release: 0.10, pan: 0.3,
  }),
  T('lead', melody(CS_MIN, SCALES.minor, [
    2, R, R, R, 4, R, R, R, 7, R, R, R, R, R, R, R,
    11, R, R, R, R, R, 9, R, 7, R, R, R, R, R, R, R,
    4, R, R, R, 7, R, R, R, 9, R, R, R, 11, R, R, R,
    12, R, R, R, R, R, 11, R, 9, R, R, 7, R, R, R,
  ], 4, 64), {
    level: 2, wave: 'square', gain: 0.115, gate: 3.2, release: 0.2, filter: 3800, q: 1.0, pan: -0.18,
  }),
  T('pad', pad(CS_MIN, SCALES.minor, s4Prog, 3), {
    level: 1, wave: 'triangle', gain: 0.10, attack: 0.4, release: 0.6, filter: 2600,
  }),
]);

/* ============================ CLEAR =============================== *
 * 生き延びた。ただ、それだけ。少しだけ明るい。
 * ================================================================= */
const A_MAJ = rootMidi('a');
const cProg = [0, 4, 5, 3];
const clear = song(144, [
  T('drums', drums('k.h.s.h.k.hhs.h.', 64), { level: 0, drum: true, gain: 0.30 }),
  T('bass', bass(A_MAJ, SCALES.major, cProg, 'x..x..x.x..x..x.', 1), {
    level: 0, wave: 'square', gain: 0.23, gate: 1.4, filter: 1000,
  }),
  T('arp', arp(A_MAJ, SCALES.major, cProg, '0.2.1.3.2.0.3.1.0.2.3.1.2.0.1.3', 4), {
    level: 0, wave: 'sine', gain: 0.10, gate: 1.3, release: 0.1, pan: -0.3,
  }),
  T('lead', melody(A_MAJ, SCALES.major, [
    4, R, 7, R, 9, R, R, R, 7, R, 4, R, R, R, R, R,
    9, R, 11, R, 12, R, R, R, 11, R, 9, R, R, R, R, R,
    7, R, R, 9, R, R, 11, R, R, R, 12, R, R, R, R, R,
    11, R, R, 9, R, R, 7, R, 4, R, R, R, R, R, R, R,
  ], 4, 64), {
    level: 2, wave: 'square', gain: 0.13, gate: 2.3, release: 0.1, filter: 5200, q: 1.0, pan: 0.2,
  }),
  T('pad', pad(A_MAJ, SCALES.major, cProg, 3), {
    level: 3, wave: 'triangle', gain: 0.09, attack: 0.2, release: 0.4, filter: 3000,
  }),
]);

/* ============================ GAME OVER =========================== *
 * ================================================================= */
const D_MIN = rootMidi('d');
const goProg = [0, 5, 3, 0];
const gameover = song(74, [
  T('pad', pad(D_MIN, SCALES.minor, goProg, 3), {
    level: 0, wave: 'triangle', gain: 0.17, attack: 0.5, release: 0.8, filter: 900,
  }),
  T('lead', melody(D_MIN, SCALES.minor, [
    7, R, R, R, R, R, 6, R, R, R, R, R, R, R, R, R,
    4, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R,
    2, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R,
    0, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R,
  ], 4, 64), {
    level: 0, wave: 'square', gain: 0.11, gate: 4.5, release: 0.5, filter: 2200, q: 0.8,
  }),
  T('bass', bass(D_MIN, SCALES.minor, goProg, 'x...............', 1), {
    level: 1, wave: 'triangle', gain: 0.20, gate: 4.0,
  }),
]);

export const SONGS = { title, stage1, stage2, stage3, stage4, clear, gameover };

/** デバッグ用: 全曲名 */
export const SONG_NAMES = Object.keys(SONGS);
