// The terrain layers of a generated map, shared by make-test-map.js and make-town-map.js (and the island generator later). A map only says "land here":
// ground (the land, the top level of the island), raised (plateaus on it), water (ponds painted in), stairs ({ cell index: tile }) and sand (extra beach).
// Everything else is what the game derives (src/terrain.js): the beach ring, the cliffs, the foam and the shadows; this writes it into the preview layers
// so the map looks right in Tiled and tmxrasterizer. The game ignores the preview layers.
const TR = require('../src/terrain.js'), C = require('./common.js');
const F = C.FIRST;

// The tile rule: no 1-tile notch (a gap with the mask on both sides), no diagonal-only touch. Returns the cells of `m` (0 / 1 mask) that break it, as the
// cell to fill: the notch itself, or one of the two cells beside a diagonal touch.
function breaks(m, w, h) {
  const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] > 0, out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!has(x, y) && ((has(x - 1, y) && has(x + 1, y)) || (has(x, y - 1) && has(x, y + 1)))) out.push([x, y]);
    for (const dx of [1]) for (const dy of [1, -1]) if (has(x, y) && has(x + dx, y + dy) && !has(x + dx, y) && !has(x, y + dy)) out.push([x + dx, y]);
  }
  return out;
}

// opts: { w, h, ground, raised, water, sand, stairs }. Returns { stairTiles, layers (bottom to top, ids from 1, without the objects), base (the beach footprint) }.
// The beach is made to obey the tile rule by painting the cells the ring leaves as notches into `sand` (a painted-water cell is left alone and throws).
module.exports = function terrainLayers({ w, h, ground, raised, water, sand, stairs }) {
  const idx = (x, y) => y * w + x, stairTiles = new Int16Array(w * h).fill(-1);
  for (const [i, t] of Object.entries(stairs)) stairTiles[i] = t;
  const mk = () => ({ w, h, ground, raised, stairTiles, water, sand });
  let m = mk();
  for (let k = 0; k < 20; k++) {
    const bad = breaks(TR.baseOf(m), w, h);
    if (!bad.length) break;
    for (const [x, y] of bad) { if (water[idx(x, y)]) throw new Error(`the beach has a 1-tile notch at the pond cell ${x},${y}`); sand[idx(x, y)] = 1 }
    m = mk();
  }
  const base = TR.baseOf(m), c = TR.cellFns(m);
  if (breaks(base, w, h).length) throw new Error('the beach still breaks the tile rule at ' + breaks(base, w, h)[0]);
  for (const [name, mask] of [['ground', ground], ['raised', raised]]) if (breaks(mask, w, h).length) throw new Error(`${name} breaks the tile rule at ${breaks(mask, w, h)[0]}`);
  for (let i = 0; i < w * h; i++) if (raised[i] && !ground[i]) throw new Error('raised outside ground');
  for (const [i, t] of Object.entries(stairs)) if (!TR.STAIR_IDX.includes(t)) throw new Error('bad stair tile ' + t + ' at ' + i);

  const foam = new Set(), landShadow = new Set(), shadow = new Set(), cliff = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (c.B(x, y) && !(c.B(x - 1, y) && c.B(x + 1, y) && c.B(x, y - 1) && c.B(x, y + 1))) foam.add(idx(x, y));
    if (c.G(x, y) && y + 1 < h) {
      landShadow.add(idx(x, y + 1));
      if (TR.hasCliff(c, x, y, 0)) { cliff.set(idx(x, y + 1), F.low + TR.cliffTile(c, x, y, 0)); if (!c.B(x, y + 1)) foam.add(idx(x, y + 1)) }
    }
    if (c.H(x, y) && y + 1 < h) {
      shadow.add(idx(x, y + 1));
      if (TR.hasCliff(c, x, y)) { cliff.set(idx(x, y + 1), F.high + TR.cliffTile(c, x, y)); if (!c.G(x, y + 1)) foam.add(idx(x, y + 1)) }
    }
  }
  const near = (k, x, y) => { const { tp } = TR.tier(c, k); return tp(x - 1, y) || tp(x + 1, y) };
  const layer = (name, f, extra) => ({ name, type: 'tilelayer', x: 0, y: 0, width: w, height: h, opacity: 1, visible: true, ...extra,
    data: Array.from({ length: w * h }, (_, i) => f(i % w, (i / w) | 0)) });
  const layers = [
    layer('Water', (x, y) => (water[idx(x, y)] ? F.water : 0)),
    layer('Foam (preview)', (x, y) => (foam.has(idx(x, y)) ? F.foam : 0)),
    layer('Beach (preview)', (x, y) => (c.B(x, y) ? F.sand + TR.autotile(c.B, x, y) : 0)),
    layer('Sand', (x, y) => (sand[idx(x, y)] ? F.sand + 10 : 0), { opacity: 0.4 }),             // the cells painted as beach: a hint over the preview
    layer('Land shadows (preview)', (x, y) => (landShadow.has(idx(x, y)) ? F.shadow : 0)),
    layer('Ground', (x, y) => (ground[idx(x, y)] ? F.low + (near(0, x, y) ? 15 : TR.autotile(c.G, x, y, 5)) : 0)),
    layer('Shadows (preview)', (x, y) => (shadow.has(idx(x, y)) ? F.shadow : 0)),
    layer('Raised', (x, y) => (raised[idx(x, y)] ? F.high + (near(1, x, y) ? 15 : TR.autotile(c.H, x, y, 5)) : 0)),
    layer('Cliffs (preview)', (x, y) => cliff.get(idx(x, y)) || 0),
    layer('Stairs', (x, y) => (stairTiles[idx(x, y)] >= 0 ? (ground[idx(x, y)] ? F.high : F.low) + stairTiles[idx(x, y)] : 0)),
  ].map((l, i) => ({ id: i + 1, ...l }));
  return { stairTiles, layers, base };
};
module.exports.breaks = breaks;
