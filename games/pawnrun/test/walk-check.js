// node test/walk-check.js : terrain rules on maps/test.tmj (left stair: top 36 at (5,6), bottom 45 at (5,7); plateau
// rows 3-6 (cols 6-11) with its cliff in row 7; a small plateau at (9..11, 9)).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap } = require('../src/tmj.js'), SEAL = require('../tiled/seal.js');
const { T, walkGrids, feetOk, rampsOf, moveFeet } = require('../src/terrain.js');
const root = path.join(__dirname, '..');

readMap('maps/test.tmj', async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))).then(m => {
  const wg = walkGrids(m), ok = (u, bx, by) => feetOk(m, wg, u.high, bx, by);   // the scene's walkable, minus object rects
  const at = (cx, cy, dx = 32, dy = 32) => [cx * T + dx, cy * T + dy];
  const ground = { high: false }, high = { high: true };
  // stairs are walls for feet boxes; the ground under a plateau's back row is free, the rows below it are not
  assert(!ok(ground, ...at(5, 7)) && !ok(high, ...at(5, 6)), 'stairs block');
  assert(ok(ground, ...at(5, 6, 20, 16)) && !ok(ground, ...at(5, 6, 36, 30)), 'the grass behind the ramp top, not the ramp');
  assert(ok(ground, ...at(10, 9, 32, 20)) && !ok(ground, ...at(10, 9, 32, 30)), 'behind the small plateau, 26px deep');
  assert(!ok(ground, ...at(10, 10, 32, 30)), 'not under it');
  assert(ok(ground, ...at(12, 4)), 'beside the big plateau');
  assert(ok(ground, ...at(7, 3, 32, 20)) && !ok(ground, ...at(7, 4, 32, 30)), 'behind the big plateau, not under it');
  assert(ok(high, ...at(7, 3, 32, 20)) && !ok(high, ...at(7, 3, 32, 10)), 'on top: feet stay 14px inside the back edge');

  // ride the ramp: walk right from anywhere in the foot cell, end up on the plateau; walk back down
  const all3 = rampsOf(m), ramps = all3.filter(r => r.hi === 1);
  assert.strictEqual(all3.length, 4, 'a plateau ramp and three beach ramps (two outside the arena, one from it down to the dock)'); assert.strictEqual(ramps.length, 1);
  for (const dy of [10, 26, 38, 50, 58]) {
    const u = { x: 4 * T + 20, y: 7 * T + dy, high: false, rail: null };
    if (!ok(u, u.x, u.y)) continue;
    let boarded = false;
    for (let i = 0; i < 200; i++) { [u.x, u.y] = moveFeet(ramps, ok, u, 2.5, 0); boarded = boarded || !!u.rail }
    assert(boarded, 'boarded from foot-cell y ' + dy);
    assert(u.high && ok(u, u.x, u.y), `on the plateau after the climb (from y ${dy}): ${u.x | 0},${u.y | 0}`);
    for (let i = 0; i < 200; i++) [u.x, u.y] = moveFeet(ramps, ok, u, -2.5, 0);
    assert(!u.high && !u.rail && ok(u, u.x, u.y), 'back on the ground, off the ramp');
  }
  const v = { x: 4 * T + 52, y: 7 * T + 30, high: false, rail: null };
  moveFeet(ramps, ok, v, 0, -2.5); assert(!v.rail, 'walking north beside the foot does not board');

  // stepping stones: the map's `stepstone` Water Rocks (art boxes measured off the PNGs) are the only footing over the 2 water tiles between the beach of the
  // two dead ends and the sand islet; a unit on the beach (level -1) or the land crosses them, each feet-box corner must be on sand, land or a stone, so gaps stop you
  const BOX = { 'water-rocks2': [7, 17, 57, 50], 'water-rocks4': [6, 14, 57, 52] };
  const stonesOf = list => list.map(o => { const [x0, y0, x1, y1] = BOX[o.key]; return { x0: o.x - 32 + x0, y0: o.y - 64 + y0, x1: o.x - 32 + x1, y1: o.y - 64 + y1 } });
  const all = m.objects.filter(o => o.cls === 'stepstone' && /^water-rocks/.test(o.key));   // (the dock is a stepstone too)
  assert.strictEqual(all.length, 4);
  const go = (stones, x, y, dx, dy, n, lv = -1) => {
    const okS = (u, bx, by) => feetOk(m, wg, u.high, bx, by, stones), u = { x, y, high: lv, rail: null };
    for (let i = 0; i < n; i++) [u.x, u.y] = moveFeet([], okS, u, dx, dy);
    return u;
  };
  const S = stonesOf(all), row = 1600;                                 // a line along the stones (the beach is at x 384-448, the islet's sand ends at x 256)
  assert(go(S, 400, row, -2, 0, 250).x < 40, 'over the stones to the sand islet');
  assert(go(S, 60, row, 2, 0, 250).x > 400, 'and back to the beach');
  assert(go([], 400, row, -2, 0, 250).x > 380, 'without stones the water stops you');
  assert(go(S, 400, row - 40, -2, 0, 250).x > 380, 'a row beside the stones is water');
  for (let i = 0; i < 4; i++) assert(go(stonesOf(all.filter((_, j) => j !== i)), 400, row, -2, 0, 250).x > 90, 'a missing stone ' + i + ' leaves a gap');
  const mid = go(S, 300, row, 0, -2, 80), low = go(S, 300, row, 0, 2, 80);
  assert(mid.y > row - 30 && low.y < row + 30, 'on a stone, the water around it is a wall');
  assert(!ok({ high: false }, ...at(2, 17)), 'feetOk without stones: water is a wall');

  // the beach: sand is walkable at level -1, the cliff above it is not; the land is level 0, and the land's back row hides a unit behind its top edge
  const sand = { high: -1 }, st = (x, y, dx, dy) => feetOk(m, wg, -1, ...at(x, y, dx, dy));
  assert(st(2, 20) && st(2, 21) && st(1, 25), 'the beach strip west of the stairs and the sand islet');
  assert(!ok(ground, ...at(2, 20)) && !ok(ground, ...at(1, 25)), 'the sand is not land level');
  assert(!st(4, 20) && !st(6, 19) && !st(4, 19), 'the cliff below the field is a wall for the beach (and so is the land itself)');
  assert(!st(5, 21, 32, 4), 'the sand ring is one tile: the water edge stops you');
  assert(ok(ground, ...at(9, 17)) && !ok(sand, ...at(9, 17)), 'on the field the hero is on land');
  assert(st(9, 2, 32, 20) && !st(9, 2, 32, 34), 'on the north coast the beach hero walks behind the land\'s top edge, 26px deep at most');
  assert(!ok(ground, ...at(9, 2, 32, 8)) && ok(ground, ...at(9, 2, 32, 30)), 'the land hero keeps off the shore edge');
    assert(st(10, 26, 32, 32) && !st(10, 25, 32, 32) && !st(10, 24, 32, 32), 'under the dead end: sand below its cliff cell, the cliff cell and the land are walls for the beach');

  // the stairs down to the beach: from the foot cell on the sand, walking east climbs onto the field, and back
  const beach = all3.filter(r => r.hi === 0);
  assert.strictEqual(beach.length, 3, 'three beach ramps (the field\'s south-west corner, the strip west of the boss clearing, and the arena\'s own stairs down to the dock)');
  for (const r of beach) {
    const [fc, fr] = r.footCell, u = { x: r.F.x, y: r.F.y, high: -1, rail: null }, okU = (w, bx, by) => feetOk(m, wg, w.high, bx, by);
    assert(okU(u, u.x, u.y), 'the foot of the ramp is standable sand at ' + fc + ',' + fr);
    let boarded = false;
    for (let i = 0; i < 300; i++) { [u.x, u.y] = moveFeet(all3, okU, u, -r.side * 2.5, 0); boarded = boarded || !!u.rail }
    assert(boarded && u.high === 0 && okU(u, u.x, u.y), 'up the stairs onto the land at ' + fc + ',' + fr + ': ' + [u.x | 0, u.y | 0, u.high]);
    for (let i = 0; i < 300; i++) [u.x, u.y] = moveFeet(all3, okU, u, r.side * 2.5, 0);
    assert(u.high === -1 && !u.rail && okU(u, u.x, u.y), 'and back down onto the sand');
  }
  // and by land: the top of each beach stair can be walked to from the start (trees, rocks and the clearings' walls in the way)
  const sp = m.objects.find(o => o.cls === 'spawn' && o.name === 'spawn'), reach = SEAL.flood(m, SEAL.mapRects(m), SEAL.stonesOf(m), [[sp.x, sp.y]], 8);
  for (const r of beach) assert(reach.has(r.P.x - r.side * 4, r.P.y), 'the start walks to the top of the stairs at ' + r.topCell);   // (4 px in from P: a lattice point on P's far side has a feet corner on the stair cell; boarding takes within 8 px)
  // the beach is connected: from the stairs' foot to the sand islet (over the stones), the dock and the other stairs, flooded over the cells
  const wgc = wg, seen = new Set(), q = [[2, 20]];
  const pass = (x, y) => feetOk(m, wgc, -1, x * T + 32, y * T + 32) || feetOk(m, wgc, -1, x * T + 32, y * T + 52);
  while (q.length) { const [x, y] = q.pop(), k = y * m.w + x; if (x < 0 || y < 0 || x >= m.w || y >= m.h || seen.has(k) || !pass(x, y)) continue; seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]) }
  for (const [x, y, what] of [[35, 43, 'the foot of the stairs west of the boss clearing'], [50, 45, 'the dock'], [41, 45, 'the beach under the lobe'], [6, 25, 'the dead ends\' beach'], [13, 23, 'the field\'s south beach']]) assert(seen.has(y * m.w + x), what + ' is connected by sand to the first stairs');
  console.log('walk-check OK');
}).catch(e => { console.error('FAIL', e.message); process.exit(1); });
