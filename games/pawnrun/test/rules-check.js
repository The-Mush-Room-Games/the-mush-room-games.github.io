// node test/rules-check.js : the Tiled automapping rules (tiled/rules/*.tmj, listed in tiled/rules.txt) rebuild exactly what tiled/layers.js writes for the two generated maps.
// A small copy of Tiled's matcher: a rule is a block of the rule map (region = the `regions` layer), `input_X` needs a tile (NON) or that gid, `inputnot_X` needs the cell
// empty, outside the map counts as empty. One file at a time: all matches read the state before the file, and two rules must not write different tiles to one cell.
const fs = require('fs'), path = require('path'), assert = require('assert');
const C = require('../tiled/common.js'), F = C.FIRST, root = path.join(__dirname, '..');
const NON = 302;                                                                            // the rules tileset's NonEmpty swatch (make-rules.js RULES_FIRST + 2)
const J = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

function load(file) {                                                                       // -> { rules: [{ cells: [[dx, dy]], pos: [[layer, dx, dy, gid | 'NON']], neg, out }] }
  const m = J('tiled/' + file), by = n => (m.layers.find(l => l.name === n) || { data: new Array(m.width * m.height).fill(0) }).data;
  const reg = by('regions'), rules = [], seen = new Set();
  for (let i = 0; i < reg.length; i++) {
    if (!reg[i] || seen.has(i)) continue;
    const x1 = i % m.width, y1 = (i / m.width) | 0;                                         // top-left of a block: extend right and down while the region goes on
    let w = 0, h = 0; while (reg[y1 * m.width + x1 + w]) w++; while (reg[(y1 + h) * m.width + x1]) h++;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) seen.add((y1 + y) * m.width + x1 + x);
    const r = { w, h, pos: [], neg: [], out: [] };
    for (const l of m.layers) {
      const [kind, ...nm] = l.name.split('_'), name = nm.join('_');
      if (!['input', 'inputnot', 'output'].includes(kind)) continue;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const g = l.data[(y1 + y) * m.width + x1 + x]; if (!g) continue;
        if (kind === 'input') r.pos.push([name, x, y, g === NON ? 'NON' : g]); else if (kind === 'inputnot') r.neg.push([name, x, y]); else r.out.push([name, x, y, g]);
      }
    }
    rules.push(r);
  }
  return rules;
}

const run = (state, w, h, files) => {
  const get = (name, x, y) => (x < 0 || y < 0 || x >= w || y >= h || !state[name]) ? 0 : state[name][y * w + x];
  for (const file of files) {
    const writes = new Map();
    for (const r of load(file)) for (let y0 = -r.h; y0 < h; y0++) for (let x0 = -r.w; x0 < w; x0++) {
      if (!r.pos.every(([l, dx, dy, g]) => { const v = get(l, x0 + dx, y0 + dy); return g === 'NON' ? v !== 0 : v === g })) continue;
      if (!r.neg.every(([l, dx, dy]) => get(l, x0 + dx, y0 + dy) === 0)) continue;
      for (const [l, dx, dy, g] of r.out) {
        const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = l + ':' + (y * w + x); assert(!writes.has(k) || writes.get(k) === g, `${file}: two rules write ${l} ${x},${y}: ${writes.get(k)} and ${g}`); writes.set(k, g);
      }
    }
    for (const [k, g] of writes) { const [l, i] = k.split(':'); (state[l] ||= new Array(w * h).fill(0))[+i] = g }
  }
};

const files = fs.readFileSync(path.join(root, 'tiled/rules.txt'), 'utf8').split('\n').filter(Boolean);
for (const name of ['test', 'town']) {
  const map = J(`maps/${name}.tmj`), { width: w, height: h } = map, L = Object.fromEntries(map.layers.filter(l => l.type === 'tilelayer').map(l => [l.name, l.data]));
  const painted = { Water: L.Water, Sand: L.Sand, Stairs: L.Stairs, Ground: L.Ground.map(g => g && F.low + 10), Raised: L.Raised.map(g => g && F.high + 10) };   // what a person paints: flat tiles
  run(painted, w, h, files);
  for (const n of ['Beach (preview)', 'Foam (preview)', 'Land shadows (preview)', 'Shadows (preview)', 'Cliffs (preview)', 'Ground', 'Raised']) {
    const want = L[n], got = painted[n] || new Array(w * h).fill(0), bad = [];
    for (let i = 0; i < w * h; i++) if (want[i] !== got[i]) bad.push(`${i % w},${(i / w) | 0}:${got[i]}!=${want[i]}`);
    assert(!bad.length, `${name}: rules and layers.js differ on ${n} at ${bad.length} cells, e.g. ${bad.slice(0, 5)}`);
  }
}
console.log('rules-check OK:', files.length, 'rule files rebuild the test and town maps\' preview layers');
