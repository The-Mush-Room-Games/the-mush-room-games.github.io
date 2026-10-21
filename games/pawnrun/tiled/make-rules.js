// Generates the Tiled side of terrain: tilesets, Automapping rules, rules tileset. Re-runnable: node tiled/make-rules.js
//   Paint any grass tile on Ground / Raised; Tiled swaps in the right edge piece (the game's autotile rule) and
//   fills the preview layers the game draws at load: Foam, Shadows, Cliffs. The game ignores those layers.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const C = require('./common.js');
const T = __dirname, R = path.join(T, '..'), F = C.FIRST;
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const json = (f, o) => w(f, JSON.stringify(o, null, 1) + '\n');
const tsj = (name, extra) => ({ type: 'tileset', name, tiledversion: '1.12.2', version: '1.10', margin: 0, spacing: 0, ...extra });

// --- tilesets in maps/. The land, its cliffs and the stairs down to the beach: tilemap1 (the elevated set, +5). Plateaus on it, their cliffs and stairs: tilemap2 (lime).
// The beach: sand.png, the old pack's sand set in the same 9x6 layout. As the game draws them.
for (const [name, img] of [['terrain', 'tilemap1'], ['terrain-high', 'tilemap2'], ['sand', 'sand']])
  json(path.join(R, `maps/${name}.tsj`), tsj(name, { image: `../assets/terrain/${img}.png`, imagewidth: 576, imageheight: 384,
    tilewidth: 64, tileheight: 64, columns: 9, tilecount: 54 }));
// foam: 192 px frames, tile 0 animated like the game; shadow: one 192 px image. tileoffset centres a 192 tile on a 64 cell.
const off = { x: -64, y: 64 };
json(path.join(R, 'maps/foam.tsj'), tsj('foam', { image: '../assets/terrain/foam.png', imagewidth: 3072, imageheight: 192,
  tilewidth: 192, tileheight: 192, columns: 16, tilecount: 16, tileoffset: off,
  tiles: [{ id: 0, animation: Array.from({ length: 16 }, (_, i) => ({ tileid: i, duration: 100 })) }] }));
json(path.join(R, 'maps/shadow.tsj'), tsj('shadow', { image: '../assets/terrain/shadow.png', imagewidth: 192, imageheight: 192,
  tilewidth: 192, tileheight: 192, columns: 1, tilecount: 1, tileoffset: off }));

// --- PNG helper: rules tileset swatches and the water tile
function png(wd, ht, px) {
  const raw = Buffer.alloc((wd * 4 + 1) * ht);
  for (let y = 0; y < ht; y++) px.copy(raw, y * (wd * 4 + 1) + 1, y * wd * 4, (y + 1) * wd * 4);
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(wd, 0); ih.writeUInt32BE(ht, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const wp = Buffer.alloc(64 * 64 * 4);
for (let i = 0; i < 64 * 64; i++) wp.set([0x47, 0xab, 0xa9, 255], i * 4);
w(path.join(T, 'water.png'), png(64, 64, wp));
json(path.join(R, 'maps/water.tsj'), tsj('water', { image: '../tiled/water.png', imagewidth: 64, imageheight: 64, tilewidth: 64, tileheight: 64, columns: 1, tilecount: 1 }));

// --- rules tileset: Tiled's own "AutoMap Rules" tileset (MatchType property), drawn here as flat swatches
const MT = ['Negate', 'Ignore', 'NonEmpty', 'Empty', 'Other'];
const COL = [[200, 60, 60], [150, 150, 150], [70, 170, 70], [240, 240, 240], [70, 110, 200]];
const px = Buffer.alloc(160 * 32 * 4);
for (let y = 0; y < 32; y++) for (let x = 0; x < 160; x++) {
  const edge = (x & 31) < 2 || (x & 31) > 29 || y < 2 || y > 29;
  px.set(edge ? [0, 0, 0, 255] : [...COL[x >> 5], 255], (y * 160 + x) * 4);
}
w(path.join(T, 'automap-rules.png'), png(160, 32, px));
json(path.join(T, 'automap-rules.tsj'), tsj('AutoMap Rules', { image: 'automap-rules.png', imagewidth: 160, imageheight: 32, tilewidth: 32, tileheight: 32,
  columns: 5, tilecount: 5, tiles: MT.map((v, id) => ({ id, properties: [{ name: 'MatchType', type: 'string', value: v }] })) }));

// --- rule maps. A rule = { pos: [[layer,dx,dy,gid]], neg: [[layer,dx,dy]], out: [[layer,dx,dy,gid]] } on a rw x rh region.
// pos: the cell must hold that tile (NON = any tile). neg: the cell must be empty. (Tiled 1.12.2's "Empty" match tile
// never fires, so "empty" is written as an inputnot_ layer.) out: write that tile.
const RULES_FIRST = 300, NON = RULES_FIRST + 2;
const gid = (set, i) => F[set] + i;
function ruleMap(rw, rh, rules) {
  const per = rw + 1, cols = Math.ceil(Math.sqrt(rules.length)), rows = Math.ceil(rules.length / cols);
  const W = 1 + cols * per, H = 1 + rows * (rh + 1), layers = new Map();
  const L = name => { if (!layers.has(name)) layers.set(name, new Array(W * H).fill(0)); return layers.get(name); };
  const reg = L('regions');
  rules.forEach((r, k) => {
    const ox = 1 + (k % cols) * per, oy = 1 + Math.floor(k / cols) * (rh + 1), at = (dx, dy) => (oy + dy) * W + ox + dx;
    for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) reg[at(dx, dy)] = NON;
    const put = (name, dx, dy, g) => { const a = L(name); if (a[at(dx, dy)]) throw new Error('rule ' + k + ': two tiles in ' + name); a[at(dx, dy)] = g; };
    r.pos.forEach(([l, dx, dy, g]) => put('input_' + l, dx, dy, g));
    r.neg.forEach(([l, dx, dy]) => put('inputnot_' + l, dx, dy, NON));
    r.out.forEach(([l, dx, dy, g]) => put('output_' + l, dx, dy, g));
  });
  return {
    type: 'map', version: '1.10', tiledversion: '1.12.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: W, height: H, tilewidth: 64, tileheight: 64, nextlayerid: layers.size + 1, nextobjectid: 1,
    properties: [{ name: 'MatchOutsideMap', type: 'bool', value: true }, { name: 'NoOverlappingRules', type: 'bool', value: false }],
    tilesets: [...C.tilesets('../../maps/').filter(t => !/objects/.test(t.source)), { firstgid: RULES_FIRST, source: '../automap-rules.tsj' }],
    layers: [...layers].map(([name, data], i) => ({ id: i + 1, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data })),
  };
}

// the game's autotile(): present neighbours n,s,e,w -> tile index in the 4x4 block
const tile = (n, s, e, ww) => (n ? (s ? 1 : 2) : (s ? 0 : 3)) * 9 + (ww ? (e ? 1 : 2) : (e ? 0 : 3));
const FOAM = gid('foam', 0), SHADOW = gid('shadow', 0), SAND = gid('sand', 10);
const bit = (k, i) => (k >> i) & 1;
// neighbour presence of layer l around (cx, cy) as pos/neg lists, for pattern k = n | s<<1 | e<<2 | w<<3
function around(l, cx, cy, k) {
  const pos = [], neg = [];
  [[0, -1], [0, 1], [1, 0], [-1, 0]].forEach(([dx, dy], i) => (bit(k, i) ? pos.push([l, cx + dx, cy + dy, NON]) : neg.push([l, cx + dx, cy + dy])));
  return { pos, neg };
}
const BEACH = 'Beach (preview)', FOAML = 'Foam (preview)';

// The beach (src/terrain.js baseOf): every cell that is land, a stair, painted Sand, or within 1 cell (8 neighbours) of the land, a stair or a cliff cell (the cell under
// a Ground cell), and is not painted Water. Rule 1 marks them on the Beach layer (the same sand tile everywhere); rule 2 turns the marks into the edge pieces and puts foam on the
// coast. Each rule says "this neighbour is a seed" (3 kinds) for one of the 9 cells round the middle (1, 2); the region is 3 x 4 for the cell above a neighbour.
const footprint = [];
for (let ny = 1; ny <= 3; ny++) for (let nx = 0; nx <= 2; nx++) for (const [l, x, y] of [['Ground', nx, ny], ['Stairs', nx, ny], ['Ground', nx, ny - 1]])
  footprint.push({ pos: [[l, x, y, NON]], neg: [['Water', 1, 2]], out: [[BEACH, 1, 2, SAND]] });
footprint.push({ pos: [['Sand', 1, 2, NON]], neg: [['Water', 1, 2]], out: [[BEACH, 1, 2, SAND]] });
const beach = [];
for (let k = 0; k < 16; k++) {
  const a = around(BEACH, 1, 1, k);
  beach.push({ pos: [[BEACH, 1, 1, NON], ...a.pos], neg: a.neg, out: [[BEACH, 1, 1, gid('sand', tile(bit(k, 0), bit(k, 1), bit(k, 2), bit(k, 3)))], ...(k === 15 ? [] : [[FOAML, 1, 1, FOAM]])] });
}

// The two tiers, each one level on the one below: the land (Ground, elevated set of tilemap1, over the beach) and a plateau (Raised, tilemap2, over the land).
// layer = the painted mask, set = its tileset, shadow = the layer its shadow goes in (one cell below), down = what its cliff stands on (row 4 on it, row 5 in water).
const TIERS = [{ name: 'ground', layer: 'Ground', set: 'low', shadow: 'Land shadows (preview)', down: BEACH }, { name: 'raised', layer: 'Raised', set: 'high', shadow: 'Shadows (preview)', down: 'Ground' }];
// autotile in place (elevated set, +5) and a shadow one cell below
const autotile = t => Array.from({ length: 16 }, (_, k) => {
  const a = around(t.layer, 1, 1, k);
  return { pos: [[t.layer, 1, 1, NON], ...a.pos], neg: a.neg, out: [[t.layer, 1, 1, gid(t.set, tile(bit(k, 0), bit(k, 1), bit(k, 2), bit(k, 3)) + 5)], [t.shadow, 1, 2, SHADOW]] };
});
// the centre piece (15) replaces the edge piece beside a stair top (36 / 39) of the tier, so the cliff goes on under the stair
const centre = t => [36, 39].flatMap(s => [0, 2].map(dx => ({ pos: [[t.layer, 1, 0, NON], ['Stairs', dx, 0, gid(t.set, s)]], neg: [], out: [[t.layer, 1, 0, gid(t.set, 15)]] })));

// Cliffs: at (x, y+1) under a cell (x, y) of the tier whose lower cell is neither the tier nor a stair. Row 4 on ground, row 5 (plus foam) in water. A side "continues" if
// its upper cell is the tier or a stair top and its lower cell isn't the tier. Each side is split into disjoint cases, because a rule can only say "this tile" or "empty", not "anything but".
// (ponytail: a stair of the other tier beside the cliff row counts as no stair here; it only happens at a land corner that also holds a plateau)
const SS = ['t36', 't39', 'e', 's45', 's48'], isTop = s => s[0] === 't';
function cliffs(t) {
  const stairAt = (s, dx, dy) => (s === 'e' ? { pos: [], neg: [['Stairs', dx, dy]] } : { pos: [['Stairs', dx, dy, gid(t.set, +s.slice(1))]], neg: [] });
  const sides = sc => {
    const cases = [{ cont: true, pos: [[t.layer, sc, 0, NON]], neg: [[t.layer, sc, 1]] }, { cont: false, pos: [[t.layer, sc, 0, NON], [t.layer, sc, 1, NON]], neg: [] }];
    for (const s of SS) {
      const st = stairAt(s, sc, 0), top = isTop(s);
      cases.push({ cont: top, pos: st.pos, neg: [[t.layer, sc, 0], ...st.neg, ...(top ? [[t.layer, sc, 1]] : [])] });
      if (top) cases.push({ cont: false, pos: [...st.pos, [t.layer, sc, 1, NON]], neg: [[t.layer, sc, 0]] });
    }
    return cases;
  };
  const out = [];
  for (const l of sides(0)) for (const r of sides(2)) for (const g of [true, false]) {
    const col = l.cont ? (r.cont ? 1 : 2) : (r.cont ? 0 : 3);
    out.push({
      pos: [[t.layer, 1, 0, NON], ...(g ? [[t.down, 1, 1, NON]] : []), ...l.pos, ...r.pos],
      neg: [[t.layer, 1, 1], ['Stairs', 1, 1], ...(g ? [] : [[t.down, 1, 1]]), ...l.neg, ...r.neg],
      out: [['Cliffs (preview)', 1, 1, gid(t.set, (g ? 4 : 5) * 9 + col + 5)], ...(g ? [] : [[FOAML, 1, 1, FOAM]])],
    });
  }
  return out;
}

// rule files, run in this order (each one reads what the ones before wrote): beach marks, beach pieces + foam, then per tier the autotile, the centre piece and the cliffs
const files = [['beach-marks', 3, 4, footprint], ['beach', 3, 3, beach]];
for (const t of TIERS) files.push([t.name, 3, 3, autotile(t)], [t.name + '-stairs', 3, 1, centre(t)], [t.name + '-cliffs', 3, 2, cliffs(t)]);
for (const f of fs.readdirSync(path.join(T, 'rules'))) fs.unlinkSync(path.join(T, 'rules', f));
for (const [name, rw, rh, rules] of files) json(path.join(T, `rules/${name}.tmj`), ruleMap(rw, rh, rules));
w(path.join(T, 'rules.txt'), files.map(f => `rules/${f[0]}.tmj\n`).join(''));
console.log('rules written:', files.map(f => f[0] + ' ' + f[3].length).join(', '));
module.exports = { files };
