// node test/tmj-check.js : reads maps/test.tmj through src/tmj.js and checks what the game relies on.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap } = require('../src/tmj.js');
const root = path.join(__dirname, '..');
const loadJson = async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

(async () => {
  const m = await readMap('maps/test.tmj', loadJson);
  assert.deepStrictEqual([m.w, m.h], [20, 16]);

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

  const gnome = one(tiles, o => o.cls === 'enemy', 'enemy');
  assert.strictEqual(gnome.key, 'gnome-idle');
  assert.deepStrictEqual(gnome.props, { kind: 'gnome-idle', count: 2 });
  const sec = one(tiles, o => o.cls === 'secret', 'secret');
  assert(sec.key.startsWith('tree') && sec.props.kind === 'tree');

  const spawn = one(shapes, o => o.cls === 'spawn', 'spawn');
  assert.deepStrictEqual([spawn.w, spawn.h], [0, 0]);
  const ent = one(shapes, o => o.cls === 'entrance', 'entrance');
  assert(ent.w > 0 && ent.h > 0 && ent.x + ent.w === m.w * 64, 'entrance on the east edge');
  const loot = one(shapes, o => o.cls === 'loot', 'loot');
  assert.strictEqual(loot.props.kind, 'duck');

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
    assert(r.images.length >= 1 && r.images.every(i => fs.existsSync(path.join(root, i.image))), 'interior images exist: ' + JSON.stringify(r.images.map(i => i.image)));
    const of = c => r.objects.filter(o => o.cls === c);
    const floors = of('floor'), blocks = of('block'), [spawn] = of('spawn'), [exit] = of('exit');
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

  console.log('tmj-check OK:', m.objects.length, 'objects,',
    ['ground', 'raised', 'stairs', 'water'].map(k => k + '=' + m[k].reduce((a, b) => a + b, 0)).join(' '));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
