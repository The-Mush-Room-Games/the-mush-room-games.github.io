// node test/camp-check.js : the camp rule (open -> closed -> cleared, for good), the fence ring and its gates, the power-up card draw (weights, no
// duplicates, stack limits), stacking and island scaling, and that the test map's camp is built and reachable.
const fs = require('fs'), path = require('path'), assert = require('assert');
Object.assign(globalThis, require('../src/data.js'), require('../src/powers.js'));
const { campNext, ringPieces } = require('../src/camp.js');
const { ASSETS } = require('../src/assets.js');
const { readMap } = require('../src/tmj.js');
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-9, (m || '') + ' ' + a + ' vs ' + b);

// the camp rule: closes when the hero's feet are inside, clears when no enemy that started inside is left, never closes again
assert.strictEqual(campNext('open', false, 4), 'open', 'outside: stays open');
assert.strictEqual(campNext('open', true, 4), 'closed', 'feet inside: closes');
assert.strictEqual(campNext('closed', false, 4), 'closed', 'a closed camp stays closed with the hero out of its rect');
assert.strictEqual(campNext('closed', true, 1), 'closed', 'one gnome left');
assert.strictEqual(campNext('closed', true, 0), 'cleared', 'all dead: clears');
for (const inside of [true, false]) for (const alive of [0, 3]) assert.strictEqual(campNext('cleared', inside, alive), 'cleared', 'cleared is for good');
let st = 'open'; for (const [inside, alive] of [[false, 4], [true, 4], [true, 2], [false, 2], [false, 0], [true, 0], [true, 5]]) st = campNext(st, inside, alive);
assert.strictEqual(st, 'cleared', 'a walk through the whole fight');

// the ring around cells 29-34 x 14-19 with gates at (32,13) and (31,20): 8x8 cells minus the 6x6 inside
const ring = ringPieces(29, 14, 34, 19, [{ c0: 32, r0: 13, c1: 32, r1: 13 }, { c0: 31, r0: 20, c1: 31, r1: 20 }]), at = (c, r) => ring.find(p => p.c === c && p.r === r);
assert.strictEqual(ring.length, 8 * 8 - 6 * 6);
assert.strictEqual(new Set(ring.map(p => p.c + ',' + p.r)).size, ring.length, 'one piece per cell');
assert(ring.every(p => p.c >= 28 && p.c <= 35 && p.r >= 13 && p.r <= 20 && !(p.c >= 29 && p.c <= 34 && p.r >= 14 && p.r <= 19)), 'only ring cells');
assert.deepStrictEqual(ring.filter(p => p.gate).map(p => [p.c, p.r]).sort(), [[31, 20], [32, 13]], 'gate pieces only where the gates are');
assert.deepStrictEqual(['tl', 'tr', 'bl', 'br'].map(t => ring.filter(p => p.type === t).length), [1, 1, 1, 1], 'four corners');
assert.deepStrictEqual([at(28, 13).type, at(35, 13).type, at(28, 20).type, at(35, 20).type], ['tl', 'tr', 'bl', 'br']);
assert.deepStrictEqual([at(31, 13).type, at(33, 13).type, at(32, 13).type], ['endL', 'endR', 'hz0'], 'posts beside the north gate, the gate piece is a plain run piece');
assert.deepStrictEqual([at(30, 20).type, at(32, 20).type, at(31, 20).type], ['endL', 'endR', 'hz1'], 'and beside the south gate');
assert(ring.filter(p => p.c === 28 && p.r > 13 && p.r < 20).every(p => p.type === 'vl') && ring.filter(p => p.c === 35 && p.r > 13 && p.r < 20).every(p => p.type === 'vr'), 'sides');
assert(ring.every(p => FENCE[p.type] && FENCE[p.type][1].every(b => b[0] >= 0 && b[2] <= 64 && b[1] >= 0 && b[3] <= 64 && b[0] < b[2] && b[1] < b[3])), 'every piece has a frame and bands inside its 64 px tile');
assert.strictEqual(ringPieces(5, 5, 6, 6).filter(p => p.gate).length, 0, 'no gates, no gate pieces');
// a gate on the side of the ring (a vertical gap) and a 2-wide one
const side = ringPieces(10, 10, 15, 15, [{ c0: 9, r0: 12, c1: 9, r1: 13 }]);
assert.deepStrictEqual(side.filter(p => p.gate).map(p => p.type + p.r), ['vl12', 'vl13']);

// the cards: n distinct ids, never an `off` one, never one at its max, drawn by rarity weight
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
assert(!POWERUPS.ducks.off && POWERUPS.ducks.stat === 'sense' && powerPool([]).includes('ducks'), 'Duck Sense is in the pool and is a kept stat');
for (let i = 0; i < 5000; i++) { const d = drawCards(3, [], rnd); assert.strictEqual(new Set(d).size, 3, 'three distinct: ' + d); assert(d.every(id => POWERUPS[id] && !POWERUPS[id].off)) }
const full = [{ id: 'twin', k: 1 }, { id: 'twin', k: 1 }, { id: 'echo', k: 1 }, { id: 'pockets', k: 1 }];
for (let i = 0; i < 2000; i++) assert(!drawCards(3, full, rnd).some(id => ['twin', 'echo', 'pockets'].includes(id)), 'maxed power-ups are not offered');
assert.strictEqual(drawCards(3, [], () => 0.999999).length, 3);
assert.strictEqual(powerPool([]).length, Object.keys(POWERUPS).filter(id => !POWERUPS[id].off).length, 'the whole list but the off ones');
assert.strictEqual(drawCards(30, [], rnd).length, powerPool([]).length, 'asking for more than there is gives the pool');
const first = { common: 0, uncommon: 0, rare: 0 }, N = 60000;                       // the first card of a draw: each id weighs its rarity's weight
for (let i = 0; i < N; i++) first[POWERUPS[drawCards(1, [], rnd)[0]].rarity]++;
const per = { common: 0, uncommon: 0, rare: 0 }; for (const id of powerPool([])) per[POWERUPS[id].rarity]++;
const tot = Object.keys(per).reduce((a, r) => a + per[r] * RARITY[r].weight, 0);
for (const r of Object.keys(per)) { const want = per[r] * RARITY[r].weight / tot; assert(Math.abs(first[r] / N - want) < 0.01, `${r}: ${first[r] / N} vs ${want}`) }
assert(first.common > first.uncommon && first.uncommon > first.rare, 'common > uncommon > rare');
assert.deepStrictEqual(Object.keys(RARITY).map(r => RARITY[r].ribbon), ['blue', 'yellow', 'purple'], 'ribbon colours');
assert(RARITY.rare.special && !RARITY.common.special && !RARITY.uncommon.special, 'only rare cards sit on paper_special');
assert(Object.keys(POWERUPS).filter(id => POWERUPS[id].rarity === 'common').length === 6 && Object.keys(POWERUPS).filter(id => POWERUPS[id].rarity === 'uncommon').length === 4, 'the plan: 6 common, 4 uncommon');

// stacking and stats
const own = []; for (const id of ['damage', 'damage', 'damage', 'vigor', 'vigor', 'swift', 'quick', 'greed', 'recharge', 'reach', 'shove', 'feast']) assert(addPower(own, id, 1));
const s = powerStats(own);
near(s.dmg, 1.45, 'dmg'); assert.strictEqual(s.hp, 2); near(s.speed, 1.1); near(s.swing, 1.15); near(s.gold, 1.25); near(s.dashRate, 1.3); near(s.reach, 1.25); near(s.kb, 1.5); assert.strictEqual(s.meat, 2);
assert.deepStrictEqual([s.charges, s.twice, s.thorns, s.slots], [1, 0, 0, 0], 'no rare ones yet');
assert.deepStrictEqual(powerStats([]), STAT0, 'nothing owned = STAT0');
assert.deepStrictEqual(powerCounts(own), [['damage', 3], ['vigor', 2], ['swift', 1], ['quick', 1], ['greed', 1], ['recharge', 1], ['reach', 1], ['shove', 1], ['feast', 1]]);
const r = []; for (const id of ['twin', 'twin', 'echo', 'thorns', 'thorns', 'pockets']) addPower(r, id);
assert.deepStrictEqual([addPower(r, 'twin'), addPower(r, 'echo'), addPower(r, 'pockets'), addPower(r, 'thorns')], [false, false, false, true], 'max stacks: 2 dash charges more, twin strike and pockets once, thorns no limit');
const rs = powerStats(r); assert.deepStrictEqual([rs.charges, rs.twice, rs.thorns, rs.slots], [3, 1, 3, 1]);
assert(addPower(own, 'heal') && own.length === 12, 'Second Wind is instant: taken, not kept');
assert(!addPower([], 'nope'));

// island scaling: the % cards grow with the island and keep the strength they had when taken; flat ones do not
near(powerK(1), 1); near(powerK(2), 1.1); near(powerK(6), 1.5); near(powerK(500), POWER_SCALE.cap); near(powerK(), 1);
const a = [], b = []; addPower(a, 'damage', 1); addPower(a, 'vigor', 5); addPower(b, 'damage', 5); addPower(b, 'vigor', 5);
near(powerStats(a).dmg, 1.15); near(powerStats(b).dmg, 1.21); assert.strictEqual(powerStats(b).hp, 1, '+1 max HP is +1 on any island');
const both = [{ id: 'damage', k: 1 }, { id: 'damage', k: 1.4 }]; near(powerStats(both).dmg, 1 + 0.15 + 0.21);
assert.strictEqual(powerText('damage', 1), '+15% damage'); assert.strictEqual(powerText('damage', 3), '+18% damage'); assert.strictEqual(powerText('shove', 1), 'Knockback +50%');
assert.strictEqual(powerText('pockets'), '+1 item slot'); assert.strictEqual(powerText('echo', 9), 'Every swing hits twice');
// every card: a rarity, a short name and one line, art that Boot loads
for (const [id, p] of Object.entries(POWERUPS)) {
  assert(RARITY[p.rarity], id + ' rarity'); assert(p.name && p.name.length <= 14, id + ' name: ' + p.name); assert(powerText(id).length <= 30 && !/\n|\{/.test(powerText(id)), id + ' one line: ' + powerText(id));
  assert(p.icon[0] in ASSETS, id + ' icon ' + p.icon[0]); assert(p.stat || p.full || p.off, id + ' does something'); assert(!p.stat || p.stat in STAT0, id + ' stat');
}

// the test map's camp
const root = path.join(__dirname, '..');
readMap('maps/test.tmj', async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))).then(m => {
  const T = 64, camps = m.objects.filter(o => o.cls === 'camp' && o.props.kind !== 'boss'), allGates = m.objects.filter(o => o.cls === 'gate');
  assert.strictEqual(camps.length, 1); assert.strictEqual(m.objects.filter(o => o.cls === 'camp').length, 2, 'the gnome camp and the boss arena');
  const gates = allGates.filter(g => g.x >= camps[0].x - T && g.x <= camps[0].x + camps[0].w && g.y >= camps[0].y - T && g.y <= camps[0].y + camps[0].h);   // the gnome camp's own
  assert.strictEqual(gates.length, 2, 'two gates'); assert.strictEqual(allGates.length, 4);
  const c = camps[0], c0 = c.x / T, r0 = c.y / T, c1 = (c.x + c.w) / T - 1, r1 = (c.y + c.h) / T - 1;
  assert([c.x, c.y, c.w, c.h].every(v => v % T === 0), 'tile-aligned');
  const cells = gates.map(g => ({ c0: g.x / T, r0: g.y / T, c1: (g.x + g.w) / T - 1, r1: (g.y + g.h) / T - 1 }));
  const ringT = ringPieces(c0, r0, c1, r1, cells);
  assert.strictEqual(ringT.filter(p => p.gate).length, 2, 'both gates are on the ring');
  assert(ringT.every(p => m.ground[p.r * m.w + p.c] && !m.raised[p.r * m.w + p.c]), 'the whole ring (and the gate cells) stands on low ground');
  const inside = o => o.x >= c.x && o.x < c.x + c.w && o.y > c.y && o.y <= c.y + c.h + 64;       // gnome art stands on its feet row, a cell above its bottom
  const gnomes = m.objects.filter(o => o.cls === 'enemy' && inside(o)).reduce((n, o) => n + (o.props.count || 1), 0);
  assert(gnomes >= 3 && gnomes <= 4, 'three or four gnomes in the camp: ' + gnomes);
  assert(m.objects.some(o => /^gnome-(hut|tower)$/.test(o.key) && inside({ x: o.x, y: o.y - 100 })), 'a gnome hut or tower inside');
  // the camp can be reached on foot from the spawn: flood the low ground (4-neighbours), then check the cells outside each gate
  const sp = m.objects.find(o => o.cls === 'spawn'), seen = new Set(), q = [[Math.floor(sp.x / T), Math.floor(sp.y / T)]];
  while (q.length) {
    const [x, y] = q.pop(), k = y * m.w + x;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h || seen.has(k) || !m.ground[k] || m.raised[k]) continue;
    seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (const g of cells) { const outer = g.r0 < r0 ? [g.c0, g.r0 - 1] : g.r0 > r1 ? [g.c0, g.r0 + 1] : g.c0 < c0 ? [g.c0 - 1, g.r0] : [g.c0 + 1, g.r0]; assert(seen.has(outer[1] * m.w + outer[0]), 'a gate is reachable from the spawn: ' + outer) }
  // the old land still works: the entrance, the doors and the field are where they were
  assert(m.objects.some(o => o.cls === 'entrance' && o.x + o.w === 20 * T) && m.objects.filter(o => o.cls === 'door').length === 2);
  console.log('camp-check OK: camp', [c0, r0, c1, r1].join(','), '| ring', ringT.length, 'pieces | gnomes', gnomes, '| pool', powerPool([]).length, 'power-ups');
}).catch(e => { console.error('FAIL', e.message); process.exit(1); });
