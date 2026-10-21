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


WEAPONS = {"axe": dict(row=3), "hammer": dict(row=2)}
BROWN = (151, 123, 107)
HAND = layer(art(FRONT), box(art(FRONT), 111, 124, 105, 116))     # his own hand, outline and all


def hand_at(x, y):
    return xform(HAND, dx=x - 117, dy=y - 110)


def bbox(m):
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max(), ys.max()


def tool_group(a, with_hand=True):
    """Tool head (the biggest swoosh-cream blob) and, if asked, the small brown hand next to it, outline included."""
    lab, n = ndi.label(is_col(a, [(237, 230, 172)]), structure=np.ones((3, 3)))
    big = 1 + int(np.argmax(ndi.sum(lab > 0, lab, range(1, n + 1))))
    ys, xs = np.where(lab == big)
    m = region(a, (xs[0], ys[0]))
    if with_hand:
        hx0, hy0, hx1, hy1 = bbox(m)
        bl, bn = ndi.label(is_col(a, [BROWN]), structure=np.ones((3, 3)))
        for i in range(1, bn + 1):
            yy, xx = np.where(bl == i)
            r = region(a, (xx[0], yy[0]))
            near = hx0 - 22 <= xx.mean() <= hx1 + 22 and hy0 - 8 <= yy.mean() <= hy1 + 30
            if r.sum() < 110 and near:
                m |= r
    return m


def with_outline(a, m):
    """m plus the dark outline hugging it (two pixels thick at most)."""
    return m | (ndi.binary_dilation(m, structure=np.ones((3, 3)), iterations=2) & is_col(a, [NAVY]))


def hammer_swoosh(a):
    return box(a, 127, 175, 20, 150) | box(a, 100, 127, 20, 73)


def tool_mask(weapon, k, a):
    """Every tool/swoosh/hand-on-tool pixel of side frame k (so what is left is his body)."""
    if weapon == "axe":
        m = tool_group(a) if k < 3 else outside_body(a) if k < 5 else tool_group(a, False)
    else:
        m = (tool_group(a) if k < 3 else hammer_swoosh(a) if k == 3 else
             comp_right_of(a, 117) | box(a, 127, 175, 20, 150) if k == 4 else tool_group(a, False))
    return with_outline(a, m)


def side_body(a, k, weapon, view):
    """His body from side frame k with the tool taken off (his lean, bob and steps stay), as front or back view."""
    tm = tool_mask(weapon, k, a)
    keep = (a[..., 3] == 255) & ~tm
    lab, n = ndi.label(keep, structure=np.ones((3, 3)))
    keep &= np.isin(lab, [i + 1 for i, z in enumerate(ndi.sum(keep, lab, range(1, n + 1))) if z >= 20])   # no flecks left over
    b = np.where(keep[..., None], a, 0).astype(np.uint8)
    hole = (b[..., 3] == 0) & (F0[..., 3] == 255)                 # where the swoosh hid legs/tunic: use his idle ones
    hole[:112] = False
    hole[:, :90] = False
    hole[:, 125:] = False
    b[hole] = F0[hole]
    return b if view == "front" else back_from_side(b)


def to_arc(lay, weapon, up, ref, top=None, bottom=None, cx=96, dy=0):
    """Turn a swoosh layer into a horizontal arc centred on his body line (up: flipped to sweep over the head)."""
    t = lambda l: xform(xform(l, rot=270 if weapon == "hammer" else 0, pivot=(96, 96)), flip="v" if up else None, pivot=(96, 96))
    r, m = t(ref), t(lay)
    x0, y0, x1, y1 = bbox(r[..., 3] == 255)
    sx = cx - (x0 + x1) // 2
    sy = (bottom - y1) if up else (top - y0)
    return xform(m, dx=sx, dy=sy + dy)


def clean(lay, minpx=6):
    """Drop specks: opaque blobs smaller than minpx pixels."""
    m = lay[..., 3] == 255
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    keep = np.isin(lab, [i + 1 for i, z in enumerate(ndi.sum(m, lab, range(1, n + 1))) if z >= minpx])
    return lay * keep[..., None]


def fade(lay, x0):
    """Right part of an arc with a slanted lower-left edge instead of a straight cut."""
    ys, xs = np.mgrid[:F, :F]
    ymid = np.where(lay[..., 3] == 255)[0].mean()
    return lay * (xs + 1.2 * (ys - ymid) >= x0)[..., None]


def hand_ring(g):
    """Centre of the hand ring: the brown at the bottom of a tool group (the head has brown shading too)."""
    x0, y0, x1, y1 = bbox(g[..., 3] == 255)
    r = is_col(g, [BROWN])
    r[:y1 - 11] = False
    ys, xs = np.where(r)
    return int(xs.mean()), int(ys.mean())


def find_hands(a):
    """Hand rings by their look: a small brown disc ringed by dark outline (hair and tool shading are brown too, but not ringed)."""
    m = is_col(a, [BROWN])
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    nav, out = is_col(a, [NAVY]), []
    for i in range(1, n + 1):
        c = lab == i
        ys, xs = np.where(c)
        if not (8 <= c.sum() <= 75 and np.ptp(xs) <= 9 and np.ptp(ys) <= 9):
            continue
        ring = ndi.binary_dilation(c, structure=np.ones((3, 3))) & ~c
        if (ring & nav).sum() >= 0.4 * ring.sum():
            out.append((int(xs.mean()), int(ys.mean()), c | (ring & nav)))
    return out


def strip_hands(lay):
    """Take every hand ring (and its outline) off a body layer; the swing puts exactly the right two back."""
    for _, _, m in find_hands(lay):
        lay = lay * ~m[..., None]
    return lay


def ring_layer():
    """His hand ring exactly as the hammer's wind-up frame draws it: outline, tan face, brown shade."""
    a = side(sheet(), 2, 0)
    m = tool_group(a, True) & ~tool_group(a, False)
    return layer(a, m), bbox(m)


RING, RB = ring_layer()
RC = ((RB[0] + RB[2]) // 2, (RB[1] + RB[3]) // 2)


def ring_at(cx, cy):
    return xform(RING, dx=cx - RC[0], dy=cy - RC[1])


# where the side rows draw his two hands, frame by frame (side-row pixels; the tables are turned to the view below).
# The axe row hides both hands in the swoosh on f3 and the tool hand on f4, so those are filled in along the swing.
FREE = {"axe": [(119, 103), (120, 100), (120, 100), (121, 106), (122, 107), (122, 108)],
        "hammer": [(81, 111), (85, 109), (85, 109), (67, 107), (68, 105), (73, 111)]}
HAMMER_TOOL = [(123, 80), (122, 78), (122, 78), None, None, (123, 109)]     # f3/f4: the grip is set on the slab itself
MIRROR = lambda p: (194 - p[0], p[1])


def free_hands(weapon, up):
    """His free (left) hand per frame: screen right in the front view, screen left in the back view."""
    f = FREE[weapon]
    flip = (weapon == "axe") == up                     # the axe row's free hand is on the right, the hammer row's on the left
    return [MIRROR(p) if flip else p for p in f]


def mirrored_body(weapon, up):
    """Right-handed in both views: the side rows are turned so the free hand lands on his own left."""
    return (weapon == "axe") == up


def hammer_frames(up, S):
    """His real build row: lift the hammer high, then slam it straight down (vertical on screen in both views)."""
    flip = not up                                      # front view: his right hand is on screen left, so the row is mirrored
    fl = (lambda lay: xform(lay, flip="h", pivot=(97, 0))) if flip else (lambda lay: lay)
    fp = MIRROR if flip else (lambda p: p)
    head = lambda k: strip_hands(layer(S[k], tool_group(S[k], False)))
    sw, rs, rest = layer(S[3], tool_mask("hammer", 3, S[3])), layer(S[4], tool_mask("hammer", 4, S[4])), head(5)
    for lay in (sw, rs):
        lay[84:114, 118:132] = 0                      # that corner is his hair fringe, not swoosh
    x0, y0, x1, y1 = bbox(sw[..., 3] == 255)
    for lay in (sw, rs):                               # no dark specks along the streak: outline only on the head at the bottom
        lay[:y1 - 30] *= ~is_col(lay[:y1 - 30], [NAVY])[..., None]
        nv = is_col(lay, [NAVY])
        lab, n = ndi.label(nv, structure=np.ones((3, 3)))
        lay *= ~np.isin(lab, [i + 1 for i, z in enumerate(ndi.sum(nv, lab, range(1, n + 1))) if z < 15])[..., None]
    sw, rs = clean(strip_hands(sw), 8), clean(strip_hands(rs), 8)
    lab, n = ndi.label(rs[..., 3] == 255, structure=np.ones((3, 3)))
    rs = rs * (lab == 1 + int(np.argmax(ndi.sum(lab > 0, lab, range(1, n + 1)))))[..., None]     # follow-through: the head and streak only
    sw, rs, rest = fl(sw), fl(rs), fl(rest)
    cols = np.where((sw[y1 - 24:, :, 3] == 255).sum(0) >= 15)[0]      # the columns the head really fills
    sx0, sx1 = cols.min(), cols.max()
    slab_x = (sx0 + sx1) // 2                          # the head's centre column: this is what lands on the spot
    for lay in (sw, rs):
        lay[y1 - 30:, :sx0 - 3] = 0                    # nothing but the head at the foot of the streak
        lay[y1 - 30:, sx1 + 3:] = 0
    if up:                                             # lands just above the top of his hair, a little right of centre
        dx, dy = 104 - slab_x, 78 - y1
    else:                                              # lands just below his feet, a little left (his right hand): swoosh stretched taller
        sw = stretch(sw, 14, 62, 100)
        dx, dy = 80 - slab_x, 142 - y1
    sw, rs = xform(sw, dx=dx, dy=dy), xform(rs, dx=dx, dy=dy)
    tool = [fp(p) if p else p for p in HAMMER_TOOL]
    low = lambda lay: lay * (np.arange(F)[:, None, None] >= 106)       # the head part, drawn in front of his feet
    high = lambda lay: lay * (np.arange(F)[:, None, None] < 106)
    targets = [(136, 108), (136, 92), (131, 78)] if up else [(58, 100), (56, 88), (60, 74)]
    wind = []
    for i in range(3):                                 # lifted: his hand grips the base of the head (ring tucked 2 px up under it)
        rx, ry = tool[i]
        ry -= 3
        tx, ty = targets[i]
        wind.append(xform(fl(head(i)), dx=tx - rx, dy=ty - ry))
        wind[-1] = (wind[-1], ring_at(tx, ty))
    out = []
    for i in range(3):
        out.append(([wind[i][1]], True, [wind[i][0]]) if up else ([wind[i][0], wind[i][1]], False, []))
    gx = (104 + 11) if up else (80 - 11)             # his right hand: on the slab's right (back view) / left (front view) side
    for k, lay in enumerate((sw, rs)):                 # the grip sits against the foot of the head, two pixels onto it
        ring = ring_at(gx + (-2 if up else 2), y1 + dy - 8)
        out.append(([ring] if up else [low(lay), ring], False, [lay] if up else [high(lay)]))
    r5 = ring_at(*HAMMER_TOOL[5])
    out.append(([xform(r5, dx=4, dy=6)], False, [xform(rest, dx=4, dy=6)]) if up else ([rest, fl(r5)], False, []))
    return out


def frames_for(weapon, up, S):
    """[(pieces, behind_body[, layers under the body])] for the 6 frames; pieces are full-frame layers."""
    if weapon == "hammer":
        return hammer_frames(up, S)
    L = lambda k: layer(S[k], tool_mask("axe", k, S[k]))
    group, rest = [L(k) for k in range(3)], L(5)
    smear, resid = L(3), strip_hands(L(4))
    arc = lambda lay, dy=0: to_arc(lay, "axe", up, smear, top=114, bottom=70, dy=dy)
    trail = lambda dy: layer(arc(smear, dy), np.arange(F)[None, :] >= 100)
    f5 = [rest, ring_at(85, 111)]                      # his own side pose again: the head at the lower left, his right hand on it
    # f4: the side row shows only the tool hand, at the head's near edge; it rides on the arc's head end
    hd = resid * (np.arange(F)[None, :, None] >= 135)
    hx0, hy0, hx1, hy1 = bbox(hd[..., 3] == 255)
    rel = (128 - hx0, 113 - (hy0 + hy1) // 2)
    if not up:                                         # his own side pose: the tool cocked up and out on screen left (his right hand)
        def f4(dy):
            h = arc(hd, dy)
            ax0, ay0, ax1, ay1 = bbox(h[..., 3] == 255)
            return [trail(dy), arc(resid, dy), ring_at(ax0 + rel[0], (ay0 + ay1) // 2 + rel[1])]
        return [([xform(g, dx=-3)], False) for g in group] + [([arc(smear)], False), (f4(5), False), (f5, False)]
    low = []
    for i in range(3):                                 # back view: tool low behind his right shoulder, pulled back
        g = xform(xform(group[i], flip="v", pivot=(96, 96)), flip="h", pivot=(96, 0))
        x0, y0, x1, y1 = bbox(g[..., 3] == 255)
        low.append(([xform(g, dx=134 - (x0 + x1) // 2 + i, dy=(110 + 2 * i) - (y0 + y1) // 2)], True))
    mir = lambda ps: [xform(q, flip="h", pivot=(96, 0)) for q in ps]      # right-handed: the arc runs from screen right over his head to the left
    h = arc(hd, -5)
    ax0, ay0, ax1, ay1 = bbox(h[..., 3] == 255)
    f4u = [trail(-5), arc(resid, -5), ring_at(ax0 + rel[0], (ay0 + ay1) // 2 + rel[1])]
    return low + [(mir([arc(smear)]), True), (mir(f4u), True), (low[0][0], True)]


def swing(weapon, direction):
    up = direction == "up"
    S = [side(sheet(), WEAPONS[weapon]["row"], c) for c in range(6)]
    shadow = np.where(((S[0][..., 3] > 0) & (S[0][..., 3] < 255))[..., None], S[0], 0).astype(np.uint8)
    free = free_hands(weapon, up)
    out = []
    for k, (pieces, behind, *under) in enumerate(frames_for(weapon, up, S)):
        f = shadow.copy()
        body = strip_hands(side_body(S[k], k, weapon, "back" if up else "front"))
        if mirrored_body(weapon, up):
            body = xform(body, flip="h", pivot=(97, 0))
        for lay in (under[0] if under else []) + (pieces + [body] if behind else [body] + pieces) + [ring_at(*free[k])]:
            m = lay[..., 3] == 255
            f[m] = lay[m]
        out.append(f)
    return out


STRICT = True


def audit(name, frames, up, weapon):
    """Per-frame hand count and places; the rules: two hands (one only where the side row hides the tool hand in the
    swoosh: the axe's f3), the free hand on its own side of the body."""
    free_side = (lambda x: x < 97) if up else (lambda x: x > 97)
    for k, f in enumerate(frames):
        hs = [(x, y) for x, y, _ in find_hands(f)]
        want = 1 if weapon == "axe" and k == 3 else 2
        print(f"  {name} f{k}: {len(hs)} hands {sorted(hs)}")
        if STRICT:
            assert len(hs) == want, f"{name} f{k}: {len(hs)} hands, want {want}"
            assert any(free_side(x) for x, _ in hs), f"{name} f{k}: no free hand on its side"


def main():
    sh = sheet()
    write("opawn-back-idle.png", [back_from_side(side(sh, 0, c)) for c in range(6)])
    write("opawn-back-run.png", [back_from_side(side(sh, 1, c)) for c in range(6)])
    for weapon in WEAPONS:
        for d in ("up", "down"):
            fr = swing(weapon, d)
            write(f"opawn-{weapon}-{d}.png", fr)
            audit(f"{weapon}-{d}", fr, d == "up", weapon)


if __name__ == "__main__":
    main()
