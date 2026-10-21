// node test/map-check.js : the explored map's pure parts: the reveal grid, its reset rules, the terrain classes and Duck Sense.
const assert = require('assert');
Object.assign(globalThis, require('../src/data.js'), require('../src/terrain.js'));   // map.js reads these globals, as in the browser
const { readMap } = require('../src/tmj.js');
const { powerStats, addPower, drawCards } = require('../src/powers.js');
const { TILE, BLOB, revealAround, terrainClass, objectClass, senseDucks, shownDucks } = require('../src/map.js');
const fs = require('fs');

// reveal: a filled circle of radius r around the tile, clipped to the map, counting only what is new
const w = 40, h = 30, seen = new Uint8Array(w * h);
const n = revealAround(seen, w, h, 20, 15, 6.5), count = () => seen.reduce((a, v) => a + v, 0);
assert.strictEqual(n, count(), 'returns the new tiles');
assert(n > 120 && n < 140, 'a radius 6.5 circle is about 133 tiles: ' + n);
assert(seen[15 * w + 20] && seen[15 * w + 26] && seen[15 * w + 14] && seen[9 * w + 20] && seen[21 * w + 20], 'the middle and 6 tiles out on each axis');
assert(!seen[15 * w + 27] && !seen[8 * w + 20] && !seen[9 * w + 26] && !seen[21 * w + 26], 'not 7 out, not the corners');
assert.strictEqual(revealAround(seen, w, h, 20, 15), 0, 'the same spot again reveals nothing');
const more = revealAround(seen, w, h, 21, 15); assert(more > 0 && more < 20 && count() === n + more, 'a step east reveals a thin crescent: ' + more);
const corner = new Uint8Array(w * h); revealAround(corner, w, h, 0, 0); assert(corner[0] && corner[6] && !corner[7] && corner.reduce((a, v) => a + v, 0) < 50, 'clipped at the map edge, no wrap');
revealAround(new Uint8Array(w * h), w, h, -50, 99);                                          // far outside: nothing, no throw
assert(EXPLORE.reveal >= 6 && EXPLORE.reveal <= 7, 'about 6-7 tiles');

// reset rules, the way TestMap.build makes them: a fresh grid per build (death = scene.restart, new island = Sail -> scene.start), kept by a house round trip (sleep / wake never rebuilds)
const build = () => ({ seen: new Uint8Array(w * h), ducksSeen: new Set() });
const scene = build(); revealAround(scene.seen, w, h, 5, 5);
const afterHouse = scene; assert(afterHouse.seen[5 * w + 5], 'a house round trip keeps it');
const afterDeath = build(); assert(afterDeath.seen.every(v => !v), 'a death starts empty');
assert(!afterDeath.ducksSeen.size, 'and forgets the ducks');
const src = fs.readFileSync(__dirname + '/../src/scenes/TestMap.js', 'utf8');
assert(/\n  build\(m, name\) \{[\s\S]*this\.exp = \{[^}]*seen: new Uint8Array[\s\S]*\n  initInput/.test(src) && !/wake'[^\n]*\n[^\n]*this\.exp =/.test(src), 'TestMap.build creates the grid, the wake handler does not');

// terrain classes of the test map, from the same grids as the game
(async () => {
  const m = await readMap('maps/test.tmj', async p => JSON.parse(fs.readFileSync(__dirname + '/../' + p, 'utf8')));
  const cls = terrainClass(m), obj = objectClass(m), at = (x, y) => cls[y * m.w + x];
  const kinds = new Set(cls); for (const k of Object.values(TILE)) assert(kinds.has(k), 'the test map has tile class ' + k);
  assert.strictEqual(cls.length, m.w * m.h);
  assert.strictEqual(at(0, 0), TILE.WATER, 'the corner is water');
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === TILE.RAISED) assert(m.raised[i], 'raised only where the map is raised');
    if (cls[i] === TILE.WATER) assert(!m.ground[i] || m.water[i], 'water has no ground');
  }
  const o = new Set(obj); assert(o.has(BLOB.TREE) && o.has(BLOB.ROCK) && o.has(BLOB.HOUSE), 'trees, rocks and a house show up');
  const house = m.objects.find(o => /^house/.test(o.key)); assert(obj[Math.floor((house.y - 1) / T) * m.w + Math.floor(house.x / T)] === BLOB.HOUSE, 'a house marks its footing');
  assert(EXPLORE.land.length === Object.keys(TILE).length && EXPLORE.obj.length === Object.keys(BLOB).length, 'a colour for every class');
  const doors = m.objects.filter(o => o.cls === 'door' && o.props.interior); assert(doors.length, 'the test map has a door');
  console.log('map-check ok');
})().catch(e => { console.error(e); process.exit(1) });

// Duck Sense: needs the power-up; ducks within 12 tiles are remembered and stay on the map when the hero walks off; a collected one (gone from loot) is not shown
const owned = [];
assert.strictEqual(powerStats(owned).sense, 0, 'no sense without the power-up');
assert(addPower(owned, 'ducks', 3) && powerStats(owned).sense === 1, 'Duck Sense is kept and turns sense on');
assert(!addPower(owned, 'ducks', 3), 'only once');
assert(!drawCards(30, owned).includes('ducks'), 'and then it is not offered again');
const duck = (tx, ty) => ({ kind: 'duck', x: tx * T, y: ty * T }), loot = [duck(10, 10), duck(22, 10), duck(30, 30), { kind: 'gold', x: 11 * T, y: 10 * T }];
const mem = new Set(); senseDucks(loot, mem, 12 * T, 10 * T);
assert.deepStrictEqual([...mem], [loot[0], loot[1]], 'both ducks within 12 tiles (and no gold, no far duck)');
senseDucks(loot, mem, 12 * T + 12 * T, 10 * T + 1);       // 12 tiles east: the duck at 30,30 is still too far; the near ones stay remembered
assert.strictEqual(mem.size, 2, 'the far duck is not sensed, the old ones are not forgotten');
assert.deepStrictEqual(shownDucks(mem, loot), [[10, 10], [22, 10]], 'remembered ducks show');
assert.deepStrictEqual(shownDucks(mem, loot.filter(p => p !== loot[0])), [[22, 10]], 'a collected duck vanishes');
assert.strictEqual(senseDucks(loot, new Set(), 10 * T + EXPLORE.ducks * T, 10 * T).size, 2, 'exactly at the radius counts');
assert.strictEqual(senseDucks(loot, new Set(), 10 * T + EXPLORE.ducks * T + 1, 10 * T - 100 * T).size, 0, 'far away: none');
