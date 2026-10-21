// node test/walk-check.js : terrain rules on maps/test.tmj (left stair: top 36 at (5,6), bottom 45 at (5,7); plateau
// rows 3-6 with its cliff in row 7; a small plateau at (9..11, 9)).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap } = require('../src/tmj.js');
const { T, LV, FEET, FEET_HIGH, heightGrid, levelAt, cornerOk, rampsOf, moveFeet } = require('../src/terrain.js');
const root = path.join(__dirname, '..');

readMap('maps/test.tmj', async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))).then(m => {
  const lv = heightGrid(m), at = (cx, cy, dx = 32, dy = 32) => [cx * T + dx, cy * T + dy];
  const ok = (ax, ay, bx, by) => {                         // the scene's walkable, minus object rects
    const F = levelAt(m, lv, bx, by) === LV.RAISED ? FEET_HIGH : FEET;
    for (const px of [bx - F.x, bx + F.x]) for (const py of [by - F.top, by + F.bottom]) if (!cornerOk(m, lv, ax, ay, px, py)) return false;
    return true;
  };
  // stair cells are walls for feet boxes; the back strip of a plateau is ground
  assert(!cornerOk(m, lv, ...at(4, 7), ...at(5, 7)) && !cornerOk(m, lv, ...at(6, 6), ...at(5, 6)), 'stairs block boxes');
  assert.strictEqual(levelAt(m, lv, ...at(10, 9, 32, 3)), LV.GROUND, 'top 5px of a back row is ground');
  assert.strictEqual(levelAt(m, lv, ...at(10, 9, 32, 6)), LV.RAISED);
  let y = 9 * T - 40; while (ok(10 * T + 32, y, 10 * T + 32, y + 1)) y++;
  assert(9 * T - y <= 0 && 9 * T - y >= -3, 'feet reach the back edge of the small plateau, got ' + (9 * T - y));

  // ride the ramp: walk right from anywhere in the foot cell, end up on the plateau; walk back down
  const ramps = rampsOf(m);
  assert.strictEqual(ramps.length, 1);
  for (const dy of [10, 26, 38, 50, 58]) {
    const u = { x: 4 * T + 20, y: 7 * T + dy, rail: null };
    if (!ok(u.x, u.y, u.x, u.y)) continue;
    let boarded = false;
    for (let i = 0; i < 200; i++) { [u.x, u.y] = moveFeet(ramps, ok, u, 2.5, 0); boarded = boarded || !!u.rail }
    assert(boarded, 'boarded from foot-cell y ' + dy);
    assert.strictEqual(levelAt(m, lv, u.x, u.y), LV.RAISED, `on the plateau after the climb (from y ${dy}): ${u.x | 0},${u.y | 0}`);
    assert(ok(u.x, u.y, u.x, u.y), 'landed on a legal spot');
    for (let i = 0; i < 200; i++) [u.x, u.y] = moveFeet(ramps, ok, u, -2.5, 0);
    assert.strictEqual(levelAt(m, lv, u.x, u.y), LV.GROUND, 'back on the ground');
    assert(!u.rail && ok(u.x, u.y, u.x, u.y), 'off the ramp on a legal spot');
  }
  // pushing up or down beside the ramp never boards it
  const v = { x: 4 * T + 52, y: 7 * T + 30, rail: null };
  moveFeet(ramps, ok, v, 0, -2.5); assert(!v.rail, 'walking north beside the foot does not board');
  console.log('walk-check OK');
}).catch(e => { console.error('FAIL', e.message); process.exit(1); });
