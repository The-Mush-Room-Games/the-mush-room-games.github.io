// The explored map, pure parts (the scene that draws it is scenes/Map.js). One Uint8Array per island, a cell per tile: 1 = seen. It is made when the
// island is built, so a death or a new island starts it empty, and a house round trip (the scene only sleeps) keeps it. Tunables: data.js (EXPLORE).
// The terrain it draws comes from the same grids as the game (terrain.js cellFns / heightGrid), so it works for any map, Tiled or generated.
const TILE = { WATER: 0, GRASS: 1, RAISED: 2, CLIFF: 3, STAIRS: 4, SAND: 5 };   // terrainClass(); EXPLORE.land is in this order
const BLOB = { NONE: 0, TREE: 1, ROCK: 2, HOUSE: 3 };                      // objectClass(); EXPLORE.obj is in this order

// Pure. Mark the tiles within r tiles (a circle) of tile (tx, ty) as seen; returns how many were new. ponytail: no line of sight, walls and cliffs do not hide anything.
function revealAround(seen, w, h, tx, ty, r = EXPLORE.reveal) {
  let n = 0;
  for (let y = Math.max(0, Math.floor(ty - r)); y <= Math.min(h - 1, Math.ceil(ty + r)); y++)
    for (let x = Math.max(0, Math.floor(tx - r)); x <= Math.min(w - 1, Math.ceil(tx + r)); x++)
      if ((x - tx) ** 2 + (y - ty) ** 2 <= r * r && !seen[y * w + x]) { seen[y * w + x] = 1; n++ }
  return n;
}
// Pure. The ground class of every tile: water, grass (the land), raised, cliff (the cell under an edge of the land or a plateau), stairs, sand.
function terrainClass(m) {
  const c = cellFns(m), lv = heightGrid(m), out = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++)
    out[y * m.w + x] = lv[y * m.w + x] === LV.STAIRS ? TILE.STAIRS : lv[y * m.w + x] === LV.RAISED ? TILE.RAISED : hasCliff(c, x, y - 1) || hasCliff(c, x, y - 1, 0) ? TILE.CLIFF : c.G(x, y) ? TILE.GRASS : c.B(x, y) ? TILE.SAND : TILE.WATER;
  return out;
}
// Pure. The blobs standing on it: a tree or rock on the tile at its foot, a building on the lower half of its art. Drawn once from the map file
// (ponytail: a tree that is felled or a rock that is broken stays on the map).
function objectClass(m) {
  const out = new Uint8Array(m.w * m.h), put = (x, y, k) => { if (x >= 0 && y >= 0 && x < m.w && y < m.h) out[y * m.w + x] = k };
  for (const o of m.objects) {
    if (!o.key) continue;
    const bld = /^(house|castle|tower|barracks|monastery|gnome-hut|gnome-tower)/.test(o.key), k = bld ? BLOB.HOUSE : /^(dead-)?tree/.test(o.key) ? BLOB.TREE : /^(rock|gold-stone)/.test(o.key) ? BLOB.ROCK : 0;
    if (!k) continue;
    const ty = Math.floor((o.y - 1) / T), tx = Math.floor(o.x / T);
    if (!bld) { put(tx, ty, k); continue }
    for (let y = Math.floor((o.y - o.h / 2) / T); y <= ty; y++) for (let x = Math.floor((o.x - o.w / 2) / T); x <= Math.floor((o.x + o.w / 2 - 1) / T); x++) put(x, y, k);
  }
  return out;
}
// Pure. Remember every golden duck pickup within r tiles of the hero (px position hx, hy) in the Set `seen`. Returns the set.
function senseDucks(loot, seen, hx, hy, r = EXPLORE.ducks) {
  for (const p of loot) if (p.kind === 'duck' && Math.hypot(p.x - hx, p.y - hy) <= r * T) seen.add(p);
  return seen;
}
// Pure. The remembered ducks that are still lying there (a collected one is gone from `loot`), as tile positions [x, y] (fractions).
const shownDucks = (seen, loot) => [...seen].filter(p => loot.includes(p)).map(p => [p.x / T, p.y / T]);

if (typeof module === 'object') module.exports = { TILE, BLOB, revealAround, terrainClass, objectClass, senseDucks, shownDucks };
