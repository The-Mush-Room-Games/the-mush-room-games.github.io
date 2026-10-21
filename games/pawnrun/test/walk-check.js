// node test/walk-check.js : terrain rules on maps/test.tmj (left stair: top 36 at (5,6), bottom 45 at (5,7); plateau
// rows 3-6 (cols 6-11) with its cliff in row 7; a small plateau at (9..11, 9)).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap } = require('../src/tmj.js');
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
  const ramps = rampsOf(m);
  assert.strictEqual(ramps.length, 1);
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

  // stepping stones: the map's `stepstone` Water Rocks (art boxes measured off the PNGs) are the only footing over the 2 water tiles between the
  // field's west shore and the islet; each feet-box corner must be on land or a stone, so gaps stop you
  const BOX = { 'water-rocks2': [7, 17, 57, 50], 'water-rocks4': [6, 14, 57, 52] };
  const stonesOf = list => list.map(o => { const [x0, y0, x1, y1] = BOX[o.key]; return { x0: o.x - 32 + x0, y0: o.y - 64 + y0, x1: o.x - 32 + x1, y1: o.y - 64 + y1 } });
  const all = m.objects.filter(o => o.cls === 'stepstone' && /^water-rocks/.test(o.key));   // (the dock is a stepstone too)
  assert.strictEqual(all.length, 4);
  const go = (stones, x, y, dx, dy, n) => {
    const okS = (u, bx, by) => feetOk(m, wg, u.high, bx, by, stones), u = { x, y, high: false, rail: null };
    for (let i = 0; i < n; i++) [u.x, u.y] = moveFeet([], okS, u, dx, dy);
    return u;
  };
  const S = stonesOf(all), row = 18 * T;                              // the line between the islet's two rows (y 1152)
  assert(go(S, 300, row, -2, 0, 200).x < 30, 'over the stones to the islet');
  assert(go(S, 60, row, 2, 0, 200).x > 400, 'and back to the field');
  assert(go([], 300, row, -2, 0, 200).x > 260, 'without stones the shore stops you');
  assert(go(S, 300, row - 52, -2, 0, 200).x > 260, 'a row beside the stones is water');
  for (let i = 0; i < 4; i++) assert(go(stonesOf(all.filter((_, j) => j !== i)), 300, row, -2, 0, 200).x > 90, 'a missing stone ' + i + ' leaves a gap');
  const mid = go(S, 190, row, 0, -2, 80), low = go(S, 190, row, 0, 2, 80);
  assert(mid.y > row - 30 && low.y < row + 30, 'on a stone, the water around it is a wall');
  assert(ok({ high: false }, ...at(4, 17)) && !ok({ high: false }, ...at(2, 17)), 'feetOk without stones: shore yes, water no');
  console.log('walk-check OK');
}).catch(e => { console.error('FAIL', e.message); process.exit(1); });
