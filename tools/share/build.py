# Link-preview card (img/share.png, 1200x630): python3 tools/share/build.py . img/share.png
# night sky + body glows, the seeded star field (same algorithm as index.html), and the centred white logo with the home page's black outline + offset shadow.
import sys
import numpy as np
from PIL import Image, ImageFilter

site, out = sys.argv[1], sys.argv[2]
W, H = 1200, 630
SKY = np.array([11, 6, 18], float)

# Glows: the body's radial gradients, radii scaled to the card. (cx, cy, rx, ry, rgb, alpha)
GLOWS = [(W, 40, 560, 430, (255, 95, 176), .22), (0, 260, 500, 500, (154, 107, 255), .24), (W, 560, 560, 430, (79, 220, 255), .14)]
img = np.tile(SKY, (H, W, 1))
yy, xx = np.mgrid[0:H, 0:W]
for cx, cy, rx, ry, c, a in reversed(GLOWS):          # first CSS layer paints on top
    k = (a * np.clip(1 - np.hypot((xx - cx) / rx, (yy - cy) / ry), 0, 1))[..., None]
    img = img * (1 - k) + np.array(c, float) * k

# Star field: port of the site's seeded canvas (rng per 512px band, 2px grid).
def rng(seed):
    def r():
        nonlocal seed
        seed = seed * 16807 % 2147483647
        return seed / 2147483647
    return r
COLS = [(255, 255, 255), (255, 124, 200), (79, 220, 255), (255, 255, 255)]
for band, y0 in enumerate(range(0, H, 512)):
    r = rng(9 + band * 7919)
    for i in range(round(W * 512 / 1400)):
        big = r() < .06
        a = .55 + r() * .4 if big else .15 + r() * .35
        x, y, s = int(r() * W / 2) * 2, y0 + int(r() * 256) * 2, 2 if big else 1
        img[y:y + s, x:x + s] = img[y:y + s, x:x + s] * (1 - a) + np.array(COLS[i % 4], float) * a
card = Image.fromarray(img.round().astype(np.uint8)).convert("RGBA")

# Logo: crisp upscale of the 200px line art, then the home page's look (2px outline + 6px offset shadow, doubled for 2x).
LOGO = 430
a = Image.open(f"{site}/img/themushroom_white.png").convert("RGBA").getchannel("A")
a = a.resize((LOGO * 2, LOGO * 2), Image.LANCZOS).point(lambda v: 255 if v >= 128 else 0).resize((LOGO, LOGO), Image.LANCZOS)
a = a.crop(a.getbbox())
OUT, SH = 4, 12
pad = OUT + SH
m = Image.new("L", (a.width + 2 * pad, a.height + 2 * pad)); m.paste(a, (pad, pad))
outline = m.filter(ImageFilter.MaxFilter(2 * OUT + 1))
shadow = Image.new("L", m.size); shadow.paste(outline, (SH, SH))
x0 = (W - a.width) // 2 - pad
y0 = (H - a.height) // 2 - pad
black = Image.new("RGBA", m.size, (0, 0, 0, 255))
for mask in (shadow, outline):
    card.paste(black, (x0, y0), mask)
card.paste(Image.new("RGBA", m.size, (255, 255, 255, 255)), (x0, y0), m)
card.convert("RGB").save(out, optimize=True)
print(out, "logo", a.size, "logo bottom", y0 + pad + a.height + SH + OUT)
