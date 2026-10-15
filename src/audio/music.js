/* =============================================================================
 * src/audio/music.js — 作曲データ
 *
 *  記譜法（トラッカー簡易記法）:
 *    「音符名」= 発音開始 / 「-」= 直前の音符を伸ばす / 「.」= 休符 / 「|」= 小節区切り
 *    行解像度は 8 分音符（1 小節 = 8 トークン）。1 小節 = 8 トークン厳守。
 *    ドラムは inst:'noise' のとき K(キック) S(スネア) H(ハット) O(開ハット)。
 *
 *  各トラックの `min` は「強度しきい値」(0..1)。フェーズが進むと
 *  setIntensity() が上がり、後からレイヤーが重なって曲が厚くなる。
 *  これが「残り時間が減るほど密度が上がる」という原作の主題の音楽的表現。
 * ========================================================================== */
'use strict';

const NOTE_BASE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** 'a4' / 'bb5' / 'f#4' → MIDI 番号 */
function noteNameToMidi(s) {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(s.toLowerCase());
  if (!m) return null;
  let n = NOTE_BASE[m[1]];
  if (m[2] === '#') n += 1; else if (m[2] === 'b') n -= 1;
  return n + (parseInt(m[3], 10) + 1) * 12;
}

/**
 * 記譜文字列 → ステップ配列
 * o: {dd:既定長(行), v:既定ベロシティ}
 */
function seq(str, o = {}) {
  const toks = str.trim().split(/\s+/).filter(t => t !== '|');
  const steps = [];
  let last = -1;
  const dd = o.dd ?? 1;
  const dv = o.v ?? 1;
  for (const tk of toks) {
    if (tk === '-') {
      if (last >= 0) steps[last].d = (steps[last].d || 1) + 1;
      steps.push(null);
    } else if (tk === '.') {
      steps.push(null);
    } else {
      let vel = dv;
      let name = tk;
      if (tk.endsWith('!')) { vel = dv * 1.28; name = tk.slice(0, -1); }
      else if (tk.endsWith('~')) { vel = dv * 0.72; name = tk.slice(0, -1); }
      let n;
      if (o.drum) {
        n = name.toUpperCase();              // K / S / H / O
      } else {
        n = noteNameToMidi(name);
        if (n == null) { steps.push(null); continue; }
      }
      last = steps.length;
      steps.push({ n, d: dd, v: vel });
    }
  }
  return steps;
}

/** 小節単位のブロックから長いステップ列を組み立てる */
function bars(...blocks) {
  const out = [];
  for (const b of blocks) out.push(...b);
  return out;
}

/* ==========================================================================
 * 01. 「本質」— タイトル / メインテーマ
 *     A マイナー。鐘のアルペジオの上に「問い」の旋律。最後に解決しない。
 * ======================================================================== */
const SONG_TITLE = {
  name: '本質', loopStart: 0, bpm: 88, rowsPerBeat: 2,
  tracks: [
    { // 鐘のアルペジオ（テーマの核）
      inst: 'bell', vol: .085, reverb: .5, ratio: 3.01, index: 300, min: 0,
      steps: bars(
        seq('a4 - c5 - e5 - c5 -', { dd: 2 }), seq('f4 - a4 - c5 - a4 -', { dd: 2 }),
        seq('c5 - e5 - g5 - e5 -', { dd: 2 }), seq('g4 - b4 - d5 - b4 -', { dd: 2 }),
        seq('a4 - c5 - e5 - c5 -', { dd: 2 }), seq('f4 - a4 - c5 - a4 -', { dd: 2 }),
        seq('c5 - e5 - g5 - e5 -', { dd: 2 }), seq('e4 - g#4 - b4 - g#4 -', { dd: 2 }),
      )
    },
    { // 「問い」の旋律
      inst: 'pulse', duty: .25, vol: .17, min: 0, reverb: .2,
      steps: bars(
        seq('e5 - - c5 - b4 - -'), seq('a4 - - - g4 a4 - -'),
        seq('b4 - - c5 - b4 - -'), seq('a4 - - - - - - -'),
        seq('e5 - - g5 - f5 - -'), seq('e5 - - c5 - b4 - -'),
        seq('c5 - - d5 - e5 - -'), seq('e5 - - - - - - -'),
      )
    },
    { // 対旋律（強度が上がると入る）
      inst: 'pulse', duty: .125, vol: .085, min: .5, pan: .35,
      steps: bars(
        seq('. . a4 - . . c5 -'), seq('. . a4 - . . f4 -'),
        seq('. . g4 - . . e4 -'), seq('. . g4 - . . b4 -'),
        seq('. . a4 - . . c5 -'), seq('. . c5 - . . a4 -'),
        seq('. . e5 - . . g5 -'), seq('. . b4 - . . g#4 -'),
      )
    },
    { // 低音
      inst: 'tri', vol: .26, min: 0,
      steps: bars(
        seq('a2 - - - a3 - - -'), seq('f2 - - - f3 - - -'),
        seq('c3 - - - c3 - - -'), seq('g2 - - - g3 - - -'),
        seq('a2 - - - a3 - - -'), seq('f2 - - - f3 - - -'),
        seq('c3 - - - g3 - - -'), seq('e2 - - - e3 - - -'),
      )
    },
  ],
};
SONG_TITLE.loopLength = SONG_TITLE.tracks[0].steps.length;

/* ==========================================================================
 * 02. 第一ステージ「南棟と北棟」— ノスタルジック、まばら、静か
 * ======================================================================== */
const SONG_STAGE1 = {
  name: '南棟と北棟', bpm: 104, rowsPerBeat: 2,
  tracks: [
    { inst: 'pulse', duty: .5, vol: .155, min: 0, reverb: .18,
      steps: bars(
        seq('a4 - c5 - e5 - - -'), seq('d5 - c5 - a4 - - -'),
        seq('g4 - c5 - e5 - - -'), seq('d5 - - - b4 - - -'),
        seq('c5 - e5 - a5 - - -'), seq('g5 - f5 - e5 - - -'),
        seq('f5 - e5 - d5 - - -'), seq('e5 - - - - - - -'),
      ) },
    { inst: 'pulse', duty: .125, vol: .07, min: .34, pan: -.3,
      steps: bars(
        seq('. . e4 - . . c4 -'), seq('. . d4 - . . a3 -'),
        seq('. . c4 - . . e4 -'), seq('. . b3 - . . g3 -'),
        seq('. . e4 - . . a4 -'), seq('. . e4 - . . c5 -'),
        seq('. . a4 - . . f4 -'), seq('. . g#4 - . . b3 -'),
      ) },
    { inst: 'bell', vol: .05, reverb: .55, min: .66, ratio: 2.01, index: 220,
      steps: bars(
        seq('. . . . a5 - - -'), seq('. . . . . . . .'),
        seq('. . . . g5 - - -'), seq('. . . . . . . .'),
        seq('. . . . c6 - - -'), seq('. . . . . . . .'),
        seq('. . . . a5 - - -'), seq('. . . . . . . .'),
      ) },
    { inst: 'tri', vol: .25, min: 0,
      steps: bars(
        seq('a2 - a2 - e3 - a2 -'), seq('a2 - a2 - e3 - g2 -'),
        seq('f2 - f2 - c3 - f2 -'), seq('f2 - f2 - c3 - e2 -'),
        seq('c3 - c3 - g3 - c3 -'), seq('g2 - g2 - d3 - g2 -'),
        seq('d3 - d3 - a2 - d3 -'), seq('e3 - e3 - b2 - e3 -'),
      ) },
    { inst: 'noise', vol: .12, min: .34, drum: true,
      steps: bars(
        seq('K - H - S - H -', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H - S - H -', { drum: 1 }), seq('K - H - S - H O', { drum: 1 }),
        seq('K - H - S - H -', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H - S - H -', { drum: 1 }), seq('K - H - S - H O', { drum: 1 }),
      ) },
  ],
};
SONG_STAGE1.loopLength = SONG_STAGE1.tracks[0].steps.length;

/* ==========================================================================
 * 03. 第二ステージ「火曜三限、味噌の地政学」— ドリア旋法、好奇心、地理
 * ======================================================================== */
const SONG_STAGE2 = {
  name: '味噌の地政学', bpm: 116, rowsPerBeat: 2,
  tracks: [
    { inst: 'pulse', duty: .5, vol: .15, min: 0, reverb: .15,
      steps: bars(
        seq('d5 - f5 - a5 - - -'), seq('g5 - f5 - e5 - - -'),
        seq('g5 - bb5 - d6 - - -'), seq('c6 - a5 - e5 - - -'),
        seq('f5 - a5 - c6 - - -'), seq('bb5 - a5 - f5 - - -'),
        seq('g5 - bb5 - a5 - g5 -'), seq('a5 - - - - - - -'),
      ) },
    { inst: 'pulse', duty: .25, vol: .085, min: .34, pan: .3,
      steps: bars(
        seq('. . a4 - d5 - . .'), seq('. . c5 - bb4 - . .'),
        seq('. . d5 - g5 - . .'), seq('. . e5 - c5 - . .'),
        seq('. . a4 - f5 - . .'), seq('. . f5 - d5 - . .'),
        seq('. . bb4 - d5 - . .'), seq('. . c#5 - e5 - . .'),
      ) },
    { inst: 'bell', vol: .05, reverb: .5, min: .66, ratio: 2.01, index: 260,
      steps: bars(
        seq('d6 - - - . . a5 -'), seq('. . . . e6 - - -'),
        seq('g5 - - - . . d6 -'), seq('. . . . c6 - - -'),
        seq('f6 - - - . . c6 -'), seq('. . . . a5 - - -'),
        seq('bb5 - - - . . d6 -'), seq('. . . . c#6 - - -'),
      ) },
    { inst: 'tri', vol: .26, min: 0,
      steps: bars(
        seq('d3 - d3 - a2 - d3 -'), seq('d3 - d3 - a2 - c3 -'),
        seq('g2 - g2 - d3 - g2 -'), seq('a2 - a2 - e3 - a2 -'),
        seq('d3 - d3 - a2 - d3 -'), seq('bb2 - bb2 - f3 - bb2 -'),
        seq('g2 - g2 - d3 - g2 -'), seq('a2 - a2 - e3 - a2 -'),
      ) },
    { inst: 'noise', vol: .13, min: .34, drum: true,
      steps: bars(
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H O', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - H H S - S O', { drum: 1 }),
      ) },
    { inst: 'noise', vol: .07, min: .7, drum: true,
      steps: bars(
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
      ) },
  ],
};
SONG_STAGE2.loopLength = SONG_STAGE2.tracks[0].steps.length;

/* ==========================================================================
 * 04. 第三ステージ「河岸段丘 — 時間を掘る」
 *     旋律が階段状に下降する = 段丘そのもの。上から掘り下げる勝也の描き方。
 * ======================================================================== */
const SONG_STAGE3 = {
  name: '河岸段丘', bpm: 124, rowsPerBeat: 2,
  tracks: [
    { inst: 'pulse', duty: .5, vol: .15, min: 0, reverb: .18,
      steps: bars(
        seq('g5 - f5 - eb5 - d5 -'), seq('c5 - bb4 - ab4 - g4 -'),
        seq('f4 - eb4 - d4 - c4 -'), seq('bb3 - - - - - - -'),
        seq('g5 - ab5 - bb5 - c6 -'), seq('bb5 - ab5 - g5 - f5 -'),
        seq('eb5 - f5 - g5 - ab5 -'), seq('g5 - - - - - - -'),
      ) },
    { inst: 'pulse', duty: .125, vol: .08, min: .34, pan: -.35,
      steps: bars(
        seq('eb5 - . . c5 - . .'), seq('ab4 - . . eb5 - . .'),
        seq('bb4 - . . f4 - . .'), seq('. . bb4 - eb5 - . .'),
        seq('c5 - . . eb5 - . .'), seq('eb5 - . . c5 - . .'),
        seq('ab4 - . . c5 - . .'), seq('. . bb4 - d5 - . .'),
      ) },
    { inst: 'bell', vol: .06, reverb: .6, min: .66, ratio: 3.01, index: 320,
      steps: bars(
        seq('. . . . g5 - - -'), seq('. . . . eb5 - - -'),
        seq('. . . . ab5 - - -'), seq('. . . . bb5 - - -'),
        seq('. . . . c6 - - -'), seq('. . . . ab5 - - -'),
        seq('. . . . eb6 - - -'), seq('. . . . d6 - - -'),
      ) },
    { inst: 'tri', vol: .28, min: 0,
      steps: bars(
        seq('c3 - c3 - g2 - c3 -'), seq('ab2 - ab2 - eb3 - ab2 -'),
        seq('eb3 - eb3 - bb2 - eb3 -'), seq('bb2 - bb2 - f3 - bb2 -'),
        seq('c3 - c3 - g2 - c3 -'), seq('ab2 - ab2 - eb3 - ab2 -'),
        seq('f2 - f2 - c3 - f2 -'), seq('g2 - g2 - d3 - g2 -'),
      ) },
    { inst: 'noise', vol: .14, min: .34, drum: true,
      steps: bars(
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - H K S - H O', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H K S - H K', { drum: 1 }), seq('K - S - S - S O', { drum: 1 }),
      ) },
    { inst: 'noise', vol: .07, min: .7, drum: true,
      steps: bars(
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
      ) },
  ],
};
SONG_STAGE3.loopLength = SONG_STAGE3.tracks[0].steps.length;

/* ==========================================================================
 * 05. 最終ステージ「最後の地形図」— 主題の再帰、感情の頂点
 * ======================================================================== */
const SONG_STAGE4 = {
  name: '最後の地形図', bpm: 136, rowsPerBeat: 2,
  tracks: [
    { inst: 'pulse', duty: .5, vol: .15, min: 0, reverb: .2,
      steps: bars(
        seq('a4 - c5 - e5 - g5 -'), seq('f5 - e5 - c5 - a4 -'),
        seq('g5 - e5 - c5 - g4 -'), seq('a4 - - - - - - -'),
        seq('a4 - c5 - e5 - a5 -'), seq('g5 - f5 - e5 - c5 -'),
        seq('d5 - f5 - e5 - d5 -'), seq('b4 - - - - - - -'),
      ) },
    { inst: 'pulse', duty: .25, vol: .1, min: .3, pan: .3,
      steps: bars(
        seq('e5 - . . a5 - . .'), seq('c5 - . . f5 - . .'),
        seq('e5 - . . g5 - . .'), seq('e5 - . . c5 - . .'),
        seq('e5 - . . a5 - . .'), seq('c6 - . . a5 - . .'),
        seq('f5 - . . d5 - . .'), seq('g5 - . . b4 - . .'),
      ) },
    { inst: 'pulse', duty: .5, vol: .06, min: .6, pan: -.25,
      steps: bars(
        seq('a3 e4 a4 . . . . .'), seq('f3 c4 f4 . . . . .'),
        seq('c4 g4 c5 . . . . .'), seq('e3 g3 b3 . . . . .'),
        seq('a3 e4 a4 . . . . .'), seq('f3 c4 f4 . . . . .'),
        seq('d4 f4 a4 . . . . .'), seq('e3 g#3 b3 . . . . .'),
      ) },
    { inst: 'bell', vol: .075, reverb: .55, min: .3, ratio: 3.01, index: 340,
      steps: bars(
        seq('a5 - - - e6 - - -'), seq('c6 - - - a5 - - -'),
        seq('g5 - - - c6 - - -'), seq('e6 - - - - - - -'),
        seq('a5 - - - c6 - - -'), seq('f6 - - - c6 - - -'),
        seq('d6 - - - a5 - - -'), seq('b5 - - - e6 - - -'),
      ) },
    { inst: 'tri', vol: .28, min: 0,
      steps: bars(
        seq('a2 - a2 - e3 - a2 -'), seq('f2 - f2 - c3 - f2 -'),
        seq('c3 - c3 - g3 - c3 -'), seq('e2 - e2 - b2 - e2 -'),
        seq('a2 - a2 - e3 - a2 -'), seq('f2 - f2 - c3 - f2 -'),
        seq('d3 - d3 - a2 - d3 -'), seq('e2 - e2 - g#2 - b2 -'),
      ) },
    { inst: 'noise', vol: .15, min: 0, drum: true,
      steps: bars(
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H O', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - H - S - H -', { drum: 1 }),
        seq('K - H - S - H K', { drum: 1 }), seq('K - S K S - S O', { drum: 1 }),
      ) },
    { inst: 'noise', vol: .08, min: .55, drum: true,
      steps: bars(
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
        seq('H - H - H - H H', { drum: 1 }), seq('H - H - H - H H', { drum: 1 }),
      ) },
  ],
};
SONG_STAGE4.loopLength = SONG_STAGE4.tracks[0].steps.length;

/* ==========================================================================
 * 06. 「✝」— ボス／狂信／緊張。半音の緊張感。
 * ======================================================================== */
const SONG_BOSS = {
  name: '✝', bpm: 148, rowsPerBeat: 2,
  tracks: [
    { inst: 'pulse', duty: .25, vol: .15, min: 0, reverb: .15,
      steps: bars(
        seq('a4 bb4 a4 e5 a4 bb4 a4 e5'), seq('a4 bb4 a4 e5 f5 e5 d5 c5'),
        seq('bb4 b4 bb4 f5 bb4 b4 bb4 f5'), seq('bb4 b4 bb4 f5 g5 f5 eb5 d5'),
        seq('g4 ab4 g4 d5 g4 ab4 g4 d5'), seq('g4 ab4 g4 d5 eb5 d5 c5 bb4'),
        seq('a4 bb4 c5 d5 e5 f5 g5 ab5'), seq('a5 - - - - - - -'),
      ) },
    { inst: 'pulse', duty: .125, vol: .08, min: .34, pan: .35,
      steps: bars(
        seq('e5 - . . c5 - . .'), seq('e5 - . . a4 - . .'),
        seq('f5 - . . d5 - . .'), seq('f5 - . . bb4 - . .'),
        seq('d5 - . . bb4 - . .'), seq('d5 - . . g4 - . .'),
        seq('a4 - . . e5 - . .'), seq('. . a5 - e5 - c5 -'),
      ) },
    { inst: 'bell', vol: .06, reverb: .4, min: .55, ratio: 3.01, index: 400,
      steps: bars(
        seq('a5 - - - . . . .'), seq('. . . . e5 - - -'),
        seq('bb5 - - - . . . .'), seq('. . . . f5 - - -'),
        seq('g5 - - - . . . .'), seq('. . . . d5 - - -'),
        seq('ab5 - - - bb5 - - -'), seq('a5 - - - - - - -'),
      ) },
    { inst: 'tri', vol: .3, min: 0,
      steps: bars(
        seq('a2 a2 a2 a2 e3 e3 a2 a2'), seq('a2 a2 a2 a2 e3 e3 g2 g2'),
        seq('bb2 bb2 bb2 bb2 f3 f3 bb2 bb2'), seq('bb2 bb2 bb2 bb2 f3 f3 eb2 eb2'),
        seq('g2 g2 g2 g2 d3 d3 g2 g2'), seq('g2 g2 g2 g2 d3 d3 c3 c3'),
        seq('a2 a2 a2 a2 e3 e3 a2 a2'), seq('e2 e2 e2 e2 b2 b2 e3 e3'),
      ) },
    { inst: 'noise', vol: .17, min: 0, drum: true,
      steps: bars(
        seq('K - H K S - H K', { drum: 1 }), seq('K - H K S - H O', { drum: 1 }),
        seq('K - H K S - H K', { drum: 1 }), seq('K - H K S - H O', { drum: 1 }),
        seq('K - H K S - H K', { drum: 1 }), seq('K - H K S - H O', { drum: 1 }),
        seq('K - H K S - H K', { drum: 1 }), seq('K K S S K S S O', { drum: 1 }),
      ) },
    { inst: 'noise', vol: .09, min: .5, drum: true,
      steps: bars(
        seq('H - H H H - H H', { drum: 1 }), seq('H - H H H - H H', { drum: 1 }),
        seq('H - H H H - H H', { drum: 1 }), seq('H - H H H - H H', { drum: 1 }),
        seq('H - H H H - H H', { drum: 1 }), seq('H - H H H - H H', { drum: 1 }),
        seq('H - H H H - H H', { drum: 1 }), seq('H - H H H - H H', { drum: 1 }),
      ) },
  ],
};
SONG_BOSS.loopLength = SONG_BOSS.tracks[0].steps.length;

/* ==========================================================================
 * 07. 最終局面「✝本質✝」— クライマックス。主題の全要素を統合した高密度。
 * ======================================================================== */
const SONG_FINAL = {
  name: '✝本質✝', bpm: 152, rowsPerBeat: 2,
  tracks: [
    { inst: 'pulse', duty: .5, vol: .16, min: 0, reverb: .22,
      steps: bars(
        seq('a5 - g5 - f5 - e5 -'), seq('d5 - e5 - f5 - g5 -'),
        seq('a5 - c6 - e6 - d6 -'), seq('c6 - b5 - a5 - - -'),
        seq('f5 - g5 - a5 - c6 -'), seq('bb5 - a5 - g5 - f5 -'),
        seq('e5 - g5 - bb5 - a5 -'), seq('a5 - - - - - - -'),
      ) },
    { inst: 'pulse', duty: .25, vol: .1, min: 0, pan: .3,
      steps: bars(
        seq('e5 a5 e5 a5 c5 f5 c5 f5'), seq('d5 g5 d5 g5 e5 a5 e5 a5'),
        seq('a5 c6 a5 c6 e6 d6 c6 a5'), seq('e5 g5 e5 g5 c5 e5 g5 b5'),
        seq('f5 a5 f5 a5 c6 a5 f5 c6'), seq('bb5 f5 d6 bb5 a5 f5 c6 a5'),
        seq('e5 bb5 g5 e5 a5 e5 c6 g5'), seq('a5 e6 a5 e6 c6 a5 e5 -'),
      ) },
    { inst: 'pulse', duty: .125, vol: .07, min: .34, pan: -.4,
      steps: bars(
        seq('. . a4 - . . c5 -'), seq('. . g4 - . . b4 -'),
        seq('. . e5 - . . a5 -'), seq('. . e5 - . . c5 -'),
        seq('. . f4 - . . a4 -'), seq('. . d5 - . . bb4 -'),
        seq('. . g4 - . . e5 -'), seq('. . a4 - . . c#5 -'),
      ) },
    { inst: 'bell', vol: .08, reverb: .6, min: .3, ratio: 3.01, index: 380,
      steps: bars(
        seq('a6 - - - e6 - - -'), seq('g6 - - - d6 - - -'),
        seq('c6 - - - e6 - - -'), seq('a5 - - - - - - -'),
        seq('f6 - - - c6 - - -'), seq('bb5 - - - f6 - - -'),
        seq('e6 - - - bb5 - - -'), seq('a6 - - - - - - -'),
      ) },
    { inst: 'tri', vol: .3, min: 0,
      steps: bars(
        seq('a2 a2 a2 a2 e3 e3 a2 a2'), seq('f2 f2 f2 f2 c3 c3 f2 f2'),
        seq('a2 a2 a2 a2 e3 e3 a2 a2'), seq('c3 c3 c3 c3 g3 g3 c3 c3'),
        seq('f2 f2 f2 f2 c3 c3 f2 f2'), seq('bb2 bb2 bb2 bb2 f3 f3 bb2 bb2'),
        seq('e2 e2 e2 e2 b2 b2 e2 e2'), seq('a2 a2 a2 a2 e3 e3 a2 a2'),
      ) },
    { inst: 'noise', vol: .18, min: 0, drum: true,
      steps: bars(
        seq('K - H K S - H K', { drum: 1 }), seq('K - H K S - H O', { drum: 1 }),
        seq('K - H K S - H K', { drum: 1 }), seq('K - H K S - H O', { drum: 1 }),
        seq('K - H K S - H K', { drum: 1 }), seq('K - H K S - H O', { drum: 1 }),
        seq('K - H K S - H K', { drum: 1 }), seq('K S K S S K S O', { drum: 1 }),
      ) },
    { inst: 'noise', vol: .1, min: .4, drum: true,
      steps: bars(
        seq('H H H H H H H H', { drum: 1 }), seq('H H H H H H H H', { drum: 1 }),
        seq('H H H H H H H H', { drum: 1 }), seq('H H H H H H H H', { drum: 1 }),
        seq('H H H H H H H H', { drum: 1 }), seq('H H H H H H H H', { drum: 1 }),
        seq('H H H H H H H H', { drum: 1 }), seq('H H H H H H H H', { drum: 1 }),
      ) },
  ],
};
SONG_FINAL.loopLength = SONG_FINAL.tracks[0].steps.length;

/* ==========================================================================
 * 08. ステージクリア — 温かい解決。ハ長調へ抜ける。
 * ======================================================================== */
const SONG_CLEAR = {
  name: '地形図の向こう側', bpm: 82, rowsPerBeat: 2,
  tracks: [
    { inst: 'bell', vol: .1, reverb: .6, ratio: 2.01, index: 280, min: 0, pan: -.2,
      steps: bars(
        seq('c5 - e5 - g5 - c6 -'), seq('g5 - c6 - e6 - - -'),
        seq('f5 - a5 - c6 - f6 -'), seq('e6 - - - - - - -'),
      ) },
    { inst: 'pulse', duty: .5, vol: .14, min: 0,
      steps: bars(
        seq('g4 - c5 - e5 - - -'), seq('d5 - e5 - g5 - - -'),
        seq('a4 - c5 - f5 - - -'), seq('e5 - - - - - - -'),
      ) },
    { inst: 'tri', vol: .24, min: 0,
      steps: bars(
        seq('c3 - c3 - g3 - c3 -'), seq('g2 - g2 - d3 - g2 -'),
        seq('f2 - f2 - c3 - f2 -'), seq('c3 - c3 - g3 - c3 -'),
      ) },
  ],
};
SONG_CLEAR.loopLength = SONG_CLEAR.tracks[0].steps.length;

/* ==========================================================================
 * 09. 静寂 — ゲームオーバー / タイトル待機。答えの出ない問い。
 * ======================================================================== */
const SONG_QUIET = {
  name: '不在', bpm: 64, rowsPerBeat: 2,
  tracks: [
    { inst: 'bell', vol: .085, reverb: .65, ratio: 3.01, index: 240, min: 0, pan: -.15,
      steps: bars(
        seq('a4 - - - . . . .'), seq('. . e5 - - - - -'),
        seq('. . . . c5 - - -'), seq('. . . . . . . .'),
        seq('f4 - - - . . . .'), seq('. . c5 - - - - -'),
        seq('. . . . g4 - - -'), seq('. . . . . . . .'),
      ) },
    { inst: 'tri', vol: .18, min: 0,
      steps: bars(
        seq('a2 - - - - - - -'), seq('. . . . e2 - - -'),
        seq('f2 - - - - - - -'), seq('. . . . c3 - - -'),
        seq('d3 - - - - - - -'), seq('. . . . a2 - - -'),
        seq('e2 - - - - - - -'), seq('. . . . - - - -'),
      ) },
  ],
};
SONG_QUIET.loopLength = SONG_QUIET.tracks[0].steps.length;

/* ==========================================================================
 * 10. メニュー — 短く軽いループ
 * ======================================================================== */
const SONG_MENU = {
  name: '廊下の光', bpm: 98, rowsPerBeat: 2,
  tracks: [
    { inst: 'pulse', duty: .25, vol: .13, min: 0, reverb: .2,
      steps: bars(
        seq('e5 - g5 - a5 - g5 -'), seq('e5 - d5 - c5 - - -'),
        seq('d5 - e5 - g5 - e5 -'), seq('d5 - - - - - - -'),
      ) },
    { inst: 'bell', vol: .05, reverb: .5, ratio: 2.01, index: 240, min: .34,
      steps: bars(
        seq('. . c6 - . . e6 -'), seq('. . a5 - . . c6 -'),
        seq('. . b5 - . . d6 -'), seq('. . g5 - . . b5 -'),
      ) },
    { inst: 'tri', vol: .2, min: 0,
      steps: bars(
        seq('c3 - c3 - g3 - c3 -'), seq('a2 - a2 - e3 - a2 -'),
        seq('f2 - f2 - c3 - f2 -'), seq('g2 - g2 - d3 - g2 -'),
      ) },
  ],
};
SONG_MENU.loopLength = SONG_MENU.tracks[0].steps.length;

const SONGS = {
  title: SONG_TITLE, stage1: SONG_STAGE1, stage2: SONG_STAGE2,
  stage3: SONG_STAGE3, stage4: SONG_STAGE4, boss: SONG_BOSS,
  final: SONG_FINAL, clear: SONG_CLEAR, quiet: SONG_QUIET, menu: SONG_MENU,
};

window.HN = window.HN || {};
Object.assign(window.HN, { SONGS, seq, bars, noteNameToMidi });
