#!/usr/bin/env python3
"""Regenerate assets/hero/opawn-roll.png and pawn-roll.png (dodge-roll strips).

Run from anywhere:  python3 tools/make_roll.py        (needs PIL, numpy, scipy)

Each strip is 9 frames of 192x192, same feet/origin as the Pawn's other sheets:
  0 crouch | 1 tuck (ball, 0 deg) | 2-6 ball rolled 60..300 deg | 7 unfurl squat | 8 rise
Frames 0, 7, 8 are the idle frame squashed by deleting rows (clean pixel art).
The ball is the hair (fixed top-left light) with the hero's own face/tunic/hands/feet
cut out of his idle frame and turned around it with a RotSprite-style rotation.
"""
import numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage as ndi

HERO = Path(__file__).resolve().parent.parent / "assets" / "hero"
F = 192
DARK = (22, 28, 46, 255)
STEP = 60                      # degrees per ball frame (6 ball frames = one full turn)
Y, X = np.mgrid[:F, :F]

# ---- per-Pawn settings -------------------------------------------------------------
# tones = hair (light, mid, dark) painted with the light at the top-left; hi = highlight colour
# parts: name -> (colours, search box x0,x1,y0,y1) cut from idle frame 0; placed at (dx, dy) from ball centre
OLD = dict(
    sheet="opawn.png", out="opawn-roll.png", cx=95, ground=125, R=20.5, rows=(9, 11, 4), band=(76, 112),
    shadow=(95, 121, 19.5, 7), tufts=(-105, 105),
    tones=((239, 225, 171), (213, 181, 131), (151, 123, 107)), hi=(255, 255, 255),
    parts=dict(
        handL=(((151, 123, 107), (213, 181, 131)), (74, 85, 106, 114), (-17, 9), False),
        handR=(((151, 123, 107), (213, 181, 131)), (111, 123, 106, 114), (17, 9), False),
    ),
    belt=((64, 78, 117), (62, 134, 152)),               # tunic as a band on the ball's lower edge
    feet=((85, 107, 119, 122), [(-5, 20), (5, 20)]),
)
NEW = dict(
    sheet="pawn-idle.png", out="pawn-roll.png", cx=97, ground=132, R=20.5, rows=(12, 15, 6), band=(70, 121),
    shadow=(97, 127, 19.5, 7),
    tones=((151, 123, 107), (94, 84, 85), (71, 65, 68)), hi=(173, 160, 129),
    parts=dict(
        face=(((200, 168, 118), (239, 225, 171)), (92, 120, 92, 112), (6, 1), True),
        handL=(((200, 168, 118),), (72, 84, 110, 122), (-16, 11), False),
        handR=(((200, 168, 118),), (113, 121, 108, 118), (16, 12), False),
        tunic=(((72, 88, 132), (70, 151, 172)), (86, 112, 111, 122), (-1, 14), True),
        tail=(((71, 65, 68),), (66, 86, 99, 110), (-20, 0), False),
    ),
    feet=((84, 110, 125, 128), [(-6, 20), (5, 20)]),
)


# ---- small pixel helpers -----------------------------------------------------------
def rgba(colour, mask):
    a = np.zeros((F, F, 4), np.uint8)
    a[mask] = (*colour[:3], 255)
    return a


def over(base, top):
    """Alpha-less composite: opaque pixels of top replace base."""
    out = base.copy()
    m = top[..., 3] == 255
    out[m] = top[m]
    return out


def outline(a):
    """1px dark outline around every opaque pixel (4-neighbourhood)."""
    m = a[..., 3] == 255
    ring = ndi.binary_dilation(m) & ~m
    out = a.copy()
    out[ring] = DARK
    return out


def epx(g):
    """Scale2x / EPX on an index image."""
    p = np.pad(g, 1, mode="edge")
    A, B, C, D = p[:-2, 1:-1], p[1:-1, 2:], p[1:-1, :-2], p[2:, 1:-1]
    o = np.repeat(np.repeat(g, 2, 0), 2, 1)
    o[0::2, 0::2] = np.where((C == A) & (C != D) & (A != B), A, g)
    o[0::2, 1::2] = np.where((A == B) & (A != C) & (B != D), B, g)
    o[1::2, 0::2] = np.where((D == C) & (D != B) & (C != A), C, g)
    o[1::2, 1::2] = np.where((B == D) & (B != A) & (D != C), D, g)
    return o


def rotsprite(a, deg, cx, cy):
    """Rotate an RGBA frame clockwise about pixel (cx, cy): 90-degree multiples are lossless;
    others use 8x EPX upscale, nearest rotate, block-mode downsample (palette stays untouched)."""
    cols, inv = np.unique(a.reshape(-1, 4), axis=0, return_inverse=True)
    g = inv.reshape(F, F)
    tr = int(np.where(cols[:, 3] == 0)[0][0])
    s = 1 if deg % 90 == 0 else 8
    for _ in range(s.bit_length() - 1):
        g = epx(g)
    n = F * s
    c = np.array([cx, cy]) * s + (s - 1) / 2
    t = np.radians(deg)
    yy, xx = np.mgrid[:n, :n]
    dx, dy = xx - c[0], yy - c[1]
    sx = np.rint(c[0] + dx * np.cos(t) + dy * np.sin(t)).astype(int)
    sy = np.rint(c[1] - dx * np.sin(t) + dy * np.cos(t)).astype(int)
    ok = (sx >= 0) & (sx < n) & (sy >= 0) & (sy < n)
    r = np.full((n, n), tr)
    r[ok] = g[sy[ok], sx[ok]]
    if s > 1:                                        # most common colour per 8x8 block
        K = len(cols)
        blk = r.reshape(F, s, F, s).transpose(0, 2, 1, 3).reshape(F * F, s * s)
        cnt = np.zeros((F * F, K), int)
        for k in range(s * s):
            np.add.at(cnt, (np.arange(F * F), blk[:, k]), 1)
        cnt = cnt * 2 + (np.arange(K) != tr)         # ties go to opaque pixels
        r = cnt.argmax(1).reshape(F, F)
    return cols[r]


# ---- squash frames (idle frame with rows deleted) ----------------------------------------
def squash(body, n, lo, hi, wide=0):
    """Delete the n rows (in lo..hi, never adjacent) that differ least from their neighbour;
    everything above drops down so the feet stay put. wide>0 also duplicates centre columns."""
    cost = {y: np.abs(body[y].astype(int) - body[y + 1].astype(int)).sum() for y in range(lo, hi)}
    pick = []
    for y in sorted(cost, key=cost.get):
        if all(abs(y - p) > 2 for p in pick):
            pick.append(y)
        if len(pick) == n:
            break
    out = np.zeros_like(body)
    for y in range(F):
        if y not in pick:
            out[y + sum(p > y for p in pick)] = body[y]
    if wide:
        mid = np.where(out[..., 3].any(0))[0]
        c = int(mid.mean())
        out = np.concatenate([out[:, :c], np.repeat(out[:, c:c + 1], wide, 1), out[:, c:]], 1)
        out = out[:, wide // 2: wide // 2 + F]
    return out


# ---- the ball ----------------------------------------------------------------------
def cut(idle, colours, box):
    """Largest blob of the given colours inside box (holes filled, e.g. eyes) -> its pixels + outline."""
    x0, x1, y0, y1 = box
    m = np.zeros((F, F), bool)
    for c in colours:
        m |= (idle[..., :3] == c).all(-1) & (idle[..., 3] == 255)
    m[:, :x0] = m[:, x1:] = False
    m[:y0] = m[y1:] = False
    lab, n = ndi.label(m)
    m = lab == (1 + np.argmax(ndi.sum(m, lab, range(1, n + 1))))
    m = ndi.binary_fill_holes(m)
    return np.where(m[..., None], idle, 0).astype(np.uint8), m


def paste(layer, part, mask, dx, dy, cx, cy):
    """Paste a cut-out so that its centre of mass lands at (cx+dx, cy+dy)."""
    ys, xs = np.where(mask)
    sx, sy = cx + dx - int(round(xs.mean())), cy + dy - int(round(ys.mean()))
    shifted = np.roll(np.roll(part, sy, 0), sx, 1)
    return over(layer, outline(shifted))


def hair_ball(P, cx, cy):
    R, (lt, md, dk), hi = P["R"], P["tones"], P["hi"]
    d = np.hypot(X - (cx - 4), Y - (cy - 4))         # distance from a light point up-left of centre
    disc = np.hypot(X - cx, Y - cy) <= R
    a = rgba(lt, disc)
    a[disc & (d >= 16)] = (*md, 255)
    a[disc & (d >= 21.5)] = (*dk, 255)
    return a


def highlight(a, P, cx, cy):
    """Fixed light: short dashed arc on the upper-left, drawn only over hair pixels."""
    r = np.hypot(X - cx, Y - cy)
    ang = np.degrees(np.arctan2(Y - cy, X - cx))
    arc = (r > P["R"] - 6) & (r <= P["R"] - 4) & (ang > -165) & (ang < -100)
    arc &= ~((ang > -143) & (ang < -135))             # gap -> dashed
    arc |= (np.hypot(X - (cx - 8), Y - (cy - 11)) < 1.2)
    hair = {P["tones"][0], P["tones"][1]}
    is_hair = np.array([tuple(p[:3]) in hair for p in a.reshape(-1, 4)]).reshape(F, F) & (a[..., 3] == 255)
    out = a.copy()
    out[arc & is_hair] = (*P["hi"], 255)
    return out


def tufts(P, cx, cy):
    """Hair tips (like the Pawn's flared fringe) poking out of the ball; they turn with it."""
    lay = np.zeros((F, F, 4), np.uint8)
    _, md, dk = P["tones"]
    R = P["R"]
    for phi in P.get("tufts", ()):
        t = np.radians(phi)
        ux, uy = np.sin(t), np.cos(t)                 # 0 deg = straight down, clockwise
        a = (X - cx) * ux + (Y - cy) * uy
        b = -(X - cx) * uy + (Y - cy) * ux
        m = ((a - R + .5) / 4.2) ** 2 + (b / 7.5) ** 2 <= 1      # flat flap hugging the rim
        lay[m] = (*md, 255)
        lay[m & (a > R + .5)] = (*dk, 255)
    return lay


def features(P, idle, cx, cy):
    """Face/tunic/hands/feet at rotation 0, cut from the hero's own idle pixels."""
    lay = np.zeros((F, F, 4), np.uint8)
    lay = np.zeros((F, F, 4), np.uint8)
    for colours, box, (dx, dy), clip in P["parts"].values():
        part, m = cut(idle, colours, box)
        piece = paste(np.zeros_like(lay), part, m, dx, dy, cx, cy)
        if clip:                                     # keep body parts on the ball's surface
            piece[np.hypot(X - cx, Y - cy) > P["R"] + .5] = 0
        lay = over(lay, piece)
    if "belt" in P:
        r = np.hypot(X - cx, Y - cy)
        ang = np.degrees(np.arctan2(X - cx, Y - cy))     # 0 = straight down
        band = (r <= P["R"] + .5) & (np.abs(ang) <= 36)
        belt = outline(rgba(P["belt"][0], band & (r > P["R"] - 7)))
        belt[r > P["R"] + .5] = 0                        # outline only on the inner edges
        lay = over(lay, belt)
        lay = over(lay, rgba(P["belt"][1], band & (r > P["R"] - 6) & (r <= P["R"] - 4) & (np.abs(ang) <= 26)))
    (x0, x1, y0, y1), spots = P["feet"]
    for dx, dy in spots:
        foot = np.zeros_like(idle)
        sel = np.zeros((F, F), bool)
        sel[y0:y1 + 1, x0:x1 + 1] = True
        sel &= idle[..., 3] == 255
        left = X < cx if dx < 0 else X >= cx
        foot[sel & left] = idle[sel & left]
        lay = paste(lay, foot, foot[..., 3] == 255, dx, dy, cx, cy)
    return lay


def ball_frame(P, idle, deg):
    cx = P["cx"]
    cy = P["ground"] - int(P["R"] + 1.5)
    hair = hair_ball(P, cx, cy)
    turn = (lambda a: rotsprite(a, deg, cx, cy)) if deg else (lambda a: a)
    base = over(turn(tufts(P, cx, cy)), hair)           # fringe flaps sit behind the hair
    ball = highlight(over(base, turn(features(P, idle, cx, cy))), P, cx, cy)
    ball = outline(ball)
    # touch the ground: nudge so the lowest opaque row sits on P["ground"]
    low = np.where(ball[..., 3].any(1))[0].max()
    return np.roll(ball, P["ground"] - low, 0)


def shadow_layer(P, sheet):
    """Idle frame's translucent shadow, with the part hidden under the body filled in."""
    cx, cy, a, b = P["shadow"]
    vis = sheet[..., 3] < 255
    vis &= sheet[..., 3] > 0
    ell = ((X - cx) / (a + .5)) ** 2 + ((Y - cy) / (b + .5)) ** 2 <= 1
    alpha = sheet[..., 3][vis].max()
    m = vis | (ell & (sheet[..., 3] == 255))
    out = np.zeros((F, F, 4), np.uint8)
    out[m] = (*DARK[:3], alpha)
    return out


def build(P):
    sheet = np.array(Image.open(HERO / P["sheet"]).convert("RGBA"))[:F, :F]
    body = np.where((sheet[..., 3] == 255)[..., None], sheet, 0).astype(np.uint8)
    (crouch, squat, rise), (lo, hi) = P["rows"], P["band"]
    frames = [
        squash(body, crouch, lo, hi, 3),                    # 0 crouch
        ball_frame(P, body, 0),                           # 1 tuck
        *[ball_frame(P, body, d) for d in range(STEP, 360, STEP)],   # 2-6 rolling
        squash(body, squat, lo, hi, 3),                   # 7 unfurl squat
        squash(body, rise, lo, hi, 1),                       # 8 rise
    ]
    sh = shadow_layer(P, sheet)
    out = []
    for f in frames:
        o = sh.copy()
        m = f[..., 3] == 255
        o[m] = f[m]
        out.append(o)
    strip = np.concatenate(out, 1)
    Image.fromarray(strip).save(HERO / P["out"])
    return out


if __name__ == "__main__":
    for P in (OLD, NEW):
        build(P)
        print("wrote", HERO / P["out"])
