#!/usr/bin/env python3
# =============================================================================
# tools/build-assets.py — 原作立ち絵からゲーム用素材を生成する
#
#  入力: google_drive/chr_*.png （原作立ち絵・作者提供）
#  出力:
#    assets/cutin/<key>.png  カットイン用バストアップ（原作の絵をそのまま活用）
#    assets/face/<key>.png   ピクセル調の小さな顔アイコン（ドット絵空間に統合）
#
#  「色調・明度・解像感を調整し、一つの作品として見せる」ための後処理を施す:
#   ・バスト（頭〜胸）を切り出し、ゲーム内で使うサイズへ整数比に近い縮小
#   ・彩度・コントラストを微調整してゲームの暗い背景に馴染ませる
#   ・顔アイコンはゲームのパレットへ減色し、輪郭線を付けてドット絵として読ませる
# =============================================================================
import os, sys, json, glob
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'google_drive')
OUT_CUTIN = os.path.join(ROOT, 'assets', 'cutin')
OUT_FACE = os.path.join(ROOT, 'assets', 'face')

# key -> [表示名, 使用する表情ファイルの接尾辞（優先順）]
ROSTER = {
    'ryoma':     ('両馬二郎',      ['01_tsuujou', '02_niyari']),
    'terachi':   ('寺地星',        ['01_nemusou', '03_haishin_shinken']),
    'satou':     ('砂糖東洋',      ['01_game_gyoushi', '02_muhyoujou']),
    'mie':       ('三重県臣',      ['01_reishou', '02_ha', '04_kimazui_chinmoku']),
    'rei':       ('零',            ['01_suzushii', '02_hohoemi']),
    'kuraishi':  ('倉石暁',        ['01_nekkyou', '05_hokorashige']),
    'katsuya':   ('塀勝也',        ['01_tsuujou', '02_hohoemi', '07_kaisou_me_hosomeru']),
    'mitsumine': ('三峰',          ['01_tsuujou', '02_tsukkomi']),
    'meshino':   ('召野カイト',    ['01_tsuujou', '04_shinken']),
    'sakura':    ('櫻優',          ['02_kenkyuusha', '05_egao']),
    'naitou':    ('内藤蘭',        ['01_tsuujou', '05_yasashii_me']),
    'izumi':     ('伊豆見',        ['02_egao', '03_kinchou']),
    'izaki':     ('伊崎',          ['01_tsuujou', '02_egao']),
    'futami':    ('二見',          ['01_tsuujou', '05_yokogao']),
    'inaba':     ('稲葉',          ['01_furushashin_hohoemi']),
}

# ゲームのコアパレット（src/art/palette.js と同期）— 顔アイコンの減色先
CORE_PALETTE = [
    '#05060c', '#0b0d16', '#141728', '#1f2438', '#2b2f42', '#39415c', '#7b85a8', '#c9cfe2', '#ffffff',
    '#0d1430', '#16275e', '#30509f', '#6b8ce0',
    '#22060f', '#5c1226', '#a82244', '#e05575',
    '#241a06', '#6b5320', '#c39a3c', '#f5df95',
    '#2a261c', '#6b6350', '#b3a583', '#f2e8cd',
    '#06222b', '#0e4c59', '#2a9dae', '#8fe8f2',
    '#071c12', '#17402a', '#2d7a4e', '#7fd6a0',
    '#150a2b', '#2e1a58', '#5b3aa0', '#a98ce8',
    '#2b0620', '#661046', '#b52482', '#f07cc4',
    '#2b1204', '#7a3208', '#d4701a', '#f7c072',
    # 肌・髪の中間色（減色で顔が破綻しないよう補う）
    '#f6d5be', '#e8b494', '#c98a6a', '#9c6046', '#6e3f2e',
    '#f0dcc8', '#d9bda3', '#b08e74',
    '#3a2a24', '#241a16', '#4d3a30', '#6b5240', '#8a6a4e',
]


def find_source(key, suffixes):
    for suf in suffixes:
        pat = os.path.join(SRC, f'chr_{key}_{suf}.png')
        if os.path.exists(pat):
            return pat
    cands = sorted(glob.glob(os.path.join(SRC, f'chr_{key}_*.png')))
    return cands[0] if cands else None


def grade(im, contrast=1.06, color=1.04, brightness=1.0):
    im = ImageEnhance.Contrast(im).enhance(contrast)
    im = ImageEnhance.Color(im).enhance(color)
    if brightness != 1.0:
        im = ImageEnhance.Brightness(im).enhance(brightness)
    return im


def make_cutin(path, height, frac=0.36):
    """バストアップを作る。幅は元のアスペクト比を保つ。"""
    im = Image.open(path).convert('RGBA')
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    w, h = im.size
    ch = int(h * frac)
    c = im.crop((0, 0, w, ch))
    # 縮小（LANCZOS）で質感を保つ
    nw = max(1, round(c.width * height / c.height))
    c = c.resize((nw, height), Image.LANCZOS)
    c = grade(c)
    # 下端を自然にフェードさせ、背景へ溶け込ませる
    fade = max(12, int(height * 0.16))
    alpha = c.split()[3]
    ad = ImageDraw.Draw(alpha)
    for i in range(fade):
        y = height - fade + i
        v = int(255 * (1 - (i / fade) ** 1.35))
        ad.line([(0, y), (nw, y)], fill=v)
    c.putalpha(alpha)
    return c


def make_face(path, size=48, frac=0.27):
    """頭部を切り出してドット絵の顔アイコンにする（頭全体が入るよう余白を確保）。"""
    im = Image.open(path).convert('RGBA')
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    w, h = im.size
    # 頭部＋首元まで。切り落とさないよう上部から取る。
    ch = int(h * frac)
    c = im.crop((0, 0, w, ch))
    cw, chh = c.size
    # 正方形へ「内接配置」（切り抜かず、余白で調整して頭が欠けないようにする）
    s = max(cw, chh)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(c, ((s - cw) // 2, int((s - chh) * 0.12)), c)
    c = sq.resize((size, size), Image.LANCZOS)
    # 減色（ゲームのパレットへ）＋輪郭線
    bg = Image.new('RGB', (size, size), (5, 6, 12))
    bg.paste(c, (0, 0), c)
    pal = Image.new('P', (1, 1))
    flat = []
    for hx in CORE_PALETTE:
        hx = hx.lstrip('#')
        flat += [int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)]
    flat += [0] * (768 - len(flat))
    pal.putpalette(flat)
    q = bg.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGBA')
    px = q.load()
    out = q.copy()
    o = out.load()
    EDGE = (5, 6, 12, 255)
    for y in range(size):
        for x in range(size):
            if x == 0 or y == 0 or x == size - 1 or y == size - 1:
                o[x, y] = EDGE
                continue
            a = px[x, y]
            if a[3] < 40:
                o[x, y] = EDGE
            elif (px[x - 1, y][3] < 40 or px[x + 1, y][3] < 40 or
                  px[x, y - 1][3] < 40 or px[x, y + 1][3] < 40):
                o[x, y] = EDGE
    return out


def main():
    os.makedirs(OUT_CUTIN, exist_ok=True)
    os.makedirs(OUT_FACE, exist_ok=True)
    manifest = {}
    total = 0
    for key, (name, sufs) in ROSTER.items():
        src = find_source(key, sufs)
        if not src:
            print(f'  !! {key}: 素材が見つかりません')
            continue
        cut = make_cutin(src, 320)
        cp = os.path.join(OUT_CUTIN, f'{key}.png')
        cut.save(cp, optimize=True)
        face = make_face(src, 48)
        fp = os.path.join(OUT_FACE, f'{key}.png')
        face.save(fp, optimize=True)
        sz = os.path.getsize(cp) + os.path.getsize(fp)
        total += sz
        manifest[key] = {'name': name, 'source': os.path.basename(src),
                         'cutin': [cut.width, cut.height], 'face': [48, 48]}
        print(f'  {key:10s} {name:8s}  cutin {cut.width}x{cut.height}  '
              f'{os.path.getsize(cp)//1024}KB + {os.path.getsize(fp)//1024}KB')
    with open(os.path.join(ROOT, 'assets', 'asset-manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f'\n合計 {total/1024:.0f} KB / {len(manifest)} キャラクター')


if __name__ == '__main__':
    main()
