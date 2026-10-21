// Does a clearing's wall hold? Pure logic over a map (readMap) for node: the generator and test/camp-check.js use it.
// It floods the hero's feet box over a pixel lattice (the game's own feetOk on the terrain, plus every object collision rect, plus `block` rects) from inside
// a clearing. Gaps closed: nothing may get further than one cell from the clearing (the dock's planks aside). Gaps open: the outside must be reachable.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const R = path.join(__dirname, '..');
const { ASSETS } = require('../src/assets.js'), TR = require('../src/terrain.js'), CP = require('../src/camp.js');
const { T, FEET, walkGrids, feetOk, collisionRects } = TR;

// the alpha of a PNG (8 bit, not interlaced), enough to measure the art box the game measures with a canvas
function pngAlpha(file) {
  const b = fs.readFileSync(file), idat = []; let p = 8, w, h, ct, trns;
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len); p += 12 + len;
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error(file + ': only 8 bit, not interlaced PNGs') }
    else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * ch), row = w * ch;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1));
    for (let i = 0; i < row; i++) {
      const a = i >= ch ? px[y * row + i - ch] : 0, u = y ? px[(y - 1) * row + i] : 0, c = i >= ch && y ? px[(y - 1) * row + i - ch] : 0;
      const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c);
      px[y * row + i] = (src[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? u : c))) & 255;
    }
  }
  return { w, h, at: (x, y) => ct === 6 ? px[(y * w + x) * 4 + 3] : ct === 4 ? px[(y * w + x) * 2 + 1] : ct === 3 ? (trns && px[y * w + x] < trns.length ? trns[px[y * w + x]] : 255) : 255 };
}
// The opaque bounding box of frame 0 of a texture (what TestMap's artBox measures in the browser): { x, y, w, h, fw, fh }. o = the map object, for art Boot does not list.
const BOX = {};
function artBoxOf(key, o) {
  if (BOX[key]) return BOX[key];
  const a = ASSETS[key], img = pngAlpha(a ? path.join(R, 'assets', a[0]) : path.join(R, o.image)), fw = a && a[1] || img.w, fh = a && a[2] || img.h;
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (img.at(x, y) > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  return BOX[key] = x1 < 0 ? { x: 0, y: 0, w: fw, h: fh, fw, fh } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, fw, fh };
}
// Every object collision rect of the map (low ground), as the game places them.
const mapRects = m => collisionRects(m, artBoxOf).filter(r => !r.high);

// Footing over water: the art of every `stepstone` object (TestMap pushes the same rects).
const stonesOf = m => m.objects.filter(o => o.cls === 'stepstone').map(o => {
  const b = artBoxOf(o.key, o), fb = o.flipX ? { ...b, x: b.fw - b.x - b.w } : b;
  return { x0: o.x - b.fw / 2 + fb.x, y0: o.y - b.fh + fb.y, x1: o.x - b.fw / 2 + fb.x + fb.w, y1: o.y - b.fh + fb.y + fb.h };
});

// Flood the hero's feet box over a lattice of `step` px from the px points `starts`. rects = collision rects { x0, y0, x1, y1 }, stones = footing over water.
// Returns { has(x, y), each(fn(x, y)), count }.
function flood(m, rects, stones, starts, step = 4) {
  const wg = walkGrids(m), LW = Math.ceil(m.w * T / step), LH = Math.ceil(m.h * T / step), seen = new Uint8Array(LW * LH), at = new Map(), live = [];
  for (const r of rects) for (let cy = Math.floor(r.y0 / T); cy <= Math.floor((r.y1 - 1e-6) / T); cy++) for (let cx = Math.floor(r.x0 / T); cx <= Math.floor((r.x1 - 1e-6) / T); cx++) {
    const k = cy * m.w + cx; (at.get(k) || at.set(k, []).get(k)).push(r);
  }
  const free = (x, y) => {
    if (!feetOk(m, wg, false, x, y, stones)) return false;
    const x0 = x - FEET.x, x1 = x + FEET.x, y0 = y - FEET.top, y1 = y + FEET.bottom;
    for (let cy = Math.floor(y0 / T); cy <= Math.floor(y1 / T); cy++) for (let cx = Math.floor(x0 / T); cx <= Math.floor(x1 / T); cx++)
      for (const r of at.get(cy * m.w + cx) || []) if (x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1) return false;
    return true;
  };
  const q = [];
  for (const [sx, sy] of starts) { const i = Math.round(sx / step), j = Math.round(sy / step); if (free(i * step, j * step)) { seen[j * LW + i] = 1; q.push(i, j) } }
  for (let h = 0; h < q.length; h += 2) {
    const i = q[h], j = q[h + 1];
    live.push(i, j);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= LW || b >= LH || seen[b * LW + a] || !free(a * step, b * step)) continue;
      seen[b * LW + a] = 1; q.push(a, b);
    }
  }
  return { count: live.length / 2, has: (x, y) => seen[Math.round(y / step) * LW + Math.round(x / step)] === 1, each: fn => { for (let k = 0; k < live.length; k += 2) fn(live[k] * step, live[k + 1] * step) } };
}

// The seal report of one clearing. spec = campSpec(...). Closed: the gap pieces stand. Open: they do not.
// A flood from a free point inside, gaps open, must reach the cell beyond every gap; with the gaps closed it must not reach any cell more than one cell from the
// inside (plank footing, `stones`, aside). Returns { reached: [bool per gap], leaks: number of lattice points out of bounds, first: [x, y], area: points inside }.
function sealReport(m, spec, rects, stones = [], step = 4) {
  const { cells, gaps, mw } = spec, has = (c, r) => cells.has(r * mw + c);
  const pieces = gaps.flatMap(g => CP.gapPieces(g, cells, mw, spec.boss)), closed = rects.concat(pieces.flatMap(p => CP.pieceRects(p, T)));
  let start = null, best = 1e9;                                       // the inside cell whose centre is closest to the middle of the clearing
  const cs = [...cells].map(i => [i % mw, Math.floor(i / mw)]), cx = cs.reduce((a, c) => a + c[0], 0) / cs.length, cy = cs.reduce((a, c) => a + c[1], 0) / cs.length;
  for (const [c, r] of cs) { const d = Math.hypot(c - cx, r - cy); if (d < best) { best = d; start = [(c + 0.5) * T, (r + 0.5) * T] } }
  const open = flood(m, rects, stones, [start], step), shut = flood(m, closed, stones, [start], step);
  const reached = gaps.map(g => g.cells.some(([c, r]) => {          // the cell beyond: opposite the inside neighbour
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (has(c + dx, r + dy)) return open.has((c - dx + 0.5) * T, (r - dy + 0.5) * T);
    return false;
  }));
  let leaks = 0, first = null;
  shut.each((x, y) => {
    const c = Math.floor(x / T), r = Math.floor(y / T);
    if ([-1, 0, 1].some(dy => [-1, 0, 1].some(dx => has(c + dx, r + dy))) || TR.onStone(stones, x, y)) return;
    leaks++; first = first || [x, y];
  });
  return { reached, leaks, first, area: shut.count, open };
}
module.exports = { artBoxOf, mapRects, stonesOf, flood, sealReport, pngAlpha };
