"""Shared colour grade for the Modern Interiors art, so it sits next to the Tiny Swords art.

Measured (HSV, opaque pixels with saturation >= 0.12, median): Tiny Swords hero 0.38, terrain 0.40, all art 0.44;
Modern Interiors floors/walls 0.28, House A 0.30 (the Shadowless furniture crops are already 0.55, so they are left alone).
The grade bends luma by GAMMA, then scales chroma by SAT about the luma (see grade()). Earlier: SAT 1.5 alone (House A median sat 0.30 -> 0.42).
(House A median 0.30 -> 0.42). Brightness is left alone: the interiors are ~0.05 brighter (V median 0.67 vs 0.59-0.62), but darkening
turns the white wall rims grey, which is worse.

Applied ONLY by the generators (make_room.py for the Room_Builder sheets, make_house_a.py), which always start from the untouched pack files, so a
second run can never grade twice. Never import this to re-grade a file in assets/.
"""
import numpy as np
from PIL import Image

SAT = 1.7       # chroma about luma (user, 2026-10-21: "still dont look contrasty and saturated enough")
GAMMA = 1.35    # luma curve: House A's median luma 162 -> ~135 (Tiny Swords 130) while white stays white and black stays black
# Measured luma std (contrast) over opaque pixels: Tiny Swords 64, House A 51, walls+floors 58, furniture crops 40.

def grade(im, sat=SAT, gamma=GAMMA, con=1.0):
    """gamma on luma (keeps each pixel's hue and saturation), then con = linear contrast about 128, then sat = chroma scale."""
    a = np.array(im.convert("RGBA")).astype(float)
    rgb = a[..., :3]
    luma = (rgb * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
    l2 = 128 + (255 * (luma / 255) ** gamma - 128) * con
    rgb = rgb * np.where(luma > 0, l2 / np.maximum(luma, 1e-6), 1)
    a[..., :3] = np.clip(l2 + (rgb - l2) * sat, 0, 255)
    return Image.fromarray(np.rint(a).astype(np.uint8), "RGBA")
