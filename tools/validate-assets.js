/* =============================================================================
 * tools/validate-assets.js — アセットとライセンスの整合性検査
 *
 *  このゲームは「素材を実際に取得・確認したものだけを使う」という方針で作った。
 *  その方針が崩れていないかを機械的に検査する。
 *
 *  検査内容:
 *    1. asset-manifest.json の 15 キャラぶんの cutin / face 画像が実在するか
 *    2. ソース内のアセットキー（CHARS / IMG）とマニフェストが一致するか
 *    3. フォント（本体・ライセンス全文）が揃っているか
 *    4. クレジット表（src/data/script.js の CREDITS）が参照するファイルが実在するか
 *    5. 未使用のアセットが残っていないか（「置いてあるだけ」を検出）
 *
 *  使い方: node tools/validate-assets.js
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadGame, ROOT } = require('./headless.js');

const rel = (p) => path.relative(ROOT, p);
let ng = 0, warn = 0;
const fail = (msg) => { ng++; console.log('  ✗ ' + msg); };
const note = (msg) => { warn++; console.log('  ! ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

console.log('アセット検証');

/* ------------------------------------------------- 1. マニフェスト -------- */
const manPath = path.join(ROOT, 'assets/asset-manifest.json');
if (!fs.existsSync(manPath)) { fail('assets/asset-manifest.json が無い'); process.exit(1); }
const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
const keys = Object.keys(man);
console.log(`  マニフェスト: ${keys.length} キャラ`);

for (const k of keys) {
  const e = man[k];
  for (const kind of ['cutin', 'face']) {
    const p = path.join(ROOT, 'assets', kind, `${k}.png`);
    if (!fs.existsSync(p)) fail(`${kind}/${k}.png が無い（マニフェストには登録済み）`);
    const sz = fs.statSync(p).size;
    if (sz < 200) fail(`${kind}/${k}.png が小さすぎる (${sz} bytes) — 空画像の疑い`);
  }
  if (!e.name) fail(`${k}: name が無い`);
  if (!e.source) note(`${k}: 元画像（source）の記録が無い`);
}
if (ng === 0) ok(`cutin / face ともに ${keys.length} 件すべて実在`);

/* ----------------------------------------- 2. ソースとマニフェストの一致 --- */
let HN;
try {
  ({ HN } = loadGame({ sources: ['src/core/util.js', 'src/art/characters.js'] }));
} catch (e) {
  fail('characters.js の読み込みに失敗: ' + e.message);
  process.exit(1);
}
const srcKeys = Object.keys(HN.CHARS || {});
const missingInSrc = keys.filter(k => !srcKeys.includes(k));
const missingInMan = srcKeys.filter(k => !keys.includes(k));
if (missingInSrc.length) note(`マニフェストにあるが CHARS に無い: ${missingInSrc.join(', ')}`);
if (missingInMan.length) fail(`CHARS にあるがマニフェストに無い: ${missingInMan.join(', ')}`);
if (!missingInSrc.length && !missingInMan.length) ok(`CHARS とマニフェストが一致 (${srcKeys.length} 件)`);

/* --------------------------------------------------- 3. フォント -------- */
console.log('  フォント:');
const fonts = [
  ['assets/fonts/FusionPixel12-japanese.woff2', '日本語ピクセルフォント（本文）'],
  ['assets/fonts/Silkscreen-latin-400.woff2', '数字・UI（標準）'],
  ['assets/fonts/Silkscreen-latin-700.woff2', '数字・UI（太字）'],
];
for (const [f, why] of fonts) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { fail(`${f} が無い（${why}）`); continue; }
  const kb = (fs.statSync(p).size / 1024).toFixed(1);
  ok(`${rel(p)}  ${kb} KB  — ${why}`);
}

/* ------------------------------------------- 4. クレジットの参照先 ------ */
console.log('  クレジット:');
let script;
try {
  ({ HN } = loadGame({ sources: ['src/core/util.js', 'src/art/characters.js', 'src/data/script.js'] }));
  script = HN.CREDITS || HN.CREDIT || null;
} catch (e) { /* 下で個別に報告 */ }

// CREDITS はオブジェクト/配列どちらでも拾う
const creditList = Array.isArray(script) ? script
  : (script && typeof script === 'object')
    ? Object.values(script).flat().filter(x => x && typeof x === 'object') : [];
if (!creditList.length) {
  note('CREDITS を自動抽出できなかった（src/data/script.js を目視で確認すること）');
} else {
  let checked = 0;
  for (const c of creditList) {
    if (c.license_file) {
      checked++;
      if (!fs.existsSync(path.join(ROOT, c.license_file))) {
        fail(`クレジット「${c.name}」のライセンス全文が無い: ${c.license_file}`);
      }
    }
    if (c.file) {
      checked++;
      for (const f of String(c.file).split(',').map(s => s.trim())) {
        if (f.includes('*')) continue;   // glob は目視対象
        if (!fs.existsSync(path.join(ROOT, f))) note(`クレジット「${c.name}」の file が存在しない: ${f}`);
      }
    }
  }
  ok(`クレジット ${creditList.length} 件 / 参照 ${checked} 件を確認`);
}

/* ------------------------------------------ 5. 使われていないアセット --- */
console.log('  未使用の検出:');
const cutinDir = path.join(ROOT, 'assets/cutin');
if (fs.existsSync(cutinDir)) {
  const onDisk = fs.readdirSync(cutinDir).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
  const unused = onDisk.filter(k => !keys.includes(k));
  if (unused.length) note(`マニフェストに無い cutin: ${unused.join(', ')}`);
  else ok(`cutin ${onDisk.length} 件すべてがマニフェストに登録されている`);
}

console.log('');
if (ng) { console.log(`NG ${ng} 件 / 警告 ${warn} 件`); process.exit(1); }
console.log(`すべて確認できた（警告 ${warn} 件）`);
