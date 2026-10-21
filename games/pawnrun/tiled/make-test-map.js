// Writes maps/test.tmj, a 20x16 test island. Run: node tiled/make-test-map.js (after make-rules.js and make-objects.js)
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const W = 20, H = 16, T = 64;
const objTs = JSON.parse(fs.readFileSync(path.join(R, 'maps/objects.tsj'), 'utf8'));
const OBJ_FIRST = 56; // terrain 1..54, water 55, objects 56..
const gidOf = key => OBJ_FIRST + objTs.tiles.findIndex(t => t.properties[0].value === key);

// island: [row, firstCol, lastCol]
const rows = { 2: [7, 12], 3: [5, 14], 4: [4, 15], 5: [4, 16], 6: [3, 16], 7: [3, 19], 8: [3, 19], 9: [4, 16], 10: [4, 15], 11: [5, 15], 12: [6, 14], 13: [7, 13] };
const idx = (x, y) => y * W + x;
const ground = new Uint8Array(W * H), raised = new Uint8Array(W * H), water = new Uint8Array(W * H);
for (const [y, [a, b]] of Object.entries(rows)) for (let x = a; x <= b; x++) ground[idx(x, +y)] = 1;
for (let y = 10; y <= 11; y++) for (let x = 9; x <= 11; x++) { ground[idx(x, y)] = 0; water[idx(x, y)] = 1; } // pond
for (let y = 3; y <= 6; y++) for (let x = 6; x <= 11; x++) raised[idx(x, y)] = 1;                          // 6x4 plateau

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

let oid = 1;
const P = (name, value, type = 'string', propertytype) => ({ name, type, ...(propertytype && { propertytype }), value });
const centre = (cx, cy) => [cx * T + T / 2, cy * T + T / 2];
const bottom = (cx, cy) => [cx * T + T / 2, (cy + 1) * T]; // bottom centre of a cell
const tileObj = (key, [x, y], cls, props = []) => {
  const t = objTs.tiles.find(t => t.properties[0].value === key);
  return { id: oid++, name: '', ...(cls && { class: cls }), gid: gidOf(key), x, y, width: t.width, height: t.height, rotation: 0, visible: true, properties: props };
};
const point = (cls, [x, y], props = []) => ({ id: oid++, name: cls, class: cls, x, y, width: 0, height: 0, point: true, rotation: 0, visible: true, properties: props });
const objects = [
  tileObj('tree1', bottom(8, 2), 'secret', [P('kind', 'tree', 'string', 'secretKind')]),
  tileObj('tree2', bottom(14, 4)), tileObj('tree4', bottom(4, 9)),
  tileObj('rock1', bottom(11, 8)), tileObj('rock2', bottom(16, 6)),
  tileObj('house1', [14 * T, 12 * T]),
  tileObj('sheep-idle', bottom(7, 9)), tileObj('sheep-idle', bottom(12, 9)),
  tileObj('gnome-idle', bottom(15, 8), undefined, [P('count', 2, 'int')]),
  tileObj('bush1', bottom(6, 8)), tileObj('bush2', bottom(13, 7)), tileObj('bush3', bottom(3, 7)),
  point('spawn', centre(9, 8)),
  { id: oid++, name: 'entrance', class: 'entrance', x: 19 * T, y: 7 * T, width: T, height: 2 * T, rotation: 0, visible: true, properties: [] },
  point('loot', centre(6, 12), [P('kind', 'duck', 'string', 'lootKind')]),
];

const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', class: 'chunk', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, compressionlevel: -1, width: W, height: H, tilewidth: T, tileheight: T, nextlayerid: 6, nextobjectid: oid,
  properties: [P('kind', 'landmark', 'string', 'chunkKind'), P('biomes', 'forest'), P('minIsland', 1, 'int'), P('weight', 1, 'float'), P('mirror', false, 'bool')],
  tilesets: [{ firstgid: 1, source: 'terrain.tsj' }, { firstgid: 55, source: 'water.tsj' }, { firstgid: OBJ_FIRST, source: 'objects.tsj' }],
  layers: [
    layer(1, 'Water', (x, y) => (water[idx(x, y)] ? 55 : 0)),
    layer(2, 'Ground', (x, y) => (ground[idx(x, y)] ? 1 + autotile(ground, x, y, 0) : 0)),
    layer(3, 'Raised', (x, y) => (raised[idx(x, y)] ? 1 + autotile(raised, x, y, 5) : 0)),
    layer(4, 'Stairs', (x, y) => (stairs[idx(x, y)] ? 1 + stairs[idx(x, y)] : 0)),
    { id: 5, name: 'Objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
  ],
};
fs.writeFileSync(path.join(R, 'maps/test.tmj'), JSON.stringify(map, null, 1) + '\n');
console.log('maps/test.tmj written,', objects.length, 'objects');
