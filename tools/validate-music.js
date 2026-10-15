/* 楽曲データの検証: 全トラックが小節境界で揃っているか、音域が妥当か */
'use strict';
const { loadGame } = require('./headless');

const { HN } = loadGame({ sources: ['src/core/util.js', 'src/audio/music.js'] });

let fail = 0;
const ROWS_PER_BAR = 8;

for (const [key, song] of Object.entries(HN.SONGS)) {
  const lens = song.tracks.map(t => t.steps.length);
  const uniq = [...new Set(lens)];
  const allBarsOk = lens.every(l => l % ROWS_PER_BAR === 0);
  // 各小節のトークン数を数え、8 の倍数でない小節を検出
  const badBars = [];
  song.tracks.forEach((t, ti) => {
    // null と note の両方が 1 行。行数が 8 の倍数であることを確認
    if (t.steps.length % ROWS_PER_BAR !== 0) badBars.push(`tr${ti}(${t.inst}) len=${t.steps.length}`);
  });
  const notes = song.tracks.flatMap(t => t.steps.filter(s => s && typeof s.n === 'number').map(s => s.n));
  const min = notes.length ? Math.min(...notes) : 0;
  const max = notes.length ? Math.max(...notes) : 0;
  const ok = uniq.length === 1 && allBarsOk && badBars.length === 0;
  if (!ok) fail++;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${key.padEnd(7)} bpm=${String(song.bpm).padStart(3)} ` +
    `tracks=${song.tracks.length} rows=${uniq.join('/')} ` +
    `loop=${song.loopLength ?? '-'} range=MIDI ${min}..${max} ` +
    (badBars.length ? `BROKEN: ${badBars.join(', ')}` : '')
  );
  if (uniq.length !== 1) {
    console.log('      トラック長不一致: ' + song.tracks.map((t, i) => `${t.inst}#${i}=${t.steps.length}`).join(' '));
  }
  if (song.loopLength !== uniq[0]) console.log(`      loopLength 不一致: ${song.loopLength} vs ${uniq[0]}`);
}

console.log(fail ? `\n${fail} 曲に問題があります` : '\n全曲 OK');
process.exit(fail ? 1 : 0);
