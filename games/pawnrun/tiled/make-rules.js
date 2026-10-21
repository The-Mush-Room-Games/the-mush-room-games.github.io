// Generates Tiled Automapping rules (tiled/rules/*.tmj, tiled/rules.txt), the rules tileset and maps/terrain.tsj.
// Run: node tiled/make-rules.js   (re-runnable)
// Paint any grass tile on Ground / Raised and Tiled swaps in the right edge piece (same rule the game uses).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const T = __dirname, R = path.join(T, '..');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const json = (f, o) => w(f, JSON.stringify(o, null, 1) + '\n');

// --- maps/terrain.tsj: Tilemap_color1.png, 9x6 tiles of 64 px
json(path.join(R, 'maps/terrain.tsj'), {
  type: 'tileset', name: 'terrain', tiledversion: '1.12.2', version: '1.10',
  image: '../assets/terrain/tilemap1.png', imagewidth: 576, imageheight: 384,
  tilewidth: 64, tileheight: 64, columns: 9, tilecount: 54, margin: 0, spacing: 0,
});

// --- rules tileset: Tiled's own "AutoMap Rules" tileset (5 tiles, MatchType property), drawn here as flat swatches
const MT = ['Negate', 'Ignore', 'NonEmpty', 'Empty', 'Other'];
const COL = [[200, 60, 60], [150, 150, 150], [70, 170, 70], [240, 240, 240], [70, 110, 200]];
function png(wd, ht, px) {
  const raw = Buffer.alloc((wd * 4 + 1) * ht);
  for (let y = 0; y < ht; y++) { raw[y * (wd * 4 + 1)] = 0; px.copy(raw, y * (wd * 4 + 1) + 1, y * wd * 4, (y + 1) * wd * 4); }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(wd, 0); ih.writeUInt32BE(ht, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const px = Buffer.alloc(160 * 32 * 4);
for (let y = 0; y < 32; y++) for (let x = 0; x < 160; x++) {
  const t = x >> 5, edge = (x & 31) < 2 || (x & 31) > 29 || y < 2 || y > 29, o = (y * 160 + x) * 4;
  px.set(edge ? [0, 0, 0, 255] : [...COL[t], 255], o);
}
w(path.join(T, 'automap-rules.png'), png(160, 32, px));
json(path.join(T, 'automap-rules.tsj'), {
  type: 'tileset', name: 'AutoMap Rules', tiledversion: '1.12.2', version: '1.10',
  image: 'automap-rules.png', imagewidth: 160, imageheight: 32, tilewidth: 32, tileheight: 32, columns: 5, tilecount: 5,
  tiles: MT.map((v, id) => ({ id, properties: [{ name: 'MatchType', type: 'string', value: v }] })),
});

// --- maps/water.tsj: one flat water tile (#47aba9) to paint the Water layer with (any tile there means water)
const wp = Buffer.alloc(64 * 64 * 4);
for (let i = 0; i < 64 * 64; i++) wp.set([0x47, 0xab, 0xa9, 255], i * 4);
w(path.join(T, 'water.png'), png(64, 64, wp));
json(path.join(R, 'maps/water.tsj'), {
  type: 'tileset', name: 'water', tiledversion: '1.12.2', version: '1.10',
  image: '../tiled/water.png', imagewidth: 64, imageheight: 64, tilewidth: 64, tileheight: 64, columns: 1, tilecount: 1,
});

// --- rule maps: 16 rules (n,s,e,w present/absent). Same formula as the game's autotile().
const tile = (n, s, e, ww) => (n ? (s ? 1 : 2) : (s ? 0 : 3)) * 9 + (ww ? (e ? 1 : 2) : (e ? 0 : 3));
const GID_T = 1, GID_R = 55, NON = GID_R + 2;
function ruleMap(layer, colOffset) {
  const W = 17, H = 17, mk = () => new Array(W * H).fill(0);
  const reg = mk(), inp = mk(), inn = mk(), out = mk();
  for (let k = 0; k < 16; k++) {
    const n = k & 1, s = (k >> 1) & 1, e = (k >> 2) & 1, ww = (k >> 3) & 1;
    const ox = 1 + (k % 4) * 4, oy = 1 + Math.floor(k / 4) * 4, at = (dx, dy) => (oy + dy) * W + ox + dx;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) reg[at(dx, dy)] = NON;
    // Tiled 1.12.2: the "Empty" match tile never fires, so absent neighbours go on an inputnot_ layer instead.
    inp[at(1, 1)] = NON;
    [[1, 0, n], [1, 2, s], [2, 1, e], [0, 1, ww]].forEach(([dx, dy, has]) => { (has ? inp : inn)[at(dx, dy)] = NON; });
    out[at(1, 1)] = GID_T + tile(n, s, e, ww) + colOffset;
  }
  const L = (id, name, data) => ({ id, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data });
  return {
    type: 'map', version: '1.10', tiledversion: '1.12.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: W, height: H, tilewidth: 64, tileheight: 64, nextlayerid: 5, nextobjectid: 1,
    properties: [{ name: 'MatchOutsideMap', type: 'bool', value: true }, { name: 'NoOverlappingRules', type: 'bool', value: false }],
    tilesets: [{ firstgid: GID_T, source: '../../maps/terrain.tsj' }, { firstgid: GID_R, source: '../automap-rules.tsj' }],
    layers: [L(1, 'regions', reg), L(2, 'input_' + layer, inp), L(3, 'inputnot_' + layer, inn), L(4, 'output_' + layer, out)],
  };
}
json(path.join(T, 'rules/ground.tmj'), ruleMap('Ground', 0));
json(path.join(T, 'rules/raised.tmj'), ruleMap('Raised', 5));
w(path.join(T, 'rules.txt'), 'rules/ground.tmj\nrules/raised.tmj\n');
console.log('rules written');
