// Shapes for natural clearings (a camp's inside), on a W x H grid of cells. A clearing is a Set of cell indices (row * W + col): the inside; a gap is a straight
// run of cells (the camp spec of src/camp.js). Pure, so the island generator can use these as they are. make-test-map.js builds the test level's two with them.
module.exports = (W, H) => {
  const idx = (c, r) => r * W + c, inMap = (c, r) => c >= 0 && r >= 0 && c < W && r < H;
  const xy = i => [i % W, Math.floor(i / W)];
  const hash = (a, b, s) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(s, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 };
  const vnoise = (x, y, s) => {                                    // smooth value noise in [0, 1]
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const rng = seed => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296 };
  // An ellipse with a wobbly edge (noise on the angle, two octaves, `amp` of the radius): the Set of cells whose centre is inside. grow = px of the radii added.
  const ellipse = (cx, cy, rx, ry, seed, { grow = 0, amp = 0.2 } = {}) => {
    const out = new Set();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const dx = c + 0.5 - cx, dy = r + 0.5 - cy, a = Math.atan2(dy, dx), x = Math.cos(a), y = Math.sin(a);
      const k = 1 + amp * 2 * (vnoise(x * 1.6 + 9, y * 1.6 + 9, seed) - 0.5) + amp * 0.35 * 2 * (vnoise(x * 4 + 3, y * 4 + 3, seed + 7) - 0.5);
      if (Math.hypot(dx / (rx + grow), dy / (ry + grow)) <= k) out.add(idx(c, r));
    }
    return out;
  };
  // The terrain rule of the game: no 1-tile notch (a gap with land on both sides), no diagonal-only touch. Fills water cells of the 0/1 mask m until none is left.
  const has = (m, x, y) => inMap(x, y) && m[idx(x, y)] === 1;
  function clean(m) {
    for (let again = true; again;) {
      again = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!m[idx(x, y)]) { if ((has(m, x - 1, y) && has(m, x + 1, y)) || (has(m, x, y - 1) && has(m, x, y + 1))) { m[idx(x, y)] = 1; again = true } continue }
        for (const dy of [1, -1]) if (has(m, x + 1, y + dy) && !has(m, x + 1, y) && !has(m, x, y + dy)) { m[idx(x + 1, y)] = 1; again = true }
      }
    }
  }
  // The inside of a clearing from a rough shape: only cells where ok(cell) (flat ground), no spurs (fewer than 2 neighbours), no diagonal-only pinches, and the
  // biggest 4-connected piece.
  function insideOf(shape, ok) {
    let s = new Set([...shape].filter(ok));
    const n4 = i => { const [c, r] = xy(i); return [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => inMap(a, b)).map(([a, b]) => idx(a, b)) };
    for (let again = true; again;) {
      again = false;
      for (const i of [...s]) {
        const [c, r] = xy(i);
        if (n4(i).filter(j => s.has(j)).length < 2) { s.delete(i); again = true; continue }
        for (const dy of [1, -1]) if (s.has(idx(c + 1, r + dy)) && !s.has(idx(c + 1, r)) && !s.has(idx(c, r + dy))) { s.delete(i); again = true; break }
      }
    }
    let best = new Set();
    const seen = new Set();
    for (const i of s) {
      if (seen.has(i)) continue;
      const comp = new Set([i]), q = [i]; seen.add(i);
      while (q.length) for (const j of n4(q.pop())) if (s.has(j) && !seen.has(j)) { seen.add(j); comp.add(j); q.push(j) }
      if (comp.size > best.size) best = comp;
    }
    return best;
  }
  // A gap on one side of the clearing: `side` 'W' | 'E' | 'N' | 'S', `span` = the rows (W, E) or columns (N, S) it covers. The cells are in a straight line, one cell outside
  // the clearing's furthest edge on that side; the inside is grown to meet them. ok(cell) = flat ground (the gap and the cells grown must be). Returns the gap cells [[c, r]].
  function carveGap(inside, side, span, ok) {
    const horiz = side === 'W' || side === 'E', s = side === 'W' || side === 'N' ? -1 : 1, at = (v, a) => horiz ? idx(v, a) : idx(a, v);
    const edge = span.map(a => { let e = null; for (const i of inside) { const [c, r] = xy(i); if ((horiz ? r : c) === a) { const v = horiz ? c : r; e = e === null ? v : s < 0 ? Math.min(e, v) : Math.max(e, v) } } return e });
    if (edge.some(e => e === null)) throw new Error(`gap ${side} ${span}: no inside on that line`);
    const line = (s < 0 ? Math.min(...edge) : Math.max(...edge)) + s;
    span.forEach((a, k) => { for (let v = edge[k] + s; v !== line; v += s) { if (!ok(at(v, a))) throw new Error(`gap ${side}: cell ${v},${a} is not flat ground`); inside.add(at(v, a)) } });
    if (span.some(a => !ok(at(line, a)))) throw new Error(`gap ${side}: the gap line ${line} is not flat ground`);
    return span.map(a => horiz ? [line, a] : [a, line]);
  }
  // The cells next to the inside (8 neighbours) that are not inside: the wall line.
  function ringOf(inside) {
    const out = new Set();
    for (const i of inside) { const [c, r] = xy(i); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(c + dx, r + dy) && !inside.has(idx(c + dx, r + dy))) out.add(idx(c + dx, r + dy)) }
    return out;
  }
  // The outline of the inside as a polygon [[x, y]] of cell corners in px (clockwise on screen, collinear points dropped): what a Tiled `camp` polygon holds.
  function outline(inside, T = 64) {
    const next = new Map(), key = (x, y) => x + ',' + y, add = (x0, y0, x1, y1) => { const k = key(x0, y0); (next.get(k) || next.set(k, []).get(k)).push([x1, y1]) };
    for (const i of inside) {
      const [c, r] = xy(i), n = (dc, dr) => inside.has(idx(c + dc, r + dr));
      if (!n(0, -1)) add(c, r, c + 1, r);
      if (!n(1, 0)) add(c + 1, r, c + 1, r + 1);
      if (!n(0, 1)) add(c + 1, r + 1, c, r + 1);
      if (!n(-1, 0)) add(c, r + 1, c, r);
    }
    const total = [...next.values()].reduce((a, v) => a + v.length, 0), first = [...next.keys()][0].split(',').map(Number), pts = [first];
    let cur = first;
    for (let k = 0; k < total; k++) {
      const outs = next.get(key(...cur));
      if (!outs || !outs.length) throw new Error('outline: open loop at ' + cur);
      if (outs.length > 1) throw new Error('outline: a pinch at ' + cur);
      const to = outs.shift();
      cur = to;
      if (cur[0] === first[0] && cur[1] === first[1] && k === total - 1) break;
      pts.push(cur);
    }
    if (pts.length < total) throw new Error('outline: more than one loop (a hole or a detached piece)');
    const keep = pts.filter((p, i) => { const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length]; return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]) });
    return keep.map(([x, y]) => [x * T, y * T]);
  }
  return { idx, xy, inMap, hash, vnoise, rng, ellipse, has, clean, insideOf, carveGap, ringOf, outline };
};
