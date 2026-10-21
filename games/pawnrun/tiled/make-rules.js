// Generates the Tiled side of terrain: tilesets, Automapping rules, rules tileset. Re-runnable: node tiled/make-rules.js
//   Paint any grass tile on Ground / Raised; Tiled swaps in the right edge piece (the game's autotile rule) and
//   fills the preview layers the game draws at load: Foam, Shadows, Cliffs. The game ignores those layers.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const C = require('./common.js');
const T = __dirname, R = path.join(T, '..'), F = C.FIRST;
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const json = (f, o) => w(f, JSON.stringify(o, null, 1) + '\n');
const tsj = (name, extra) => ({ type: 'tileset', name, tiledversion: '1.12.2', version: '1.10', margin: 0, spacing: 0, ...extra });

// --- tilesets in maps/. Flat ground: tilemap1. Raised ground, cliffs, stairs: tilemap2 (lime), as the game draws them.
for (const [name, img] of [['terrain', 'tilemap1'], ['terrain-high', 'tilemap2']])
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
const FOAM = gid('foam', 0), SHADOW = gid('shadow', 0);
const bit = (k, i) => (k >> i) & 1;
// neighbour presence of layer l around (cx, cy) as pos/neg lists, for pattern k = n | s<<1 | e<<2 | w<<3
function around(l, cx, cy, k) {
  const pos = [], neg = [];
  [[0, -1], [0, 1], [1, 0], [-1, 0]].forEach(([dx, dy], i) => (bit(k, i) ? pos.push([l, cx + dx, cy + dy, NON]) : neg.push([l, cx + dx, cy + dy])));
  return { pos, neg };
}

// Ground: autotile in place + foam under every shore cell (a neighbour is not Ground)
const ground = [];
for (let k = 0; k < 16; k++) {
  const a = around('Ground', 1, 1, k);
  ground.push({ pos: [['Ground', 1, 1, NON], ...a.pos], neg: a.neg,
    out: [['Ground', 1, 1, gid('low', tile(bit(k, 0), bit(k, 1), bit(k, 2), bit(k, 3)))], ...(k === 15 ? [] : [['Foam (preview)', 1, 1, FOAM]])] });
}

// stairs next to a cell: states of the Stairs cell (36/39 = stair top, e = none, 45/48 = stair bottom)
const SS = ['t36', 't39', 'e', 's45', 's48'], isTop = s => s[0] === 't';
const stairAt = (s, dx, dy) => (s === 'e' ? { pos: [], neg: [['Stairs', dx, dy]] } : { pos: [['Stairs', dx, dy, gid('high', +s.slice(1))]], neg: [] });

// Raised: autotile in place (elevated set, +5), centre piece 15 beside a stair top, and a shadow one cell below
const raised = [];
for (const l of SS) for (const r of SS) {
  const sl = stairAt(l, 0, 1), sr = stairAt(r, 2, 1), shadow = ['Shadows (preview)', 1, 2, SHADOW];
  if (isTop(l) || isTop(r)) { raised.push({ pos: [['Raised', 1, 1, NON], ...sl.pos, ...sr.pos], neg: [...sl.neg, ...sr.neg], out: [['Raised', 1, 1, gid('high', 15)], shadow] }); continue; }
  for (let k = 0; k < 16; k++) {
    const a = around('Raised', 1, 1, k);
    raised.push({ pos: [['Raised', 1, 1, NON], ...a.pos, ...sl.pos, ...sr.pos], neg: [...a.neg, ...sl.neg, ...sr.neg],
      out: [['Raised', 1, 1, gid('high', tile(bit(k, 0), bit(k, 1), bit(k, 2), bit(k, 3)) + 5)], shadow] });
  }
}

// Cliffs: at (x, y+1) under a Raised cell (x, y) whose lower cell is neither Raised nor Stairs. Row 4 on ground, row 5
// (plus foam) in water. A side "continues" if its upper cell is Raised or a stair top and its lower cell isn't Raised.
// Each side is split into disjoint cases, because a rule can only say "this tile" or "empty", not "anything but".
function sides(sc) {
  const cases = [{ cont: true, pos: [['Raised', sc, 0, NON]], neg: [['Raised', sc, 1]] },
                 { cont: false, pos: [['Raised', sc, 0, NON], ['Raised', sc, 1, NON]], neg: [] }];
  for (const s of SS) {
    const st = stairAt(s, sc, 0), top = isTop(s);
    cases.push({ cont: top, pos: st.pos, neg: [['Raised', sc, 0], ...st.neg, ...(top ? [['Raised', sc, 1]] : [])] });
    if (top) cases.push({ cont: false, pos: [...st.pos, ['Raised', sc, 1, NON]], neg: [['Raised', sc, 0]] });
  }
  return cases;
}
const cliffs = [];
for (const l of sides(0)) for (const r of sides(2)) for (const g of [true, false]) {
  const col = l.cont ? (r.cont ? 1 : 2) : (r.cont ? 0 : 3);
  cliffs.push({
    pos: [['Raised', 1, 0, NON], ...(g ? [['Ground', 1, 1, NON]] : []), ...l.pos, ...r.pos],
    neg: [['Raised', 1, 1], ['Stairs', 1, 1], ...(g ? [] : [['Ground', 1, 1]]), ...l.neg, ...r.neg],
    out: [['Cliffs (preview)', 1, 1, gid('high', (g ? 4 : 5) * 9 + col + 5)], ...(g ? [] : [['Foam (preview)', 1, 1, FOAM]])],
  });
}

json(path.join(T, 'rules/ground.tmj'), ruleMap(3, 3, ground));
json(path.join(T, 'rules/raised.tmj'), ruleMap(3, 3, raised));
json(path.join(T, 'rules/cliffs.tmj'), ruleMap(3, 2, cliffs));
w(path.join(T, 'rules.txt'), 'rules/ground.tmj\nrules/raised.tmj\nrules/cliffs.tmj\n');
console.log('rules written:', ground.length, 'ground,', raised.length, 'raised,', cliffs.length, 'cliff rules');
