#!/usr/bin/env python3
"""Regenerate the swing-up / swing-down strips: assets/hero/{opawn,pawn}-<weapon>-{up,down}.png

Run:  python3 tools/make_swings.py        (needs PIL, numpy, scipy; reuses tools/make_roll.py)

Each strip has the same frame count and hit frame as the weapon's side swing (data.js WEAPONS),
192x192 frames, same feet origin as the side sheets.
  down = front view (face / hair front), tool lifted overhead then slammed down in front of his feet
  up   = back view (hair + ponytail), tool swung up and away over his head (drawn behind the body)
Tool heads are cut from his own side frames (colour-keyed), the handle is a drawn stick, and the
head is turned with the RotSprite routine from make_roll. Hands are his own hand pixels.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from make_roll import (HERO, F, DARK, X, Y, OLD, NEW, rgba, over, outline, rotsprite, squash,
                       cut, shadow_layer)

NAVY = DARK[:3]
WOOD = (134, 99, 83)

# weapon: (strip frames N, hit frame h, side sheet used for the reference tool frame, handle colour)
# tool head cut from a reference frame: (file, row, col) + how to find it; pivot = the hand there.
TOOLS = {
    "old": {
        "axe": dict(n=6, hit=3, ref=("opawn.png", 3, 1), seed=(50, 78), hand=(57, 92), handle=NAVY),
        "hammer": dict(n=6, hit=3, ref=("opawn.png", 2, 1), seed=(110, 60), hand=(122, 79), handle=NAVY),
    },
    "new": {
        "axe": dict(n=6, hit=2, ref=("pawn-interact-axe.png", 0, 0), box=(50, 90, 90, 125), hand=(75, 110), handle=WOOD),
        "hammer": dict(n=3, hit=1, ref=("pawn-interact-hammer.png", 0, 0), box=(100, 150, 60, 125), hand=(122, 100), handle=WOOD),
        "pickaxe": dict(n=6, hit=3, ref=("pawn-interact-pickaxe.png", 0, 0), box=(50, 95, 85, 120), hand=(76, 108), handle=WOOD),
        "knife": dict(n=4, hit=1, ref=("pawn-interact-knife.png", 0, 0), box=(110, 145, 78, 115), hand=(125, 104), handle=WOOD),
    },
}
# per-pawn: shoulder (arm root) of the tool hand, idle hand pose, vfx colours, tool-head draw reach
PAWN = {
    "old": dict(P=OLD, shoulder=(113, 103), cx=95, vfx=((255, 255, 255), (237, 230, 172)), lscale=.8, vscale=1.25),
    "new": dict(P=NEW, shoulder=(113, 106), cx=97, vfx=((218, 243, 238), (160, 179, 182)), lscale=1.0, vscale=1.7),
}
# key poses: (tool/arm angle clockwise from up, reach of the hand from the shoulder, rows squashed (+) / stretched (-))
POSES = {
    "down": dict(start=(160, 8, 0), peak=(15, 34, -2), hit=(172, 15, 3), end=(150, 10, 1)),
    "up": dict(start=(160, 8, 0), peak=(105, 14, 2), hit=(10, 34, -2), end=(100, 12, 0), after=(-35, 30, -1)),
}


def sheet_frame(name, row, col):
    a = np.array(Image.open(HERO / name).convert("RGBA"))
    return a[row * F:(row + 1) * F, col * F:(col + 1) * F]


def colour_in(a, cols):
    m = np.zeros(a.shape[:2], bool)
    for c in cols:
        m |= (a[..., :3] == c).all(-1)
    return m & (a[..., 3] == 255)


def palette(a):
    return {tuple(int(v) for v in c[:3]) for c in a.reshape(-1, 4) if c[3] == 255}


# ---- tool heads cut from the side frames ----------------------------------------------
def tool_head(kind, spec, hero_pal):
    """RGBA layer with just the tool head (with its dark outline) in its reference-frame position."""
    a = sheet_frame(*spec["ref"])
    nav = colour_in(a, [NAVY])
    if kind == "old":      # flood the head inside its dark outline
        lab, _ = ndi.label((a[..., 3] == 255) & ~nav)
        m = lab == lab[spec["seed"][1], spec["seed"][0]]
    else:                  # colours the hero himself never uses
        x0, x1, y0, y1 = spec["box"]
        m = (a[..., 3] == 255) & ~np.isin(a[..., :3].reshape(-1, 3).dot([65536, 256, 1]),
                                         [r * 65536 + g * 256 + b for r, g, b in hero_pal]).reshape(F, F)
        m[:y0] = m[y1:] = False
        m[:, :x0] = m[:, x1:] = False
        lab, n = ndi.label(ndi.binary_dilation(m, iterations=2))
        big = 1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1))))      # the tool, not flecks of spark
        m = ndi.binary_fill_holes(m & (lab == big))
    m |= ndi.binary_dilation(m) & nav
    return np.where(m[..., None], a, 0).astype(np.uint8), m


# ---- body views ------------------------------------------------------------------------
def put(layer, part, mask, x, y):
    """Paste a cut-out (with outline) so its centre of mass lands on (x, y)."""
    ys, xs = np.where(mask)
    shifted = np.roll(np.roll(part, int(y - round(ys.mean())), 0), int(x - round(xs.mean())), 1)
    return over(layer, outline(shifted))


def front_back_body(pawn, idle, view):
    """New Pawn: head from the idle hair/face palette, drawn square-on (front) or from behind (back)."""
    P, cx = NEW, 97
    lt, md, dk = P["tones"]
    head = np.zeros((F, F, 4), np.uint8)
    # hair: a cap over the head (dome + knot) with side locks (front) or one long bell (back)
    dome = ((X - cx) / 22.5) ** 2 + ((Y - 82) / 17.5) ** 2 <= 1
    knot = ((X - cx + 5) / 7.5) ** 2 + ((Y - 65) / 4.5) ** 2 <= 1
    lock = (np.abs(X - cx) <= 16) & (Y >= 86) & (Y <= 104)
    lock &= ~((np.abs(X - cx) >= 15) & (Y >= 102))                      # round the bottoms
    if view == "front":
        lock &= np.abs(X - cx) >= 10
    mask = dome | knot | lock
    d = np.hypot(X - (cx - 5), (Y - 78) * 1.1)
    hair = rgba(lt, mask)
    hair[mask & (d >= 20)] = (*md, 255)
    hair[mask & (d >= 27)] = (*dk, 255)
    for sx_, y0_, ln in ((-15, 86, 4), (-10, 77, 3), (-4, 72, 3), (3, 78, 4), (9, 72, 3), (14, 80, 3), (-7, 87, 3), (7, 88, 4)):
        for yy in range(y0_, y0_ + ln):
            if (hair[yy, cx + sx_] == (*lt, 255)).all():
                hair[yy, cx + sx_] = (*md, 255)
    # source highlight blobs, moved to the top-left of the dome
    hi, m = cut(idle, [P["hi"]], (86, 108, 76, 92))
    ys, xs = np.where(m)
    spot = np.roll(np.roll(hi, 72 - int(ys.mean()), 0), cx - 9 - int(xs.mean()), 1)
    hair = over(hair, spot)
    head = over(head, hair)
    if view == "front":
        face = np.zeros((F, F, 4), np.uint8)
        box = (np.abs(X - cx) <= 10) & (Y >= 94) & (Y <= 108)
        box &= ~((np.abs(X - cx) >= 9) & ((Y <= 95) | (Y >= 107)))      # round the corners
        face[box] = (*P["parts"]["face"][0][1], 255)          # cream
        face[box & (Y <= 99)] = (*P["parts"]["face"][0][0], 255)   # tan brow shade
        for k, dx in enumerate(range(-10, 11)):                 # jagged fringe over the forehead
            cut_rows = (2, 3, 2, 1, 2, 3)[k % 6]
            face[94:94 + cut_rows, cx + dx] = hair[94:94 + cut_rows, cx + dx]
        for ex in (-5, 5):
            face[101:103, cx + ex] = DARK
        face[105, cx - 1:cx + 2] = DARK
        head = over(head, outline(face))
    else:
        tail, m = cut(idle, [(71, 65, 68)], (66, 86, 99, 110))
        tail, m = np.rot90(tail, -1), np.rot90(m, -1)           # lossless: hang the ponytail down
        head = put(head, tail, m, cx, 103)
    head = outline(head)
    body = head
    tun, m = cut(idle, P["parts"]["tunic"][0], (82, 115, 111, 122))
    if view == "back":
        tun = tun.copy()
        tun[(tun[..., :3] == (70, 151, 172)).all(-1)] = (*P["parts"]["tunic"][0][0], 255)
    m &= np.abs(X - cx) <= 12
    body = over(body, outline(np.where(m[..., None], tun, 0).astype(np.uint8)))
    foot = np.zeros_like(idle)
    sel = (idle[..., 3] == 255)
    sel[:123] = sel[128:] = False
    foot[sel] = idle[sel]
    body = over(body, foot)
    hand, hm = cut(idle, P["parts"]["handL"][0], P["parts"]["handL"][1])
    return body, (hand, hm)


def old_body(idle):
    """Old Pawn: his idle frame, minus the tool-hand (screen right)."""
    body = np.where((idle[..., 3] == 255)[..., None], idle, 0).astype(np.uint8)
    hand, hm = cut(idle, OLD["parts"]["handR"][0], OLD["parts"]["handR"][1])
    hm = ndi.binary_dilation(hm)
    body[hm] = 0
    body[:, 111:][105:116, :] = 0
    return body, (hand, hm)


# ---- poses -----------------------------------------------------------------------------
def pose_at(direction, n, hit, i):
    """Pose of frame i: wind up to 'peak' before the hit, 'hit' on the hit frame, then ease to 'end'."""
    k = POSES[direction]
    path = lambda pts, t: (lambda u, j: tuple(pts[j][c] + (pts[j + 1][c] - pts[j][c]) * (u - j) for c in range(3)))(
        t * (len(pts) - 1), min(int(t * (len(pts) - 1)), len(pts) - 2))
    if i < hit:
        return path([k["start"], k["peak"]], (i + 1) / hit)
    tail = [k["hit"]] + ([k["after"]] if "after" in k else []) + [k["end"]]
    return path(tail, (i - hit) / (n - 1 - hit))


def stretch(body, n, lo, hi):
    """Opposite of squash: duplicate n quiet rows so the head rises and the feet stay."""
    cost = {y: np.abs(body[y].astype(int) - body[y + 1].astype(int)).sum() for y in range(lo, hi)}
    pick = []
    for y in sorted(cost, key=cost.get):
        if all(abs(y - p) > 2 for p in pick):
            pick.append(y)
        if len(pick) == n:
            break
    out = np.zeros_like(body)
    for y in range(F):
        dst = y - sum(p > y for p in pick)
        # row y lands at y - (#picks below it); picked rows appear twice
        out[dst] = body[y]
        if y in pick:
            out[dst - 1] = body[y]
    return out


def posed_body(body, rows, band):
    if rows > 0:
        return squash(body, rows, *band)
    if rows < 0:
        return stretch(body, -rows, *band)
    return body


# ---- drawing helpers -------------------------------------------------------------------
def line(layer, p0, p1, colour, thick=2):
    n = int(max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))) * 2 + 1
    for t in np.linspace(0, 1, n):
        x, y = int(round(p0[0] + (p1[0] - p0[0]) * t)), int(round(p0[1] + (p1[1] - p0[1]) * t))
        layer[y:y + thick, x:x + thick] = (*colour, 255)


def disc(layer, x, y, r, colour):
    layer[(X - x) ** 2 + (Y - y) ** 2 <= r * r] = (*colour, 255)


def build(pawn, weapon, direction):
    S, T = PAWN[pawn], TOOLS[pawn][weapon]
    P, cx = S["P"], S["cx"]
    sheet = np.array(Image.open(HERO / P["sheet"]).convert("RGBA"))[:F, :F]
    idle = np.where((sheet[..., 3] == 255)[..., None], sheet, 0).astype(np.uint8)
    hero_pal = palette(sheet)
    if pawn == "old":
        body, (hand, hm) = old_body(idle)
    else:
        body, (hand, hm) = front_back_body(pawn, idle, "front" if direction == "down" else "back")
        hand, hm = hand[:, ::-1], hm[:, ::-1]
    head, hmask = tool_head(pawn, T, hero_pal)
    ys, xs = np.where(hmask)
    hx, hy = int(round(xs.mean())), int(round(ys.mean()))
    px, py = T["hand"]
    v = np.array([hx - px, hy - py], float)
    ref_ang = np.degrees(np.arctan2(v[0], -v[1]))
    vlen = np.hypot(*v)
    band = P["band"]
    shadow = shadow_layer(P, sheet)
    sx, sy = S["shoulder"]
    out, prev, pa = [], None, None
    for i in range(T["n"]):
        ang, reach, rows = pose_at(direction, T["n"], T["hit"], i)
        reach *= S["lscale"]
        rows = int(round(rows))
        b = posed_body(body, rows, band)
        shy = sy + rows                               # shoulder follows the head up / down
        hand_xy = (sx + reach * np.sin(np.radians(ang)), shy - reach * np.cos(np.radians(ang)))
        reach_t = vlen * S["vscale"]
        tool_xy = (hand_xy[0] + reach_t * np.sin(np.radians(ang)), hand_xy[1] - reach_t * np.cos(np.radians(ang)))
        tx, ty = int(round(tool_xy[0])), int(round(tool_xy[1]))
        delta = ang - ref_ang
        rot = rotsprite(head, delta, hx, hy) if delta % 360 else head
        rot = np.roll(np.roll(rot, ty - hy, 0), tx - hx, 1)
        stick = np.zeros((F, F, 4), np.uint8)
        line(stick, hand_xy, tool_xy, T["handle"])
        stick = stick if pawn == "old" else outline(stick)
        # swoosh on the hit frame: a tapered crescent along the path the head just travelled
        trail = np.zeros((F, F, 4), np.uint8)
        if i == T["hit"] and prev is not None:        # arc about the shoulder, thin tail -> fat head
            for t in np.linspace(.35, 1, 40):
                aa = pa[0] + (ang - pa[0]) * t
                rr = pa[1] + (reach - pa[1]) * t + reach_t
                x, y = sx + (rr) * np.sin(np.radians(aa)), shy - (rr) * np.cos(np.radians(aa))
                disc(trail, x, y, 1.0 + 1.6 * t, S["vfx"][1])
            for t in np.linspace(.55, 1, 40):
                aa = pa[0] + (ang - pa[0]) * t
                rr = pa[1] + (reach - pa[1]) * t + reach_t
                x, y = sx + (rr) * np.sin(np.radians(aa)), shy - (rr) * np.cos(np.radians(aa))
                disc(trail, x, y, .5 + 1.1 * t, S["vfx"][0])
        prev = tool_xy
        pa = (ang, reach)
        hand_layer = np.zeros((F, F, 4), np.uint8)
        hand_layer = put(hand_layer, np.where(hm[..., None], hand, 0).astype(np.uint8), hm, int(round(hand_xy[0])), int(round(hand_xy[1])))
        f = shadow.copy()
        if direction == "up":     # seen from behind: overhead, the tool and hand sit behind his head
            stack = [stick, rot, trail, hand_layer, b] if reach > 18 else [stick, rot, trail, b, hand_layer]
        else:
            stack = [b, trail, stick, rot, hand_layer]
        for layer in stack:
            m = layer[..., 3] == 255
            f[m] = layer[m]
        out.append(f)
    return out


def main():
    for pawn, tools in TOOLS.items():
        if pawn == "old":
            continue                                     # the Old Pawn strips come from make_old_anims.py
        prefix = "opawn" if pawn == "old" else "pawn"
        for weapon in tools:
            for direction in ("up", "down"):
                frames = build(pawn, weapon, direction)
                Image.fromarray(np.concatenate(frames, 1)).save(HERO / f"{prefix}-{weapon}-{direction}.png")
                print("wrote", f"{prefix}-{weapon}-{direction}.png", len(frames), "frames, hit", tools[weapon]["hit"])


if __name__ == "__main__":
    main()
