// node test/camp-check.js : the camp rule (open -> closed -> cleared, for good), clearings as cells and gaps (fence pieces, boulders, the close trigger), the power-up card draw (weights, no
// duplicates, stack limits), stacking and island scaling, and that the test map's camp is built and reachable.
const fs = require('fs'), path = require('path'), assert = require('assert');
Object.assign(globalThis, require('../src/data.js'), require('../src/powers.js'));
const { campNext, campCells, campGaps, gapPieces, pieceRects, campSpec, campEntered, inPoly } = require('../src/camp.js'), E = require('../src/enemies.js'), SEAL = require('../tiled/seal.js'), TR = require('../src/terrain.js');
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

// cells, gaps and pieces of a clearing: a rect (cols 10-15, rows 20-23 on a 40-wide map) and an L-shaped polygon, a gate on the north and one on the east
const MW = 40, TT = 64, rect = { x: 10 * TT, y: 20 * TT, w: 6 * TT, h: 4 * TT, props: {} };
const rc = campCells(rect, TT, MW);
assert.strictEqual(rc.size, 24); assert(rc.has(20 * MW + 10) && rc.has(23 * MW + 15) && !rc.has(19 * MW + 10) && !rc.has(20 * MW + 16), 'a rect holds its cells');
const lpoly = campCells({ x: 10 * TT, y: 20 * TT, poly: [[0, 0], [256, 0], [256, 128], [128, 128], [128, 256], [0, 256]].map(([x, y]) => ({ x, y })) }, TT, MW);
assert.strictEqual(lpoly.size, 12, 'a polygon holds the cells whose centre it covers'); assert(lpoly.has(20 * MW + 13) && lpoly.has(23 * MW + 11) && !lpoly.has(22 * MW + 12) && !lpoly.has(23 * MW + 13), 'the L, not its box');
assert(inPoly([[0, 0], [10, 0], [10, 10]], 8, 2) && !inPoly([[0, 0], [10, 0], [10, 10]], 2, 8), 'even-odd, a triangle');
const gN = { x: 12 * TT, y: 19 * TT, w: 2 * TT, h: TT }, gE = { x: 16 * TT, y: 21 * TT, w: TT, h: 2 * TT }, gW = { x: 9 * TT, y: 21 * TT, w: TT, h: 2 * TT }, gFar = { x: 30 * TT, y: 5 * TT, w: 2 * TT, h: TT };
const gaps = campGaps([gN, gE, gFar], rc, TT, MW);
assert.strictEqual(gaps.length, 2, 'a gate that does not touch the inside is not a gap');
assert.deepStrictEqual(gaps.map(g => g.dir), ['h', 'v']); assert.deepStrictEqual(gaps[0].cells, [[12, 19], [13, 19]]); assert.deepStrictEqual(gaps[1].cells, [[16, 21], [16, 22]]);
assert.deepStrictEqual(gapPieces(gaps[0], rc, MW, false).map(p => p.type), ['el', 'er'], 'a run along a row: a post at each end');
assert.deepStrictEqual(gapPieces({ dir: 'h', cells: [[5, 2], [3, 2], [4, 2]] }, rc, MW, false).map(p => p.type), ['el', 'hz0', 'er'], 'a longer run: rails between the end posts, whatever the cell order');
assert.deepStrictEqual(gapPieces({ dir: 'h', cells: [[3, 2]] }, rc, MW, false).map(p => p.type), ['el', 'er'], 'a 1-cell gap: both posts in the cell');
assert.deepStrictEqual(gapPieces(gaps[1], rc, MW, false).map(p => p.type), ['vr', 'vr', 'capr'], 'inside to the west: the east side post, capped at the bottom');
assert.deepStrictEqual(gapPieces(campGaps([gW], rc, TT, MW)[0], rc, MW, false).map(p => p.type), ['vl', 'vl', 'capl'], 'inside to the east: the west side post');
assert(gapPieces(gaps[1], rc, MW, false).slice(-1)[0].r === Math.max(...gaps[1].cells.map(c => c[1])), 'the cap is on the bottom cell');
assert(pieceRects({ c: 1, r: 1, type: 'capr' }, 64).length === 0, 'a cap has no collision of its own');
assert(gapPieces(gaps[0], rc, MW, true).every(p => p.type === 'rock'), 'a boss clearing is closed with boulders');
assert.deepStrictEqual(pieceRects({ c: 12, r: 19, type: 'rock' }, TT), [{ x0: 768, y0: 1216, x1: 832, y1: 1280 }], 'a boulder fills its cell');
const hz = pieceRects({ c: 12, r: 19, type: 'hz0' }, TT); assert.deepStrictEqual(hz, [{ x0: 768, y0: 1246, x1: 832, y1: 1264 }], 'a fence run is a rail band');
assert(Object.values(FENCE).every(([, bands]) => bands.every(b => b[0] >= 0 && b[2] <= 64 && b[1] >= 0 && b[3] <= 64 && b[0] < b[2] && b[1] < b[3])), 'every fence piece has bands inside its 64 px tile');
assert(!('tl' in FENCE) && !('endL' in FENCE), 'no ring corners or posts any more');
// the close trigger: inside the clearing and a couple of tiles from every gap cell, not just across the line
const spec = campSpec(rect, [gN, gE], TT, MW), at = (c, r) => [(c + 0.5) * TT, (r + 0.5) * TT];
assert(CAMP.clear >= 2 * TT, 'a couple of tiles clear of the gap');
assert(!campEntered(spec, ...at(12, 19)), 'standing in the gap: no'); assert(!campEntered(spec, ...at(12, 20)), 'one step in: no'); assert(!campEntered(spec, ...at(13, 21)), 'two tiles in: not yet');
assert(campEntered(spec, ...at(11, 23)) && campEntered(spec, ...at(10, 22)), 'well inside'); assert(!campEntered(spec, ...at(11, 24)), 'outside the clearing'); assert(!campEntered(spec, ...at(14, 22)), 'near the east gap');
assert(spec.boss === false && campSpec({ ...rect, props: { kind: 'boss' } }, [gN], TT, MW).boss === true);
// a camp's foe sees nothing while the camp is open: the mode rule with `same` false (what Enemy.caged does) keeps it idle at any distance
for (const d of [5, 60, 200]) assert.strictEqual(E.nextMode('idle', d, false, ENEMIES.gnome, true), 'idle', 'caged foe at ' + d);
assert.strictEqual(E.nextMode('idle', 60, true, ENEMIES.gnome, true), 'chase', 'and chases once the camp is closed'); assert.strictEqual(E.nextMode('chase', 60, false, ENEMIES.gnome, true), 'idle', 'a chaser lets go');

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

// the test map's two clearings
const root = path.join(__dirname, '..');
readMap('maps/test.tmj', async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))).then(m => {
  const T = 64, camps = m.objects.filter(o => o.cls === 'camp'), gates = m.objects.filter(o => o.cls === 'gate');
  assert.strictEqual(camps.length, 2, 'the gnome camp and the boss arena'); assert(camps.every(c => c.poly && c.poly.length >= 8), 'both clearings are polygons, not boxes');
  const gc = camps.find(o => o.props.kind !== 'boss'), bc = camps.find(o => o.props.kind === 'boss'), gs = campSpec(gc, gates, T, m.w), bs = campSpec(bc, gates, T, m.w);
  for (const sp of [gs, bs]) {
    assert(sp.gaps.length >= 1 && sp.gaps.length <= 2, 'one or two gaps'); assert(sp.gaps.every(g => g.cells.length >= 2 && g.cells.length <= 3), 'each gap is 2-3 tiles');
    for (const i of sp.cells) assert(m.ground[i] && !m.raised[i] && !m.stairs[i], 'the inside is low ground, cell ' + i);
    for (const g of sp.gaps) for (const [c, r] of g.cells) assert((m.ground[r * m.w + c] || (sp.boss && m.stairs[r * m.w + c])) && !m.raised[r * m.w + c], 'a gap is open ground (or the arena\'s stairs)');
  }
  assert.strictEqual(gates.length, gs.gaps.length + bs.gaps.length, 'every gate is a gap of one clearing');
  const cellOf = (x, y) => Math.floor(y / T) * m.w + Math.floor(x / T), inside = (sp, o, dy = -8) => sp.cells.has(cellOf(o.x, o.y + dy));
  const gnomes = m.objects.filter(o => o.cls === 'enemy' && o.key === 'gnome-idle' && inside(gs, o, -80)).reduce((n, o) => n + (o.props.count || 1), 0);   // art stands on its feet row, 65 px above its bottom
  assert(gnomes >= 3 && gnomes <= 4, 'three or four gnomes in the camp: ' + gnomes);
  assert(m.objects.some(o => /^gnome-(hut|tower)$/.test(o.key) && inside(gs, o, -40)), 'a gnome hut or tower inside');
  assert(m.objects.filter(o => o.cls === 'enemy' && o.key === 'bear-idle' && inside(bs, o, -80)).length === 1, 'the Bear is in its clearing');
  assert(m.objects.filter(o => o.cls === 'block').length > 30, 'the walls are made of block rects under the trees and rocks');
  // the seal test: the real terrain and object collision, a 4 px lattice of the hero's feet box. Closed: nothing gets out. Open: the outside is reachable. And it can fail.
  const rects = SEAL.mapRects(m), stones = SEAL.stonesOf(m);
  for (const [name, sp] of [['gnome', gs], ['boss', bs]]) {
    const r = SEAL.sealReport(m, sp, rects, stones);
    assert.deepStrictEqual(r.reached, sp.gaps.map(() => true), name + ': with the gaps open the cell beyond every gap is reachable');
    assert.strictEqual(r.leaks, 0, name + ': closed, nothing escapes (first leak ' + r.first + ')'); assert(r.area > 5000, name + ' has room: ' + r.area);
    assert(SEAL.sealReport(m, { ...sp, gaps: [] }, rects, stones).leaks > 1000, name + ': without its gap pieces the clearing leaks (the test can fail)');
    assert(SEAL.sealReport(m, sp, SEAL.mapRects({ ...m, objects: m.objects.filter(o => o.cls !== 'block') }), stones).leaks > 1000, name + ': without the block rects the walls leak');
  }
  // both clearings can be walked into from the spawn (gaps open): flood the feet box from it
  const sp0 = m.objects.find(o => o.cls === 'spawn' && o.name === 'spawn'), fl = SEAL.flood(m, rects, stones, [[sp0.x, sp0.y]]);
  for (const [name, sp] of [['gnome', gs], ['boss', bs]]) for (const g of sp.gaps) assert(g.cells.some(([c, r]) => fl.has((c + 0.5) * T, (r + 0.5) * T)), name + ': a gap is reachable on foot from the spawn');
  assert([...gs.cells].some(i => fl.has((i % m.w + 0.5) * T, (Math.floor(i / m.w) + 0.5) * T)) && [...bs.cells].some(i => fl.has((i % m.w + 0.5) * T, (Math.floor(i / m.w) + 0.5) * T)), 'and so is the inside');
  // the old land still works: the entrance, the doors and the field are where they were
  assert(m.objects.some(o => o.cls === 'entrance' && o.x + o.w === 20 * T) && m.objects.filter(o => o.cls === 'door').length === 2);
  console.log('camp-check OK: gnome', gs.cells.size, 'cells,', gs.gaps.length, 'gaps | boss', bs.cells.size, 'cells,', bs.gaps.length, 'gap | gnomes', gnomes, '| seal ok | pool', powerPool([]).length, 'power-ups');
}).catch(e => { console.error('FAIL', e.stack.split('\n').slice(0, 3).join('\n')); process.exit(1); });
