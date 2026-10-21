#!/usr/bin/env python3
"""Old Pawn back-view idle/walk and the up/down axe + hammer swings -> assets/hero/opawn-*.png

Run:  python3 tools/make_old_anims.py        (needs PIL, numpy, scipy; maps live in tools/make_views.py)

  opawn-back-idle.png   6 frames  his side idle, with the back-view hair/tunic (make_views.BACK) on every frame
  opawn-back-run.png    6 frames  his side run (legs, hands, bob copied frame by frame), back-view hair/tunic
  opawn-{axe,hammer}-down.png  6 frames, hit 3   front view = his normal art; tool cut from his chop/build rows
  opawn-{axe,hammer}-up.png    6 frames, hit 3   back view; same tools, swung up and away over his head

The Old Pawn art has no real side view: idle/run/chop/build are already front-facing, so a "front" strip is his own
sheet. Back frames take each side frame and only change what is seen from behind: the sash becomes the back of the
tunic (an even blue patch), and the fringe's centre gap is closed with the hair filler drawn in make_views.BACK.
"""
import numpy as np
from pathlib import Path
from PIL import Image
from scipy import ndimage as ndi
from make_views import FRONT, BACK, LEGEND, ORIGIN

HERO = Path(__file__).resolve().parent.parent / "assets" / "hero"
F = 192
NAVY = (22, 28, 46)
HAIR = [(239, 225, 171), (213, 181, 131), (255, 255, 255)]      # b a w: never overwritten by the filler
BLUE = [(64, 78, 117), (62, 134, 152)]


def sheet():
    return np.array(Image.open(HERO / "opawn.png").convert("RGBA"))


def side(sh, row, col):
    return sh[row * F:(row + 1) * F, col * F:(col + 1) * F].copy()


def art(txt):
    """ASCII map -> RGBA frame (shadow not included)."""
    f = np.zeros((F, F, 4), np.uint8)
    for dy, r in enumerate(txt.strip("\n").split("\n")):
        for dx, ch in enumerate(r):
            if ch in LEGEND:
                f[ORIGIN[1] + dy, ORIGIN[0] + dx] = (*LEGEND[ch], 255)
    return f


def is_col(a, cols):
    m = np.zeros(a.shape[:2], bool)
    for c in cols:
        m |= (a[..., :3] == c).all(-1)
    return m & (a[..., 3] == 255)


F0, B0 = art(FRONT), art(BACK)
# what BACK adds to FRONT: hair filler (closed fringe + hem) and the tunic patch
FILL = (B0[..., 3] == 255) & ~(F0 == B0).all(-1) & is_col(B0, HAIR + [(151, 123, 107)])
PATCH = is_col(B0, [(64, 78, 117)]) & ~is_col(F0, [(64, 78, 117)])
PATCH |= is_col(B0, [(64, 78, 117)])


def shift_of(ref, cur, rows):
    """Integer (dx, dy) that best lays ref's opaque pixels over cur inside the given rows."""
    y0, y1 = rows
    best, arg = -1, (0, 0)
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            r = np.roll(np.roll(ref, dy, 0), dx, 1)[y0:y1]
            sc = ((r == cur[y0:y1]).all(-1) & (r[..., 3] == 255)).sum()
            if sc > best:
                best, arg = sc, (dx, dy)
    return arg


def back_from_side(s):
    """The back-view version of one side-sheet frame."""
    shadow = np.where(((s[..., 3] > 0) & (s[..., 3] < 255))[..., None], s, 0).astype(np.uint8)
    body = np.where((s[..., 3] == 255)[..., None], s, 0).astype(np.uint8)
    sash = is_col(body, BLUE)
    hx, hy = shift_of(F0, body, (88, 100))                       # how the fringe sits in this frame
    ys, xs = np.where(sash)
    sx0, sy0 = np.where(is_col(F0, BLUE))[::-1]
    tx, ty = (int(round(xs.mean() - sx0.mean())), int(round(ys.mean() - sy0.mean()))) if len(xs) else (hx, hy)
    out = body.copy()
    out[sash] = (*NAVY, 255)
    patch = np.roll(np.roll(PATCH, ty, 0), tx, 1) & (out[..., :3] == NAVY).all(-1) & (out[..., 3] == 255)
    out[patch] = (*LEGEND["u"], 255)
    fill = np.roll(np.roll(FILL, hy, 0), hx, 1) & ~is_col(out, HAIR)
    out[fill] = np.roll(np.roll(B0, hy, 0), hx, 1)[fill]
    f = shadow.copy()
    f[out[..., 3] == 255] = out[out[..., 3] == 255]
    return f


def write(name, frames):
    Image.fromarray(np.concatenate(frames, 1)).save(HERO / name)
    print("wrote", name, len(frames), "frames")


# ---- tool pieces cut from his chop (axe) and build (hammer) rows ---------------------------------------------
def region(a, seed):
    """The part inside one dark outline (flood from a seed pixel), holes filled, plus the 1 px outline."""
    nav = is_col(a, [NAVY])
    lab, _ = ndi.label((a[..., 3] == 255) & ~nav)
    m = ndi.binary_fill_holes(lab == lab[seed[1], seed[0]])
    return m | (ndi.binary_dilation(m) & nav)


def comp(a, seed):
    lab, _ = ndi.label(a[..., 3] == 255, structure=np.ones((3, 3)))
    return lab == lab[seed[1], seed[0]]


def box(a, x0, x1, y0, y1):
    m = np.zeros(a.shape[:2], bool)
    m[y0:y1, x0:x1] = True
    return m & (a[..., 3] == 255)


def cream(a):
    """The swoosh/tool cream colour (his hair is a slightly different cream), with its edge pixels."""
    c = is_col(a, [(237, 230, 172)])
    return c | (ndi.binary_dilation(c, structure=np.ones((3, 3))) & is_col(a, [(213, 181, 131), (255, 255, 255), NAVY]))


def outside_body(a):
    """Everything the swoosh/tool adds to his side frame: the frame minus his hair box and his tunic/legs."""
    m = a[..., 3] == 255
    m[72:112, 76:134] = False
    tun = is_col(a, BLUE + [NAVY])
    tun[:, :86] = False
    tun[:, 130:] = False
    tun[:109] = False
    tun[118:] = False
    m &= ~tun
    m |= cream(a)
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    lit = ndi.sum(m & ~is_col(a, [NAVY]), lab, range(1, n + 1))        # a piece must hold real swoosh colour
    return np.isin(lab, [i + 1 for i, z in enumerate(lit) if z >= 6])


def layer(a, m):
    return np.where(m[..., None], a, 0).astype(np.uint8)


def xform(lay, dx=0, dy=0, rot=0, flip=None, pivot=(96, 96)):
    """Lossless 90-degree turns / flips about a pivot, then a shift."""
    if flip == "h":
        lay = np.roll(lay[:, ::-1], 2 * pivot[0] - (F - 1), 1)
    if flip == "v":
        lay = np.roll(lay[::-1], 2 * pivot[1] - (F - 1), 0)
    if rot:
        cols, inv = np.unique(lay.reshape(-1, 4), axis=0, return_inverse=True)
        k = (rot // 90) % 4
        px, py = pivot
        yy, xx = np.mgrid[:F, :F]
        dxs, dys = xx - px, yy - py
        sx, sy = [(dxs, dys), (dys, -dxs), (-dxs, -dys), (-dys, dxs)][k]      # source offset for a clockwise turn
        sxs, sys_ = px + sx, py + sy
        ok = (sxs >= 0) & (sxs < F) & (sys_ >= 0) & (sys_ < F)
        out = np.zeros_like(lay)
        out[ok] = lay[sys_[ok], sxs[ok]]
        lay = out
    return np.roll(np.roll(lay, dy, 0), dx, 1)


def stretch(body, n, lo, hi):
    """Duplicate n quiet rows (head rises, feet stay), the opposite of make_roll.squash."""
    cost = {y: np.abs(body[y].astype(int) - body[y + 1].astype(int)).sum() for y in range(lo, hi)}
    pick = []
    for y in sorted(cost, key=cost.get):
        if all(abs(y - p) > 2 for p in pick):
            pick.append(y)
        if len(pick) == n:
            break
    out = np.zeros_like(body)
    for y in range(F):
        out[y - sum(p > y for p in pick)] = body[y]
        if y in pick:
            out[y - sum(p > y for p in pick) - 1] = body[y]
    return out


def posed(body, rows):
    from make_roll import squash
    return squash(body, rows, 76, 112) if rows > 0 else stretch(body, -rows, 76, 112) if rows < 0 else body


def swing_body(view):
    """Front (his idle) or back body without the tool hand (screen right); he keeps the other hand."""
    a = art(FRONT if view == "front" else BACK)
    a[105:116, 112:] = 0                                   # the right hand and its outline ...
    a[106:114, 111] = (*NAVY, 255)                         # ... leaving the body's own edge
    return a


def comp_right_of(a, xmin):
    """Largest separate blob whose left edge is at xmin or further right (the tool, apart from the body)."""
    lab, n = ndi.label(a[..., 3] == 255, structure=np.ones((3, 3)))
    best, size = None, 0
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if xs.min() >= xmin and len(xs) > size:
            best, size = lab == i, len(xs)
    return best if best is not None else np.zeros(a.shape[:2], bool)


WEAPONS = {"axe": dict(row=3, head=(50, 78), hand=(58, 92)), "hammer": dict(row=2, head=(110, 60), hand=(121, 79))}
HAND = layer(art(FRONT), box(art(FRONT), 111, 124, 105, 116))     # his own hand, outline and all


def hand_at(x, y):
    return xform(HAND, dx=x - 117, dy=y - 110)


def frames_for(weapon, direction, S):
    """[(pieces, behind_body)] for the 6 frames; pieces are full-frame layers."""
    group = layer(S[1], region(S[1], WEAPONS[weapon]["head"]) | region(S[1], WEAPONS[weapon]["hand"]))
    down = direction == "down"
    if weapon == "hammer":
        smear = layer(S[3], box(S[3], 124, 160, 58, 128))
        resid = layer(S[4], comp_right_of(S[4], 117))
        rest = layer(S[5], box(S[5], 127, 160, 80, 112))
        if down:
            return [([xform(group, dx=-6 - 2 * i, dy=-2 * i)], False) for i in range(3)] + [
                ([xform(smear, dx=-16), hand_at(113, 106)], False),
                ([xform(resid, dx=-12), hand_at(113, 112)], False),
                ([xform(rest, dx=-8, dy=4), hand_at(112, 112)], False)]
        low = xform(group, flip="v", pivot=(112, 70))
        return [([xform(low, dx=-4 + i, dy=26 + 2 * i)], False) for i in range(3)] + [
            ([xform(smear, dx=-16, flip="v", pivot=(140, 93)), hand_at(113, 76)], True),
            ([xform(resid, dx=-12, flip="v", pivot=(140, 93)), hand_at(113, 76)], True),
            ([xform(rest, dx=-8, dy=8), hand_at(112, 112)], False)]
    smear = layer(S[3], outside_body(S[3]))
    resid = layer(S[4], outside_body(S[4]))
    rest = layer(S[5], cream(S[5]))
    turn = lambda lay, r: xform(lay, rot=r, pivot=(106, 76))
    if down:
        up_group = xform(group, flip="h", pivot=(96, 0))
        return [([xform(up_group, dx=-22 - 2 * i, dy=-2 * i)], False) for i in range(3)] + [
            ([xform(turn(smear, 90), flip="h", pivot=(96, 0)), hand_at(113, 106)], False),
            ([xform(turn(resid, 90), flip="h", pivot=(96, 0)), hand_at(113, 108)], False),
            ([xform(rest, flip="h", pivot=(96, 0), dx=-22, dy=-4), hand_at(113, 114)], False)]
    return [([xform(rest, flip="h", pivot=(96, 0), dx=-22 + i, dy=-4 + 2 * i), hand_at(114, 112)], False) for i in range(3)] + [
        ([turn(smear, 270), hand_at(113, 76)], True),
        ([turn(resid, 270), hand_at(113, 76)], True),
        ([xform(rest, flip="h", pivot=(96, 0), dx=-22, dy=-4), hand_at(113, 114)], False)]


def swing(weapon, direction):
    S = [side(sheet(), WEAPONS[weapon]["row"], c) for c in range(6)]
    shadow = np.where(((S[0][..., 3] > 0) & (S[0][..., 3] < 255))[..., None], S[0], 0).astype(np.uint8)
    body0 = swing_body("front" if direction == "down" else "back")
    rows = [0, -1, -2, 3, 3, 1] if direction == "down" else [1, 2, 2, -2, -2, 0]
    out = []
    for i, (pieces, behind) in enumerate(frames_for(weapon, direction, S)):
        f = shadow.copy()
        body = posed(body0, rows[i])
        for lay in (pieces + [body] if behind else [body] + pieces):
            m = lay[..., 3] == 255
            f[m] = lay[m]
        out.append(f)
    return out


def main():
    sh = sheet()
    write("opawn-back-idle.png", [back_from_side(side(sh, 0, c)) for c in range(6)])
    write("opawn-back-run.png", [back_from_side(side(sh, 1, c)) for c in range(6)])
    for weapon in WEAPONS:
        for d in ("up", "down"):
            write(f"opawn-{weapon}-{d}.png", swing(weapon, d))


if __name__ == "__main__":
    main()
