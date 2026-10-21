// node test/town-check.js : maps/town.tmj holds what the town needs (vendors, houses, gate, spawns), everything it names exists, and the terrain obeys the game's rules.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap } = require('../src/tmj.js'), TR = require('../src/terrain.js'), SEAL = require('../tiled/seal.js');
const { ASSETS } = require('../src/assets.js');
const { NPCS, SHOPS, UPGRADES, YARD } = require('../src/data.js');
const root = path.join(__dirname, '..'), T = 64;
const load = async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

(async () => {
  const m = await readMap('maps/town.tmj', load), tiles = m.objects.filter(o => 'key' in o), shapes = m.objects.filter(o => !('key' in o));
  assert.deepStrictEqual([m.w, m.h], [48, 44]);
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
  for (const s of spawns) assert(s.name === 'beach' ? !land(s.x, s.y) : land(s.x, s.y), (s.name === 'beach' ? 'the beach spawn is on the sand: ' : 'spawn on land: ') + s.name);
  for (const r of ['blacksmith', 'healer', 'market', 'steward', 'trainer']) {
    const s = spawns.find(o => o.name === r), n = npcs.find(o => o.props.role === r);
    assert(Math.hypot(s.x - n.x, s.y - n.y) < 220, `spawn ${r} is ${Math.round(Math.hypot(s.x - n.x, s.y - n.y))} px from its NPC`);
  }
  // terrain: no ground over water; the beach spawn is on sand (level -1) by the sea and the sand reaches the stairs up to the town and the pier's first plank, and the stairs climb
  for (let i = 0; i < m.w * m.h; i++) assert(!(m.water[i] && m.ground[i]));
  const b = spawns.find(o => o.name === 'beach'), wg = TR.walkGrids(m), lv = TR.heightGrid(m), stones = SEAL.stonesOf(m), ok = (x, y) => TR.feetOk(m, wg, -1, x, y, stones);
  assert(TR.levelAt(lv, m.w, b.x, b.y) === -1 && ok(b.x, b.y), 'the hero wakes up standing on the sand');
  assert([-3, 3].some(dx => !TR.baseOf(m)[Math.floor(b.y / T) * m.w + Math.floor((b.x + dx * T) / T)]), 'the beach is by the sea');
  const ramps = TR.rampsOf(m); assert.strictEqual(ramps.length, 2, 'two stairs down to the sand'); assert(ramps.every(r => r.lo === -1 && r.hi === 0));
  const seen = new Set(), q = [[Math.floor(b.x / T), Math.floor(b.y / T)]];                      // flood the sand cells (centre of each cell, or a bit lower where the sea edge stops the first)
  while (q.length) { const [x, y] = q.pop(), k = y * m.w + x; if (x < 0 || y < 0 || x >= m.w || y >= m.h || seen.has(k) || !(ok(x * T + 32, y * T + 32) || ok(x * T + 32, y * T + 52))) continue; seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]) }
  for (const r of ramps) assert(seen.has(r.footCell[1] * m.w + r.footCell[0]), 'the sand reaches the foot of the stairs at ' + r.footCell);
  for (const r of ramps) {                                                                    // up the stairs from the sand onto the town's land
    const u = { x: r.F.x, y: r.F.y, high: -1, rail: null }, okU = (w, x, y) => TR.feetOk(m, wg, w.high, x, y);
    for (let i = 0; i < 300; i++) [u.x, u.y] = TR.moveFeet(ramps, okU, u, -r.side * 2.5, 0);
    assert(u.high === 0 && okU(u, u.x, u.y), 'the stairs at ' + r.footCell + ' climb onto the land');
  }
  const plank = tiles.filter(o => o.key === 'dock').sort((p, q) => p.y - q.y)[0], pc = [Math.floor(plank.x / T), Math.floor((plank.y - 158 + 12) / T)];
  assert(seen.has(pc[1] * m.w + pc[0]), 'the sand reaches the pier: ' + pc); const sc = [Math.floor((sail[0].x + sail[0].w / 2) / T), Math.floor((sail[0].y + sail[0].h / 2) / T)]; assert(seen.has(sc[1] * m.w + sc[0]), 'and the planks lead on to the sail rect: ' + sc); assert(!m.ground[pc[1] * m.w + pc[0]] && TR.baseOf(m)[pc[1] * m.w + pc[0]], 'the pier starts on the beach, not on the land');
  console.log('town-check ok:', m.objects.length, 'objects,', fences.length, 'fence cells,', npcs.length, 'NPCs');
})().catch(e => { console.error(e); process.exit(1) });
