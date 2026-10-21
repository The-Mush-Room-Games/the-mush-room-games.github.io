// node test/boss-check.js : the new enemies and the Bear, pure rules only (no browser): island scaling, the spider's gait, the slingshot gnome's distance band,
// the acorn's flight and where it stops, the Bear's phase and move picker, the drop tables, the boat prompt, and the test map's arena, dock, routes and ?at= points.
const fs = require('fs'), path = require('path'), assert = require('assert');
Object.assign(globalThis, require('../src/data.js'), require('../src/powers.js'));
const E = require('../src/enemies.js'), { rollDrops } = require('../src/loot.js'), { boatState } = require('../src/boat.js');
const { ASSETS, ANIMS } = require('../src/assets.js'), { readMap } = require('../src/tmj.js'), { campSpec } = require('../src/camp.js'), SEAL = require('../tiled/seal.js');
const { walkGrids, feetOk, baseOf, levelAt, heightGrid, T } = require('../src/terrain.js');
const near = (a, b, e = 1e-9, m = '') => assert(Math.abs(a - b) < e, m + ' ' + a + ' vs ' + b);
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

// island scaling: island 1 is the table, then hp x (1 + 0.35 per island above 1), damage x (1 + 0.34 per island), rounded, never under 1
assert.deepStrictEqual([1, 2, 3, 6].map(i => E.enemyHp(4, i)), [4, 5, 7, 11]);
assert.deepStrictEqual([1, 2, 3, 4, 6].map(i => E.enemyDmg(1, i)), [1, 1, 2, 2, 3]);
assert.strictEqual(E.enemyHp(4), 4); assert.strictEqual(E.enemyHp(0.1, 1), 1, 'never under 1');
for (const [k, d] of Object.entries(ENEMIES)) { assert(E.enemyHp(d.hp, 2) >= E.enemyHp(d.hp, 1), k + ' grows with the island') }

// every enemy: art Boot loads, animations that exist, a drop table, sane numbers
for (const [k, d] of Object.entries(ENEMIES)) {
  for (const a of [d.idle, d.run, d.attack]) assert(a in ASSETS || a in ANIMS, k + ' art ' + a);
  assert(DROPS[d.drops], k + ' has a drop table'); assert(d.hp > 0 && d.hurtbox.length === 4 && d.originY > 0.4 && d.originY < 1, k);
  if (d.boss) assert(d.boss.avatar in ASSETS);
}
assert(DROPS.snake && DROPS.spider && DROPS.slingshot && DROPS.bear);

// snake: a coil on frame `lunge.frame`, then a lunge of speed x time px, which is more than its reach less the hit range: it does cross the gap
const sn = ENEMIES.snake, L = sn.lunge;
assert(L.speed * L.time >= sn.reach - sn.hitRange, 'the lunge covers the distance from its reach to a hit'); assert(L.speed > 4 * sn.speed, 'a lunge is far faster than its walk');
assert(L.frame < 3 && L.coil > 0.2, 'a visible coil (the attack art: coil 0-2, strike 3-5)');

// spider: bursts and rests, in the right proportion (check 20 s of frames)
const sp = ENEMIES.spider, g = { go: false, t: 0 }; let moving = 0, tot = 0, flips = 0, prev = false;
for (let i = 0; i < 20 * 60; i++) { const go = E.gaitStep(g, 1 / 60, sp.gait); moving += go; tot++; if (go !== prev) flips++; prev = go }
near(moving / tot, sp.gait.burst / (sp.gait.burst + sp.gait.rest), 0.02, 'moving share');
assert(flips >= 2 * 20 / (sp.gait.burst + sp.gait.rest) - 3, 'bursts: ' + flips); assert(sp.speed > 2 * ENEMIES.gnome.speed && sp.hp < ENEMIES.gnome.hp, 'fast and low hp');

// slingshot gnome: backs off under `near`, closes in past `far`, stands in the band
const sl = ENEMIES.slingshot;
assert.deepStrictEqual([0, 100, 191, 192, 250, 320, 321, 500].map(d => E.slingMove(d, sl)), [-1, -1, -1, 0, 0, 0, 1, 1]);
assert(sl.near >= 3 * T && sl.far <= 5 * T && sl.reach <= sl.far && sl.shot.range > sl.far, 'keeps 3-5 tiles, and the acorn outranges where it stands');
// the acorn flies in a straight line at its speed, stops at its range, and at the first blocked point (checked every 6 px, so it cannot skip a thin wall)
const acorn = (vx, vy, left) => ({ x: 0, y: 0, vx, vy, left, end: null });
let a = acorn(240, 0, 448); E.acornStep(a, 1, () => false); near(a.x, 240, 1e-6); assert.strictEqual(a.end, null); near(a.left, 208, 1e-6);
E.acornStep(a, 1, () => false); assert.strictEqual(a.end, 'range'); near(a.x, 448, 1e-6, 'stops exactly at its range');
a = acorn(0, -240, 448); E.acornStep(a, 1, (x, y) => y <= -100); assert.strictEqual(a.end, 'wall'); assert(a.y <= -100 && a.y > -107, 'stops within a step of the wall: ' + a.y);
a = acorn(240, 0, 448); E.acornStep(a, 0.5, (x, y) => x >= 118 && x < 121); assert.strictEqual(a.end, 'wall', 'a 3 px wall is not skipped');
a = acorn(3, 4, 100); E.acornStep(a, 1, () => false); near(Math.hypot(a.x, a.y), 5, 1e-9, 'any direction'); near(a.y / a.x, 4 / 3, 1e-9);
a = acorn(240, 0, 0); E.acornStep(a, 0.1, () => false); assert.strictEqual(a.end, 'range', 'no range left: gone at once');
a = acorn(240, 0, 448); a.end = 'wall'; E.acornStep(a, 1, () => false); assert.strictEqual(a.x, 0, 'an ended acorn does not move');
const hero = { x: 100, y: 100, high: false, dead: false };
assert(E.acornHits({ x: 110, y: 100, high: false, sh: sl.shot }, hero) && !E.acornHits({ x: 130, y: 100, high: false, sh: sl.shot }, hero), 'a circle of shot.r around his feet');
assert(!E.acornHits({ x: 100, y: 100, high: true, sh: sl.shot }, hero), 'not across levels'); assert(!E.acornHits({ x: 100, y: 100, high: false, sh: sl.shot }, { ...hero, dead: true }));

// the Bear: the phase rule, the speed / telegraph factors, and the move picker
const B = ENEMIES.bear.boss;
assert.deepStrictEqual([1, 0.9, 0.51, 0.5, 0.49, 0.1].map(f => E.bossPhase(f * 100, 100, B)), [1, 1, 1, 1, 2, 2], 'phase 2 below half hp');
assert.deepStrictEqual(E.bossK(1, B), { speed: 1, tele: 1 }); assert(E.bossK(2, B).speed > 1 && E.bossK(2, B).tele < 1, 'phase 2: faster, shorter telegraphs');
const tally = (dist, last, phase, n = 20000) => { const c = { swipe: 0, charge: 0, slam: 0 }; for (let i = 0; i < n; i++) c[E.bossMove(rnd, dist, last, B, phase)]++; return c };
const close = tally(100, null, 1), far = tally(400, null, 1);
assert(close.swipe > close.slam && close.slam > 0 && close.charge === 0, 'close: mostly swipes, some slams, never a charge from point-blank ' + JSON.stringify(close));
assert.strictEqual(tally(B.charge.min - 5, null, 1, 2000).charge, 0, 'no charge closer than charge.min, however the weights are'); assert.strictEqual(tally(200, null, 1, 2000).slam, 2000, 'between the swipe and the charge: only the slam');
assert.strictEqual(far.swipe, 0, 'far away: no swipe'); assert(far.charge > far.slam && far.slam > 0);
const total = Object.values(B.weights.near).reduce((x, y) => x + y, 0); near(close.swipe / 20000, B.weights.near.swipe / total, 0.02, 'weights');
for (const dist of [100, 400]) for (const last of ['swipe', 'charge', 'slam']) assert.strictEqual(tally(dist, last, 1, 3000)[last], dist === 400 && last === 'swipe' ? 0 : 0, 'never the same move twice: ' + dist + last);
assert.strictEqual(tally(400, 'charge', 1, 500).slam, 500, 'far, after a charge: the slam is the only option left');
assert(tally(400, 'swipe', 2, 500).charge > 0, 'last = a move that is not an option is ignored');
const p1 = tally(100, null, 1), p2 = tally(100, null, 2);
assert(p2.slam > p1.slam && p2.swipe < p1.swipe, 'phase 2 favours the slam over the swipe');
assert.strictEqual(E.bossMove(() => 0.999999, 100, null, B, 1), 'slam', 'the last with weight is reachable'); assert.strictEqual(E.bossMove(() => 0, 100, null, B, 1), 'swipe');
assert(B.charge.dist > 6 * T / 1.5 && B.charge.hitR > 60 && B.charge.tele >= 0.9, 'the charge is readable: a long telegraph'); assert(B.slam.w > 8);
assert(B.slam.r >= 2.5 * T && B.slam.r <= 3.5 * T, 'the ring is small enough to walk out of: ' + B.slam.r); assert(B.slam.r / B.slam.speed >= 0.7, 'and takes a while to grow');
for (const k of ['swipe', 'charge', 'slam']) { assert.strictEqual(B[k].dmg, 1, k + ' hurts for 1'); assert(B[k].tele >= 0.7, k + ' has a telegraph you can read'); assert(B[k].rec >= 0.8, k + ' leaves a punish window') }
assert(B.charge.stun >= 1.2, 'a crash into a wall stuns it long enough to hit'); assert(B.keep >= 100 && B.walk <= 130, 'it stops at keep and walks, not runs');
assert(B.resist < 0.3 && B.p2At === 0.5);

// kill time with the starting axe: hp / damage per swing x seconds per swing. Dodging and waiting out the rests roughly triples it; the aim is 30-40 s in play
const axe = WEAPONS.axe, swing = 6 / (10 * axe.speed) + axe.recover, perfect = ENEMIES.bear.hp / axe.damage * swing;
assert(perfect >= 8 && perfect <= 14, 'perfect play is about 10 s of swings: ' + perfect.toFixed(1)); assert(perfect * 3 >= 28 && perfect * 3 <= 42, 'about 30-40 s with dodging');
const hammer = WEAPONS.hammer, hs = 6 / (10 * hammer.speed) + hammer.recover; assert(ENEMIES.bear.hp / hammer.damage * hs < perfect, 'a hammer is quicker, as it should be');

// drops: three ducks, gold, a tier-2 weapon (any one the hero can use)
const bd = rollDrops(DROPS.bear, rnd);
assert.strictEqual(bd.filter(d => d.kind === 'duck').length, 3); assert(bd.some(d => d.kind === 'weapon' && d.weapon === 'any' && d.tier === 2)); assert(bd.some(d => d.kind === 'gold' && d.n >= 10));
assert.deepStrictEqual(rollDrops([{ kind: 'weapon', weapon: 'axe' }], rnd), [{ kind: 'weapon', n: 1, weapon: 'axe', tier: 0 }]);
for (const k of ['snake', 'spider', 'slingshot']) assert(rollDrops(DROPS[k], () => 0).some(d => d.kind === 'gold'), k + ' drops gold');

// the boat prompt
assert.deepStrictEqual([[false, false], [true, false], [false, true], [true, true]].map(([o, n]) => boatState(o, n)), ['hidden', 'hidden', 'locked', 'board']);

// the test map: the arena, the dock and the routes
readMap('maps/test.tmj', async p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'))).then(m => {
  const gates = m.objects.filter(o => o.cls === 'gate'), campO = m.objects.filter(o => o.cls === 'camp'), arenaO = campO.find(o => o.props.kind === 'boss'), gnomeO = campO.find(o => o.props.kind !== 'boss');
  const bs = campSpec(arenaO, gates, T, m.w), gs = campSpec(gnomeO, gates, T, m.w), xy = i => [i % m.w, Math.floor(i / m.w)], cs = [...bs.cells].map(xy);
  const c0 = Math.min(...cs.map(c => c[0])), c1 = Math.max(...cs.map(c => c[0])), r0 = Math.min(...cs.map(c => c[1])), r1 = Math.max(...cs.map(c => c[1]));
  assert(c1 - c0 + 1 >= 16 && r1 - r0 + 1 >= 14 && bs.cells.size >= 200, 'the arena is at least 16 x 14 and 200 cells: ' + (c1 - c0 + 1) + 'x' + (r1 - r0 + 1) + ', ' + bs.cells.size);
  const ok = (c, r) => m.ground[r * m.w + c] === 1 && !m.raised[r * m.w + c] && !m.stairs[r * m.w + c];
  for (const [c, r] of cs) assert(ok(c, r), `flat low ground at ${c},${r} inside the arena`);
  const inside = (o, dy = -8) => bs.cells.has(Math.floor((o.y + dy) / T) * m.w + Math.floor(o.x / T));
  const foes = m.objects.filter(o => o.cls === 'enemy' && inside(o, -80)); assert.deepStrictEqual(foes.map(o => o.key), ['bear-idle'], 'nothing in the arena but the Bear');
  const open = o => [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => bs.cells.has(Math.floor((o.y - 8) / T + dy) * m.w + Math.floor(o.x / T + dx))));
  const clusters = m.objects.filter(o => o.key === 'rock4' && open(o)).length; assert(clusters >= 2 && clusters <= 3, 'two or three rock clusters to crash into: ' + clusters);
  assert.strictEqual(bs.gaps.length, 1, 'one gap'); const gap = bs.gaps[0], bear = foes[0];
  assert(gap.cells.every(([, r]) => r <= r0 + 1), 'the gap is in the north wall'); const near = Math.min(...gap.cells.map(([c, r]) => Math.hypot((c + 0.5) * T - bear.x, (r + 0.5) * T - (bear.y - 80))));
  assert(near >= 8 * T, 'the Bear starts far from the gap: ' + Math.round(near / T) + ' tiles');
  // the shore: water along the south edge, the dock's planks start on land and run out over the water, and the boat floats beside it
  const dock = m.objects.find(o => o.key === 'dock'), boat = m.objects.find(o => o.cls === 'boat'), zone = m.objects.find(o => o.cls === 'dock' && o.w > 0);
  assert(dock && dock.cls === 'stepstone' && boat && boat.key === 'boat' && zone, 'a dock (feet may stand on it), a boat and a dock zone');
  const dc = Math.floor(dock.x / T), top = Math.floor((dock.y - 158 + 8) / T);
  assert(baseOf(m)[top * m.w + dc] && !m.ground[top * m.w + dc] && m.ground[(top - 2) * m.w + dc], 'the planks start on the beach under the arena cliff at col ' + dc + ' row ' + top);
  assert(!baseOf(m)[(top + 2) * m.w + dc], 'and run over the water'); assert(cs.some(([c, r]) => !m.ground[(r + 2) * m.w + c]), 'the arena has water along its south edge');
  assert(!m.ground[Math.floor(boat.x / T) + Math.floor((boat.y - 128) / T) * m.w], 'the boat floats on water'); assert(boat.x > dock.x + 33 && boat.x - dock.x < 3 * T, 'beside the dock');
  assert(zone.x <= dock.x && zone.x + zone.w >= dock.x && zone.y < dock.y && zone.y + zone.h > dock.y - 158, 'the dock zone is on the planks');
  assert(m.objects.filter(o => o.cls === 'enemy' && o.key === 'bear-idle').length === 1, 'one bear');
  // the way from the spawn to the arena's gap does not cross the gnome camp (tiles; the seal test in camp-check covers the walls)
  const blocked = new Set(); for (const i of gs.cells) { const [c, r] = xy(i); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blocked.add((r + dy) * m.w + c + dx) }
  const reach = (from, avoid) => { const seen = new Set(), q = [from]; while (q.length) { const [x, y] = q.pop(), k = y * m.w + x; if (x < 0 || y < 0 || x >= m.w || y >= m.h || seen.has(k) || avoid.has(k) || !ok(x, y)) continue; seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]) } return seen };
  const sp0 = m.objects.find(o => o.cls === 'spawn' && o.name === 'spawn'), seen = reach([Math.floor(sp0.x / T), Math.floor(sp0.y / T)], blocked);
  assert(gap.cells.every(([c, r]) => seen.has(r * m.w + c)), 'the arena gap is reachable from the spawn without crossing the camp');
  // the enemy areas: each kind in its own area, far from the spawn, all on land and reachable
  const kinds = {}; for (const o of m.objects.filter(o => o.cls === 'enemy')) (kinds[o.key] ||= []).push(o);
  for (const k of ['snake-idle', 'spider-idle', 'slingshot-idle']) {
    assert(kinds[k] && kinds[k].reduce((n, o) => n + (o.props.count || 1), 0) >= 3, k + ' a small group');
    for (const o of kinds[k]) { const c = Math.floor(o.x / T), r = Math.floor((o.y - 60) / T); assert(seen.has(r * m.w + c), k + ' stands on reachable land ' + c + ',' + r); assert(Math.hypot(o.x - sp0.x, o.y - sp0.y) > 20 * T, k + ' is away from the start') }
  }
  const area = k => { const xs = kinds[k].map(o => o.x / T), ys = kinds[k].map(o => o.y / T); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] };
  const [s, p, q] = ['snake-idle', 'spider-idle', 'slingshot-idle'].map(area); assert(s[0] > 43 && p[3] < 12 && q[2] > 28, 'snakes east, spiders north, slingshots south');
  // ?at= points: named spawns on land
  const at = m.objects.filter(o => o.cls === 'spawn' && o.name !== 'spawn');
  assert.deepStrictEqual(at.map(o => o.name).sort(), ['arena', 'beach', 'camp', 'dock', 'field', 'grove', 'islet', 'snakes', 'spiders']);
  const wg = walkGrids(m), stones = m.objects.filter(o => o.cls === 'stepstone' && o.key === 'dock').map(o => ({ x0: o.x - 33, y0: o.y - 158, x1: o.x + 33, y1: o.y }));
  for (const o of at) assert(feetOk(m, wg, levelAt(heightGrid(m), m.w, o.x, o.y), o.x, o.y, stones), '?at=' + o.name + ' puts the hero on walkable ground');
  console.log('boss-check OK: arena', (c1 - c0 + 1) + 'x' + (r1 - r0 + 1), bs.cells.size, 'cells | bear hp', ENEMIES.bear.hp, '| perfect axe kill', perfect.toFixed(1) + 's | ?at', at.map(o => o.name).join(','));
}).catch(e => { console.error('FAIL', e.stack.split('\n').slice(0, 3).join('\n')); process.exit(1); });
