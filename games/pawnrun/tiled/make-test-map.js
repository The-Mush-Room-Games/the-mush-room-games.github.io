// Writes maps/test.tmj, a 20x16 test island. Run: node tiled/make-test-map.js (after make-rules.js and make-objects.js)
const fs = require('fs'), path = require('path');
const C = require('./common.js'), TR = require('../src/terrain.js');
const R = path.join(__dirname, '..');
const W = 20, H = 16, T = 64;
const objTs = JSON.parse(fs.readFileSync(path.join(R, 'maps/objects.tsj'), 'utf8'));
const keyOf = t => (t.properties || []).find(p => p.name === 'key')?.value || t.image.split('/').pop().replace(/\.png$/i, '');
const findTile = key => objTs.tiles.find(t => keyOf(t) === key);
const gidOf = key => C.FIRST.objects + findTile(key).id;
const F = C.FIRST;

// island: [row, firstCol, lastCol]
const rows = { 2: [7, 12], 3: [5, 14], 4: [4, 15], 5: [4, 16], 6: [3, 16], 7: [3, 19], 8: [3, 19], 9: [4, 16], 10: [4, 15], 11: [5, 15], 12: [6, 14], 13: [7, 13] };
const idx = (x, y) => y * W + x;
const ground = new Uint8Array(W * H), raised = new Uint8Array(W * H), water = new Uint8Array(W * H);
for (const [y, [a, b]] of Object.entries(rows)) for (let x = a; x <= b; x++) ground[idx(x, +y)] = 1;
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
const point = (cls, [x, y], props = []) => ({ id: oid++, name: cls, class: cls, x, y, width: 0, height: 0, point: true, rotation: 0, visible: true, properties: props });
const objects = [
  tileObj('tree1', bottom(8, 2), 'secret', [P('kind', 'tree', 'string', 'secretKind')]),
  tileObj('tree2', bottom(14, 4)), tileObj('tree4', bottom(4, 9)),
  tileObj('rock1', bottom(11, 8)), tileObj('rock2', bottom(16, 6)),
  tileObj('house1', [14 * T, 12 * T]),
  tileObj('sheep-idle', bottom(7, 9)), tileObj('sheep-idle', bottom(12, 9)),
  tileObj('pig-idle', [768, 584]),   // Tiled-only art (added in Tiled): keep it across regeneration
  tileObj('gnome-idle', bottom(15, 8), undefined, [P('count', 2, 'int')]),
  tileObj('bush1', bottom(6, 8)), tileObj('bush2', bottom(13, 7)), tileObj('bush3', bottom(3, 7)),
  point('spawn', centre(9, 8)),
  { id: oid++, name: 'entrance', class: 'entrance', x: 19 * T, y: 7 * T, width: T, height: 2 * T, rotation: 0, visible: true, properties: [] },
  point('loot', centre(6, 12), [P('kind', 'duck', 'string', 'lootKind')]),
];
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
