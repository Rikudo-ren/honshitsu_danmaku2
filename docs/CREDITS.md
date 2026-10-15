# クレジット

## 作品

**✝本質✝ — 耐久型ドット絵弾幕ゲーム**

| 役割 | 担当 |
|---|---|
| 企画・設計・ディレクション・弾幕設計 | 本作制作 |
| プログラム（描画・弾幕・音声・UI） | 本作制作 |
| ドット絵（自機・ボス・弾・背景・エフェクト・✝グリフ） | 本作制作（**すべてプロシージャル生成。画像素材を使用していない**） |
| 楽曲・効果音 | 本作制作（**Web Audio による合成。外部音源不使用**） |
| キャラクター原画（立ち絵） | 原作プロジェクト提供 — `assets/cutin` / `assets/face` に加工のうえ使用 |
| 原作テキスト | 原作プロジェクト提供 |

## 原作

> **『偏差値60の教室から✝本質✝が漏れ出している件について』**

本作は原作小説の世界観・登場人物・象徴を基盤に、**翻案**してゲーム化したものです。
原作に戦闘は存在しないため、授業・配信・学期という「時間」を弾幕のフェーズに置き換えています。
どの部分を採用し、どこを翻案し、どこが本作の独自追加かは
[ADAPTATION.md](ADAPTATION.md) に区分して明記しています（ゲーム内の用語集でも確認できます）。

## 外部素材

本作が外部から取得した素材は**フォント 2 種のみ**です。

### Fusion Pixel Font（本文の日本語）

- 名称: **Fusion Pixel 12px**（日本語サブセット / Modified Version）
- 作者: **TakWolf** — <https://github.com/TakWolf/fusion-pixel-font>
- ライセンス: **SIL Open Font License 1.1**
- 全文: [`assets/fonts/LICENSE-FusionPixel-OFL.txt`](../assets/fonts/LICENSE-FusionPixel-OFL.txt)
- 合成元フォントの全文: [`assets/fonts/LICENSES-FusionPixel/`](../assets/fonts/LICENSES-FusionPixel/)
- 記録: [`assets/fonts/NOTICE-FusionPixel.md`](../assets/fonts/NOTICE-FusionPixel.md)
- 入手元: npm `@vp-tw/cjk-web-fonts-fusion-pixel-font` v0.0.1
  （パッケージの `license` は `MIT AND OFL-1.1`。**MIT はパッケージのビルドツール側**であり、
  フォント本体は OFL-1.1。本作はフォントとして再配布するため **OFL-1.1 の全文を同梱**している）
- 加工: 必要な文字（1,514 グリフ）へのサブセット化。ファミリ名を `FusionPixel12` に変更。
  生成は `tools/build-font.js`。
- 備考: ✝（U+271D）など原フォントに無い文字は、**ゲーム側が自前でビットマップから描画**する。

### Silkscreen（数字・UI）

- 名称: **Silkscreen**（400 / 700）
- 作者: Jason Kottke / The Silkscreen Project Authors
- ライセンス: **SIL Open Font License 1.1**
- 全文: [`assets/fonts/LICENSE-Silkscreen.txt`](../assets/fonts/LICENSE-Silkscreen.txt)
- 入手元: npm `@fontsource/silkscreen`

## 使用していないもの（明確化）

- 外部の画像素材（いわゆるフリー素材・ドット絵素材）は**1 点も使用していない**。
- 外部の音源・BGM は**使用していない**。
- 生成 AI による画像は**使用していない**。すべて描画コードが生成している。
- 立ち絵以外の人物グラフィックは原画の流用ではなく、観察のうえ描き起こしたドット絵である。

## 再配布について

本作の画像・音声はすべて本作が生成するコードの出力です。
立ち絵（`assets/cutin` / `assets/face`）と原作テキストの引用は原作プロジェクトの提供物であり、
**その権利は原作プロジェクトに帰属します**。再配布の条件は原作プロジェクトに従ってください。

フォントは上記の OFL-1.1 に従います。
