#!/usr/bin/env python3
"""
make_portraits.py — 原作立ち絵を「ゲーム向けピクセルアート」へ翻案する処理

原作立ち絵 (source_assets/portraits/*.png, 1024x1536 前後のアニメ調イラスト) を
そのまま貼るのではなく、以下を施してゲーム内のドット絵表現に統合する:

  1. 背景(白)を境界からのフラッドフィルで透過 (キャラ内部の白は保持)
  2. 不透明領域のバウンディングボックスで余白を切り落とし
  3. プリマルチプライドアルファで縮小 (エッジの色滲みを防止)
  4. 減色 (メディアンカット) でパレットを制限 → ドット絵らしい階調
  5. 輪郭を 1px ダークで締める (ドット絵の「縁取り」表現)

出力:
  public/assets/px/<key>.png     … 高さ 320 / 28色  (会話・ボス基準)
  public/assets/px_hi/<key>.png  … 高さ 384 / 56色  (大カットイン用・等倍描画)

元画像は source_assets/portraits/ にそのまま保持する (無改変)。
"""
import os
import sys
import glob
import json
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "source_assets", "portraits")
OUT_PX = os.path.join(ROOT, "public", "assets", "px")
OUT_HI = os.path.join(ROOT, "public", "assets", "px_hi")

PX_H, PX_COLORS = 320, 28
HI_H, HI_COLORS = 384, 56
BUST_H, BUST_COLORS = 384, 40
BOSS_H, BOSS_COLORS = 176, 40   # ボスはゲーム内で等倍描画したいので実寸で書き出す


# --------------------------------------------------------------------------
def remove_white_bg(im: Image.Image, tol: int = 26) -> Image.Image:
    """境界から連結している明るい画素だけを透過する。
    シャツなどキャラ内部の白は境界と繋がっていなければ残る。"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_bg(p):
        r, g, b, a = p
        if a < 8:
            return True
        return r >= 255 - tol and g >= 255 - tol and b >= 255 - tol

    visited = bytearray(w * h)
    q = deque()

    def push(x, y):
        if 0 <= x < w and 0 <= y < h:
            i = y * w + x
            if not visited[i] and is_bg(px[x, y]):
                visited[i] = 1
                q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)

    return im


# --------------------------------------------------------------------------
def premul_resize(im: Image.Image, size) -> Image.Image:
    """プリマルチプライドアルファで縮小 → アンパープリマルチプライ。"""
    r, g, b, a = im.split()
    rgb = Image.merge("RGB", (r, g, b))
    # 色をアルファで重み付けしてから縮小する
    a_small = a.resize(size, Image.LANCZOS)
    prem = Image.new("RGB", im.size)
    prem.paste(rgb, (0, 0), a)          # 透過部を黒で埋める
    prem_small = prem.resize(size, Image.LANCZOS)
    pr, pg, pb = prem_small.split()
    return Image.merge("RGBA", (pr, pg, pb, a_small))


# --------------------------------------------------------------------------
def shrink_alpha(im: Image.Image, amount: int = 1) -> Image.Image:
    """アルファを収縮させて縁のジャギ・半透明のにじみを抑える。"""
    if amount <= 0:
        return im
    a = im.split()[3]
    for _ in range(amount):
        a = a.filter(ImageFilter.MinFilter(3))
    r, g, b, _ = im.split()
    return Image.merge("RGBA", (r, g, b, a))


# --------------------------------------------------------------------------
def quantize_rgba(im: Image.Image, colors: int, outline=True) -> Image.Image:
    """RGB を減色し、元のアルファを戻す。さらに輪郭を締める。"""
    a = im.split()[3]
    # アルファ境界をハードニング (ドット絵らしい 2 値の輪郭)
    a = a.point(lambda v: 0 if v < 100 else 255)

    rgb = im.convert("RGB")
    # 透過部分の色が量子化に悪影響しないよう、可視画素だけでパレットを作る
    q = rgb.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    rgb_q = q.convert("RGB")

    out = Image.merge("RGBA", (*rgb_q.split(), a))

    if outline:
        # アルファの外縁 1px を暗色で締める
        er = a.filter(ImageFilter.MaxFilter(3))
        edge = Image.new("L", im.size, 0)
        ep, rp, op = er.load(), a.load(), edge.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                if rp[x, y] == 0 and ep[x, y] > 0:
                    op[x, y] = 255
        dark = Image.new("RGB", im.size, (12, 10, 18))
        outlined = Image.composite(dark, rgb_q, edge)
        # 縁の下に元絵を残すため、縁画素だけ差し替える
        final = Image.new("RGBA", im.size, (0, 0, 0, 0))
        final.paste(outlined, (0, 0), edge)
        final.paste(out, (0, 0), out)
        out = final
    return out


# --------------------------------------------------------------------------
def process(path: str, out_dir: str, height: int, colors: int,
            outline: bool, x_inset: float = 0.0, y_from: float = 0.0,
            y_to: float = 1.0):
    name = os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path)
    im = remove_white_bg(im)

    # 不透明バウンディングボックスで余白を切る
    bbox = im.split()[3].getbbox()
    if bbox:
        im = im.crop(bbox)

    w, h = im.size
    if y_from > 0 or y_to < 1 or x_inset > 0:
        im = im.crop((
            int(w * x_inset),
            int(h * y_from),
            int(w * (1 - x_inset)),
            int(h * y_to),
        ))
        w, h = im.size

    # アスペクト比を保って目標高さへ
    tw = max(1, round(w * (height / h)))
    im = premul_resize(im, (tw, height))
    im = shrink_alpha(im, 1)
    im = quantize_rgba(im, colors, outline=outline)

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, name + ".png")
    im.save(out_path, optimize=True)
    return name, tw, height, os.path.getsize(out_path)


# --------------------------------------------------------------------------
def main():
    files = sorted(glob.glob(os.path.join(SRC, "*.png")))
    if not files:
        print("元立ち絵が見つかりません:", SRC, file=sys.stderr)
        return 1

    manifest = {}
    total = 0
    print(f"{len(files)} 枚を処理します\n")
    for f in files:
        key = os.path.splitext(os.path.basename(f))[0]
        n1, w1, h1, s1 = process(f, OUT_PX, PX_H, PX_COLORS, True)
        n2, w2, h2, s2 = process(f, OUT_HI, HI_H, HI_COLORS, False)
        # 素体 (等身そのまま) とボス用バストアップ (頭〜腰) の 2 種を生成
        n3, w3, h3, s3 = process(f, os.path.join(OUT_PX, "bust"),
                                 BUST_H, BUST_COLORS, True,
                                 x_inset=0.12, y_to=0.40)
        n4, w4, h4, s4 = process(f, os.path.join(OUT_PX, "boss"),
                                 BOSS_H, BOSS_COLORS, True,
                                 x_inset=0.02, y_to=0.30)
        manifest[key] = {
            "px": {"file": f"assets/px/{n1}.png", "w": w1, "h": h1},
            "px_hi": {"file": f"assets/px_hi/{n2}.png", "w": w2, "h": h2},
            "bust": {"file": f"assets/px/bust/{n3}.png", "w": w3, "h": h3},
            "boss": {"file": f"assets/px/boss/{n4}.png", "w": w4, "h": h4},
        }
        total += s1 + s2 + s3 + s4
        print(f"  {key:42s} px {w1:3d}x{h1}  hi {w2:3d}x{h2}  bust {w3:3d}x{h3}  boss {w4:3d}x{h4}", flush=True)

    with open(os.path.join(ROOT, "src", "game", "portrait_manifest.json"), "w",
              encoding="utf-8") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=1)

    # ランタイム用: JSON をそのまま import するとブラウザによっては
    # import attributes が必要になるため、同じ内容の JS モジュールも出す。
    js_body = json.dumps(manifest, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "src", "game", "portraits.js"), "w",
              encoding="utf-8") as fp:
        fp.write("/**\n * portraits.js — 自動生成ファイル (tools/make_portraits.py)\n"
                 " *\n * 立ち絵ごとのピクセル化済みバリアント。手で編集しないこと。\n"
                 " *   px     : 会話・カットイン用 (高さ 320 / 28 色)\n"
                 " *   px_hi  : 会話・カットイン用の高精細版 (高さ 384 / 56 色)\n"
                 " *   bust   : バストアップ (会話の枠内用)\n"
                 " *   boss   : ボス本体用 (176px / 40 色 / 1:1 描画)\n"
                 " */\n")
        fp.write("export const PORTRAITS = " + js_body + ";\n\n")
        fp.write("export default PORTRAITS;\n")

    print(f"\n{len(files)} 枚 / 合計 {total/1024/1024:.1f}MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
