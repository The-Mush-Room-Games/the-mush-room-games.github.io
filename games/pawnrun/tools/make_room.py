#!/usr/bin/env python3
"""Regenerate House B: the Modern Interiors tilesets, the furniture crops and maps/interiors/house_b.tmj.

Run from anywhere:  python3 tools/make_room.py        (needs PIL, numpy; the Modern Interiors pack in WebGames/Assets)

Writes (all under the game folder):
  assets/interiors/Room_Builder_3d_walls_48x48.png, Room_Builder_Floors_48x48.png   colour-graded copies of the two Room_Builder sheets
  assets/interiors/furniture/*.png                                                  pieces cropped from the Shadowless Theme_Sorter sheets
  maps/room_walls.tsj      wall sheet; every tile has a collision shape = the box of its opaque pixels (made once, used by every room)
  maps/room_floors.tsj     floor sheet (no collision)
  maps/room_furniture.tsj  image-collection tileset of the cropped pieces, each with its own collision shape; objectalignment bottom
  maps/interiors/house_b.tmj  the room (rules: _guide/ROOM_RULES.txt of the pack). Edit it in Tiled afterwards; this only seeds it.
The tilesets are rewritten on every run, so run it only to rebuild from scratch.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from interior_color import grade

GAME = Path(__file__).resolve().parent.parent
PACK = GAME.parents[2] / "WebGames/Assets/moderninteriors-win/1_Interiors/48x48"
SUB, SORT = PACK / "Room_Builder_subfiles_48x48", PACK / "Theme_Sorter_Shadowless_48x48"
OUT = GAME / "assets/interiors"
T = 48

def dump(path, d): Path(path).write_text(json.dumps(d, indent=1) + "\n")
def prop(n, v): return {"name": n, "type": "string", "value": v}
def shape(sid, x, y, w, h): return {"id": sid, "name": "", "type": "", "rotation": 0, "visible": True, "x": x, "y": y, "width": w, "height": h}
def collision(rects): return {"draworder": "index", "id": 2, "name": "", "objects": [shape(i + 1, *r) for i, r in enumerate(rects)], "opacity": 1, "type": "objectgroup", "visible": True, "x": 0, "y": 0}

# ---- sheet tilesets -------------------------------------------------------------------------------------------------
def sheet_tsj(name, png, solid):
    im = Image.open(OUT / png).convert("RGBA"); a = np.array(im)[:, :, 3] > 0
    cols, rows = im.width // T, im.height // T
    tiles = []
    if solid:                       # one box per non-empty tile: the bounding box of its opaque pixels
        for i in range(cols * rows):
            r, c = divmod(i, cols); ys, xs = np.nonzero(a[r * T:(r + 1) * T, c * T:(c + 1) * T])
            if len(xs): tiles.append({"id": i, "objectgroup": collision([(int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))])})
    d = {"type": "tileset", "name": name, "tiledversion": "1.12.2", "version": "1.10", "image": "../assets/interiors/" + png,
         "imagewidth": im.width, "imageheight": im.height, "columns": cols, "tilecount": cols * rows, "tilewidth": T, "tileheight": T,
         "margin": 0, "spacing": 0}
    if tiles: d["tiles"] = tiles
    dump(GAME / "maps" / (name + ".tsj"), d)
    return cols * rows

WALLS, FLOORS = "Room_Builder_3d_walls_48x48.png", "Room_Builder_Floors_48x48.png"
OUT.mkdir(parents=True, exist_ok=True)
for f in (WALLS, FLOORS): grade(Image.open(SUB / f)).save(OUT / f)      # colour-graded copies (tools/interior_color.py)
n_walls = sheet_tsj("room_walls", WALLS, True)
n_floors = sheet_tsj("room_floors", FLOORS, False)

# ---- furniture ------------------------------------------------------------------------------------------------------
# name: (sheet, col0, row0, col1, row1 (exclusive), collision (x, y, w, h) in the cropped image, depth property)
# The crop is trimmed to its opaque pixels. Contrast only (luma std 40 vs Tiny Swords 64): the Shadowless pieces already match the Tiny Swords saturation (median 0.55 vs 0.52). Collision follows the base: wall pieces block their whole floor depth.
PIECES = {
    "bed":        ("4_Bedroom",  9, 0, 11, 4,  lambda w, h: (0, 24, w, h - 24), None),
    "armoire":    ("2_LivingRoom", 7, 4, 9, 7, lambda w, h: (2, h - 48, w - 4, 48), None),
    "fireplace":  ("2_LivingRoom", 4, 23, 6, 26, lambda w, h: (0, h - 56, w, 56), None),
    "bookshelf":  ("5_Classroom_and_library", 0, 19, 3, 22, lambda w, h: (0, h - 48, w, 48), None),
    "table":      ("1_Generic", 0, 34, 4, 37, lambda w, h: (0, h - 55, w, 55), None),
    "rug":        ("1_Generic", 9, 4, 13, 7, None, "under"),
    "jar1":       ("2_LivingRoom", 0, 22, 1, 24, lambda w, h: (8, h - 20, w - 16, 20), None),
    "jar2":       ("2_LivingRoom", 1, 22, 2, 24, lambda w, h: (8, h - 20, w - 16, 20), None),
    "jar3":       ("2_LivingRoom", 2, 22, 3, 24, lambda w, h: (8, h - 20, w - 16, 20), None),
}
(OUT / "furniture").mkdir(exist_ok=True)
tiles, size = [], {}
for i, (name, (sh, c0, r0, c1, r1, col, depth)) in enumerate(PIECES.items()):
    im = Image.open(SORT / f"{sh}_Shadowless_48x48.png").convert("RGBA").crop((c0 * T, r0 * T, c1 * T, r1 * T))
    im = im.crop(im.getbbox()); grade(im, sat=1.1, gamma=1, con=1.45).save(OUT / "furniture" / f"{name}.png"); size[name] = im.size
    t = {"id": i, "image": f"../assets/interiors/furniture/{name}.png", "imagewidth": im.width, "imageheight": im.height}
    if depth: t["properties"] = [prop("depth", depth)]
    if col: t["objectgroup"] = collision([col(*im.size)])
    tiles.append(t)
dump(GAME / "maps/room_furniture.tsj", {"type": "tileset", "name": "room_furniture", "tiledversion": "1.12.2", "version": "1.10",
     "objectalignment": "bottom", "columns": 0, "tilecount": len(tiles), "margin": 0, "spacing": 0,
     "tilewidth": max(w for w, h in size.values()), "tileheight": max(h for w, h in size.values()),
     "grid": {"orientation": "orthogonal", "width": 1, "height": 1}, "tiles": tiles})
FIRST_WALLS, FIRST_FLOORS = 1, 1 + n_walls
FIRST_FURN = FIRST_FLOORS + n_floors
ids = {n: i for i, n in enumerate(PIECES)}

# ---- the room: 10 x 6 floor tiles, wall 2 tall, a 2-wide gap in the south wall (ROOM_RULES.txt, cottage wood set) -------
FW, FH, WT, GAP = 10, 6, 2, 5                      # floor tiles, wall height, first floor col of the gap
W, H = FW + 2, FH + WT + 2                         # + side strips; + south cap row and one outside row
S = WT + FH                                        # cap row
wall = [[0] * W for _ in range(H)]; floor = [[0] * W for _ in range(H)]
for c in range(1, W - 1):
    wall[0][c], wall[1][c] = 51, 75
wall[0][0], wall[1][0], wall[0][W - 1], wall[1][W - 1] = 3, 27, 4, 28
for r in range(WT, S): wall[r][0], wall[r][W - 1] = 121, 126
gap = (GAP, GAP + 1)
for c in range(1, W - 1): wall[S][c] = 123
wall[S][0], wall[S][W - 1] = 122, 125
wall[S][gap[0] - 1], wall[S][gap[1] + 1] = 125, 122      # cap ends with the little post, either side of the gap
for c in gap: wall[S][c] = 0
for r in range(WT, S):
    for c in range(1, W - 1): floor[r][c] = 184 if (r, c) == (WT, 1) else 185 if r == WT else 199 if c == 1 else 200
for r in (S, S + 1):
    for c in gap: floor[r][c] = 200
g = lambda rows, first: [0 if not v else v + first for row in rows for v in row]

# furniture: (piece, x of the bottom centre, y of the bottom). North-wall pieces stand one floor row deep (bottom y = 144).
PUT = [("bed", 96, 231), ("armoire", 192, 144), ("fireplace", 288, 144), ("bookshelf", 455, 144),
       ("rug", 288, 310), ("table", 288, 280), ("jar1", 466, 372), ("jar3", 505, 372), ("jar2", 505, 334), ("jar2", 84, 366)]
oid = 1
def tile_obj(n, x, y):
    global oid; o = {"id": oid, "name": n, "type": "", "gid": FIRST_FURN + ids[n], "x": x, "y": y, "width": size[n][0], "height": size[n][1], "rotation": 0, "visible": True}
    oid += 1; return o
objs = [tile_obj(*p) for p in PUT if p[0] != "rug"]
rugs = [tile_obj(*p) for p in PUT if p[0] == "rug"]        # own layer under the others, so Tiled draws it below the table too
def plain(cls, x, y, w=0, h=0):
    global oid; o = {"id": oid, "name": "", "class": cls, "x": x, "y": y, "width": w, "height": h, "rotation": 0, "visible": True}
    oid += 1; return o
objs += [plain("spawn", 288, 350), plain("exit", gap[0] * T, (S + 0.5) * T, 2 * T, 1.5 * T - 8)]
layers = [
    {"id": 1, "name": "floor", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 1, "visible": True, "data": g(floor, FIRST_FLOORS)},
    {"id": 2, "name": "walls", "type": "tilelayer", "width": W, "height": H, "x": 0, "y": 0, "opacity": 1, "visible": True, "data": g(wall, FIRST_WALLS)},
    {"id": 4, "name": "rugs", "type": "objectgroup", "draworder": "topdown", "x": 0, "y": 0, "opacity": 1, "visible": True, "objects": rugs},
    {"id": 3, "name": "objects", "type": "objectgroup", "draworder": "topdown", "x": 0, "y": 0, "opacity": 1, "visible": True, "objects": objs},
]
dump(GAME / "maps/interiors/house_b.tmj", {
    "type": "map", "version": "1.10", "tiledversion": "1.12.2", "class": "interior", "orientation": "orthogonal", "renderorder": "right-down",
    "infinite": False, "compressionlevel": -1, "width": W, "height": H, "tilewidth": T, "tileheight": T, "nextlayerid": 5, "nextobjectid": oid,
    "backgroundcolor": "#0b0612",
    "tilesets": [{"firstgid": FIRST_WALLS, "source": "../room_walls.tsj"}, {"firstgid": FIRST_FLOORS, "source": "../room_floors.tsj"},
                 {"firstgid": FIRST_FURN, "source": "../room_furniture.tsj"}],
    "layers": layers})
print("house_b.tmj", W, "x", H, "tiles;", len(objs), "objects;", {n: size[n] for n in PIECES})
