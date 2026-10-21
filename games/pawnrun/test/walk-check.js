// node test/walk-check.js : the ramp rules of cornerOk on maps/test.tmj (left stair: top 36 at (5,6), bottom 45 at (5,7)).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { readMap } = require('../src/tmj.js');
const { T, heightGrid, cornerOk } = require('../src/terrain.js');
const root = path.join(__dirname, '..');

readMap('maps/test.tmj', async p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))).then(m => {
  const lv = heightGrid(m), at = (cx, cy, dx = 32, dy = 32) => [cx * T + dx, cy * T + dy];
  const ok = (from, to) => cornerOk(m, lv, null, ...at(...from), ...at(...to));
  assert(ok([4, 7], [5, 7]), 'onto the ramp foot from the west');
  assert(!ok([5, 8], [5, 7]), 'not up the stone face from below');
  assert(!ok([4, 6], [5, 6]), 'not onto the ramp top from the ground');
  assert(ok([5, 7], [4, 7]) && !ok([5, 7], [5, 8]), 'off the ramp only at its foot');
  assert(ok([6, 6], [5, 6]) && ok([5, 6], [6, 6]), 'ramp top joins the plateau');
  assert(!ok([5, 7], [6, 7]), 'cliff beside the ramp blocks');
  console.log('walk-check OK');
}).catch(e => { console.error('FAIL', e.message); process.exit(1); });
