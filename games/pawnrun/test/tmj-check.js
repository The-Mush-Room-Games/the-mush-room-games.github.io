// node test/tmj-check.js : reads maps/test.tmj through src/tmj.js and checks what the game relies on.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap, roomShape } = require('../src/tmj.js');
const root = path.join(__dirname, '..');
const loadJson = async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

(async () => {
  const m = await readMap('maps/test.tmj', loadJson);
  assert.deepStrictEqual([m.w, m.h], [40, 26]);

  for (const k of ['ground', 'raised', 'stairs', 'water']) {
    assert(m[k] instanceof Uint8Array && m[k].length === m.w * m.h, k + ' size');
    assert(m[k].some(v => v === 1), k + ' empty');
  }
  assert(m.stairTiles instanceof Int16Array && m.stairTiles.length === m.w * m.h, 'stairTiles size');
  for (let i = 0; i < m.w * m.h; i++) {
    if (m.raised[i]) assert(m.ground[i], 'raised outside ground at ' + i);
    assert(!(m.water[i] && m.ground[i]), 'water on land at ' + i);
    if (m.stairs[i]) assert([36, 45, 39, 48].includes(m.stairTiles[i]), 'bad stair tile ' + m.stairTiles[i]);
    else assert.strictEqual(m.stairTiles[i], -1);
  }
  const st = [...m.stairTiles].filter(v => v >= 0);
  assert.deepStrictEqual(st, [36, 45], 'one left stair, top then bottom');

  assert.strictEqual(m.cls, 'chunk');
  assert.deepStrictEqual(m.props, { biomes: 'forest', kind: 'landmark', minIsland: 1, mirror: false, weight: 1 }, JSON.stringify(m.props));

  // every tile object has a key Boot loads: listed in assets.js, or art added to objects.tsj in Tiled (named after its file)
  const af = path.join(root, 'src/assets.js');
  if (fs.existsSync(af)) {
    const { ASSETS } = require(af);
    const ts = JSON.parse(fs.readFileSync(path.join(root, 'maps/objects.tsj'), 'utf8')).tiles;
    const extra = new Set(ts.map(t => t.image.split('/').pop().replace(/\.png$/i, '')));
    for (const o of m.objects) if ('key' in o) assert(o.key in ASSETS || extra.has(o.key), 'unknown asset key ' + o.key);
    assert(m.objects.some(o => o.key && !(o.key in ASSETS)), 'test map should hold one Tiled-only art object (pig-idle)');
  }
  const tiles = m.objects.filter(o => 'key' in o), shapes = m.objects.filter(o => !('key' in o));
  assert(tiles.length >= 10 && tiles.every(o => o.key && Number.isFinite(o.x) && Number.isFinite(o.y) && Array.isArray(o.block)), 'tile objects');
  const one = (list, f, what) => { const r = list.filter(f); assert.strictEqual(r.length, 1, what + ' x' + r.length); return r[0]; };

  const houses = tiles.filter(o => o.key === 'house1');
  assert.strictEqual(houses.length, 2, 'two enterable houses');
  assert.deepStrictEqual(houses[0].block, [2, 2]);
  assert.deepStrictEqual(one(tiles, o => o.key === 'tree2', 'tree2').block, [1, 1]);
  assert.deepStrictEqual(one(tiles, o => o.key === 'bush1', 'bush1').block, [0, 0]);

  const gnome = one(tiles, o => o.cls === 'enemy' && o.x < 24 * 64, 'the island gnome pack');   // the camp's gnomes are in camp-check
  assert.strictEqual(gnome.key, 'gnome-idle');
  assert.deepStrictEqual(gnome.props, { kind: 'gnome-idle', count: 2 });
  // secrets and resources: a choppable tree (north tip), the pocket's tree, a rock pile (2 rocks), a plug of 3 rocks and a rock on the tiny islet
  const secs = tiles.filter(o => o.cls === 'secret');
  assert.deepStrictEqual(secs.map(o => o.props.kind + ':' + o.key.replace(/\d$/, '')).sort(), Array(6).fill('rock:rock').concat(['tree:tree', 'tree:tree']));
  assert.strictEqual(tiles.filter(o => /^gold-stone\d$/.test(o.key)).length, 3, 'three gold stones');
  assert.strictEqual(tiles.filter(o => o.cls === 'stepstone').length, 4, 'four stepping stones');
  assert(tiles.filter(o => o.cls === 'stepstone').every(o => /^water-rocks\d$/.test(o.key)), 'stepping stones are Water Rocks');
  assert.strictEqual(tiles.filter(o => /^sheep/.test(o.key)).length, 3, 'three sheep');

  const spawn = one(shapes, o => o.cls === 'spawn', 'spawn');
  assert.deepStrictEqual([spawn.w, spawn.h], [0, 0]);
  const ent = one(shapes, o => o.cls === 'entrance', 'entrance');
  assert(ent.w > 0 && ent.h > 0 && ent.x + ent.w === 20 * 64, 'entrance on the first island\'s east edge');
  const lootOf = k => shapes.filter(o => o.cls === 'loot' && o.props.kind === k);
  assert.strictEqual(lootOf('duck').length, 2, 'a duck in the open and one in the tree pocket');
  assert.deepStrictEqual(lootOf('gold').map(o => o.props.n).sort((a, b) => a - b), [5, 8, 10, 12], 'gold behind the rocks and on the islet');
  assert.strictEqual(lootOf('meat').length, 3, 'two behind secrets and one in the camp meadow');
  // weapons (tier 1 axe, tier 2 hammer, a pickaxe the old Pawn can't use) and one-use items on the field
  const ws = lootOf('weapon').map(o => o.props.weapon + o.props.tier).sort();
  assert.deepStrictEqual(ws, ['axe1', 'hammer2', 'pickaxe0']);
  assert.strictEqual(lootOf('dynamite').length, 2, '2 dynamite'); assert.strictEqual(lootOf('bomb').length, 1, '1 bomb');
  const cellOf = o => [Math.floor(o.x / 64), Math.floor(o.y / 64)];
  for (const o of [...lootOf('weapon'), ...lootOf('dynamite'), ...lootOf('bomb')]) assert(m.ground[cellOf(o)[1] * m.w + cellOf(o)[0]], 'pickup on land ' + o.props.kind + cellOf(o));
  // the blast-only islet: land at cols 13-14, rows 24-25 with 2 water tiles (rows 22-23) between it and the field above, and a rock pile on it
  const g = (x, y) => m.ground[y * m.w + x];
  assert(g(13, 24) && g(14, 25) && !g(13, 22) && !g(13, 23) && g(13, 21), 'islet two tiles south of the field');
  assert(tiles.some(o => o.cls === 'secret' && o.key === 'rock2' && o.x === 13 * 64 + 32 && o.y === 26 * 64), 'a rock pile on the islet');

  // each house has a door rect over its doorway (inside the house's art) naming an interior map that reads and is playable
  const doors = shapes.filter(o => o.cls === 'door');
  assert.strictEqual(doors.length, 2);
  for (const h of houses) {
    const d = doors.filter(d => d.x >= h.x - 64 && d.x + d.w <= h.x + 64 && d.y >= h.y - 192 && d.y < h.y);
    assert.strictEqual(d.length, 1, 'one door per house');
  }
  for (const d of doors) {
    assert(d.w > 0 && d.h > 0 && d.props.interior, 'door needs a rect and an interior');
    const r = await readMap(d.props.interior, loadJson);
    assert.strictEqual(r.cls, 'interior');
    assert.strictEqual(r.tw, 48);
    const art = [...r.images, ...r.objects, ...r.tileLayers.flatMap(l => l.tiles)].map(i => i.image).filter(Boolean);
    assert(r.images.length + r.tileLayers.length >= 1 && art.every(f => fs.existsSync(path.join(root, f))), 'interior images exist: ' + art);
    const of = c => r.objects.filter(o => o.cls === c);
    const { floors, blocks } = roomShape(r), [spawn] = of('spawn'), [exit] = of('exit');
    assert(floors.length && spawn && exit && of('spawn').length === 1 && of('exit').length === 1, 'floor, spawn, exit');
    const inside = (rs, x, y) => rs.some(f => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
    assert(inside(floors, spawn.x, spawn.y) && !inside(blocks, spawn.x, spawn.y), 'spawn stands on free floor');
    assert(inside(floors, exit.x + exit.w / 2, exit.y + exit.h / 2), 'the exit can be reached on the floor');
    const g = r.images.map(i => i.props.depth || 'under');
    assert(g.every(v => ['under', 'sort', 'over'].includes(v)), 'image depth: ' + g);
  }
  const A = await readMap('maps/interiors/house_a.tmj', loadJson);
  assert.deepStrictEqual(A.images.map(i => [i.name, i.image, i.props.depth || 'under']),
    [['Layer_1', 'assets/interiors/house_a_1.png', 'under'], ['Layer_2', 'assets/interiors/house_a_2.png', 'sort']]);
  assert.strictEqual(A.objects.filter(o => o.cls === 'block').length, 12);

  // House B: a room built from tile layers (Room_Builder tilesets) and furniture tile objects, collision from the tiles' own shapes
  const B = await readMap('maps/interiors/house_b.tmj', loadJson), bs = roomShape(B);
  assert.deepStrictEqual(B.tileLayers.map(l => l.name), ['floor', 'walls']);
  const [fl, wl] = B.tileLayers, cell = (l, c, r) => l.tiles.find(t => t.col === c && t.row === r);
  assert.deepStrictEqual([B.w, B.h], [12, 10]);
  assert.strictEqual(fl.tiles.length, 10 * 6 + 4, '10 x 6 floor + 2 x 2 in the gap');
  assert(fl.tiles.every(t => !t.rects.length), 'floor tiles do not block');
  const cap = cell(wl, 1, 8), north = cell(wl, 1, 0), west = cell(wl, 0, 4);
  assert.deepStrictEqual(cap.rects, [{ x: 0, y: 0, w: 48, h: 18 }], 'the south cap blocks only its drawn 18 px');
  assert.deepStrictEqual(north.rects, [{ x: 0, y: 0, w: 48, h: 48 }]);
  assert.deepStrictEqual([west.image, west.sx, west.sy], ['assets/interiors/Room_Builder_3d_walls_48x48.png', 48, 240], 'west strip = sheet tile (1,5)');
  assert(!cell(wl, 5, 8) && !cell(wl, 6, 8) && cell(fl, 5, 8) && cell(fl, 6, 9), 'two-tile gap in the south wall');
  const furn = B.objects.filter(o => o.image && o.image.includes('/furniture/'));
  assert.deepStrictEqual(furn.map(o => o.key).sort(), ['armoire', 'bed', 'bookshelf', 'fireplace', 'jar1', 'jar2', 'jar2', 'jar3', 'rug', 'table']);
  for (const o of furn) assert.strictEqual(o.rects.length, o.key === 'rug' ? 0 : 1, o.key + ' collision shape');
  assert.strictEqual(furn.find(o => o.key === 'rug').props.depth, 'under');
  const free = (x, y) => bs.floors.some(f => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) && !bs.blocks.some(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  assert(free(288, 330) && free(288, 420) && free(288, 460), 'a path from the spawn out through the gap');
  assert(!free(96, 200) && !free(288, 250) && !free(288, 130) && !free(100, 392) && !free(200, 392), 'bed, table, fireplace, cap: solid');
  assert(free(288, 300) && free(150, 300) && free(430, 200), 'open floor stays open');

  console.log('tmj-check OK:', m.objects.length, 'objects,',
    ['ground', 'raised', 'stairs', 'water'].map(k => k + '=' + m[k].reduce((a, b) => a + b, 0)).join(' '));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
