// Writes maps/town.tmj, the town hub (48x42 tiles). Run: node tiled/make-town-map.js (after make-rules.js and make-objects.js). Open it in Tiled to move anything.
//   North: the Castle, with the Steward at its door (the duck shop). West: the Barracks, the Blacksmith in his fenced yard. East: the Monastery and the Healer's garden.
//   Middle: the Market (a House) with the Merchant, a pig pen and produce. South-west: the Trainer's yard. South: two enterable houses, and the main gate (two Towers and a
//   Wooden Fence) with a pier: the `sail` rect on it starts a run. The beach where you wash up is on the west shore.
// Same terrain rules as make-test-map.js (no 1-tile notches, no diagonal-only touches); the NPCs, doors, yards and `sail` rect are this map's own.
const fs = require('fs'), path = require('path');
const C = require('./common.js'), TR = require('../src/terrain.js'), SEAL = require('./seal.js');
const { NPCS } = require('../src/data.js');
const R = path.join(__dirname, '..');
const W = 48, H = 42, T = 64, CL = require('./clearing.js')(W, H);
const objTs = JSON.parse(fs.readFileSync(path.join(R, 'maps/objects.tsj'), 'utf8'));
const keyOf = t => (t.properties || []).find(p => p.name === 'key')?.value || t.image.split('/').pop().replace(/\.png$/i, '');
const findTile = key => objTs.tiles.find(t => keyOf(t) === key);
const gidOf = key => C.FIRST.objects + findTile(key).id;
const F = C.FIRST, idx = (x, y) => y * W + x;

// ---- the island: a few overlapping blobs, cleaned by the game's terrain rule
const ground = new Uint8Array(W * H);
for (const [cx, cy, rx, ry, seed] of [[24.5, 18.5, 17.5, 12.5, 3], [14, 12.5, 8, 6, 5], [35, 12, 8, 6.5, 7], [11.5, 25, 7, 5.5, 11], [38, 24.5, 7, 5.5, 13], [24.5, 28, 9.5, 5.5, 17]])
  for (const i of CL.ellipse(cx, cy, rx, ry, seed, { amp: 0.12 })) ground[i] = 1;
for (let y = 29; y <= 35; y++) for (let x = 20; x <= 29; x++) ground[idx(x, y)] = 1;       // the gatehouse spit, down to the pier
CL.clean(ground);
const has = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[idx(x, y)] === 1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!ground[idx(x, y)] && ((has(ground, x - 1, y) && has(ground, x + 1, y)) || (has(ground, x, y - 1) && has(ground, x, y + 1)))) throw new Error(`1-tile notch at ${x},${y}`);
  for (const [dx, dy] of [[1, 1], [1, -1]]) if (has(ground, x, y) && has(ground, x + dx, y + dy) && !has(ground, x + dx, y) && !has(ground, x, y + dy)) throw new Error(`diagonal-only touch at ${x},${y}`);
}
const raised = new Uint8Array(W * H), stairTiles = new Int16Array(W * H).fill(-1);
const autotile = (m, x, y, off) => {
  const n = has(m, x, y - 1), s = has(m, x, y + 1), w = has(m, x - 1, y), e = has(m, x + 1, y);
  return (n ? (s ? 1 : 2) : (s ? 0 : 3)) * 9 + (w ? (e ? 1 : 2) : (e ? 0 : 3)) + off;
};
const layer = (id, name, f) => ({ id, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: Array.from({ length: W * H }, (_, i) => f(i % W, (i / W) | 0)) });
const foam = new Set();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ground[idx(x, y)] && !(has(ground, x - 1, y) && has(ground, x + 1, y) && has(ground, x, y - 1) && has(ground, x, y + 1))) foam.add(idx(x, y));

// ---- objects
let oid = 1;
const P = (name, value, type = 'string', propertytype) => ({ name, type, ...(propertytype && { propertytype }), value });
const FLIP = 0x80000000;
const tileObj = (key, [x, y], cls, props = [], flip = false) => {
  const t = findTile(key);
  if (!t) throw new Error('no tile for ' + key);
  return { id: oid++, name: '', ...(cls && { class: cls }), gid: gidOf(key) + (flip ? FLIP : 0), x: Math.round(x), y: Math.round(y), width: t.width, height: t.height, rotation: 0, visible: true, properties: props };
};
const point = (cls, [x, y], props = [], name = cls) => ({ id: oid++, name, class: cls, x, y, width: 0, height: 0, point: true, rotation: 0, visible: true, properties: props });
const rect = (cls, x, y, w, h, props = [], name = cls) => ({ id: oid++, name, class: cls, x, y, width: w, height: h, rotation: 0, visible: true, properties: props });
const gapOf = key => { if (key === 'pig-idle') return 58;      // Tiled-only art: 192 px frames, the feet 58 rows above the bottom
  const b = SEAL.artBoxOf(key, {}); return b.fh - (b.y + b.h) };      // transparent rows under the art: tile objects are placed by the frame's bottom
const at = (cx, cy) => [cx * T, cy * T];                                                // a point given in (fractional) tiles
const feet = (key, cx, cy, cls, props, flip) => tileObj(key, [cx * T, cy * T + gapOf(key)], cls, props, flip);   // the art's feet at (cx, cy) tiles
const rnd = CL.rng(41), pick = a => a[Math.floor(rnd() * a.length)], jit = a => (rnd() - 0.5) * a;
const objects = [], used = new Set();                                                      // used: cells nothing random may grow on (buildings, yards, lanes)
const reserve = (c0, r0, c1, r1) => { for (let y = Math.floor(r0); y <= Math.floor(r1); y++) for (let x = Math.floor(c0); x <= Math.floor(c1); x++) used.add(idx(x, y)) };
const add = (...o) => objects.push(...o);

// buildings: bottom-centre at (cx, cy) tiles; the cells under and around the art are reserved (nothing random grows there)
const building = (key, cx, cy, wTiles, hTiles, cls) => { add(tileObj(key, at(cx, cy), cls)); reserve(cx - wTiles / 2 - 0.5, cy - hTiles, cx + wTiles / 2 + 0.5, cy + 0.2) };
building('castle', 24.5, 10.4, 5, 4);
building('barracks', 12, 16.2, 3, 4);
building('monastery', 36, 16.4, 3, 5);
building('house2', 25, 20.6, 2, 3);                                                          // the Market
// the houses you can enter: a door rect over the doorway in the art (house1.png: door x 51-77, y 126-162 in the 128x192 frame), past the base shadow where the walking-up feet stop
const house = (cx, cy, interior, role, npcAt) => {
  const [x, y] = at(cx, cy);
  building('house1', cx, cy, 2, 3);
  add(rect('door', x - 64 + 48, y - 192 + 126, 32, 52, [P('interior', interior), P('npc', role), P('npcAt', npcAt)], 'door'));
};
house(17.5, 27.4, 'maps/interiors/house_a.tmj', 'folk1', '370,300');
house(31.5, 27.8, 'maps/interiors/house_b.tmj', 'folk2', '420,330');

// fences: one `fence` rect per 64 px cell, `p` = the piece of the sheet (data.js YARD): tl tr bl br corners, h0 h1 (a run), v (a side), el / er (the end next to an opening)
const fence = (c, r, p) => add(rect('fence', c * T, r * T, T, T, [P('p', p)]));
// a yard: the rectangle of cells c0..c1 x r0..r1; an edge may be left out (`no`: 'N' 'S' 'W' 'E'), the south edge may have an opening `gap` = [first, last] column
function yard(c0, r0, c1, r1, { no = '', gap } = {}) {
  const edge = (r, top) => {
    for (let c = c0; c <= c1; c++) {
      if (gap && !top && c >= gap[0] && c <= gap[1]) continue;
      const side = c === c0 ? 'W' : c === c1 ? 'E' : '';
      let p = (c + r) % 2 ? 'h1' : 'h0';
      if (side && !no.includes(side)) p = (top ? 't' : 'b') + (side === 'W' ? 'l' : 'r');
      else if (gap && !top && c === gap[0] - 1) p = 'er'; else if (gap && !top && c === gap[1] + 1) p = 'el';
      fence(c, r, p);
    }
  };
  if (!no.includes('N')) edge(r0, true);
  if (!no.includes('S')) edge(r1, false);
  for (let r = no.includes('N') ? r0 : r0 + 1; r < r1; r++) { if (!no.includes('W')) fence(c0, r, 'v'); if (!no.includes('E')) fence(c1, r, 'v') }
  reserve(c0 - 0.5, r0 - 0.5, c1 + 0.5, r1 + 0.5);
}

// ---- who stands where
const npc = (role, cx, cy, flip) => add(feet(NPCS[role].key, cx, cy, 'npc', [P('role', role)], flip));
const none = undefined;

// the Steward at the Castle door: a courtyard of bushes, a sign, pumpkins
npc('steward', 24.5, 12.4);
add(feet('odeco17', 22.1, 12.6), feet('bush3', 20.7, 12.4), feet('bush2', 28.3, 12.5), feet('bush1', 29.6, 13), feet('odeco14', 22.9, 13.7), feet('odeco15', 26.7, 13.5), feet('odeco06', 27.3, 14.2));
reserve(20, 11, 30, 14);

// the Blacksmith: the Barracks' yard to its south, fenced on three sides, ore piles of gold stones and rocks, a bone, a sign at the opening
yard(9, 17, 16, 21, { no: 'N', gap: [12, 13] });
npc('blacksmith', 12.9, 18.9);
add(feet('gold-stone4', 10, 18.6), feet('gold-stone2', 10.8, 19.5), feet('gold-stone6', 9.9, 20.4), feet('rock2', 15.1, 18.8), feet('rock4', 15.4, 20.1), feet('rock1', 14.5, 19.6), feet('odeco08', 10.6, 21.3), feet('odeco13', 15.3, 21.2),
  feet('odeco17', 11.1, 22.7, none, none, true), feet('odeco05', 14.2, 21.1));

// the Healer: a herb garden by the Monastery, soft fences, bushes, pumpkins, mushrooms and two sheep
npc('healer', 36.1, 18.7);
add(feet('bush4', 32.8, 19.2), feet('bush2', 33.5, 20.9), feet('bush3', 39, 19), feet('bush1', 39.7, 20.8), feet('odeco14', 34.2, 20), feet('odeco15', 38, 20.1), feet('odeco13', 37.6, 21.7), feet('odeco02', 34.7, 22),
  feet('odeco03', 37.3, 19.6), feet('odeco01', 38.8, 22.1), feet('odeco10', 33.2, 22.2), feet('sheep-idle', 31.6, 22.4), feet('sheep-idle', 40.4, 23));
for (let c = 31; c <= 33; c++) fence(c, 24, c % 2 ? 'h1' : 'h0');
for (let c = 39; c <= 41; c++) fence(c, 24, c % 2 ? 'h0' : 'h1');
reserve(31, 17, 41, 24);

// the Market: the Merchant in front of the House, produce in rows, a pig pen with a pig
npc('market', 25.2, 22.7, true);
add(feet('odeco15', 22.7, 22.9), feet('odeco14', 23.4, 23.6), feet('odeco15', 27.7, 23.1), feet('odeco12', 28.4, 22.4), feet('bush4', 21.7, 21.4), feet('odeco17', 26.9, 24.5));
yard(29, 20, 33, 23, { no: 'W' });
add(feet('pig-idle', 31.1, 22.1, none, none, true), feet('odeco09', 32.4, 21.1), feet('odeco06', 30, 23.4));
reserve(21, 21, 28, 25);

// the Trainer's yard south-west: a scarecrow to hit, signs, bones, fenced all round with an opening to the south
yard(7, 24, 14, 29, { gap: [10, 11] });
npc('trainer', 12.4, 26.6, true);
add(feet('odeco18', 9.6, 27.2), feet('odeco16', 8.3, 25.6), feet('odeco16', 12.9, 30.9, none, none, true), feet('odeco18', 10.6, 25.5), feet('odeco07', 8.2, 28.4), feet('odeco04', 13.4, 25.1), feet('odeco05', 11.2, 28.5));

// the main gate: two Towers (the Wooden Fence between them leaves a gap in the middle), a plank pier into the sea, the boat tied at its end, the `sail` rect on the planks
building('tower', 21, 33, 2, 4); building('tower', 28, 33, 2, 4);
for (const [c, p] of [[22, 'h0'], [23, 'er'], [25, 'el'], [26, 'h1']]) fence(c, 32, p);
add(feet('odeco17', 23.1, 35.3), feet('odeco16', 26, 35.5, none, none, true));
const dock = y => tileObj('dock', [24.5 * T, y], 'stepstone');
add(dock(35.55 * T + 158), dock(35.55 * T + 316), tileObj('boat', [26.4 * T, 39.7 * T], 'boat'));
add(rect('sail', 24 * T, 38.3 * T, T + 32, 2.2 * T));
reserve(19, 30, 30, 41);

// the beach where you wash up (west shore), and rocks off the coast
add(tileObj('water-rocks4', [2.6 * T, 20.5 * T], 'stepstone'), tileObj('water-rocks2', [3.8 * T, 23.8 * T]), tileObj('water-rocks3', [2.2 * T, 25.6 * T]));
reserve(4, 20, 7, 24);

// lanes: the walking routes stay free of trees (gate -> plaza -> castle, and out to each yard)
const lane = (x0, y0, x1, y1, w = 1.4) => { const n = 40; for (let i = 0; i <= n; i++) reserve(x0 + (x1 - x0) * i / n - w, y0 + (y1 - y0) * i / n - w, x0 + (x1 - x0) * i / n + w, y0 + (y1 - y0) * i / n + w) };
lane(24.5, 36, 24.5, 18); lane(24.5, 18, 24.5, 13); lane(24.5, 18, 12, 19.5); lane(24.5, 19, 36, 20); lane(24.5, 26, 12, 30); lane(24.5, 27, 18, 29); lane(24.5, 27, 31, 29); lane(11, 22.5, 6, 22.5);
reserve(17, 15, 32, 25);                                                                     // the plaza

// trees: the rim of the island and clumps in the corners, thinner inside; bushes, rocks and mushrooms in the open ground, sheep in the meadows
const dense = (x, y) => CL.vnoise(x / 4.5 + 3, y / 4.5 + 3, 21) > 0.55;
const treeAt = (cx, cy) => add(feet(pick(['tree1', 'tree2', 'tree3', 'tree4']), cx + jit(0.5), cy + jit(0.4)));
for (let y = 3; y < H - 2; y++) for (let x = 3; x < W - 3; x++) {
  const i = idx(x, y);
  if (!ground[i] || used.has(i)) continue;
  const edge = !(has(ground, x - 2, y) && has(ground, x + 2, y) && has(ground, x, y - 2) && has(ground, x, y + 2));   // within 2 cells of the water
  const p = edge ? (dense(x, y) ? 0.6 : 0.32) : dense(x, y) ? 0.3 : 0.04;
  if (rnd() < p) { treeAt(x + 0.5, y + 0.85); used.add(i) }
}
for (let n = 0, g = 0; n < 600 && g < 30; n++) {
  const x = 4 + Math.floor(rnd() * (W - 8)), y = 5 + Math.floor(rnd() * 28), i = idx(x, y);
  if (!ground[i] || used.has(i) || !has(ground, x - 1, y) || !has(ground, x + 1, y) || !has(ground, x, y + 1) || !has(ground, x, y - 1)) continue;
  add(feet(pick(['bush1', 'bush2', 'bush3', 'bush4', 'odeco02', 'odeco03', 'odeco10', 'odeco11', 'rock1', 'rock3']), x + 0.5 + jit(0.4), y + 0.8 + jit(0.3))); used.add(i); g++;
}
add(feet('sheep-idle', 19.3, 17.6), feet('sheep-idle', 20.4, 18.4), feet('sheep-idle', 29.4, 16.8), feet('sheep-idle', 27.9, 17.9), feet('sheep-idle', 20, 24.3));

// spawn points for ?at=<name>: the first is where a new game starts
const spawn = (name, cx, cy) => add(point('spawn', at(cx, cy), [], name));
spawn('start', 24.5, 25.6); spawn('gate', 24.5, 30.6); spawn('blacksmith', 12.9, 21.7); spawn('healer', 36, 21.7); spawn('market', 25.2, 24.8); spawn('steward', 24.5, 15); spawn('trainer', 12.4, 31.3); spawn('beach', 6.2, 22.2);
spawn('houseA', 17.5, 30.4); spawn('houseB', 31.5, 31);

const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', class: 'chunk', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, compressionlevel: -1, width: W, height: H, tilewidth: T, tileheight: T, nextlayerid: 9, backgroundcolor: C.BG, nextobjectid: oid,
  properties: [P('kind', 'landmark', 'string', 'chunkKind'), P('biomes', 'town'), P('minIsland', 1, 'int'), P('weight', 1, 'float'), P('mirror', false, 'bool')],
  tilesets: C.tilesets(),
  layers: [
    layer(1, 'Water', () => 0),
    layer(2, 'Foam (preview)', (x, y) => (foam.has(idx(x, y)) ? F.foam : 0)),
    layer(3, 'Ground', (x, y) => (ground[idx(x, y)] ? F.low + autotile(ground, x, y, 0) : 0)),
    layer(4, 'Shadows (preview)', () => 0), layer(5, 'Raised', () => 0), layer(6, 'Cliffs (preview)', () => 0), layer(7, 'Stairs', () => 0),
    { id: 8, name: 'Objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
  ],
};
fs.writeFileSync(path.join(R, 'maps/town.tmj'), JSON.stringify(map, null, 1) + '\n');
console.log('maps/town.tmj written,', objects.length, 'objects');
