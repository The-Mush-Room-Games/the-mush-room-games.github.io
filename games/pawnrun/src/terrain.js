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

// The ramps climb sideways: a stair bottom meets the ground on one side only (left stair: west, right stair: east);
// its bottom edge is a small stone face. 0 = a stair top, which never meets the ground.
const FOOT_SIDE = { 45: -1, 48: 1 }, footSide = t => FOOT_SIDE[t] || 0;

// Pixel rule for one corner of a unit's feet box: can a unit centred at (ax, ay) put a corner at (px, py)?
// On top of canStep: ground and ramp meet only at the ramp's foot side, and inside a stair cell only the ramp's own
// pixels count (masks: stair tile -> Uint8Array T*T, 1 = walkable; see stairMasks).
function cornerOk(m, lv, masks, ax, ay, px, py) {
  const cx = Math.floor(px / T), cy = Math.floor(py / T), fx = Math.floor(ax / T), fy = Math.floor(ay / T);
  if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
  const from = lv[fy * m.w + fx], to = lv[cy * m.w + cx];
  if (!canStep(from, to)) return false;
  if (to === LV.STAIRS) {
    const t = m.stairTiles[cy * m.w + cx], mk = masks && masks[t];
    if (mk && !mk[(Math.floor(py) - cy * T) * T + Math.floor(px) - cx * T]) return false;
    if (from === LV.GROUND) return footSide(t) !== 0 && fy === cy && fx === cx + footSide(t);
  }
  if (from === LV.STAIRS && to === LV.GROUND) {
    const f = footSide(m.stairTiles[fy * m.w + fx]);
    return f !== 0 && cy === fy && cx === fx + f;
  }
  return true;
}

// Phaser side. Water is the camera background; layers bottom to top: foam −40, flat −30, shadow −20, raised −10.
// low/high: texture keys of the colour files for flat and raised ground (the guide: one colour per level).
function dressTerrain(scene, m, low = 'tilemap1', high = 'tilemap2') {
  const c = cellFns(m), mid = n => n * T + T / 2;
  const map = scene.make.tilemap({ tileWidth: T, tileHeight: T, width: m.w, height: m.h });
  const tsLow = map.addTilesetImage('low', low, T, T, 0, 0, 0);
  const tsHigh = map.addTilesetImage('high', high, T, T, 0, 0, 54);
  const flat = map.createBlankLayer('flat', tsLow).setDepth(-30);
  const lvl1 = map.createBlankLayer('lvl1', tsHigh).setDepth(-10);
  const foam = [], shadows = [];
  const addFoam = (x, y) => foam.push(scene.add.sprite(mid(x), mid(y), 'foam').setDepth(-40)
    .play({ key: 'foam', startFrame: Phaser.Math.Between(0, 15) }));
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (c.G(x, y)) {
      flat.putTileAt(autotile(c.G, x, y), x, y);
      if (!c.G(x - 1, y) || !c.G(x + 1, y) || !c.G(x, y - 1) || !c.G(x, y + 1)) addFoam(x, y);
    }
    if (c.S(x, y)) lvl1.putTileAt(54 + m.stairTiles[y * m.w + x], x, y);
    if (!c.H(x, y)) continue;
    // a stair top beside a raised edge: swap that edge for the centre piece (15), as the guide says
    const t = c.top(x - 1, y) || c.top(x + 1, y) ? 15 : autotile(c.H, x, y, 5);
    lvl1.putTileAt(54 + t, x, y);
    shadows.push(scene.add.image(mid(x), mid(y + 1), 'shadow').setDepth(-20));
    if (hasCliff(c, x, y)) {
      lvl1.putTileAt(54 + cliffTile(c, x, y), x, y + 1);
      if (!c.G(x, y + 1)) addFoam(x, y + 1);                  // cliffs standing in water get foam too
    }
  }
  return { map, flat, lvl1, foam, shadows };
}

// Walkable pixels of the stair tiles, read from the art: anything that is not cliff stone, outline or empty.
// The stone palette is a cliff tile's non-green colours (same file, so every colour file works). The outline along the
// ramp's foot side is drawing, not a wall, so up to 10px of it is opened where the ramp surface reaches it.
function stairMasks(scene, key = 'tilemap2') {
  const src = scene.textures.get(key).getSourceImage(), c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
  const px = t => g.getImageData((t % 9) * T, Math.floor(t / 9) * T, T, T).data;
  const stone = new Set(), cliff = px(42), rgb = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  for (let i = 0; i < cliff.length; i += 4) if (cliff[i + 3] && cliff[i + 1] <= cliff[i + 2] + 10) stone.add(rgb(cliff, i));
  const masks = {};
  for (const t of STAIR_IDX) {
    const d = px(t), mk = masks[t] = new Uint8Array(T * T);
    for (let i = 0; i < T * T; i++) mk[i] = d[i * 4 + 3] && !stone.has(rgb(d, i * 4)) ? 1 : 0;
    const f = footSide(t);
    if (f) for (let y = 0; y < T; y++) for (let k = 0; k < 10; k++) {
      const x = f < 0 ? k : T - 1 - k;
      if (mk[y * T + x]) { for (let j = 0; j < k; j++) mk[y * T + (f < 0 ? j : T - 1 - j)] = 1; break }
    }
  }
  return masks;
}

if (typeof module === 'object') module.exports = { T, LV, STAIR_IDX, autotile, heightGrid, canStep, cornerOk, cellFns, cliffTile, hasCliff };
