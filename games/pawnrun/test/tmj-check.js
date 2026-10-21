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

  // every tile object has a known asset key (when assets.js exists)
  const af = path.join(root, 'src/assets.js');
  if (fs.existsSync(af)) {
    const { ASSETS } = require(af);
    for (const o of m.objects) if ('key' in o) assert(o.key in ASSETS, 'unknown asset key ' + o.key);
  }
  const tiles = m.objects.filter(o => 'key' in o), shapes = m.objects.filter(o => !('key' in o));
  assert(tiles.length >= 10 && tiles.every(o => o.key && Number.isFinite(o.x) && Number.isFinite(o.y) && Array.isArray(o.block)), 'tile objects');
  const one = (list, f, what) => { const r = list.filter(f); assert.strictEqual(r.length, 1, what + ' x' + r.length); return r[0]; };

  const house = one(tiles, o => o.key === 'house1', 'house');
  assert.deepStrictEqual(house.block, [2, 2]);
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

  console.log('tmj-check OK:', m.objects.length, 'objects,',
    ['ground', 'raised', 'stairs', 'water'].map(k => k + '=' + m[k].reduce((a, b) => a + b, 0)).join(' '));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
