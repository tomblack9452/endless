# The credit packs' icons: gold coin stacks, in the cores icons' line style.
# Writes public/store/<id>.png (160 px, the game's store) and
# docs/store-assets/products/<id>.png (512 px, Play Console's product icon).
#
#   python scripts/credit-icons.py      (needs Pillow: pip install pillow)

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (241, 237, 228, 255)  # the cores icons' paper
INK = (176, 132, 52, 255)  # gold: credits, beside the cores' violet
LINE = 3.2  # stroke, in the 160-unit drawing
W, H, T = 50, 17, 8  # a coin's width, its face's height, its thickness

# Each pack: stacks of coins as (centre x, coins, how far the stack stands above the shared floor).
PACKS = {
    'credits_1000': [(80, 3, 0)],
    'credits_2500': [(80, 6, 0)],
    'credits_5000': [(56, 3, 0), (104, 6, 0)],
    'credits_10000': [(40, 4, 6), (120, 5, 6), (80, 7, 0)],
}


def draw(stacks, size):
    s = size / 160
    sup = 4  # drawn larger, then scaled down for smooth edges
    k = s * sup
    im = Image.new('RGBA', (size * sup, size * sup), BG)
    d = ImageDraw.Draw(im)
    lw = max(1, round(LINE * k))
    tallest = max(n for _, n, _ in stacks)
    floor = 80 + (tallest * T + H) / 2  # the tallest stack sits centred
    # Back stacks (raised ones) first, so the front one overlaps them.
    for cx, n, lift in sorted(stacks, key=lambda st: -st[2]):
        base = floor - lift - T - H / 2  # the bottom coin's face centre
        x0, x1 = (cx - W / 2) * k, (cx + W / 2) * k
        for i in range(n):
            y = (base - i * T) * k
            t, h = T * k, H * k
            d.ellipse([x0, y + t - h / 2, x1, y + t + h / 2], fill=BG)
            d.rectangle([x0, y, x1, y + t], fill=BG)
            d.ellipse([x0, y - h / 2, x1, y + h / 2], fill=BG)
            d.arc([x0, y + t - h / 2, x1, y + t + h / 2], 0, 180, fill=INK, width=lw)
            d.line([x0 + lw / 2, y, x0 + lw / 2, y + t], fill=INK, width=lw)
            d.line([x1 - lw / 2, y, x1 - lw / 2, y + t], fill=INK, width=lw)
            d.ellipse([x0, y - h / 2, x1, y + h / 2], outline=INK, width=lw)
        y = (base - (n - 1) * T) * k
        iw, ih = W * 0.56 * k, H * 0.5 * k
        d.ellipse([cx * k - iw / 2, y - ih / 2, cx * k + iw / 2, y + ih / 2], outline=INK, width=max(1, round(LINE * 0.8 * k)))
    return im.resize((size, size), Image.LANCZOS)


for pack, stacks in PACKS.items():
    draw(stacks, 160).save(ROOT / 'public' / 'store' / f'{pack}.png')
    draw(stacks, 512).save(ROOT / 'docs' / 'store-assets' / 'products' / f'{pack}.png')
    print(pack)
