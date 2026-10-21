// Writes maps/test.tmj, a 64x50 test island. Run: node tiled/make-test-map.js (after make-rules.js and make-objects.js)
const fs = require('fs'), path = require('path');
const C = require('./common.js'), TR = require('../src/terrain.js');
const R = path.join(__dirname, '..');
const W = 64, H = 50, T = 64;
const objTs = JSON.parse(fs.readFileSync(path.join(R, 'maps/objects.tsj'), 'utf8'));
const keyOf = t => (t.properties || []).find(p => p.name === 'key')?.value || t.image.split('/').pop().replace(/\.png$/i, '');
const findTile = key => objTs.tiles.find(t => keyOf(t) === key);
const gidOf = key => C.FIRST.objects + findTile(key).id;
const F = C.FIRST;

// island: row -> [firstCol, lastCol] (or a list of those). Rows 2-13 are the first island; below it a field with:
// a tree-walled pocket (rows 14-16, cols 19-20), two 1-tile dead ends (cols 7 and 10, rows 22-24), an islet (cols 0-1) across the water
// and a tiny islet (cols 13-14, rows 24-25) two water tiles south of the field: only a thrown dynamite reaches it.
// The field's rows 17-18 run on east (cols 22-24) to a meadow (cols 25-38, rows 11-23) with a gnome camp in it
const rows = { 2: [7, 12], 3: [5, 14], 4: [4, 15], 5: [4, 16], 6: [3, 16], 7: [3, 19], 8: [3, 19], 9: [4, 16], 10: [4, 15], 11: [[5, 15], [25, 38]], 12: [[6, 14], [25, 38]], 13: [[7, 13], [25, 38]],
  14: [[7, 13], [19, 20], [25, 38]], 15: [[5, 15], [19, 20], [25, 38]], 16: [[4, 16], [19, 20], [25, 38]], 17: [[0, 1], [4, 38]], 18: [[0, 1], [4, 38]], 19: [[4, 17], [25, 38]], 20: [[5, 15], [25, 38]], 21: [[7, 13], [25, 38]],
  22: [[7, 7], [10, 10], [25, 38]], 23: [[7, 7], [10, 10], [25, 38]], 24: [[7, 7], [10, 10], [13, 14]], 25: [13, 14] };
const idx = (x, y) => y * W + x;
const ground = new Uint8Array(W * H), raised = new Uint8Array(W * H), water = new Uint8Array(W * H);
for (const [y, r] of Object.entries(rows)) for (const [a, b] of typeof r[0] === 'number' ? [r] : r) for (let x = a; x <= b; x++) ground[idx(x, +y)] = 1;
// East and south of the meadow, all reached from it (the camp is in the middle of the meadow: walk round it):
// - a 2-tile corridor east (rows 17-18, cols 39-43) into the snake den (cols 44-56, rows 13-23);
// - from the den a 3-wide corridor south (cols 49-51, rows 24-27) into the boss arena: ground cols 42-59, rows 28-43, the inside (the camp rect) is cols 43-58 x rows 29-42
//   (16 x 14 flat tiles) and its fence ring is the outer row/column; water below row 43, where the dock and the boat are;
// - a spider glade north of the meadow (cols 25-40, rows 2-7, joined by a 4-wide neck, rows 8-10, cols 30-33);
// - a slingshot grove south of it (cols 26-37, rows 27-37, neck rows 24-26, cols 30-33).
const land = (c0, r0, c1, r1) => { for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) ground[idx(x, y)] = 1 };
land(39, 17, 43, 18); land(44, 13, 56, 23); land(49, 24, 51, 27); land(42, 28, 59, 43);
land(25, 2, 40, 7); land(30, 8, 33, 10); land(30, 24, 33, 26); land(26, 27, 37, 37);
for (let y = 10; y <= 11; y++) for (let x = 9; x <= 11; x++) { ground[idx(x, y)] = 0; water[idx(x, y)] = 1; } // pond
for (let y = 3; y <= 6; y++) for (let x = 6; x <= 11; x++) raised[idx(x, y)] = 1;                          // 6x4 plateau
for (let x = 9; x <= 11; x++) raised[idx(x, 9)] = 1;                                                      // bump whose cliff stands in the pond

const has = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[idx(x, y)] === 1;
// the game's rule; no inside corners exist, so reject 1-tile notches and diagonal-only touches
function check(m, name) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[idx(x, y)] && ((has(m, x - 1, y) && has(m, x + 1, y)) || (has(m, x, y - 1) && has(m, x, y + 1)))) throw new Error(`${name}: 1-tile notch at ${x},${y}`);
    for (const [dx, dy] of [[1, 1], [1, -1]]) {
      const a = has(m, x, y), b = has(m, x + dx, y + dy), c = has(m, x + dx, y), d = has(m, x, y + dy);
      if (a && b && !c && !d) throw new Error(`${name}: diagonal-only touch at ${x},${y}`);
    }
  }
}
check(ground, 'ground'); check(raised, 'raised');
for (let i = 0; i < W * H; i++) if (raised[i] && !ground[i]) throw new Error('raised outside ground');

function autotile(m, x, y, off) {
  const n = has(m, x, y - 1), s = has(m, x, y + 1), w = has(m, x - 1, y), e = has(m, x + 1, y);
  return (n ? (s ? 1 : 2) : (s ? 0 : 3)) * 9 + (w ? (e ? 1 : 2) : (e ? 0 : 3)) + off;
}
const layer = (id, name, f) => ({ id, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true,
  data: Array.from({ length: W * H }, (_, i) => f(i % W, (i / W) | 0)) });
const stairs = { [idx(5, 6)]: 36, [idx(5, 7)]: 45 }; // left stair beside the plateau's west edge, down to the ground

// what the game draws on top of the three masks, from the game's own rules (src/terrain.js)
const stairTiles = new Int16Array(W * H).fill(-1);
for (const [i, t] of Object.entries(stairs)) stairTiles[i] = t;
const c = TR.cellFns({ w: W, h: H, ground, raised, stairTiles });
const raisedTile = (x, y) => (c.top(x - 1, y) || c.top(x + 1, y) ? 15 : autotile(raised, x, y, 5));
const cliff = new Map(), foam = new Set(), shadow = new Set();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (ground[idx(x, y)] && !(has(ground, x - 1, y) && has(ground, x + 1, y) && has(ground, x, y - 1) && has(ground, x, y + 1))) foam.add(idx(x, y));
  if (!raised[idx(x, y)] || y + 1 >= H) continue;
  shadow.add(idx(x, y + 1));
  if (TR.hasCliff(c, x, y)) { cliff.set(idx(x, y + 1), TR.cliffTile(c, x, y)); if (!c.G(x, y + 1)) foam.add(idx(x, y + 1)); }
}

let oid = 1;
const P = (name, value, type = 'string', propertytype) => ({ name, type, ...(propertytype && { propertytype }), value });
const centre = (cx, cy) => [cx * T + T / 2, cy * T + T / 2];
const bottom = (cx, cy) => [cx * T + T / 2, (cy + 1) * T]; // bottom centre of a cell
const tileObj = (key, [x, y], cls, props = []) => {
  const t = findTile(key);
  return { id: oid++, name: '', ...(cls && { class: cls }), gid: gidOf(key), x, y, width: t.width, height: t.height, rotation: 0, visible: true, properties: props };
};
const point = (cls, [x, y], props = [], name = cls) => ({ id: oid++, name, class: cls, x, y, width: 0, height: 0, point: true, rotation: 0, visible: true, properties: props });
const objects = [
  tileObj('tree1', bottom(8, 2), 'secret', [P('kind', 'tree', 'string', 'secretKind')]),
  tileObj('tree2', bottom(14, 4)), tileObj('tree4', bottom(4, 9)),
  tileObj('rock1', bottom(11, 8)), tileObj('rock2', bottom(16, 6)),
  tileObj('house1', [14 * T, 12 * T]),
  tileObj('sheep-idle', bottom(7, 9)), tileObj('sheep-idle', bottom(12, 9)), tileObj('sheep-idle', bottom(7, 17)),
  tileObj('pig-idle', [768, 584]),   // Tiled-only art (added in Tiled): keep it across regeneration
  tileObj('gnome-idle', bottom(15, 8), undefined, [P('count', 2, 'int')]),
  tileObj('bush1', bottom(6, 8)), tileObj('bush2', bottom(13, 7)), tileObj('bush3', bottom(3, 7)),
  point('spawn', centre(9, 8)),
  { id: oid++, name: 'entrance', class: 'entrance', x: 19 * T, y: 7 * T, width: T, height: 2 * T, rotation: 0, visible: true, properties: [] },
  point('loot', centre(6, 12), [P('kind', 'duck', 'string', 'lootKind')]),
];
// Resources and secrets (the field south of the first island)
const kind = k => [P('kind', k, 'string', 'secretKind')];
const weapon = (w, tier, [x, y]) => point('loot', [x, y], [P('kind', 'weapon', 'string', 'lootKind'), P('weapon', w), P('tier', tier, 'int')]);
const loot = (k, [x, y], n) => point('loot', [x, y], [P('kind', k, 'string', 'lootKind'), ...(n ? [P('n', n, 'int')] : [])]);
objects.push(
  // gold stones: a pickaxe pops gold and steps each down a size (the old Pawn has no pickaxe: ?hero=new)
  tileObj('gold-stone4', bottom(11, 18)), tileObj('gold-stone6', bottom(14, 18)), tileObj('gold-stone2', bottom(8, 19)),
  // the pocket (rows 14-16, cols 19-20): a tree line closes its mouth; only the middle tree, with the mushroom at its foot, can be chopped.
  // Trunks stand 54 px apart: 18 px between them (the Pawn is 20 wide), 31 px once the middle one is a stump
  tileObj('tree1', [1226, 1091]), tileObj('tree1', [1280, 1091], 'secret', kind('tree')), tileObj('tree1', [1334, 1091]),
  loot('duck', [1280, 15 * T + 32]),
  // a 1-tile dead end closed by a rock pile (hammer, or pickaxe x2); meat and gold behind it
  tileObj('rock4', [672, 1436], 'secret', kind('rock')), tileObj('rock2', [672, 1461], 'secret', kind('rock')),
  loot('meat', [672, 23 * T + 32]), loot('gold', [672, 24 * T + 32], 5),
  // stepping stones across 2 tiles of water to an islet (Water Rocks of class stepstone, overlapping so the line has no gap)
  tileObj('water-rocks4', [128, 1183], 'stepstone'), tileObj('water-rocks2', [174, 1183], 'stepstone'),
  tileObj('water-rocks4', [222, 1183], 'stepstone'), tileObj('water-rocks2', [265, 1183], 'stepstone'),
  loot('gold', [44, 1140], 10), loot('meat', [84, 1170]),
  // weapons on the ground, row 16 (tier colours: 0 blue, 1 red, 2 yellow, 3 purple). The old Pawn takes the axe and hammer, not the pickaxe
  weapon('axe', 1, centre(6, 16)), weapon('hammer', 2, centre(8, 16)), weapon('pickaxe', 0, centre(10, 16)),
  // one-use items, row 20: 2 dynamite and a bomb
  loot('dynamite', centre(6, 20)), loot('dynamite', centre(7, 20)), loot('bomb', centre(9, 20)),
  // a dead end (col 7) plugged with 3 rock piles in a row, gold behind: one blast clears them all (a hammer takes 3 swings)
  tileObj('rock4', [480, 1436], 'secret', kind('rock')), tileObj('rock2', [480, 1461], 'secret', kind('rock')), tileObj('rock4', [480, 1486], 'secret', kind('rock')),
  loot('gold', [480, 23 * T + 40], 12), loot('gold', [480, 24 * T + 32], 8),
  // a rock pile on the tiny islet across 2 water tiles from the field's south shore (col 13, row 21): out of reach of any swing, a dynamite thrown south lands next to it
  tileObj('rock2', bottom(13, 25), 'secret', kind('rock')),
);
// The gnome camp (src/camp.js): the `camp` rect is the inside (cols 29-34, rows 14-19); the Wooden Fence ring stands on the cells around it
// (cols 28-35, rows 13-20), and a `gate` rect on the ring is a gap that closes when the hero steps in: north (32,13) and south (31,20).
// A Gnome Hut in the north-east corner, 4 gnomes in the rest. Reach it along the field's rows 17-18 to the east, then round to the south gate.
const rect = (cls, c0, r0, c1, r1, props = []) => ({ id: oid++, name: cls, class: cls, x: c0 * T, y: r0 * T, width: (c1 - c0 + 1) * T, height: (r1 - r0 + 1) * T, rotation: 0, visible: true, properties: props });
const GNOME_GAP = 65;                                                  // transparent rows under a gnome's feet in its 192 px frame
const gnome = (cx, cy, n) => tileObj('gnome-idle', [cx * T + T / 2, (cy + 1) * T - T / 2 + GNOME_GAP], undefined, n > 1 ? [P('count', n, 'int')] : []);
objects.push(
  rect('camp', 29, 14, 34, 19, [P('kind', 'gnome')]), rect('gate', 32, 13, 32, 13), rect('gate', 31, 20, 31, 20),
  tileObj('gnome-hut', [34 * T, 17 * T]),
  gnome(31, 16, 2), gnome(30, 18, 1), gnome(33, 19, 1),
  tileObj('bush3', bottom(26, 12)), tileObj('bush2', bottom(37, 22)), tileObj('rock3', bottom(26, 21)), tileObj('tree3', bottom(37, 12)),
  loot('meat', centre(36, 21)),
);
// Enemy areas (a gnome stands with 64 px tiles: `gap` = transparent rows under the feet in the 192 / 256 px frame). `n` makes a pack in a ring.
const foe = (key, gap, cx, cy, n) => tileObj(key + '-idle', [cx * T + T / 2, cy * T + T / 2 + gap], undefined, n > 1 ? [P('count', n, 'int')] : []);
objects.push(
  // snake den: slow, then a lunge. Rocks and a bush to dodge round.
  foe('snake', 69, 47, 15, 2), foe('snake', 69, 54, 19, 2),
  tileObj('rock1', bottom(46, 21)), tileObj('rock3', bottom(53, 14)), tileObj('bush1', bottom(51, 22)), tileObj('tree2', bottom(55, 22)),
  // spider glade: three fast ones that skitter
  foe('spider', 55, 31, 4, 3), foe('spider', 55, 37, 5, 2),
  tileObj('tree1', bottom(27, 3)), tileObj('tree4', bottom(39, 3)), tileObj('bush2', bottom(34, 3)), tileObj('rock2', bottom(26, 6)),
  // slingshot grove: three that keep their distance. A rock and a tree stand in the line of fire (an acorn stops at them)
  foe('slingshot', 55, 29, 32), foe('slingshot', 55, 34, 34), foe('slingshot', 55, 31, 36),
  tileObj('rock2', bottom(31, 30)), tileObj('tree3', bottom(35, 30)), tileObj('rock4', bottom(28, 35)), tileObj('bush3', bottom(36, 36)),
  loot('meat', centre(27, 28)),
);
// The boss arena: a boss `camp` (the inside is 16 x 14 flat tiles, nothing in it but the Bear, which stands in the middle), a gate in the fence ring on the
// north side (the way in, below the corridor) and on the south side (the dock). The dock is one plank section standing on the south shore, over the water
// (a stepstone: feet may stand on it); the boat floats beside it. Standing in the `dock` rect shows the Board prompt, once the Bear is down.
objects.push(
  rect('camp', 43, 29, 58, 42, [P('kind', 'boss')]), rect('gate', 50, 28, 50, 28), rect('gate', 50, 43, 50, 43),
  foe('bear', 79, 50, 35),
  tileObj('dock', [50 * T + 32, 43 * T + 40 + 158], 'stepstone'),
  tileObj('boat', [52 * T + 38, 44 * T + 210], 'boat'),
  rect('dock', 50, 44, 50, 45),
);
// named spawn points for ?at=<name> (dev shortcut): the first `spawn` above is the default
const at = (name, cx, cy) => point('spawn', centre(cx, cy), [], name);
objects.push(at('field', 10, 17), at('camp', 36, 21), at('snakes', 45, 17), at('spiders', 29, 6), at('grove', 31, 28), at('arena', 50, 26), at('dock', 50, 44));
// two enterable houses near the spawn. A door is a rect over the doorway in the art (house1.png: door x 51-77, y 126-162 in the
// 128x192 frame) that reaches down past the base shadow, where the walking-up hero's feet stop. Its `interior` is a map path.
const house2 = tileObj('house1', [416, 768]);
objects.push(house2);
for (const [h, interior] of [[[896, 768], 'maps/interiors/house_a.tmj'], [[416, 768], 'maps/interiors/house_b.tmj']])
  objects.push({ id: oid++, name: 'door', class: 'door', x: h[0] - 64 + 48, y: h[1] - 192 + 126, width: 32, height: 52, rotation: 0, visible: true, properties: [P('interior', interior)] });

const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', class: 'chunk', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, compressionlevel: -1, width: W, height: H, tilewidth: T, tileheight: T, nextlayerid: 9, backgroundcolor: C.BG, nextobjectid: oid,
  properties: [P('kind', 'landmark', 'string', 'chunkKind'), P('biomes', 'forest'), P('minIsland', 1, 'int'), P('weight', 1, 'float'), P('mirror', false, 'bool')],
  tilesets: C.tilesets(),
  layers: [
    layer(1, 'Water', (x, y) => (water[idx(x, y)] ? F.water : 0)),
    layer(2, 'Foam (preview)', (x, y) => (foam.has(idx(x, y)) ? F.foam : 0)),
    layer(3, 'Ground', (x, y) => (ground[idx(x, y)] ? F.low + autotile(ground, x, y, 0) : 0)),
    layer(4, 'Shadows (preview)', (x, y) => (shadow.has(idx(x, y)) ? F.shadow : 0)),
    layer(5, 'Raised', (x, y) => (raised[idx(x, y)] ? F.high + raisedTile(x, y) : 0)),
    layer(6, 'Cliffs (preview)', (x, y) => (cliff.has(idx(x, y)) ? F.high + cliff.get(idx(x, y)) : 0)),
    layer(7, 'Stairs', (x, y) => (stairs[idx(x, y)] ? F.high + stairs[idx(x, y)] : 0)),
    { id: 8, name: 'Objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
  ],
};
fs.writeFileSync(path.join(R, 'maps/test.tmj'), JSON.stringify(map, null, 1) + '\n');
console.log('maps/test.tmj written,', objects.length, 'objects');
