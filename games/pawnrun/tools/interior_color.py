"""Shared colour grade for the Modern Interiors art, so it sits next to the Tiny Swords art.

Measured (HSV, opaque pixels with saturation >= 0.12, median): Tiny Swords hero 0.38, terrain 0.40, all art 0.44;
Modern Interiors floors/walls 0.28, House A 0.30 (the Shadowless furniture crops are already 0.55, so they are left alone).
The grade scales chroma by SAT about the pixel's luma, so hue and brightness stay; SAT 1.5 of chroma is about 1.4x HSV saturation
(House A median 0.30 -> 0.42). Brightness is left alone: the interiors are ~0.05 brighter (V median 0.67 vs 0.59-0.62), but darkening
turns the white wall rims grey, which is worse.

Applied ONLY by the generators (make_room.py for the Room_Builder sheets, make_house_a.py), which always start from the untouched pack files, so a
second run can never grade twice. Never import this to re-grade a file in assets/.
"""
import numpy as np
from PIL import Image

SAT = 1.5

def grade(im):
    a = np.array(im.convert("RGBA")).astype(float)
    rgb = a[..., :3]
    luma = (rgb * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
    a[..., :3] = np.clip(luma + (rgb - luma) * SAT, 0, 255)
    return Image.fromarray(np.rint(a).astype(np.uint8), "RGBA")
