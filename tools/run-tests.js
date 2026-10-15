/* =============================================================================
 * tools/run-tests.js — まとめて検証する（npm test）
 *
 *  重い検証（通しプレイ・フレーム描画）は既定では走らせない。
 *  ここで走るのは「速くて、壊れたら必ず気づきたい」ものだけ。
 *
 *    node tools/run-tests.js            速い検証だけ
 *    node tools/run-tests.js --full     重い検証も走らせる
 *
 *  個別に走らせる場合:
 *    node tools/test-patterns.js     全パターン×全難易度の安全域・弾数・弾速
 *    node tools/playthrough.js       回避 AI による通しクリア検証
 *    node tools/render-frames.js     実フレームを PNG に描いて目視検証
 * ========================================================================== */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FULL = process.argv.includes('--full');

const suite = [
  ['アセットとライセンス', 'tools/validate-assets.js', false],
  ['楽曲データ', 'tools/validate-music.js', false],
  ['弾幕パターン（全 21 種 × 3 難易度）', 'tools/test-patterns.js', false],
];

if (FULL) {
  suite.push(['通しクリア検証（全 4 章 × 3 難易度）', 'tools/playthrough.js', true]);
  suite.push(['フレーム描画', 'tools/render-frames.js', true]);
}

const results = [];
for (const [name, script, heavy] of suite) {
  console.log('\n' + '='.repeat(66));
  console.log(`■ ${name}  —  ${script}${heavy ? '（重い）' : ''}`);
  console.log('='.repeat(66));
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, script)], {
    cwd: ROOT, stdio: 'inherit', env: process.env,
  });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  results.push({ name, code: r.status ?? 1, sec });
}

console.log('\n' + '='.repeat(66));
console.log('結果');
console.log('='.repeat(66));
let bad = 0;
for (const r of results) {
  const mark = r.code === 0 ? '  OK ' : ' NG  ';
  if (r.code !== 0) bad++;
  console.log(`${mark} ${r.name.padEnd(38, ' ')} ${r.sec}s`);
}
console.log('');
if (bad) { console.log(`${bad} 件が失敗した`); process.exit(1); }
console.log('すべて成功');
if (!FULL) console.log('（重い検証も走らせる場合: node tools/run-tests.js --full）');
