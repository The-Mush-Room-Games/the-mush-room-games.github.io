// node test/boss-check.js : the new enemies and the Bear, pure rules only (no browser): island scaling, the spider's gait, the slingshot gnome's distance band,
// the acorn's flight and where it stops, the Bear's phase and move picker, the drop tables, the boat prompt, and the test map's arena, dock, routes and ?at= points.
const fs = require('fs'), path = require('path'), assert = require('assert');
Object.assign(globalThis, require('../src/data.js'), require('../src/powers.js'));
const E = require('../src/enemies.js'), { rollDrops } = require('../src/loot.js'), { boatState } = require('../src/boat.js');
const { ASSETS, ANIMS } = require('../src/assets.js'), { readMap } = require('../src/tmj.js'), { ringPieces } = require('../src/camp.js');
const { walkGrids, feetOk, T } = require('../src/terrain.js');
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
assert(close.swipe > close.slam && close.slam > close.charge && close.charge > 0, 'close: mostly swipes, some slams, rare charges ' + JSON.stringify(close));
assert.strictEqual(far.swipe, 0, 'far away: no swipe'); assert(far.charge > far.slam && far.slam > 0);
const total = Object.values(B.weights.near).reduce((x, y) => x + y, 0); near(close.swipe / 20000, B.weights.near.swipe / total, 0.02, 'weights');
for (const dist of [100, 400]) for (const last of ['swipe', 'charge', 'slam']) assert.strictEqual(tally(dist, last, 1, 3000)[last], dist === 400 && last === 'swipe' ? 0 : 0, 'never the same move twice: ' + dist + last);
assert.strictEqual(tally(400, 'charge', 1, 500).slam, 500, 'far, after a charge: the slam is the only option left');
assert(tally(400, 'swipe', 2, 500).charge > 0, 'last = a move that is not an option is ignored');
const p1 = tally(100, null, 1), p2 = tally(100, null, 2);
assert(p2.charge / 20000 > p1.charge / 20000 && p2.slam / 20000 > p1.slam / 20000 && p2.swipe / 20000 < p1.swipe / 20000, 'phase 2 favours charge and slam');
assert.strictEqual(E.bossMove(() => 0.999999, 100, null, B, 1), 'charge', 'the last in the table is reachable'); assert.strictEqual(E.bossMove(() => 0, 100, null, B, 1), 'swipe');
assert(B.charge.dist > 6 * T / 1.5 && B.charge.hitR > 60 && B.charge.tele >= 0.6, 'the charge is readable: a long telegraph'); assert(B.slam.r > 4 * T && B.slam.w > 8);
assert(B.resist < 0.3 && B.p2At === 0.5);

// kill time with the old Pawn's tier-0 axe: hp / damage per swing x seconds per swing. Dodging roughly doubles it; the aim is 30-60 s in play
const axe = WEAPONS.axe, swing = 6 / (10 * axe.speed) + axe.recover, perfect = ENEMIES.bear.hp / axe.damage * swing;
assert(perfect >= 20 && perfect <= 40, 'perfect play is about 30 s: ' + perfect.toFixed(1)); assert(perfect * 2 >= 40 && perfect * 2 <= 80);
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
  const arena = m.objects.find(o => o.cls === 'camp' && o.props.kind === 'boss'), c0 = arena.x / T, r0 = arena.y / T, c1 = (arena.x + arena.w) / T - 1, r1 = arena.y / T + arena.h / T - 1;
  assert(arena.w / T >= 16 && arena.h / T >= 14, 'the arena is at least 16 x 14: ' + arena.w / T + 'x' + arena.h / T);
  const lv = m.ground, ok = (c, r) => lv[r * m.w + c] === 1 && !m.raised[r * m.w + c] && !m.stairs[r * m.w + c];
  for (let r = r0 - 1; r <= r1 + 1; r++) for (let c = c0 - 1; c <= c1 + 1; c++) assert(ok(c, r), `flat low ground at ${c},${r} (arena and its ring)`);
  const free = m.objects.filter(o => o.key && o.x >= arena.x && o.x <= arena.x + arena.w && o.y > arena.y && o.y <= arena.y + arena.h + 80);
  assert.deepStrictEqual(free.map(o => o.key), ['bear-idle'], 'nothing in the arena but the Bear');
  const gates = m.objects.filter(o => o.cls === 'gate' && o.x >= (c0 - 1) * T && o.x <= (c1 + 1) * T && o.y >= (r0 - 1) * T && o.y <= (r1 + 1) * T);
  assert.strictEqual(gates.length, 2, 'a gate north (in) and south (the dock)');
  const cells = gates.map(g => ({ c0: g.x / T, r0: g.y / T, c1: g.x / T, r1: g.y / T })), ring = ringPieces(c0, r0, c1, r1, cells);
  assert.strictEqual(ring.filter(p => p.gate).length, 2); assert(ring.every(p => ok(p.c, p.r)), 'the ring stands on land');
  // the shore: the south ring row is the last land row, water below it, and a dock plank section + the boat out there
  const south = gates.find(g => g.y / T === r1 + 1), north = gates.find(g => g.y / T === r0 - 1);
  assert(south && north); for (let c = c0; c <= c1; c++) assert(!lv[(r1 + 2) * m.w + c], 'water below the arena at col ' + c);
  const dock = m.objects.find(o => o.key === 'dock'), boat = m.objects.find(o => o.cls === 'boat'), zone = m.objects.find(o => o.cls === 'dock' && o.w > 0);
  assert(dock && dock.cls === 'stepstone' && boat && boat.key === 'boat' && zone, 'a dock (feet may stand on it), a boat and a dock zone');
  assert(Math.abs(dock.x - (south.x + T / 2)) < 1, 'the dock leads out of the south gate'); assert(dock.y - 158 < (r1 + 1) * T + T && dock.y > (r1 + 2) * T + 64, 'it starts on the shore row and runs over the water');
  assert(!lv[Math.floor(boat.x / T) + Math.floor((boat.y - 128) / T) * m.w], 'the boat floats on water'); assert(boat.x > dock.x + 33 && boat.x - dock.x < 3 * T, 'beside the dock');
  assert(zone.x <= dock.x && zone.x + zone.w >= dock.x && zone.y >= (r1 + 1) * T, 'the dock zone is on the planks');
  assert(m.objects.some(o => o.cls === 'enemy' && o.key === 'bear-idle') && m.objects.filter(o => o.cls === 'enemy' && o.key === 'bear-idle').length === 1, 'one bear');
  // the way from the spawn to the arena's north gate is open ground (4-neighbours), round the gnome camp's fence
  const camp = m.objects.find(o => o.cls === 'camp' && o.props.kind !== 'boss'), blocked = new Set();
  for (let r = camp.y / T - 1; r <= (camp.y + camp.h) / T; r++) for (let c = camp.x / T - 1; c <= (camp.x + camp.w) / T; c++) blocked.add(r * m.w + c);   // its fence ring (and inside)
  const reach = (from, avoid) => { const seen = new Set(), q = [from]; while (q.length) { const [x, y] = q.pop(), k = y * m.w + x; if (x < 0 || y < 0 || x >= m.w || y >= m.h || seen.has(k) || avoid.has(k) || !ok(x, y)) continue; seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]) } return seen };
  const sp0 = m.objects.find(o => o.cls === 'spawn' && o.name === 'spawn'), seen = reach([Math.floor(sp0.x / T), Math.floor(sp0.y / T)], blocked);
  assert(seen.has((r0 - 2) * m.w + north.x / T), 'the arena corridor is reachable from the spawn without crossing the camp');
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
  assert.deepStrictEqual(at.map(o => o.name).sort(), ['arena', 'camp', 'dock', 'field', 'grove', 'snakes', 'spiders']);
  const wg = walkGrids(m), stones = m.objects.filter(o => o.cls === 'stepstone' && o.key === 'dock').map(o => ({ x0: o.x - 33, y0: o.y - 158, x1: o.x + 33, y1: o.y }));
  for (const o of at) assert(feetOk(m, wg, false, o.x, o.y, stones), '?at=' + o.name + ' puts the hero on walkable ground');
  console.log('boss-check OK: arena', arena.w / T + 'x' + arena.h / T, '| bear hp', ENEMIES.bear.hp, '| perfect axe kill', perfect.toFixed(1) + 's | ?at', at.map(o => o.name).join(','));
}).catch(e => { console.error('FAIL', e.stack.split('\n').slice(0, 3).join('\n')); process.exit(1); });
