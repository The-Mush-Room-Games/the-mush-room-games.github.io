// Terrain: picks Tiny Swords tiles for any map (generated, Tiled, or both) and dresses it with cliffs,
// stairs, foam and shadows. Rules from the build guide, section 6.
// A map here is { w, h, ground, raised: Uint8Array w*h (1 = set), stairTiles: Int16Array (tile index or -1), sand?, water? }.
// Three levels, each sitting on the last as the guide stacks them: the BEACH (flat sand at water level), the LAND (`ground`: the playable
// grass, one cliff up; its south edge is a cliff face over the sand) and PLATEAUS (`raised`, one more up). Maps only say "land here":
// the beach is derived (baseOf): a ring of BEACH cells round the land and its cliff cells, plus any cell painted in `sand`.
const T = 64;
const STAIR_TOP = [36, 39], STAIR_IDX = [36, 45, 39, 48];
const LV = { BLOCK: 0, GROUND: 1, RAISED: 2, STAIRS: 3, SAND: 4 };
const BEACH = 1;

// Column from the left/right neighbours, row from up/down: all 16 pieces. colOffset 5 = elevated set.
function autotile(has, x, y, colOffset = 0) {
  const n = has(x, y - 1), s = has(x, y + 1), w = has(x - 1, y), e = has(x + 1, y);
  const col = w ? (e ? 1 : 2) : (e ? 0 : 3);
  const row = n ? (s ? 1 : 2) : (s ? 0 : 3);
  return row * 9 + col + colOffset;
}

// The sand level's footprint (1 = sand level or above): the land, its stairs, painted `sand`, and a BEACH-wide ring round the land, the cells
// under its south edge (the cliff cells) and the stairs (their foot). Painted water (ponds) stays water. Cached on the map.
// ponytail: no 1-tile notch / diagonal-only fix-up here; the generators check it (and paint the missing cells into `sand`).
function baseOf(m) {
  if (m._base) return m._base;
  const { w, h } = m, on = (a, x, y) => !!a && x >= 0 && y >= 0 && x < w && y < h && a[y * w + x] > 0;
  const seed = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, land = on(m.ground, x, y), st = !!m.stairTiles && m.stairTiles[i] >= 0;
    if (on(m.water, x, y)) continue;
    if (land || st || on(m.sand, x, y)) out[i] = 1;
    if (land || st || on(m.ground, x, y - 1)) seed[i] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (out[y * w + x] || on(m.water, x, y)) continue;
    for (let dy = -BEACH; dy <= BEACH; dy++) for (let dx = -BEACH; dx <= BEACH; dx++) if (on(seed, x + dx, y + dy)) out[y * w + x] = 1;
  }
  return m._base = out;
}

function cellFns(m) {
  const at = (a, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h ? a[y * m.w + x] : 0;
  const stair = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h ? m.stairTiles[y * m.w + x] : -1, base = baseOf(m);
  return {
    G: (x, y) => at(m.ground, x, y) === 1,
    H: (x, y) => at(m.raised, x, y) === 1,
    B: (x, y) => at(base, x, y) === 1,
    S: (x, y) => stair(x, y) >= 0,
    top: (x, y) => STAIR_TOP.includes(stair(x, y)),
  };
}

// A tier k is one level sitting on the one below: k 0 = the land over the sand, k 1 = a plateau over the land. up = its cells, down = the footprint it
// stands on, st / tp = a stair / a stair top of that tier (a stair of tier 0 is on the beach, outside the land; of tier 1 inside it).
const tier = (c, k) => {
  const on = k ? c.G : (x, y) => !c.G(x, y);
  return { up: k ? c.H : c.G, down: k ? c.G : c.B, st: (x, y) => c.S(x, y) && on(x, y), tp: (x, y) => c.top(x, y) && on(x, y) };
};

// The cliff under an edge of tier k: (x, y) is the upper cell, the cliff sits at (x, y + 1). A stair top beside the cliff counts as the cliff continuing,
// which gives the guide's "cliff middle" fix. Row 4 (standing on ground) when the cell below is part of the footprint, row 5 (in water) when not.
function cliffTile(c, x, y, k = 1) {
  const { up, down, tp } = tier(c, k);
  const w = (up(x - 1, y) || tp(x - 1, y)) && !up(x - 1, y + 1);
  const e = (up(x + 1, y) || tp(x + 1, y)) && !up(x + 1, y + 1);
  const col = w ? (e ? 1 : 2) : (e ? 0 : 3);
  return (down(x, y + 1) ? 4 : 5) * 9 + col + 5;
}
const hasCliff = (c, x, y, k = 1) => { const { up, st } = tier(c, k); return up(x, y) && !up(x, y + 1) && !st(x, y + 1) };

// Walkability per cell: water and cliffs block, stairs join the levels. Pure, so the generator's node self-check uses the same rule as the game.
function heightGrid(m) {
  const c = cellFns(m), lv = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    if (c.S(x, y)) lv[i] = LV.STAIRS;
    else if (c.H(x, y)) lv[i] = LV.RAISED;
    else if (c.G(x, y)) lv[i] = hasCliff(c, x, y - 1) ? LV.BLOCK : LV.GROUND;
    else if (c.B(x, y)) lv[i] = hasCliff(c, x, y - 1, 0) ? LV.BLOCK : LV.SAND;
  }
  return lv;
}
// The level a point stands on: -1 the beach, 0 the land, 1 a plateau. (A unit's `high` is this; things sort by it, see lift.)
const levelAt = (lv, w, px, py) => { const l = lv[Math.floor(py / T) * w + Math.floor(px / T)]; return l === LV.RAISED ? 1 : l === LV.SAND ? -1 : 0 };
const lvOf = u => u.high | 0;       // a unit's, rect's or shot's level; `high` may be a boolean (plateau) or -1 (beach)
// Can a unit step from level a to level b? Same level, or on/off stairs.
const canStep = (a, b) => a !== LV.BLOCK && b !== LV.BLOCK && (a === b || a === LV.STAIRS || b === LV.STAIRS);

// Feet boxes around a unit's feet point. On a plateau the grass stops ~5px inside the tile edge and the back edge has
// a thick outline, so the box is bigger there.
const FEET = { x: 10, top: 6, bottom: 2 }, FEET_HIGH = { x: 16, top: 14, bottom: 8 };
const HIGH_DEPTH = 2 * T;     // depth boost per level of anything standing up there (see dressTerrain, lift)
const lift = high => (high | 0) * HIGH_DEPTH;   // a unit's depth = its feet y + lift(its level): -2T on the beach, 0 on the land, +2T on a plateau
const BEHIND = 26;           // how far feet go in behind a plateau's back edge: legs hidden, head and body still showing
const RAMP_BACK = 8;         // feet stay this far above a ramp's back edge (its top cell's diagonal), on the ground behind it
const SHORE = { x: 6, top: 8, bottom: 6 };   // extra margin on a tile's water side (on top of FEET), so feet stay on the drawn grass

// Where feet may stand, per level (`sand` the beach, `ground` the land, `high` a plateau). A level's top is drawn one tile above the ground it covers: an
// upper cell blocks the cell below it (a cliff), and the ground under the top of its back row is free (units there walk behind it, which dressTerrain draws
// in front of them; only BEHIND px deep, so a unit never vanishes). Stair cells are never stood on: units ride ramps (moveFeet). Only the corner behind a
// ramp's top cell, above its diagonal back edge, is ground. 2 = behind a back row, 3 = behind a ramp.
function walkGrids(m) {
  const c = cellFns(m), n = m.w * m.h, sand = new Uint8Array(n), ground = new Uint8Array(n), high = new Uint8Array(n);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    high[i] = c.H(x, y) && !c.S(x, y) ? 1 : 0;
    ground[i] = !c.G(x, y) || c.H(x, y - 1) ? 0 : c.top(x, y) ? 3 : c.S(x, y) ? 0 : c.H(x, y) ? 2 : 1;
    sand[i] = !c.B(x, y) || c.G(x, y - 1) ? 0 : c.G(x, y) ? 2 : c.top(x, y) ? 3 : c.S(x, y) ? 0 : 1;
  }
  return { sand, ground, high };
}
// can a unit of level lv (-1 beach, 0 land, 1 plateau; true = 1) stand at the point?
function standOk(m, wg, lv, px, py) {
  const cx = Math.floor(px / T), cy = Math.floor(py / T), L = lv | 0;
  if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
  const v = (L > 0 ? wg.high : L < 0 ? wg.sand : wg.ground)[cy * m.w + cx], lx = px - cx * T, ly = py - cy * T;
  if (L <= 0) {                                                       // keep off the edge of the level's own footprint, so feet stay on the drawn grass or sand
    const own = L < 0 ? baseOf(m) : m.ground, land = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && own[y * m.w + x] === 1;
    if (ly < SHORE.top && !land(cx, cy - 1) || ly >= T - SHORE.bottom && !land(cx, cy + 1) ||
        lx < SHORE.x && !land(cx - 1, cy) || lx >= T - SHORE.x && !land(cx + 1, cy)) return false;
  }
  return v === 1 || v === 2 && ly < BEHIND || v === 3 && (m.stairTiles[cy * m.w + cx] === 36 ? lx : T - lx) + ly < T - RAMP_BACK;
}
// Stepping stones: rects { x0, y0, x1, y1 } (the art of a Water Rock in the water, or the dock) where feet at the beach or land level may stand on top of
// the water. Each corner of the feet box must be on land or on a stone, so a gap between stones is a wall (stones must overlap).
const onStone = (stones, x, y) => stones.some(r => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
// Is a unit's feet box at (bx, by) on its own level's walkable ground (or, below a plateau, on a stone)?
function feetOk(m, wg, lv, bx, by, stones = []) {
  const up = (lv | 0) > 0, F = up ? FEET_HIGH : FEET;
  for (const px of [bx - F.x, bx + F.x]) for (const py of [by - F.top, by + F.bottom]) if (!standOk(m, wg, lv, px, py) && (up || !onStone(stones, px, py))) return false;
  return true;
}

// Ramps climb sideways from a foot beside the stair bottom up to the upper level beside the stair top. A unit rides the
// ramp's centre line from F (lower side) to P (upper side); both sit just far enough out that a feet box there
// clears the stair cells. The line follows the art's ramp surface: y 92 at the foot edge, y 36 at the top edge
// (pixels down from the stair top cell's top). lo / hi = the levels it joins: beach and land (a stair outside the land), or land and plateau.
function rampsOf(m) {
  const out = [];
  for (let i = 0; i < m.w * m.h; i++) {
    const t = m.stairTiles[i];
    if (!STAIR_TOP.includes(t)) continue;
    const sx = i % m.w, sy = Math.floor(i / m.w), side = t === 36 ? -1 : 1, lo = m.ground[i] ? 0 : -1;      // side the foot is on
    const foot = sx * T + (side < 0 ? 0 : T), top = sx * T + (side < 0 ? T : 0);
    const yAt = x => sy * T + 92 + (36 - 92) * (x - foot) / (top - foot);
    const fx = foot + side * (FEET.x + 1), px = top - side * (FEET_HIGH.x + 1);
    const F = { x: fx, y: yAt(fx) }, P = { x: px, y: yAt(px) }, L = Math.hypot(P.x - F.x, P.y - F.y);
    const d = { x: (P.x - F.x) / L, y: (P.y - F.y) / L };
    out.push({ F, P, L, d, n: { x: -d.y, y: d.x }, side, lo, hi: lo + 1, footCell: [sx + side, sy + 1], topCell: [sx - side, sy],
      depth: (sy + 2 + 2 * lo) * T + 1 });                          // riders draw over both ramp rows (lo's units sort 2T lower per level)
  }
  return out;
}

// Move unit u ({ x, y, high, rail }) by (dx, dy); returns the new [x, y]. Off a ramp: per-axis slide, each axis only if
// ok(u, bx, by). Pushing sideways into a ramp from the cell beside its foot (on its lower level) or its top (on the upper one)
// boards it (u.rail); on it, any input along the ramp moves along the centre line, and the unit drifts onto that line
// as it climbs. Leaving at the top puts the unit on the upper level (u.high = hi), at the foot back on the lower one.
function moveFeet(ramps, ok, u, dx, dy) {
  let x = u.x, y = u.y;
  if (!u.rail) {
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    for (const r of ramps) {
      const atFoot = lvOf(u) === r.lo && cx === r.footCell[0] && cy === r.footCell[1] && dx * r.side < 0 && Math.abs(x - r.F.x) < 8;
      const atTop = lvOf(u) === r.hi && cx === r.topCell[0] && cy === r.topCell[1] && dx * r.side > 0 && Math.abs(x - r.P.x) < 8;
      if (!atFoot && !atTop) continue;
      const along = (x - r.F.x) * r.d.x + (y - r.F.y) * r.d.y, t = Math.min(1, Math.max(0, along / r.L));
      u.rail = { r, t, a: along - t * r.L, o: (x - r.F.x) * r.n.x + (y - r.F.y) * r.n.y };   // a, o: off the line
      break;
    }
  }
  if (u.rail) {
    const R = u.rail, r = R.r, along = dx * r.d.x + dy * r.d.y, k = Math.abs(along) * 1.5;
    const toward0 = v => v - Math.sign(v) * Math.min(Math.abs(v), k);
    R.t += along / r.L; R.a = toward0(R.a); R.o = toward0(R.o);
    const s = R.t * r.L + R.a;
    if (R.t < 0 || R.t > 1) { u.high = R.t > 1 ? r.hi : r.lo; u.rail = null }
    return [r.F.x + r.d.x * s + r.n.x * R.o, r.F.y + r.d.y * s + r.n.y * R.o];
  }
  if (ok(u, x + dx, y)) x += dx;
  if (ok(u, x, y + dy)) y += dy;
  return [x, y];
}

// Collision rects of an object in frame pixels: the ones drawn in Tiled, else a band along the bottom of the art
// (only when the object has a `block` footprint). Trees block only the trunk, buildings most of their base.
function objectRects(o, box) {
  if (o.rects && o.rects.length) return o.rects;
  if (!o.block || (!o.block[0] && !o.block[1])) return [];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let w = 0.8 * box.w, h = clamp(0.3 * box.h, 12, 40);
  if (/^tree/.test(o.key)) { w = 0.3 * box.w; h = 14 }
  else if (/^(house|castle|tower|barracks|monastery)/.test(o.key)) { w = 0.9 * box.w; h = 0.4 * box.h }
  return [{ x: box.x + (box.w - w) / 2, y: box.y + box.h - 2 - h, w, h }];
}
// An object's collision in world px [{ x0, y0, x1, y1 }]: o = a tile object (bottom-centre anchored, as readMap gives it, with .key), box = its art box
// { x, y, w, h, fw, fh } (TestMap artBox; tiled/seal.js reads the PNG), rs = frame-pixel rects to use instead of objectRects.
function worldRects(o, box, rs) {
  const fb = o.flipX ? { ...box, x: box.fw - box.x - box.w } : box, top = o.y - box.fh, left = o.x - box.fw / 2;
  return (rs || objectRects(o, fb)).map(r => ({ x0: left + r.x, y0: top + r.y, x1: left + r.x + r.w, y1: top + r.y + r.h }));
}
// Every object collision rect of a map (what TestMap places, minus the camps' gap pieces): objects with art, and `block` rects, which wall off a clearing.
// boxOf(key, o) = the art box of a texture. A rect is { x0, y0, x1, y1, high }.
function collisionRects(m, boxOf) {
  const lv = heightGrid(m), out = [];
  for (const o of m.objects) {
    if (o.cls === 'block' && o.w > 0) { out.push({ x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h, high: false }); continue }
    if (!o.key || o.cls === 'enemy' || /^sheep/.test(o.key)) continue;
    const high = levelAt(lv, m.w, o.x, o.y - 1);
    for (const r of worldRects(o, boxOf(o.key, o))) out.push({ ...r, high });
  }
  return out;
}

// Phaser side. Water is the camera background; static layers, bottom to top: foam -4000, sand -3000, shadows of the land -2900, stairs to the beach -2800.
// Everything that stands up sorts with the units, one layer per row: a unit's depth is its feet y + lift (-2T on the beach, 0 on the land, +2T on a plateau),
// and a top-surface pixel covers the ground one tile below it, so a land row y sorts at y * T (in front of anything on the beach beside or behind it, behind
// anything on the land in front of it) and a plateau row y at (y + 2) * T, a cliff with the row above it. A plateau's shadow falls on the land row two below
// it, so it sits between that row and the plateau (the .1 steps are only there to keep the order of equal rows).
// low / high / sand: texture keys of the colour files for the land, the plateaus and the beach (the guide: one colour per level).
function dressTerrain(scene, m, low = 'tilemap1', high = 'tilemap2', sand = 'sand') {
  const c = cellFns(m), mid = n => n * T + T / 2;
  const map = scene.make.tilemap({ tileWidth: T, tileHeight: T, width: m.w, height: m.h });
  const sets = [low, high, sand].map((k, i) => map.addTilesetImage('set' + i, k, T, T, 0, 0, 54 * i));   // tile ids: land 0-53, plateau 54-107, sand 108-161
  const flat = map.createBlankLayer('flat', sets).setDepth(-3000);
  const stairs = map.createBlankLayer('stairs', sets).setDepth(-2800);
  const foam = [], shadows = [], rows = new Map();
  const row = (y, d) => rows.get(y + ':' + d) || rows.set(y + ':' + d, map.createBlankLayer('row' + y + ':' + d, sets, 0, y * T, m.w, 1).setDepth(d)).get(y + ':' + d);   // a one-row layer at depth d
  const addFoam = (x, y) => foam.push(scene.add.sprite(mid(x), mid(y), 'foam').setDepth(-4000)
    .play({ key: 'foam', startFrame: Phaser.Math.Between(0, 15) }));
  const shadow = (x, y, d) => shadows.push(scene.add.image(mid(x), mid(y), 'shadow').setDepth(d));
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (c.B(x, y)) {
      flat.putTileAt(108 + autotile(c.B, x, y), x, y);
      if (!c.B(x - 1, y) || !c.B(x + 1, y) || !c.B(x, y - 1) || !c.B(x, y + 1)) addFoam(x, y);
    }
    if (c.S(x, y)) (c.G(x, y) ? row(y, y * T - 0.4) : stairs).putTileAt((c.G(x, y) ? 54 : 0) + m.stairTiles[y * m.w + x], x, c.G(x, y) ? 0 : y);
    // a stair top beside an edge: swap that edge for the centre piece (15), as the guide says
    const near = k => { const { tp } = tier(c, k); return tp(x - 1, y) || tp(x + 1, y) };
    if (c.G(x, y)) {
      row(y, y * T - 0.5).putTileAt(near(0) ? 15 : autotile(c.G, x, y, 5), x, 0);
      shadow(x, y + 1, -2900);
      if (hasCliff(c, x, y, 0)) {
        row(y + 1, y * T - 0.5).putTileAt(cliffTile(c, x, y, 0), x, 0);
        if (!c.B(x, y + 1)) addFoam(x, y + 1);                // cliffs standing in a pond get foam too
      }
    }
    if (!c.H(x, y)) continue;
    row(y, (y + 2) * T - 0.25).putTileAt(54 + (near(1) ? 15 : autotile(c.H, x, y, 5)), x, 0);
    shadow(x, y + 1, (y + 2) * T - 0.4);
    if (hasCliff(c, x, y)) {
      row(y + 1, (y + 2) * T - 0.25).putTileAt(54 + cliffTile(c, x, y), x, 0);
      if (!c.G(x, y + 1)) addFoam(x, y + 1);
    }
  }
  return { map, flat, stairs, rows, foam, shadows };
}

if (typeof module === 'object') module.exports = { objectRects, worldRects, collisionRects, T, LV, BEACH, STAIR_IDX, FEET, FEET_HIGH, HIGH_DEPTH, lift, lvOf, levelAt, autotile, baseOf, heightGrid, canStep, walkGrids, standOk, onStone, feetOk, rampsOf, moveFeet, cellFns, tier, cliffTile, hasCliff };
