/* =============================================================================
 * tools/build-font.js — 日本語ピクセルフォントのビルド
 *
 *  WHY:
 *   ゲームの日本語を DotGothic16（アウトラインフォント）から
 *   **Fusion Pixel 12px**（本物のピクセルフォント）へ切り替えた。
 *   ドット絵の弾・自機・背景と同じ「1px の格子」で文字が描かれるため、
 *   画面全体のピクセル密度が揃い、見た目の一貫性が大きく上がる。
 *
 *  素材: @vp-tw/cjk-web-fonts-fusion-pixel-font
 *        Fusion Pixel Font（TakWolf/fusion-pixel-font, MIT）の配布物
 *        12px プロポーショナル日本語サブセット
 *
 *  このスクリプトがやること:
 *    1. 配布物の woff2 サブセット群を 1 つの TTF に合成
 *    2. 「ゲーム内に実際に現れる文字＋予備」に絞ってサブセット化
 *    3. assets/fonts/FusionPixel12-japanese.woff2 として保存（数十 KB）
 *    4. サブセット後に「グリフの無い文字」が残っていないか検査し、あれば失敗させる
 *
 *  入力（リポジトリには含めない中間物。取得手順は docs/ASSETS.md）:
 *    /tmp/assets/package/dist/12px/proportional/ja/*.woff2
 *
 *  使い方: node tools/build-font.js [--src /path/to/fusion-pixel-ja]
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const SRC = argOf('--src', '/tmp/assets/package/dist/12px/proportional/ja');
const OUT = path.join(ROOT, 'assets/fonts/FusionPixel12-japanese.woff2');
const WORK = path.join(ROOT, '_work/font');

/* 合成に使うサブセット。日本語の常用域＋記号＋英数字を広く覆う。 */
const SUBSETS = [
  'Basic-Latin', 'Latin-1-Supplement', 'Latin-Extended-A', 'Latin-Extended-B',
  'General-Punctuation', 'CJK-Symbols-and-Punctuation', 'Halfwidth-and-Fullwidth-Forms',
  'Hiragana', 'Katakana', 'Number-Forms', 'Letterlike-Symbols',
  'Arrows', 'Geometric-Shapes', 'Miscellaneous-Symbols', 'Miscellaneous-Technical',
  'Dingbats', 'Block-Elements', 'Box-Drawing', 'Enclosed-Alphanumerics',
  'Enclosed-Alphanumeric-Supplement', 'Enclosed-CJK-Letters-and-Months',
  'Cyrillic', 'Greek-and-Coptic', 'Vertical-Forms',
  'CJK-Compatibility', 'CJK-Compatibility-Forms',
  'Ideographic-Symbols-and-Punctuation', 'CJK-Radicals-Supplement',
  'Kangxi-Radicals', 'Ideographic-Description-Characters', 'Specials',
  'Superscripts-and-Subscripts',
];
for (let i = 1; i <= 19; i++) SUBSETS.push(`CJK-Unified-Ideographs-${String(i).padStart(3, '0')}`);
SUBSETS.push('CJK-Unified-Ideographs-Extension-A-001', 'CJK-Unified-Ideographs-Extension-A-002');

/* ------------------------------------------------------------- 補助 ------ */
/** Python(fontTools) を呼ぶ。brotli 必須（pip install --break-system-packages brotli） */
function py(code) {
  const out = execFileSync('python3', ['-c', code], { encoding: 'utf8' });
  return out.trim();
}

/**
 * 文字集合を 2 種類返す。
 *   required … ゲーム内に実際に現れる文字。グリフが無ければビルドを失敗させる。
 *   bonus    … 予備（かな・英数・約物・記号）。あれば取り込むが、無くても失敗にしない。
 *              （一般約物の U+2045 等は Fusion Pixel に存在せず、必須扱いにすると
 *                ビルドが無意味に落ちるため）
 */
function collectCharsets() {
  const required = new Set();
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html|css)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  files.push(path.join(ROOT, 'index.html'));

  for (const f of files) {
    for (const ch of fs.readFileSync(f, 'utf8')) {
      const o = ch.codePointAt(0);
      if (o > 0x2000 || (0x20 <= o && o < 0x7f)) required.add(ch);
    }
  }

  const bonus = new Set(required);
  const ranges = [[0x0020, 0x007f], [0x2000, 0x2070], [0x2190, 0x21a0],
  [0x2500, 0x2580], [0x25a0, 0x25b0], [0x3000, 0x3100], [0xff00, 0xff70]];
  for (const [a, b] of ranges) for (let o = a; o < b; o++) bonus.add(String.fromCodePoint(o));
  for (const ch of '─―‐–—‖‘’“”†‡•…‥※‼⁇⁈⁉、。「」『』（）〔〕【】〈〉《》〜！＃＄％＆＊＋，．／：；＜＝＞？＠［］＾＿｀｛｜｝￥　✝×±°·') bonus.add(ch);
  return { required, bonus };
}

/* ------------------------------------------------------------- 実行 ------ */
console.log('✝本質✝ フォントビルド');
if (!fs.existsSync(SRC)) {
  console.error(`入力が見つかりません: ${SRC}`);
  console.error('取得手順は docs/ASSETS.md を参照してください。');
  process.exit(1);
}
fs.mkdirSync(WORK, { recursive: true });
fs.rmSync(path.join(WORK, 'ttf'), { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'ttf'), { recursive: true });

const files = SUBSETS
  .map(n => path.join(SRC, `Fusion-Pixel-12px-Proportional-Japanese.${n}.woff2`))
  .filter(p => { if (!fs.existsSync(p)) console.warn('  skip:', path.basename(p)); return fs.existsSync(p); });
console.log(`  サブセット ${files.length} 件 / 予定 ${SUBSETS.length} 件`);

const { required, bonus } = collectCharsets();
const textFile = path.join(WORK, 'charset.txt');
const reqFile = path.join(WORK, 'charset-required.txt');
fs.writeFileSync(textFile, [...bonus].sort().join(''), 'utf8');
fs.writeFileSync(reqFile, [...required].sort().join(''), 'utf8');
console.log(`  文字集合 ${bonus.size} 文字（うち必須 ${required.size} 文字）`);

/* 1) woff2 → TTF 展開、2) 合成、3) サブセット化して woff2 保存 */
const mergeScript = `
import glob, os, json
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
from fontTools import subset

SRC = ${JSON.stringify(files)}
WORK = ${JSON.stringify(path.join(WORK, 'ttf'))}
TEXT = open(${JSON.stringify(textFile)}, encoding='utf-8').read()
REQUIRED = open(${JSON.stringify(reqFile)}, encoding='utf-8').read()
OUT = ${JSON.stringify(OUT)}

ttfs = []
for p in SRC:
    f = TTFont(p)
    o = os.path.join(WORK, os.path.basename(p).replace('.woff2', '.ttf'))
    f.flavor = None
    f.save(o)
    ttfs.append(o)

merged = Merger().merge(sorted(ttfs))
n_all = len(merged.getGlyphOrder())

opts = subset.Options()
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
opts.recalc_bounds = True
opts.drop_tables = ['DSIG']
sub = subset.Subsetter(opts)
sub.populate(text=TEXT)
sub.subset(merged)
merged.flavor = 'woff2'
merged.save(OUT)

check = TTFont(OUT)
cmap = check.getBestCmap()
# ✝ (U+271D) は本文フォントに存在しないため、ゲーム側がドット絵グリフを自前で描く
# （src/art/glyph.js の drawCross / CROSS_BITMAP）。したがって欠落扱いにしない。
DRAWN_BY_ENGINE = {'\u271d'}
missing = [c for c in REQUIRED if ord(c) not in cmap and not c.isspace() and c not in DRAWN_BY_ENGINE]
dropped = [c for c in TEXT if ord(c) not in cmap and not c.isspace()]
print(json.dumps({
    'merged_glyphs': n_all,
    'subset_glyphs': len(check.getGlyphOrder()),
    'size_kb': round(os.path.getsize(OUT) / 1024, 1),
    'missing': ''.join(missing),
    'dropped_bonus': len(dropped),
}))
`;
let res;
try {
  res = JSON.parse(py(mergeScript));
} catch (e) {
  console.error('フォントの合成に失敗しました。brotli / fontTools が入っているか確認してください。');
  console.error('  pip install --break-system-packages fonttools brotli');
  throw e;
}
console.log(`  合成後グリフ ${res.merged_glyphs} → サブセット ${res.subset_glyphs} グリフ`);
if (res.dropped_bonus) console.log(`  （予備文字のうち ${res.dropped_bonus} 文字は素材に無いため除外）`);
console.log(`  出力 ${path.relative(ROOT, OUT)}  ${res.size_kb} KB`);

if (res.missing) {
  const list = [...res.missing].map(c => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ${c}`);
  console.error(`  NG: グリフの無い文字が ${list.length} 種あります:`);
  for (const l of list.slice(0, 40)) console.error('    ' + l);
  process.exit(1);
}
console.log('  グリフ欠落なし（豆腐は出ません）');

/* -------------------------------------------------------- ライセンス同梱 ---
 *  フォント本体のライセンスは **OFL-1.1**（Fusion Pixel Font / TakWolf）。
 *  npm パッケージの MIT はビルドツール側のライセンスなので、
 *  フォントとして再配布するときは OFL の全文を同梱する必要がある。
 *  合成元（ark-pixel / cubic-11 / galmuri など）の全文も合わせて同梱する。
 */
const pkg = path.resolve(SRC, '../../../..');   // .../package
const copies = [
  ['LICENSE.font.txt', 'assets/fonts/LICENSE-FusionPixel-OFL.txt'],
  ['NOTICE.md', 'assets/fonts/NOTICE-FusionPixel.md'],
];
for (const [from, to] of copies) {
  const a = path.join(pkg, from), b = path.join(ROOT, to);
  if (fs.existsSync(a)) { fs.copyFileSync(a, b); console.log(`  同梱: ${to}`); }
  else console.warn(`  ! 見つからない: ${from}`);
}
const licDir = path.join(pkg, 'LICENSES');
const licOut = path.join(ROOT, 'assets/fonts/LICENSES-FusionPixel');
if (fs.existsSync(licDir)) {
  fs.rmSync(licOut, { recursive: true, force: true });
  fs.cpSync(licDir, licOut, { recursive: true });
  console.log('  同梱: assets/fonts/LICENSES-FusionPixel/ （合成元フォントの全文）');
}
console.log('  フォント本体のライセンス: SIL OFL 1.1（MIT はパッケージのビルドツール側）');
console.log('完了');
