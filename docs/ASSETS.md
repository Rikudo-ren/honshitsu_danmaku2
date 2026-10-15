# 使用素材とライセンス

**このゲームで外部から取得した素材はフォント 2 種だけである。**
画像・音声はすべて本作が生成・合成したもので、外部の画像素材・音源は 1 点も使っていない。

## 一覧

| 種別 | 素材 | ライセンス | 同梱物 | 入手元 |
|---|---|---|---|---|
| 本文フォント | **Fusion Pixel 12px**（日本語サブセット） | **SIL OFL 1.1** | `assets/fonts/FusionPixel12-japanese.woff2`（37 KB） | npm `@vp-tw/cjk-web-fonts-fusion-pixel-font` v0.0.1 |
| 数字・UI フォント | **Silkscreen** 400 / 700 | SIL OFL 1.1 | `assets/fonts/Silkscreen-latin-400.woff2` ほか | npm `@fontsource/silkscreen` |
| 立ち絵（原画） | 原作プロジェクト提供の 78 枚 | 提供物（原作プロジェクト） | `assets/cutin/` 15 枚、`assets/face/` 15 枚（加工後） | Google Drive（プロジェクト提供） |
| 原作テキスト | 『偏差値60の教室から✝本質✝が漏れ出している件について』 | 提供物（原作プロジェクト） | 引用のみ `src/data/script.js` に収録 | Google Drive（プロジェクト提供） |
| 画像（弾・自機・ボス・背景・エフェクト） | すべて本作が描画コードで生成 | 本作 | — | — |
| 楽曲・効果音 | すべて本作が Web Audio で合成 | 本作 | — | — |

フォントのライセンス全文は `assets/fonts/` に同梱している。

- `LICENSE-FusionPixel-OFL.txt` — Fusion Pixel Font（TakWolf）の OFL-1.1 全文
- `LICENSES-FusionPixel/` — Fusion Pixel が合成している元フォント（ark-pixel / cubic-11 / galmuri など）の全文
- `NOTICE-FusionPixel.md` — 入手元と版の記録
- `LICENSE-Silkscreen.txt` — Silkscreen の OFL-1.1 全文

### Fusion Pixel の扱いについて（正確な記録）

- フォント本体は **SIL OFL 1.1**（Fusion Pixel Font / TakWolf、upstream release 2026.08.11）。
- npm パッケージ `@vp-tw/cjk-web-fonts-fusion-pixel-font` の `license` フィールドは
  `MIT AND OFL-1.1` だが、**MIT は同パッケージのビルドツール側**のライセンスである
  （パッケージの `NOTICE.md` に明記されている）。したがって
  **フォントとして再配布する本作では OFL-1.1 の全文を同梱**している。
- 本作のフォントファイルは、OFL-1.1 が認める **Modified Version（必要文字へのサブセット）**
  である。ファミリ名は `FusionPixel12` とし、原フォントの名称をそのまま使っていない。
- ✝（U+271D）など原フォントに存在しない文字があるため、
  **それらはゲーム側がビットマップから自前で描画する**（`src/art/glyph.js` の `drawCross`）。
  フォントに無い文字を無理に使っているわけではない。

## 再生成の手順

リポジトリには**再生成に必要な素材と手順を残している**が、
ライセンス上問題のない範囲に留めるため、取得物そのものは同梱していない
（フォントは OFL が認める形でサブセット化して同梱している）。

### 1. フォント

```bash
# 1) 配布物を取得（npm レジストリから）
mkdir -p /tmp/assets && cd /tmp/assets
npm pack @vp-tw/cjk-web-fonts-fusion-pixel-font
tar xzf vp-tw-cjk-web-fonts-fusion-pixel-font-0.0.1.tgz

# 2) 日本語 12px プロポーショナルの woff2 サブセット群から合成
pip install --break-system-packages fonttools brotli
cd <リポジトリ>
node tools/build-font.js            # 既定の入力: /tmp/assets/package/dist/12px/proportional/ja
node tools/build-font.js --src /path/to/fusion-pixel-ja   # 場所を変えた場合
```

`build-font.js` は次を行う。

1. 44 個の woff2 サブセットを 1 つの TTF に合成（23,505 グリフ）
2. `src/**` と `index.html` に実際に現れる文字＋予備（かな・英数・約物・記号）に絞ってサブセット化
3. `assets/fonts/FusionPixel12-japanese.woff2` として保存（1,514 グリフ / 37 KB）
4. **必須文字（ソースに現れる 1,123 文字）にグリフ欠落が無いか検査し、あれば失敗させる**
5. OFL 全文と合成元フォントのライセンスを `assets/fonts/` へ同梱

✝ だけは意図的に欠落扱いの対象外にしてある（ゲーム側が自前で描くため）。
その旨はスクリプト内の `DRAWN_BY_ENGINE` に理由付きで書いてある。

### 2. 立ち絵

```bash
python3 tools/build-assets.py
```

`google_drive/chr_*.png` から `assets/cutin/` と `assets/face/` を生成する。
使用した原画のファイル名は `assets/asset-manifest.json` に記録される。

> `google_drive/` はリポジトリに含めていない（57 MB の原画のため）。
> 再生成には原作プロジェクトからの提供物が必要である。

## 検証

```bash
node tools/validate-assets.js
```

- 15 キャラぶんの cutin / face が実在するか
- ソース内のアセットキー（`CHARS`）とマニフェストが一致するか
- フォント本体とライセンス全文が揃っているか
- クレジット表が参照するファイルが実在するか
- マニフェストに無い（＝置いてあるだけの）アセットが無いか

## 素材の取得について（事実の記録）

- 画像素材サイト（OpenGameArt / itch.io / Kenney など）へは**到達できなかった**
  （この作業環境のネットワーク制約）。したがってそこからの素材は**使用していない**。
- 到達可能だったのは GitHub / npm / PyPI のみで、そこで見つけたもののうち
  **実際に取得して内容とライセンスを確認できたのは上記フォント 2 種だけ**である。
- 検討して**採用しなかった**ものも記録しておく:
  - `TakWolf/ark-pixel-font` — MIT だが GitHub の tarball にビルド済みフォントが含まれない
  - `SolidZORO/zpix-pixel-font` — ライセンスが明示されていないため**使用しない**
  - `hicchicc/x8y12pxDenkiChip` / `Astro-2539/ZLabs-Pixel-12px` — 取得は可能だったが、
    採用した Fusion Pixel のほうが必要文字を広く覆っていた
