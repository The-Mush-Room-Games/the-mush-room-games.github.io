// Writes maps/town.tmj, the town hub (48x44 tiles): a walled hill town. Run: node tiled/make-town-map.js (after make-rules.js and make-objects.js).
// Laid out like a small medieval market town (Rothenburg, the bastides): one main street from the gate that bends up to the market square, the church and
// the big houses on the square, houses with shared walls fronting every street, yards behind, the smith by the wall, the keep on the high ground at the far
// end, fields and the harbour outside the wall. Like a game hub (Hades 2's Crossroads), every vendor is a nook a few steps off the centre with its own clutter.
//
//          sea . . . . . . . . . . . . . . . . . . . . . sea                 rows
//     trees  T====[ the KEEP on its plateau ]====T  trees                   4-10   a ramp up each side, the Steward at the door
//            | ramp   cliff cliff cliff   ramp |                            11     the cliff under it
//     T------+     forecourt (dirt)            +----T                      11-13   the wall turns in here (Towers T, fence ----)
//     |          house house | hill |  MARKET house |                      14-17   their fronts on the square
//   T-+ BARRACKS==lane==[ SQUARE  ]==lane==MONASTERY |                    18-20   the market square: a signpost, produce, a sheep
//   | smith yard   training   \\ street   herb garden +--T                 21-24   yards and nooks; the main street bends
//   |  house house house       ||  house house       |                   22-25   houses with shared walls on the cross lane
//   T--------------T---GATE---T----------------------T                      28     the gate: two Towers, a 2-tile gap
//        field (scarecrow)      road     sheep, pig pen                     29-33   outside the wall; the washup beach far west, stairs down to it
//                            stairs > sand > pier > boat                     35-43   the `sail` rect on the pier starts a run
//
// Same terrain rules as make-test-map.js (no 1-tile notches, no diagonal-only touches). Streets are the `dirt` mask: sand tiles drawn on the land (src/terrain.js).
// Fences: every run ends in a corner or an end post (the sheet has no loose vertical end), so a yard is a full ring with gaps in its north or south side; the town
// wall is a ring of fence cells with Towers on its corners and beside the gate, the only way in (test/town-check.js floods it).
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

// ---- the wall first: the land is shaped round it. A rectilinear ring through these corners (clockwise from the north-west sea end), 'T' = a Tower stands there.
// It runs up to the sea on both sides of the keep, so the hill's own cliffs close the north. The gate is a gap in the south run between two more Towers.
const corners = [[16, 3, 'T'], [16, 11], [12, 11, 'T'], [12, 18], [10, 18, 'T'], [10, 28, 'T'], [36, 28, 'T'], [36, 25], [39, 25, 'T'], [39, 17], [37, 17], [37, 11, 'T'], [33, 11], [33, 3, 'T']];
const GATE_ROW = 28, GATE = [23, 24], towers = [[21, GATE_ROW], [26, GATE_ROW]], wall = new Set();
for (let k = 0; k + 1 < corners.length; k++) {
  const [c0, r0] = corners[k], [c1, r1] = corners[k + 1];
  for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) wall.add(idx(c, r));
}
for (const [c, r, t] of corners) if (t) towers.push([c, r]);
for (const c of GATE) wall.delete(idx(c, GATE_ROW));
const onTower = new Set(towers.map(([c, r]) => idx(c, r)));

// ---- the island: a wobbly ellipse, the hill block, the gate spit, a lobe for the washup beach, and a cell of land on either side of every wall cell
const ground = new Uint8Array(W * H);
for (const [cx, cy, rx, ry, seed, amp] of [[24.5, 18.5, 20.5, 15.5, 3, 0.14], [11.5, 31, 6, 3.5, 19, 0.12], [40, 28, 6, 4.5, 13, 0.15]]) for (const i of CL.ellipse(cx, cy, rx, ry, seed, { amp })) ground[i] = 1;
fill(ground, 15, 3, 34, 12); fill(ground, 20, 27, 29, 35);
for (const i of wall) { const c = i % W, r = Math.floor(i / W); fill(ground, Math.max(0, c - 1), Math.max(0, r - 1), Math.min(W - 1, c + 1), Math.min(H - 1, r + 1)) }
CL.clean(ground);
fill(ground, 5, 31, 6, 32, 0);                                                                // a bite at the south-west corner: the beach stairs get a clean corner
fill(ground, 0, 0, W - 1, 2, 0); fill(ground, 0, 0, 1, H - 1, 0); fill(ground, W - 2, 0, W - 1, H - 1, 0);   // the sea keeps a margin
CL.clean(ground);
const has = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[idx(x, y)] === 1;
const raised = new Uint8Array(W * H), water = new Uint8Array(W * H), sand = new Uint8Array(W * H), dirt = new Uint8Array(W * H);
fill(raised, 19, 4, 30, 10);                                                                   // the keep's hill
// stairs { cell: tile }: a left stair is 36 over 45 (the upper level to its east), a right one 39 over 48 (upper level to its west).
// Up the hill on both sides of the keep (land cells beside the plateau); down to the sand at the spit's south-west corner (the pier) and at the south-west lobe
// (the washup beach: sand painted west of it); those are sand cells beside the land.
const stairs = { [idx(18, 9)]: 36, [idx(18, 10)]: 45, [idx(31, 9)]: 39, [idx(31, 10)]: 48, [idx(19, 35)]: 36, [idx(19, 36)]: 45, [idx(6, 33)]: 36, [idx(6, 34)]: 45 };
for (const i of Object.keys(stairs)) raised[i] = 0;
for (const i of [idx(19, 35), idx(19, 36), idx(6, 33), idx(6, 34)]) ground[i] = 0;
fill(sand, 1, 31, 5, 36);
for (const i of wall) if (!ground[i] || raised[i]) throw new Error(`the wall is off the land at ${i % W},${Math.floor(i / W)}`);
// streets (2 wide, they bend): the gate street up to the square, the square (a wobbly oval), the hill street up to the forecourt and each ramp's foot, lanes
// west to the Barracks and east to the Monastery, a cross lane of houses, the road out to the pier
const street = (c0, r0, c1, r1) => fill(dirt, c0, r0, c1, r1);
street(23, 24, 24, 33); street(22, 21, 23, 24);                                                // the gate street, with a bend
for (const i of CL.ellipse(24.5, 19.3, 5.2, 2.4, 29, { amp: 0.25 })) dirt[i] = 1;             // the square
street(25, 14, 26, 18); street(18, 12, 31, 13); street(17, 10, 17, 12); street(32, 10, 32, 12);   // the hill street, the forecourt, the way to each ramp
street(14, 18, 20, 19); street(29, 19, 35, 20);                                                // the lanes
street(12, 26, 35, 27); street(33, 21, 34, 26);                                                // the cross lane, an alley up to the east lane
street(21, 33, 22, 34); street(20, 34, 21, 35);                                                // the road steps west to the stairs down to the pier
CL.clean(dirt);
for (let i = 0; i < W * H; i++) if (dirt[i] && (!ground[i] || raised[i] || wall.has(i) || onTower.has(i))) throw new Error('a street off the land, or through the wall, at ' + i % W + ',' + Math.floor(i / W));
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
for (let i = 0; i < W * H; i++) if (dirt[i] || raised[i] || wall.has(i)) used.add(i);

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
// fences: one `fence` rect per 64 px cell, `p` = the piece of the sheet (data.js YARD): tl tr bl br corners, h0 h1 (a run), v (a side), el / er (an end post, rail to its left / right).
// The sheet has no loose vertical end, so every vertical run ends in a corner: a yard is a full ring c0..c1 x r0..r1, with gaps only in its north (gapN) or south
// (gapS) side, [first, last] column, never next to a corner; a side that is the town wall (wallW / wallE) is left out, its runs meet the wall's rail.
const fence = (c, r, p) => add(rect('fence', c * T, r * T, T, T, [P('p', p)]));
function yard(c0, r0, c1, r1, { wallW, wallE, gapN, gapS } = {}) {
  const edge = (r, top, gap) => {
    if (gap && (gap[0] <= c0 + (wallW ? 0 : 1) || gap[1] >= c1 - (wallE ? 0 : 1))) throw new Error(`a gap next to a corner at row ${r}`);
    for (let c = c0; c <= c1; c++) {
      if (gap && c >= gap[0] && c <= gap[1]) continue;
      let p = (c + r) % 2 ? 'h1' : 'h0';
      if (c === c0 && !wallW) p = top ? 'tl' : 'bl'; else if (c === c1 && !wallE) p = top ? 'tr' : 'br';
      else if (gap && c === gap[0] - 1) p = 'er'; else if (gap && c === gap[1] + 1) p = 'el';   // the end posts either side of the gap
      fence(c, r, p);
    }
  };
  edge(r0, true, gapN); edge(r1, false, gapS);
  for (let r = r0 + 1; r < r1; r++) { if (!wallW) fence(c0, r, 'v'); if (!wallE) fence(c1, r, 'v') }
  reserve(c0 - 0.5, r0 - 0.5, c1 + 0.5, r1 + 0.5);
}
// the wall's pieces, from each cell's wall neighbours (a Tower's cell gets none: the Tower stands on it and the rails run into its base)
for (const i of wall) {
  if (onTower.has(i)) continue;
  const c = i % W, r = Math.floor(i / W), n = wall.has(idx(c, r - 1)), s = wall.has(idx(c, r + 1)), w = wall.has(idx(c - 1, r)), e = wall.has(idx(c + 1, r));
  const p = s && e ? 'tl' : s && w ? 'tr' : n && e ? 'bl' : n && w ? 'br' : w && e ? ((c + r) % 2 ? 'h1' : 'h0') : w ? 'er' : e ? 'el' : 'v';
  if (p === 'v' && !(n && s)) throw new Error(`a loose vertical fence end at ${c},${r}`);
  fence(c, r, p);
}
for (const [c, r] of towers) { add(feet('tower', c + 0.5, r + 1.08)); reserve(c - 1, r - 3, c + 1, r + 1) }   // its feet a touch below its cell: it draws over the rails that run into it, and its base seals the join
const inside = (c, r) => (c > 12 && c < 37 && r > 11 && r < 18) || (c > 10 && c < 39 && r >= 18 && r < 25) || (c > 10 && c < 36 && r >= 25 && r < GATE_ROW) || (c > 16 && c < 33 && r > 3 && r <= 11);

// ---- buildings. Houses share walls: 2 tiles apart in a row, each a little up or down so the row is not ruled
building('castle', 24.5, 9.4, 5, 4);                                                           // the keep, on the plateau
building('barracks', 14.5, 17.3, 3, 4);                                                        // the Blacksmith's, at the west end of the lane, under the wall
building('monastery', 35, 17.5, 3, 5);                                                         // the Healer's, at the east end
building('house2', 28.5, 17.4, 2, 3);                                                          // the Market, on the square, east of the hill street
building('house2', 30.5, 17.1, 2, 3, undefined, true);
building('house2', 21.5, 17.2, 2, 3, undefined, true); building('house2', 19.5, 17.5, 2, 3);  // west of it, two more with their fronts on the square
house(15.5, 25.8, 'maps/interiors/house_a.tmj', 'folk1', '370,300');                          // the cross lane: three houses west of the gate street, two east, their doors on the lane
building('house2', 13.5, 25.6, 2, 3, undefined, true); building('house2', 17.5, 26, 2, 3, undefined, true);
house(29.5, 25.8, 'maps/interiors/house_b.tmj', 'folk2', '420,330');
building('house2', 31.5, 25.5, 2, 3);

// ---- who stands where, and the clutter round each nook
const npc = (role, cx, cy, flip) => add(feet(NPCS[role].key, cx, cy, 'npc', [P('role', role)], flip));
const none = undefined;
// the Steward at the keep's door, bushes and a sign along the castle wall
npc('steward', 24.5, 10.5);
add(feet('bush3', 21, 10.3), feet('bush1', 28.2, 10.4), feet('odeco17', 20.3, 7.6), feet('odeco03', 29.6, 8.2), feet('odeco10', 22, 6.5));
// the Blacksmith: a yard under the Barracks against the wall, open to the lane on its north; ore piles, bones, a sign
yard(11, 20, 15, 22, { wallW: true, gapN: [12, 13] });
npc('blacksmith', 13.4, 21.9);
add(feet('gold-stone4', 11.7, 21.2), feet('gold-stone2', 12.1, 22.1), feet('rock2', 14.7, 21.6), feet('odeco08', 14.2, 22.2), feet('odeco14', 12.6, 22.3), feet('odeco17', 15.9, 20.1, none, none, true));
// the Healer: a herb garden under the Monastery, open to the lane: bushes, pumpkins, mushrooms, a sheep grazing by it
yard(31, 21, 36, 24, { gapN: [33, 34] });
npc('healer', 34.4, 22.6);
add(feet('bush4', 35.5, 22.1), feet('bush2', 32.9, 23.4), feet('odeco12', 35.6, 23.6), feet('odeco13', 33.2, 22.2), feet('odeco02', 33.7, 21.6), feet('odeco01', 34.9, 24.1), feet('odeco17', 31.2, 20.3), feet('sheep-idle', 37.6, 21.9));
// the square: the Merchant in front of the Market with his produce, a signpost in the middle, a sheep wandered in
npc('market', 28.5, 19.3, true);
add(feet('odeco13', 27, 18.9), feet('odeco12', 27.4, 19.9), feet('odeco15', 30.1, 19.2), feet('odeco14', 30.6, 20.3), feet('odeco17', 24.5, 20.2), feet('odeco04', 21.6, 20.9), feet('sheep-idle', 20.3, 18.6), feet('odeco05', 26.2, 21.6));
// the Trainer: a training ground in the square's south-west corner, between the houses and the bend of the street: a scarecrow to hit, a sign, bones
npc('trainer', 20.4, 23.4, true);
add(feet('odeco18', 18.9, 22.3), feet('odeco16', 21.3, 21.6), feet('odeco07', 19.5, 23.9), feet('odeco05', 21.2, 24.2), feet('odeco14', 18.4, 23.6));
reserve(18, 21, 21, 24);
// the cross lane and the alleys: mushrooms, a bush, a rock between the houses
add(feet('odeco03', 19.1, 25.9), feet('odeco02', 27.7, 25.9), feet('rock3', 33.6, 25.5), feet('bush3', 12.2, 24.1), feet('odeco11', 35.2, 24.4), feet('odeco10', 25.6, 22.3));
// the gate: a signpost outside, then the road; the pier: planks starting on the sand in front of the spit's cliff (row 37), the boat tied at its end, the `sail` rect on the planks
add(feet('odeco17', 22, 30.2), feet('odeco16', 26, 30.4, none, none, true));
const dock = y => tileObj('dock', [24.5 * T, y], 'stepstone');
add(dock(37.55 * T + 158), dock(37.55 * T + 316), tileObj('boat', [26.4 * T, 41.7 * T], 'boat'));
add(rect('sail', 24 * T, 40.3 * T, T + 32, 2.2 * T));
reserve(19, 29, 30, 36);
// the fields outside the wall: a scarecrow over pumpkin rows to the west, a sheep meadow to the east, a pig pen outside the wall's jog
add(feet('odeco18', 14.5, 31.6), feet('odeco12', 12.6, 30.4), feet('odeco13', 13.8, 30.6), feet('odeco12', 16.1, 30.5), feet('odeco13', 17.4, 30.7), feet('odeco12', 13.2, 32), feet('odeco13', 16.8, 32.1), feet('odeco11', 18.6, 31.3));
reserve(11, 29, 19, 33);
add(feet('sheep-idle', 31.6, 30.6), feet('sheep-idle', 33.4, 31.5), feet('sheep-idle', 30.2, 31.9), feet('sheep-idle', 35.1, 30.9), feet('sheep-idle', 29.4, 30.2));
yard(37, 27, 41, 29, { gapS: [39, 39] });
add(feet('pig-idle', 39.4, 28.4, none, none, true), feet('odeco09', 40.6, 27.8));
reserve(29, 29, 37, 33);
// the beach where you wash up (south-west, sand painted below), and rocks off the coast
add(tileObj('water-rocks4', [1.3 * T, 38.1 * T], 'stepstone'), tileObj('water-rocks2', [3.6 * T, 38.8 * T]), tileObj('water-rocks3', [0.6 * T, 30.2 * T]));
reserve(6, 30, 10, 34);

// trees: thick along the coast and in the corners outside the wall, none within a cell of the wall (it stays in view) or on the fields; a few inside, in leftover corners
const dense = (x, y) => CL.vnoise(x / 4.5 + 3, y / 4.5 + 3, 21) > 0.5;
const nearWall = (x, y) => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => wall.has(idx(x + dx, y + dy)) || onTower.has(idx(x + dx, y + dy))));
const treeAt = (cx, cy) => add(feet(pick(['tree1', 'tree2', 'tree3', 'tree4']), cx + jit(0.5), cy + jit(0.4)));
for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
  const i = idx(x, y);
  if (!ground[i] || raised[i] || used.has(i) || nearWall(x, y)) continue;
  const edge = !(has(ground, x - 2, y) && has(ground, x + 2, y) && has(ground, x, y - 2) && has(ground, x, y + 2));   // within 2 cells of the water
  const p = inside(x, y) ? 0.08 : edge ? (dense(x, y) ? 0.7 : 0.4) : dense(x, y) ? 0.45 : 0.12;
  if (rnd() < p) { treeAt(x + 0.5, y + 0.85); used.add(i) }
}
// bushes, rocks, stumps and mushrooms on the open grass, inside and out
for (let n = 0, g = 0; n < 3000 && g < 70; n++) {
  const x = 3 + Math.floor(rnd() * (W - 6)), y = 3 + Math.floor(rnd() * (H - 10)), i = idx(x, y);
  if (!ground[i] || raised[i] || used.has(i) || nearWall(x, y) || !has(ground, x - 1, y) || !has(ground, x + 1, y) || !has(ground, x, y + 1) || !has(ground, x, y - 1)) continue;
  add(feet(pick(['bush1', 'bush2', 'bush3', 'bush4', 'odeco02', 'odeco03', 'odeco10', 'odeco11', 'rock1', 'rock3', 'odeco04', 'stump2']), x + 0.5 + jit(0.4), y + 0.8 + jit(0.3))); used.add(i); g++;
}

// spawn points for ?at=<name>: the first is where a new game starts
const spawn = (name, cx, cy) => add(point('spawn', at(cx, cy), [], name));
spawn('start', 23.5, 23.6); spawn('gate', 24, 29.6); spawn('blacksmith', 13.5, 20.6); spawn('healer', 34.5, 20.6); spawn('market', 28.5, 20.6); spawn('steward', 22.6, 9.8); spawn('trainer', 22.5, 23.6);
spawn('beach', 3.5, 33.5); spawn('houseA', 15.5, 27.1); spawn('houseB', 29.5, 27.1);

const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', class: 'chunk', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, compressionlevel: -1, width: W, height: H, tilewidth: T, tileheight: T, nextlayerid: C.LAYERS.length + 1, backgroundcolor: C.BG, nextobjectid: oid,
  properties: [P('kind', 'landmark', 'string', 'chunkKind'), P('biomes', 'town'), P('minIsland', 1, 'int'), P('weight', 1, 'float'), P('mirror', false, 'bool')],
  tilesets: C.tilesets(),
  layers: [...terrain, { id: terrain.length + 1, name: 'Objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects }],
};
fs.writeFileSync(path.join(R, 'maps/town.tmj'), JSON.stringify(map, null, 1) + '\n');
console.log('maps/town.tmj written,', objects.length, 'objects,', wall.size, 'wall cells,', towers.length, 'towers');
