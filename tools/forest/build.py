# Spore Nocturne: seamless parallax layers for the studio site banner, built at 1x from CC0 sprites
# (Platshrooms by surt, Pixel Mushrooms by Kami, Red Shroom by CazBee). Shown at 1.5x on the page.
from PIL import Image
import numpy as np, os
D = os.path.dirname(os.path.abspath(__file__)); S = os.path.join(D, 'src'); OUT = os.path.join(D, '..', '..', 'img', 'forest')
W, H = 640, 204          # tile size in art pixels
GY = H - 12              # top of the ground

def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)] + [255], np.uint8)
RAMP = {
  'violet': ['#12081f', '#2a1245', '#5a2bc4', '#9a6bff', '#d9ccff'],
  'pink':   ['#1a0610', '#5c0f3a', '#c4157a', '#ff4fae', '#ffc2e4'],
  'cyan':   ['#04121a', '#0b3b52', '#0f8fb8', '#4fdcff', '#d6f7ff'],
  'lime':   ['#0b1405', '#2b4a08', '#5fa800', '#c6ff3d', '#f1ffc9'],
}
RAMP = {k: np.stack([hexc(c) for c in v]) for k, v in RAMP.items()}

def load(name): return np.array(Image.open(os.path.join(S, name)).convert('RGBA'))
plat = load('platshrooms.png'); kami = load('kami_mushrooms.png'); run = load('red-shroom-run.png')
def crop(a, x0, x1, y0, y1):
  c = a[y0:y1, x0:x1].copy(); return c
CLUSTER = crop(plat, 64, 256, 32, 192)     # surt's three-stalk platform cluster
STACK = crop(plat, 34, 60, 140, 192)       # small stacked shroom
BUD = crop(plat, 48, 64, 112, 128)
# the cluster bbox also holds a stray small piece; keep only the big connected shape
from scipy import ndimage as nd
def biggest(c):
  lab, n = nd.label(c[..., 3] > 0, structure=np.ones((3, 3)))
  if n > 1:
    keep = np.argmax(nd.sum(np.ones_like(lab), lab, range(1, n + 1))) + 1; c[lab != keep] = 0
  return c
CLUSTER, STACK = biggest(CLUSTER), biggest(STACK)
KAMI = [crop(kami, x0, x1, y0, y1) for x0, x1, y0, y1 in
        [(17, 32, 2, 16), (3, 15, 4, 16), (33, 46, 6, 16), (16, 31, 18, 32), (1, 13, 20, 32), (34, 47, 22, 32),
         (16, 31, 33, 48), (1, 15, 34, 48), (17, 32, 49, 64), (1, 15, 50, 64), (50, 55, 11, 16), (58, 62, 12, 16)]]
KAMI = [k[np.any(k[..., 3] > 0, 1)][:, np.any(k[..., 3] > 0, 0)] for k in KAMI]   # trim to the sprite

def gmap(c, ramp, lift=0):
  """Remap a sprite onto one ramp by its own light and shadow (quantiles), then light it from below."""
  out = np.zeros_like(c); m = c[..., 3] > 0
  lum = (c[..., :3].astype(float) @ [.3, .59, .11])
  q = np.zeros(c.shape[:2], int); v = lum[m]
  edges = np.quantile(v, [.18, .42, .68, .9]); q[m] = np.searchsorted(edges, v)
  ys = np.arange(c.shape[0])[:, None] / max(1, c.shape[0] - 1)      # 0 top .. 1 bottom
  q = np.clip(q + lift + np.where(ys < .35, -1, 0), 0, 4)
  out[m] = RAMP[ramp][q[m]]; return out

def silhouette(c, body='#110820', rim='#2a1040'):
  out = np.zeros_like(c); m = c[..., 3] > 0; out[m] = hexc(body)
  under = m & ~np.vstack([m[1:], np.zeros((1, m.shape[1]), bool)])   # lit underside from the low stage light
  out[under] = hexc(rim); return out

def put(L, spr, x, bottom, flip=False):
  if flip: spr = spr[:, ::-1]
  h, w = spr.shape[:2]; y = bottom - h
  for ox in (x, x - W, x + W):                 # wrap so the tile has no seam
    x0, x1 = max(0, ox), min(W, ox + w); y0, y1 = max(0, y), min(H, y + h)
    if x0 >= x1 or y0 >= y1: continue
    s = spr[y0 - y:y1 - y, x0 - ox:x1 - ox]; a = s[..., 3:] > 0
    L[y0:y1, x0:x1] = np.where(a, s, L[y0:y1, x0:x1])

def layer(): return np.zeros((H, W, 4), np.uint8)

# surt's cluster is a kit of three mushrooms (thin A, medium B, thick C): cap, platform ring, stalk, roots.
# Build each at its own height by stacking those row sections; the stalk band (rows 96-128) tiles cleanly.
PARTS = {  # x range in the cluster, cap end, platform rows, lower stalk start
  'A': (0, 32, 62, (62, 82)), 'B': (32, 96, 32, (62, 90)), 'C': (96, 192, 62, (62, 92)) }
def shroom(kind, lower, plat=True, upper=None):
  x0, x1, cap, (p0, p1) = PARTS[kind]; c = biggest(CLUSTER[:, x0:x1].copy()); rows = [c[:cap]]
  if kind == 'B': rows.append(np.concatenate([c[36:60]] * 4)[:upper if upper is not None else 30])
  if plat: rows.append(c[p0:p1])
  band = np.concatenate([c[96:128]] * 8); rows += [band[:lower], c[144:160]]
  out = np.concatenate(rows); return out[np.any(out[..., 3] > 0, 1).cumsum() > 0]

# far forest: a sparse silhouette row, mostly smaller forms, one tall one
back = layer()
for kind, low, pl, up, x, f in [('B', 40, True, 50, 20, False), ('A', 30, False, None, 150, True), ('C', 90, True, None, 250, False),
                                ('A', 70, True, None, 420, False), ('B', 10, False, 0, 500, True), ('A', 12, True, None, 585, False)]:
  put(back, silhouette(shroom(kind, low, pl, up)), x, H - 4, f)

# middle distance: one towering hero that leaves the frame, then medium, short and stubby ones with gaps to breathe
mid = layer()
put(mid, gmap(shroom('C', 84), 'violet'), 52, H - 6)                         # hero
put(mid, gmap(shroom('A', 10), 'pink', 1), 196, H - 7); put(mid, gmap(shroom('A', 2, False), 'pink', 1), 222, H - 7, True)
put(mid, gmap(shroom('B', 34, True, 20), 'cyan'), 300, H - 6)
put(mid, gmap(shroom('C', 8, False), 'violet'), 420, H - 6, True)
put(mid, gmap(shroom('A', 96), 'cyan'), 540, H - 6, True)
put(mid, gmap(shroom('B', 4, False, 0), 'pink', 1), 586, H - 7)

# ground: soil, moss edge, tufts; mushrooms in twos and threes at very different sizes
def ground(L, gy, seed):
  r = np.random.default_rng(seed); L[gy:] = hexc('#0a0512'); L[gy] = hexc('#2b4a08'); L[gy + 1] = hexc('#14240a')
  for x in range(W):
    if r.random() < .05 and L.shape[0] - gy > 4: L[gy + 3 + r.integers(0, L.shape[0] - gy - 3), x] = hexc('#1e0d33')
    if r.random() < .16:
      t = 1 + int(r.random() < .35); L[gy - t:gy, x] = hexc('#5fa800'); L[gy - t, x] = hexc('#c6ff3d')
SPROUT = [KAMI[10], KAMI[11]]
def size(k):  # sprites by name, from 5px sprouts to 50px little platform shrooms
  return {'sprout': SPROUT[0], 'sprout2': SPROUT[1], 'bud': BUD, 'stack': STACK,
          'tinyA': shroom('A', 2, False), 'tinyB': shroom('B', 4, False, 0), 'shortA': shroom('A', 6)}.get(k) if isinstance(k, str) else KAMI[k]
def row(L, gy, picks):
  for x, k, ramp, *f in picks: put(L, gmap(size(k), ramp, 1), x, gy + 1, bool(f))

front = layer(); ground(front, GY, 7)
row(front, GY, [(36, 3, 'pink'), (50, 'sprout', 'lime'), (148, 'bud', 'cyan'), (252, 0, 'violet'), (268, 'sprout2', 'lime'),
                (281, 10, 'violet'), (404, 'stack', 'pink'), (432, 8, 'pink', 1), (512, 6, 'cyan'), (527, 'sprout', 'lime'), (612, 1, 'violet')])
put(front, silhouette(shroom('A', 120), '#05020a', '#1a0a26'), 262, H + 2, True)

# divider strip: just grass and mushrooms for the runner to cross between sections
SH = 64; SGY = SH - 10
strip = np.zeros((SH, W, 4), np.uint8); ground(strip, SGY, 11)
row(strip, SGY, [(30, 'stack', 'pink'), (60, 3, 'violet'), (74, 'sprout', 'lime'), (150, 5, 'cyan'),
                 (214, 'tinyA', 'violet'), (244, 'bud', 'cyan', 1), (262, 'sprout2', 'lime'), (330, 0, 'lime'), (346, 9, 'pink'),
                 (420, 'tinyB', 'cyan', 1), (450, 'sprout', 'pink'), (505, 'bud', 'pink'), (526, 6, 'violet'), (560, 'stack', 'lime', 1), (606, 1, 'cyan')])
Image.fromarray(strip).save(os.path.join(OUT, 'strip.png'), optimize=True)

def outline(c, col='#000000'):
  m = c[..., 3] > 0; p = np.pad(m, 1); o = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]   # no wrap-around
  out = c.copy(); out[o & ~m] = hexc(col); return out
# the runner is the only acid-lime figure with a hard black outline, so it reads over every mushroom
# a true palette swap: only CazBee's four cap reds become four acid-lime shades; gills, face and eyes keep every original brown
SWAP = {'#e05959': '#ecff9e', '#ac3232': '#c6ff3d', '#922727': '#8fd100', '#7b1b1b': '#5fa800'}
def swap(c):
  out = c.copy()
  for src, dst in SWAP.items(): out[np.all(c[..., :3] == hexc(src)[:3], -1)] = hexc(dst)
  return out
runner = np.concatenate([outline(swap(run[:, i * 32:(i + 1) * 32])) for i in (0, 1)], 1)   # per frame, so frames don't bleed

for n, a in [('back', back), ('mid', mid), ('front', front), ('runner', runner)]:
  Image.fromarray(a).save(os.path.join(OUT, n + '.png'), optimize=True)

# preview at 3x: sky + one low pink stage light + layers + runner
pv = np.zeros((H, W, 4), np.uint8); pv[..., 3] = 255
yy, xx = np.mgrid[0:H, 0:W]
g = np.clip(1 - np.hypot((xx - W * .5) / (W * .55), (yy - H * 1.05) / (H * .9)), 0, 1) ** 1.6
for i, (b, p) in enumerate(zip([11, 6, 18], [255, 79, 174])): pv[..., i] = (b + g * (p * .35 - b * .2)).astype(np.uint8)
im = Image.fromarray(pv)
for a in (back, mid, front): im.alpha_composite(Image.fromarray(a))
im.alpha_composite(Image.fromarray(runner[:, :32]), (190, GY + 1 - 32))
im.resize((W * 3, H * 3), Image.NEAREST).save(os.path.join(D, 'preview.png'))
print('ok', back.shape)
