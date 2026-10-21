// Writes maps/town.tmj, the town hub (48x44 tiles): a walled hill town. Run: node tiled/make-town-map.js (after make-rules.js and make-objects.js).
//
//        sea . . . . . . . . . . . . . . . . . . . . . . . . . . sea          rows
//   trees   T=======[ CASTLE on a plateau ]=======T   trees            4-10   the keep: a raised plateau, a ramp up each side, the Steward at the door
//           |  ramp  cliff cliff cliff cliff  ramp |                   11     the cliff under it
//   T-------+      forecourt (dirt)               +-------T           12-13   the wall turns the corner here (towers T, Wooden Fence ----)
//   |  house  |  house   ||   house   house  |                       14-17   houses tight on the main street (||), their fronts on side lanes
//   | BARRACKS=lane==[  MARKET SQUARE  ]==lane=MONASTERY |            18-22   the square: the Market, a signpost, produce; the Blacksmith's and Healer's yards
//   | smith yard      ||  (signpost)  ||     herb garden |
//   |  TRAINER yard   ||               ||                 +---T      23-26   the Trainer's yard; the wall jogs in on the east
//   |  house  house   ||    house   house   house         |          27-29   a cross lane of houses
//   T-------------T--GATE--T-----------------------------T          31     the gate: two Towers, a 2-tile gap in the fence
//      field (scarecrow)   road    sheep meadow, pig pen             32-35   outside the wall: fields, the washup beach far west (stairs down to it)
//                       stairs > sand > pier > boat                  36-43   the `sail` rect on the pier starts a run
//
// Same terrain rules as make-test-map.js (no 1-tile notches, no diagonal-only touches). Streets are the `dirt` mask: sand tiles drawn on the land (src/terrain.js).
// The wall is `fence` rects (the yards' sheet, src/scenes/Town.js) with Towers at the corners; the gate is the only way in (test/town-check.js floods it).
const fs = require('fs'), path = require('path');
const C = require('./common.js'), SEAL = require('./seal.js'), terrainLayers = require('./layers.js');
const { NPCS } = require('../src/data.js');
const R = path.join(__dirname, '..');
const W = 48, H = 44, T = 64, CL = require('./clearing.js')(W, H);
const objTs = JSON.parse(fs.readFileSync(path.join(R, 'maps/objects.tsj'), 'utf8'));
const keyOf = t => (t.properties || []).find(p => p.name === 'key')?.value || t.image.split('/').pop().replace(/\.png$/i, '');
const findTile = key => objTs.tiles.find(t => keyOf(t) === key);
const gidOf = key => C.FIRST.objects + findTile(key).id;
const idx = (x, y) => y * W + x;
const fill = (m, c0, r0, c1, r1, v = 1) => { for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) m[idx(x, y)] = v };

// ---- the island: a wobbly ellipse, plus the ground the town needs for sure (the walled rectangle, the hill, the fields, the gate spit), cleaned by the terrain rule
const ground = new Uint8Array(W * H);
for (const [cx, cy, rx, ry, seed] of [[24.5, 19, 21, 16, 3], [11.5, 31, 6, 3.5, 19], [38, 30, 6, 4, 13]]) for (const i of CL.ellipse(cx, cy, rx, ry, seed, { amp: 0.12 })) ground[i] = 1;
fill(ground, 7, 12, 41, 33); fill(ground, 14, 3, 35, 12); fill(ground, 20, 29, 29, 35); fill(ground, 11, 32, 37, 34);
CL.clean(ground);
fill(ground, 5, 31, 6, 32, 0);                                                                // a bite at the south-west corner: the beach stairs get a clean corner
fill(ground, 0, 0, W - 1, 1, 0); fill(ground, 0, 0, 1, H - 1, 0); fill(ground, W - 2, 0, W - 1, H - 1, 0);   // the sea keeps a margin
CL.clean(ground);
const has = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[idx(x, y)] === 1;
const raised = new Uint8Array(W * H), water = new Uint8Array(W * H), sand = new Uint8Array(W * H), dirt = new Uint8Array(W * H);
fill(raised, 19, 4, 30, 10);                                                                   // the keep's hill
// stairs { cell: tile }: a left stair is 36 over 45 (the upper level to its east), a right one 39 over 48 (upper level to its west).
// Up the hill on both sides of the keep; down to the sand at the spit's south-west corner (the pier) and at the south-west lobe (the washup beach, sand painted west of it).
const stairs = { [idx(18, 9)]: 36, [idx(18, 10)]: 45, [idx(31, 9)]: 39, [idx(31, 10)]: 48, [idx(19, 35)]: 36, [idx(19, 36)]: 45, [idx(6, 33)]: 36, [idx(6, 34)]: 45 };
for (const i of Object.keys(stairs)) raised[i] = 0;                                           // a hill stair is a land cell beside the plateau
for (const i of [idx(19, 35), idx(19, 36), idx(6, 33), idx(6, 34)]) ground[i] = 0;             // a beach stair is a sand cell beside the land
fill(sand, 1, 31, 5, 36);
// streets: the main street (3 wide) from the gate up to the forecourt, the square, the lanes to each yard, alleys down to a cross lane of houses, the road out to the pier
const street = (c0, r0, c1, r1) => fill(dirt, c0, r0, c1, r1);
street(23, 12, 25, 33); street(17, 12, 32, 13); street(17, 10, 17, 13); street(32, 10, 32, 13);   // main street and the forecourt, with the way up to each ramp's foot
street(19, 18, 30, 21);                                                                        // the square
street(12, 19, 18, 20); street(31, 19, 37, 20);                                                // lanes west to the Blacksmith, east to the Healer
street(16, 21, 17, 27); street(32, 21, 33, 27); street(12, 28, 36, 29);                        // alleys down to the cross lane of houses
street(21, 33, 22, 34); street(20, 34, 21, 35);                                                // the road steps west to the stairs down to the pier
CL.clean(dirt);
for (let i = 0; i < W * H; i++) if (dirt[i] && !ground[i]) throw new Error('a street off the land at ' + i % W + ',' + Math.floor(i / W));
const { layers: terrain } = terrainLayers({ w: W, h: H, ground, raised, water, sand, stairs, dirt });

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
const objects = [], used = new Set();                                                      // used: cells nothing random may grow on (buildings, yards, streets)
const reserve = (c0, r0, c1, r1) => { for (let y = Math.floor(r0); y <= Math.floor(r1); y++) for (let x = Math.floor(c0); x <= Math.floor(c1); x++) used.add(idx(x, y)) };
const add = (...o) => objects.push(...o);
for (let i = 0; i < W * H; i++) if (dirt[i] || raised[i]) used.add(i);

// buildings: bottom-centre at (cx, cy) tiles; the cells under and around the art are reserved. Every building must stand on the land (a throw here is a layout slip).
const building = (key, cx, cy, wTiles, hTiles, cls, flip) => {
  if (!has(ground, Math.floor(cx), Math.floor(cy - 0.3))) throw new Error(`${key} is off the land at ${cx},${cy}`);
  add(tileObj(key, at(cx, cy), cls, [], flip)); reserve(cx - wTiles / 2 - 0.5, cy - hTiles, cx + wTiles / 2 + 0.5, cy + 0.2);
};
// the houses you can enter: a door rect over the doorway in the art (house1.png: door x 51-77, y 126-162 in the 128x192 frame), past the base shadow where the walking-up feet stop
const house = (cx, cy, interior, role, npcAt) => {
  const [x, y] = at(cx, cy);
  building('house1', cx, cy, 2, 3);
  add(rect('door', x - 64 + 48, y - 192 + 126, 32, 52, [P('interior', interior), P('npc', role), P('npcAt', npcAt)], 'door'));
};
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

// ---- the town wall: a rectilinear ring of fence cells through these corners (clockwise from the north-west), open at the gate; Towers stand on the marked corners
// and beside the gate. It runs up to the sea on both sides of the keep, so the hill's own cliffs close the north.
const corners = [[16, 4, 'T'], [16, 13], [10, 13, 'T'], [10, 30, 'T'], [37, 30, 'T'], [37, 24], [39, 24, 'T'], [39, 13, 'T'], [33, 13], [33, 4, 'T']];
const wall = new Set(), GATE = [23, 24, 25], towers = [[21, 30], [27, 30]];
for (let k = 0; k + 1 < corners.length; k++) {
  const [c0, r0] = corners[k], [c1, r1] = corners[k + 1];
  for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) wall.add(idx(c, r));
}
for (const [c, r, t] of corners) if (t) towers.push([c, r]);
for (const c of GATE) wall.delete(idx(c, 30));
for (const i of wall) if (!ground[i] || raised[i]) throw new Error(`the wall is off the land at ${i % W},${Math.floor(i / W)}`);
const onTower = new Set(towers.map(([c, r]) => idx(c, r)));
for (const i of wall) {
  if (onTower.has(i)) continue;
  const c = i % W, r = Math.floor(i / W), n = wall.has(idx(c, r - 1)), s = wall.has(idx(c, r + 1)), w = wall.has(idx(c - 1, r)), e = wall.has(idx(c + 1, r));
  const p = s && e ? 'tl' : s && w ? 'tr' : n && e ? 'bl' : n && w ? 'br' : w && e ? ((c + r) % 2 ? 'h1' : 'h0') : w ? 'er' : e ? 'el' : 'v';
  fence(c, r, p);
}
for (const [c, r] of towers) building('tower', c + 0.5, r + 1.08, 2, 4);                 // a tower's feet a touch below its cell, so it draws over the fence that runs into it
const inside = (c, r) => (c > 10 && c < 39 && r > 13 && r < 24) || (c > 10 && c < 37 && r >= 24 && r < 30) || (c > 16 && c < 33 && r > 3 && r <= 13);

// ---- buildings: the keep on the plateau; the Barracks and the Monastery at the ends of the lanes off the square; houses with their backs to the forecourt and their
// fronts on the square, and a row of them on the cross lane (two can be entered)
building('castle', 24.5, 9.7, 5, 4);
building('barracks', 14, 18.3, 3, 4);
building('monastery', 35.5, 18.5, 3, 5);
building('house2', 27.5, 17.3, 2, 3);                                                          // the Market, on the square's north-east corner
building('house2', 30.5, 17.3, 2, 3, undefined, true); building('house2', 21.5, 17.3, 2, 3, undefined, true); building('house2', 18.5, 17.3, 2, 3);
house(18.5, 27.3, 'maps/interiors/house_a.tmj', 'folk1', '370,300');
house(27.5, 27.3, 'maps/interiors/house_b.tmj', 'folk2', '420,330');
building('house2', 21.5, 27.3, 2, 3, undefined, true); building('house2', 30.5, 27.3, 2, 3); building('house2', 33.5, 27.3, 2, 3, undefined, true);

// ---- who stands where
const npc = (role, cx, cy, flip) => add(feet(NPCS[role].key, cx, cy, 'npc', [P('role', role)], flip));
const none = undefined;
// the Steward at the keep's door, bushes along the castle wall
npc('steward', 22.7, 10.4);
add(feet('bush3', 21, 10.3), feet('bush1', 28.2, 10.4), feet('odeco17', 20.2, 7.8), feet('odeco03', 29.6, 8.4));
// the Blacksmith: the yard south of the lane, under the Barracks, ore piles, a bone, a sign at the opening
yard(11, 21, 15, 24, { no: 'NW' });                                                           // the town wall is its west side
npc('blacksmith', 13.6, 22.6);
add(feet('gold-stone4', 11.8, 22.4), feet('gold-stone2', 12.2, 23.6), feet('rock2', 14.6, 23.8), feet('rock1', 11.6, 21.7), feet('odeco08', 13.2, 24), feet('odeco17', 16.3, 18.4, none, none, true));
// the Healer: a herb garden south of the lane, under the Monastery, soft fences, bushes, pumpkins, mushrooms
yard(33, 21, 38, 23, { no: 'NE' });                                                           // the town wall is its east side
npc('healer', 35.6, 22.6);
add(feet('bush4', 37.3, 22.2), feet('bush2', 33.9, 23.8), feet('odeco12', 36.8, 23.9), feet('odeco13', 34.2, 22.1), feet('odeco02', 37.6, 21.6), feet('odeco01', 35.9, 22.9), feet('odeco17', 32.2, 18.4));
// the square: the Merchant in front of the Market with his produce, a signpost in the middle, bushes at the corners
npc('market', 27.5, 19.1, true);
add(feet('odeco13', 25.9, 18.8), feet('odeco12', 26.4, 19.9), feet('odeco15', 29.2, 19.1), feet('odeco14', 29.8, 20.2), feet('odeco17', 24.5, 19.8), feet('odeco10', 20.2, 20.6), feet('odeco04', 29.6, 21.3));
// the Trainer's yard, south-west, open to the cross lane: a scarecrow to hit, a sign, bones
yard(11, 25, 15, 27, { no: 'NSW' });                                                          // under the Blacksmith's fence, against the wall, open to the lane
npc('trainer', 13.6, 26.6, true);
add(feet('odeco18', 11.6, 26.6), feet('odeco16', 15.4, 25.6), feet('odeco07', 12.8, 27.1));
// the cross lane of houses: a mushroom or two, a bush between the houses
add(feet('bush3', 24.5, 25.1), feet('odeco03', 20, 27.3), feet('odeco02', 29, 27.3), feet('odeco11', 35.6, 27.4), feet('bush2', 24.4, 15.4));
// the gate: a signpost outside, then the road; the pier: planks starting on the sand in front of the spit's cliff (row 37), the boat tied at its end, the `sail` rect on the planks
add(feet('odeco17', 22.1, 32.2), feet('odeco16', 26.9, 32.4, none, none, true));
const dock = y => tileObj('dock', [24.5 * T, y], 'stepstone');
add(dock(37.55 * T + 158), dock(37.55 * T + 316), tileObj('boat', [26.4 * T, 41.7 * T], 'boat'));
add(rect('sail', 24 * T, 40.3 * T, T + 32, 2.2 * T));
reserve(19, 31, 30, 36);
// the fields outside the wall: a scarecrow over pumpkin rows to the west, a sheep meadow to the east, a pig pen outside the wall's jog
add(feet('odeco18', 14.5, 33.2), feet('odeco12', 12.6, 32.1), feet('odeco13', 13.8, 32.3), feet('odeco12', 16.1, 32.2), feet('odeco13', 17.4, 32.4), feet('odeco12', 13.2, 33.6), feet('odeco13', 16.8, 33.7), feet('odeco11', 18.6, 32.9));
reserve(11, 31, 19, 34);
add(feet('sheep-idle', 31.6, 32.2), feet('sheep-idle', 33.4, 33.1), feet('sheep-idle', 30.2, 33.4), feet('sheep-idle', 35.4, 32.6), feet('sheep-idle', 29.4, 31.8));
yard(38, 26, 41, 28, { no: 'N' });
add(feet('pig-idle', 39.4, 27.9, none, none, true), feet('odeco09', 40.6, 26.8));
reserve(29, 31, 37, 34);
// the beach where you wash up (south-west, sand painted below), and rocks off the coast
add(tileObj('water-rocks4', [1.3 * T, 38.1 * T], 'stepstone'), tileObj('water-rocks2', [3.6 * T, 38.8 * T]), tileObj('water-rocks3', [0.6 * T, 30.2 * T]));
reserve(6, 30, 10, 34);

// trees: outside the wall only, thick along the coast and in the corners, none within a cell of the wall (it stays in view) or on the fields
const dense = (x, y) => CL.vnoise(x / 4.5 + 3, y / 4.5 + 3, 21) > 0.5;
const nearWall = (x, y) => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => wall.has(idx(x + dx, y + dy)) || onTower.has(idx(x + dx, y + dy))));
const treeAt = (cx, cy) => add(feet(pick(['tree1', 'tree2', 'tree3', 'tree4']), cx + jit(0.5), cy + jit(0.4)));
for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
  const i = idx(x, y);
  if (!ground[i] || raised[i] || used.has(i) || inside(x, y) || nearWall(x, y)) continue;
  const edge = !(has(ground, x - 2, y) && has(ground, x + 2, y) && has(ground, x, y - 2) && has(ground, x, y + 2));   // within 2 cells of the water
  if (rnd() < (edge ? (dense(x, y) ? 0.7 : 0.4) : dense(x, y) ? 0.45 : 0.12)) { treeAt(x + 0.5, y + 0.85); used.add(i) }
}
// bushes, rocks and mushrooms on the open grass, inside and out
for (let n = 0, g = 0; n < 3000 && g < 60; n++) {
  const x = 3 + Math.floor(rnd() * (W - 6)), y = 3 + Math.floor(rnd() * (H - 10)), i = idx(x, y);
  if (!ground[i] || raised[i] || used.has(i) || nearWall(x, y) || !has(ground, x - 1, y) || !has(ground, x + 1, y) || !has(ground, x, y + 1) || !has(ground, x, y - 1)) continue;
  add(feet(pick(['bush1', 'bush2', 'bush3', 'bush4', 'odeco02', 'odeco03', 'odeco10', 'odeco11', 'rock1', 'rock3', 'odeco04']), x + 0.5 + jit(0.4), y + 0.8 + jit(0.3))); used.add(i); g++;
}

// spawn points for ?at=<name>: the first is where a new game starts
const spawn = (name, cx, cy) => add(point('spawn', at(cx, cy), [], name));
spawn('start', 24, 23.6); spawn('gate', 24, 31.6); spawn('blacksmith', 13.5, 21.6); spawn('healer', 35.5, 21.6); spawn('market', 27.5, 20.6); spawn('steward', 21.5, 9.6); spawn('trainer', 13.5, 28.6);
spawn('beach', 3.5, 33.5); spawn('houseA', 18.5, 28.6); spawn('houseB', 27.5, 28.6);

const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', class: 'chunk', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, compressionlevel: -1, width: W, height: H, tilewidth: T, tileheight: T, nextlayerid: C.LAYERS.length + 1, backgroundcolor: C.BG, nextobjectid: oid,
  properties: [P('kind', 'landmark', 'string', 'chunkKind'), P('biomes', 'town'), P('minIsland', 1, 'int'), P('weight', 1, 'float'), P('mirror', false, 'bool')],
  tilesets: C.tilesets(),
  layers: [...terrain, { id: terrain.length + 1, name: 'Objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects }],
};
fs.writeFileSync(path.join(R, 'maps/town.tmj'), JSON.stringify(map, null, 1) + '\n');
console.log('maps/town.tmj written,', objects.length, 'objects,', wall.size, 'wall cells,', towers.length, 'towers');
