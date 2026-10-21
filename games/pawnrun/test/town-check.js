// node test/town-check.js : maps/town.tmj holds what the town needs (vendors, houses, gate, spawns), everything it names exists, and the terrain obeys the game's rules.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap } = require('../src/tmj.js');
const { ASSETS } = require('../src/assets.js');
const { NPCS, SHOPS, UPGRADES, YARD } = require('../src/data.js');
const root = path.join(__dirname, '..'), T = 64;
const load = async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

(async () => {
  const m = await readMap('maps/town.tmj', load), tiles = m.objects.filter(o => 'key' in o), shapes = m.objects.filter(o => !('key' in o));
  assert.deepStrictEqual([m.w, m.h], [48, 42]);
  const extra = new Set(JSON.parse(fs.readFileSync(path.join(root, 'maps/objects.tsj'), 'utf8')).tiles.map(t => t.image.split('/').pop().replace(/\.png$/i, '')));
  for (const o of tiles) assert(o.key in ASSETS || extra.has(o.key), 'unknown asset key ' + o.key);
  const land = (x, y) => { const c = Math.floor(x / T), r = Math.floor(y / T); return c >= 0 && r >= 0 && c < m.w && r < m.h && m.ground[r * m.w + c] === 1 };
  for (const o of m.objects) assert(o.x >= 0 && o.y >= 0 && o.x <= m.w * T && o.y <= m.h * T + 4 * T, 'object off the map: ' + (o.key || o.cls));

  // NPCs: every role is in data.js; the vendors, the trainer and the townsfolk are inside the houses (the doors); a Pawn is never a townsfolk
  const npcs = tiles.filter(o => o.cls === 'npc'), roles = npcs.map(o => o.props.role).sort();
  assert.deepStrictEqual(roles, ['blacksmith', 'healer', 'market', 'steward', 'trainer']);
  for (const o of npcs) { const d = NPCS[o.props.role]; assert(d, 'no NPC ' + o.props.role); assert(o.key === d.key, `${o.props.role} art ${o.key} != ${d.key}`); assert(land(o.x, o.y - 40), o.props.role + ' stands on land'); assert(!/^pawn|^opawn/.test(o.key), 'a Pawn townsfolk') }
  // each shop is on sale somewhere, every item on sale exists, and a vendor's shop is named in SHOPS
  for (const [role, d] of Object.entries(NPCS)) if (d.shop) { assert(SHOPS[d.shop], role + ' shop'); for (const id of SHOPS[d.shop]) assert(UPGRADES[id], id) }
  const sold = Object.values(SHOPS).flat(); for (const id of Object.keys(UPGRADES)) assert(sold.includes(id), id + ' is not sold anywhere');

  // buildings: the Castle, Barracks, Monastery, the Market house, two enterable houses (doors that name real rooms and NPCs), the gate's two Towers
  for (const k of ['castle', 'barracks', 'monastery', 'house2']) assert.strictEqual(tiles.filter(o => o.key === k).length, 1, k);
  assert.strictEqual(tiles.filter(o => o.key === 'tower').length, 2, 'two Towers');
  const doors = shapes.filter(o => o.cls === 'door');
  assert.strictEqual(doors.length, 2, 'two doors'); assert.deepStrictEqual(doors.map(d => d.props.npc).sort(), ['folk1', 'folk2']);
  for (const d of doors) { assert(fs.existsSync(path.join(root, d.props.interior)), d.props.interior); assert(NPCS[d.props.npc] && !/pawn/.test(NPCS[d.props.npc].key), 'door npc'); assert(/^\d+,\d+$/.test(d.props.npcAt), 'npcAt') }
  assert(tiles.some(o => o.key === 'boat') && tiles.filter(o => o.cls === 'stepstone' && o.key === 'dock').length === 2, 'pier and boat');
  const sail = shapes.filter(o => o.cls === 'sail'); assert.strictEqual(sail.length, 1, 'one sail rect');
  assert(!land(sail[0].x + sail[0].w / 2, sail[0].y + sail[0].h / 2), 'the sail rect is on the pier over water');

  // yards: every fence cell names a piece of the sheet; sheep, trees, a pig
  const fences = shapes.filter(o => o.cls === 'fence'); assert(fences.length > 40, 'fences');
  for (const f of fences) { assert(YARD[f.props.p], 'fence piece ' + f.props.p); assert.deepStrictEqual([f.w, f.h], [T, T]); assert(f.x % T === 0 && f.y % T === 0, 'fence on the grid') }
  assert(tiles.filter(o => /^sheep/.test(o.key)).length >= 4, 'sheep'); assert(tiles.filter(o => /^tree\d$/.test(o.key)).length >= 40, 'trees');
  assert(tiles.some(o => o.key === 'pig-idle'), 'a pig');

  // ?at= names: start first, the rest where the vendors are; each on land, near its vendor
  const spawns = shapes.filter(o => o.cls === 'spawn'), names = spawns.map(o => o.name);
  assert.strictEqual(names[0], 'start');
  for (const n of ['gate', 'blacksmith', 'healer', 'market', 'steward', 'trainer', 'beach', 'houseA', 'houseB']) assert(names.includes(n), 'spawn ' + n);
  for (const s of spawns) assert(land(s.x, s.y), 'spawn on land: ' + s.name);
  for (const r of ['blacksmith', 'healer', 'market', 'steward', 'trainer']) {
    const s = spawns.find(o => o.name === r), n = npcs.find(o => o.props.role === r);
    assert(Math.hypot(s.x - n.x, s.y - n.y) < 220, `spawn ${r} is ${Math.round(Math.hypot(s.x - n.x, s.y - n.y))} px from its NPC`);
  }
  // terrain: no ground over water, the beach has sand to wake on (its spawn is next to water)
  for (let i = 0; i < m.w * m.h; i++) assert(!(m.water[i] && m.ground[i]));
  const b = spawns.find(o => o.name === 'beach'); let wet = false;
  for (let dx = -3; dx <= 3; dx++) if (!land(b.x + dx * T, b.y)) wet = true;
  assert(wet, 'the beach is by the sea');
  console.log('town-check ok:', m.objects.length, 'objects,', fences.length, 'fence cells,', npcs.length, 'NPCs');
})().catch(e => { console.error(e); process.exit(1) });
