// Terrain: picks Tiny Swords tiles for any map (generated, Tiled, or both) and dresses it with cliffs,
// stairs, foam and shadows. Rules from the build guide, section 6.
// A map here is { w, h, ground, raised: Uint8Array w*h (1 = set), stairTiles: Int16Array (tile index or -1) }.
const T = 64;
const STAIR_TOP = [36, 39], STAIR_IDX = [36, 45, 39, 48];
const LV = { BLOCK: 0, GROUND: 1, RAISED: 2, STAIRS: 3 };

// Column from the left/right neighbours, row from up/down: all 16 pieces. colOffset 5 = elevated set.
function autotile(has, x, y, colOffset = 0) {
  const n = has(x, y - 1), s = has(x, y + 1), w = has(x - 1, y), e = has(x + 1, y);
  const col = w ? (e ? 1 : 2) : (e ? 0 : 3);
  const row = n ? (s ? 1 : 2) : (s ? 0 : 3);
  return row * 9 + col + colOffset;
}

function cellFns(m) {
  const at = (a, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h ? a[y * m.w + x] : 0;
  const stair = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h ? m.stairTiles[y * m.w + x] : -1;
  return {
    G: (x, y) => at(m.ground, x, y) === 1,
    H: (x, y) => at(m.raised, x, y) === 1,
    S: (x, y) => stair(x, y) >= 0,
    top: (x, y) => STAIR_TOP.includes(stair(x, y)),
  };
}

// The cliff under a raised edge: (x, y) is the raised cell, the cliff sits at (x, y + 1).
// A stair top beside the cliff counts as the cliff continuing, which gives the guide's "cliff middle" fix.
function cliffTile(c, x, y) {
  const w = (c.H(x - 1, y) || c.top(x - 1, y)) && !c.H(x - 1, y + 1);
  const e = (c.H(x + 1, y) || c.top(x + 1, y)) && !c.H(x + 1, y + 1);
  const col = w ? (e ? 1 : 2) : (e ? 0 : 3);
  return (c.G(x, y + 1) ? 4 : 5) * 9 + col + 5;
}
const hasCliff = (c, x, y) => c.H(x, y) && !c.H(x, y + 1) && !c.S(x, y + 1);

// Walkability per cell: water and cliffs block, stairs join ground and raised. Pure, so the generator's
// node self-check uses the same rule as the game.
function heightGrid(m) {
  const c = cellFns(m), lv = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    if (c.S(x, y)) lv[i] = LV.STAIRS;
    else if (c.H(x, y)) lv[i] = LV.RAISED;
    else if (c.G(x, y) && !hasCliff(c, x, y - 1)) lv[i] = LV.GROUND;
  }
  return lv;
}
// Can a unit step from level a to level b? Same level, or on/off stairs.
const canStep = (a, b) => a !== LV.BLOCK && b !== LV.BLOCK && (a === b || a === LV.STAIRS || b === LV.STAIRS);

// Feet boxes around a unit's feet point. On a plateau the grass stops ~5px inside the tile edge and the back edge has
// a thick outline, so the box is bigger there.
const FEET = { x: 10, top: 6, bottom: 2 }, FEET_HIGH = { x: 16, top: 14, bottom: 8 };
const HIGH_DEPTH = 2 * T;     // depth boost for anything standing on a plateau (see dressTerrain)
const BEHIND = 26;           // how far feet go in behind a plateau's back edge: legs hidden, head and body still showing
const RAMP_BACK = 8;         // feet stay this far above a ramp's back edge (its top cell's diagonal), on the ground behind it
const SHORE = { x: 6, top: 8, bottom: 6 };   // extra margin on a tile's water side (on top of FEET), so feet stay on the drawn grass

// Where feet may stand, per level. A plateau's top is drawn one tile above the ground it covers: a raised cell blocks
// the ground cell below it, and the ground under the top of a plateau's back row is free (units there walk behind the
// plateau, which dressTerrain draws in front of them; only BEHIND px deep, so a unit never vanishes). Stair cells are never stood on: units ride ramps
// (moveFeet). Only the grass corner behind a ramp's top cell, above its diagonal back edge, is ground.
function walkGrids(m) {
  const c = cellFns(m), ground = new Uint8Array(m.w * m.h), high = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    high[i] = c.H(x, y) && !c.S(x, y) ? 1 : 0;
    ground[i] = !c.G(x, y) || c.H(x, y - 1) ? 0 : c.top(x, y) ? 3 : c.S(x, y) ? 0 : c.H(x, y) ? 2 : 1;   // 2 = behind a back row, 3 = behind a ramp
  }
  return { ground, high };
}
function standOk(m, wg, high, px, py) {
  const cx = Math.floor(px / T), cy = Math.floor(py / T);
  if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
  const v = (high ? wg.high : wg.ground)[cy * m.w + cx], lx = px - cx * T, ly = py - cy * T;
  if (!high) {
    const land = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.ground[y * m.w + x] === 1;
    if (ly < SHORE.top && !land(cx, cy - 1) || ly >= T - SHORE.bottom && !land(cx, cy + 1) ||
        lx < SHORE.x && !land(cx - 1, cy) || lx >= T - SHORE.x && !land(cx + 1, cy)) return false;
  }
  return v === 1 || v === 2 && ly < BEHIND || v === 3 && (m.stairTiles[cy * m.w + cx] === 36 ? lx : T - lx) + ly < T - RAMP_BACK;
}
// Stepping stones: rects { x0, y0, x1, y1 } (the art of a Water Rock in the water) where ground-level feet may stand on top of
// the water. Each corner of the feet box must be on land or on a stone, so a gap between stones is a wall (stones must overlap).
const onStone = (stones, x, y) => stones.some(r => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
// Is a unit's feet box at (bx, by) on its own level's walkable ground (or, at ground level, on a stone)?
function feetOk(m, wg, high, bx, by, stones = []) {
  const F = high ? FEET_HIGH : FEET;
  for (const px of [bx - F.x, bx + F.x]) for (const py of [by - F.top, by + F.bottom]) if (!standOk(m, wg, high, px, py) && (high || !onStone(stones, px, py))) return false;
  return true;
}

// Ramps climb sideways from a foot beside the stair bottom up to the plateau beside the stair top. A unit rides the
// ramp's centre line from F (ground side) to P (plateau side); both sit just far enough out that a feet box there
// clears the stair cells. The line follows the art's ramp surface: y 92 at the foot edge, y 36 at the top edge
// (pixels down from the stair top cell's top).
function rampsOf(m) {
  const out = [];
  for (let i = 0; i < m.w * m.h; i++) {
    const t = m.stairTiles[i];
    if (!STAIR_TOP.includes(t)) continue;
    const sx = i % m.w, sy = Math.floor(i / m.w), side = t === 36 ? -1 : 1;      // side the foot is on
    const foot = sx * T + (side < 0 ? 0 : T), top = sx * T + (side < 0 ? T : 0);
    const yAt = x => sy * T + 92 + (36 - 92) * (x - foot) / (top - foot);
    const fx = foot + side * (FEET.x + 1), px = top - side * (FEET_HIGH.x + 1);
    const F = { x: fx, y: yAt(fx) }, P = { x: px, y: yAt(px) }, L = Math.hypot(P.x - F.x, P.y - F.y);
    const d = { x: (P.x - F.x) / L, y: (P.y - F.y) / L };
    out.push({ F, P, L, d, n: { x: -d.y, y: d.x }, side, footCell: [sx + side, sy + 1], topCell: [sx - side, sy],
      depth: (sy + 2) * T + 1 });                                   // riders draw over both ramp rows
  }
  return out;
}

// Move unit u ({ x, y, high, rail }) by (dx, dy); returns the new [x, y]. Off a ramp: per-axis slide, each axis only if
// ok(u, bx, by). Pushing sideways into a ramp from the cell beside its foot (on the ground) or its top (on the plateau)
// boards it (u.rail); on it, any input along the ramp moves along the centre line, and the unit drifts onto that line
// as it climbs. Leaving at the top puts the unit on the plateau (u.high), at the foot back on the ground.
function moveFeet(ramps, ok, u, dx, dy) {
  let x = u.x, y = u.y;
  if (!u.rail) {
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    for (const r of ramps) {
      const atFoot = !u.high && cx === r.footCell[0] && cy === r.footCell[1] && dx * r.side < 0 && Math.abs(x - r.F.x) < 8;
      const atTop = u.high && cx === r.topCell[0] && cy === r.topCell[1] && dx * r.side > 0 && Math.abs(x - r.P.x) < 8;
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
    if (R.t < 0 || R.t > 1) { u.high = R.t > 1; u.rail = null }
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
    const high = lv[Math.floor((o.y - 1) / T) * m.w + Math.floor(o.x / T)] === LV.RAISED;
    for (const r of worldRects(o, boxOf(o.key, o))) out.push({ ...r, high });
  }
  return out;
}

// Phaser side. Water is the camera background; layers bottom to top: foam −40, flat −30, shadow −20, stairs −10. Plateau
// tops and cliffs sort with the units, one layer per row. A top-surface pixel covers the ground one tile below it, so it
// is in front of anything standing on the ground less than a tile below it (a unit beside or behind the plateau is
// shorter than the cliff): a top row y sorts at (y + 2) * T, a cliff row at (y + 1) * T. Units on a plateau sort at
// feet + 2 * T, so the row they stand on stays under them (HIGH_DEPTH).
// low/high: texture keys of the colour files for flat and raised ground (the guide: one colour per level).
function dressTerrain(scene, m, low = 'tilemap1', high = 'tilemap2') {
  const c = cellFns(m), mid = n => n * T + T / 2;
  const map = scene.make.tilemap({ tileWidth: T, tileHeight: T, width: m.w, height: m.h });
  const tsLow = map.addTilesetImage('low', low, T, T, 0, 0, 0);
  const tsHigh = map.addTilesetImage('high', high, T, T, 0, 0, 54);
  const flat = map.createBlankLayer('flat', tsLow).setDepth(-30);
  const stairs = map.createBlankLayer('stairs', tsHigh).setDepth(-10);
  const foam = [], shadows = [], rows = new Map();
  const row = (y, d) => rows.get(y + ':' + d) || rows.set(y + ':' + d,                      // a one-row layer at depth d
    map.createBlankLayer('row' + y + ':' + d, tsHigh, 0, y * T, m.w, 1).setDepth(d - 0.5)).get(y + ':' + d);
  const addFoam = (x, y) => foam.push(scene.add.sprite(mid(x), mid(y), 'foam').setDepth(-40)
    .play({ key: 'foam', startFrame: Phaser.Math.Between(0, 15) }));
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (c.G(x, y)) {
      flat.putTileAt(autotile(c.G, x, y), x, y);
      if (!c.G(x - 1, y) || !c.G(x + 1, y) || !c.G(x, y - 1) || !c.G(x, y + 1)) addFoam(x, y);
    }
    if (c.S(x, y)) stairs.putTileAt(54 + m.stairTiles[y * m.w + x], x, y);
    if (!c.H(x, y)) continue;
    // a stair top beside a raised edge: swap that edge for the centre piece (15), as the guide says
    const t = c.top(x - 1, y) || c.top(x + 1, y) ? 15 : autotile(c.H, x, y, 5);
    row(y, (y + 2) * T).putTileAt(54 + t, x, 0);
    shadows.push(scene.add.image(mid(x), mid(y + 1), 'shadow').setDepth(-20));
    if (hasCliff(c, x, y)) {
      row(y + 1, (y + 2) * T).putTileAt(54 + cliffTile(c, x, y), x, 0);
      if (!c.G(x, y + 1)) addFoam(x, y + 1);                  // cliffs standing in water get foam too
    }
  }
  return { map, flat, stairs, rows, foam, shadows };
}

if (typeof module === 'object') module.exports = { objectRects, worldRects, collisionRects, T, LV, STAIR_IDX, FEET, FEET_HIGH, HIGH_DEPTH, autotile, heightGrid, canStep, walkGrids, standOk, onStone, feetOk, rampsOf, moveFeet, cellFns, cliffTile, hasCliff };
