// Writes maps/test.tmj, a 64x50 test island. Run: node tiled/make-test-map.js (after make-rules.js and make-objects.js)
// The land below is the island's top level; the game puts a ring of sand round it (src/terrain.js baseOf) and a cliff face under its south edges. This file only says
// where the land is (plus the plateaus, ponds and stairs, and a sand islet); tiled/layers.js writes the rest.
const fs = require('fs'), path = require('path');
const C = require('./common.js'), TR = require('../src/terrain.js'), SEAL = require('./seal.js'), terrainLayers = require('./layers.js');
const R = path.join(__dirname, '..');
const W = 64, H = 50, T = 64, CL = require('./clearing.js')(W, H);
const objTs = JSON.parse(fs.readFileSync(path.join(R, 'maps/objects.tsj'), 'utf8'));
const keyOf = t => (t.properties || []).find(p => p.name === 'key')?.value || t.image.split('/').pop().replace(/\.png$/i, '');
const findTile = key => objTs.tiles.find(t => keyOf(t) === key);
const gidOf = key => C.FIRST.objects + findTile(key).id;
const F = C.FIRST;

// island: row -> [firstCol, lastCol] (or a list of those). Rows 2-13 are the first island; below it a field with:
// a tree-walled pocket (rows 14-16, cols 19-20), two 1-tile dead ends (cols 7 and 10, rows 22-24), a sand islet (cols 0-3, rows 24-26, painted below) across
// two tiles of water from the dead ends' beach (stepping stones), and a tiny islet (cols 13-14, rows 27-28) two water tiles south of the field's beach: only a thrown dynamite reaches it.
// The field's rows 17-18 run on east (cols 22-24) to a meadow (cols 25-38, rows 11-23) with a gnome camp in it
const rows = { 2: [7, 12], 3: [5, 14], 4: [4, 15], 5: [4, 16], 6: [3, 16], 7: [3, 19], 8: [3, 19], 9: [4, 16], 10: [4, 15], 11: [[5, 15], [25, 38]], 12: [[6, 14], [25, 38]], 13: [[7, 13], [25, 38]],
  14: [[7, 13], [19, 20], [25, 38]], 15: [[5, 15], [19, 20], [25, 38]], 16: [[4, 16], [19, 20], [25, 38]], 17: [4, 38], 18: [4, 38], 19: [[4, 17], [25, 38]], 20: [[5, 15], [25, 38]], 21: [[7, 13], [25, 38]],
  22: [[7, 7], [10, 10], [25, 38]], 23: [[7, 7], [10, 10], [25, 38]], 24: [[7, 7], [10, 10]], 27: [13, 14], 28: [13, 14] };
const idx = (x, y) => y * W + x;
const ground = new Uint8Array(W * H), raised = new Uint8Array(W * H), water = new Uint8Array(W * H), sand = new Uint8Array(W * H);
for (const [y, r] of Object.entries(rows)) for (const [a, b] of typeof r[0] === 'number' ? [r] : r) for (let x = a; x <= b; x++) ground[idx(x, +y)] = 1;
// East and south of the meadow, all reached from it (the gnome camp is a clearing in the middle of the meadow: walk round it):
// - a 2-tile corridor east (rows 17-18, cols 39-43) into the snake den (cols 44-56, rows 13-23);
// - from the den a 3-wide corridor south (cols 49-51, rows 24-27) into the boss clearing on the shore (generated below: a wobbly ellipse about 20 x 16 cells, the
//   island's south shore runs along its bottom, where the dock and the boat are);
// - a spider glade north of the meadow (cols 25-40, rows 2-7, joined by a 4-wide neck, rows 8-10, cols 30-33);
// - a slingshot grove south of it (cols 26-37, rows 27-37, neck rows 24-26, cols 30-33).
const land = (c0, r0, c1, r1) => { for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) ground[idx(x, y)] = 1 };
land(39, 17, 43, 18); land(44, 13, 56, 23); land(49, 24, 51, 27);
land(25, 2, 40, 7); land(30, 8, 33, 10); land(30, 24, 33, 26); land(26, 27, 37, 37);
land(24, 10, 41, 24);                                                                                      // the meadow (wide enough to walk round the camp)
for (let y = 10; y <= 11; y++) for (let x = 9; x <= 11; x++) { ground[idx(x, y)] = 0; water[idx(x, y)] = 1; } // pond
for (let y = 3; y <= 6; y++) for (let x = 6; x <= 11; x++) raised[idx(x, y)] = 1;                          // 6x4 plateau
for (let x = 9; x <= 11; x++) raised[idx(x, 9)] = 1;                                                      // bump whose cliff stands in the pond

// The clearings' terrain. Gnome camp (centre 32.4, 17.5): a pond west-south-west and a plateau (with its cliff) north-east. Boss clearing (centre 51, 35.3): the
// land is the ellipse grown by 2 cells, cut at the shore (rows <= shore(col), a wobbly line with the dock at col 50), a plateau on its north-west side and another on the east.
// lobes = [cx, cy, rx, ry] ellipses added to the main one, so the outline is not a circle.
const CAMP = { cx: 32.2, cy: 17.6, rx: 4.5, ry: 3.7, seed: 5, lobes: [[35.4, 19.5, 2.5, 2.1], [29.4, 15.2, 2.3, 2.3]] };
const ARENA = { cx: 51.2, cy: 36.4, rx: 8.6, ry: 7.6, seed: 23, lobes: [[56.8, 31.8, 4, 3.4], [46, 40.3, 4.4, 3.3], [56.2, 40.5, 3.8, 3.2]] };
const shapeOf = (G, { grow = 0, amp = 0.2 } = {}) => new Set([[G.cx, G.cy, G.rx, G.ry], ...G.lobes].flatMap(([cx, cy, rx, ry], k) => [...CL.ellipse(cx, cy, rx, ry, G.seed + k, { grow, amp })]));
for (let y = 21; y <= 23; y++) for (let x = 27; x <= 29; x++) { ground[idx(x, y)] = 0; water[idx(x, y)] = 1 }              // pond
for (let y = 11; y <= 12; y++) for (let x = 33; x <= 37; x++) raised[idx(x, y)] = 1;                                     // plateau, cliff in row 13
const shore = Array.from({ length: W }, (_, x) => CL.vnoise(x * 0.35, 3, 9) > 0.5 ? 43 : 42);
for (let x = 48; x <= 53; x++) shore[x] = 43;
for (let k = 0; k < 4; k++) for (let x = 1; x < W - 1; x++) if (shore[x - 1] === shore[x + 1] && shore[x] !== shore[x - 1]) shore[x] = shore[x - 1];   // no 1-column steps
for (const i of shapeOf(ARENA, { grow: 2.1, amp: 0.1 })) { const [x, y] = CL.xy(i); if (x >= 39 && x <= 62 && y <= shore[x]) ground[i] = 1 }   // (col 63 is the beach)
land(37, 33, 40, 42);                                                                                                      // a wide strip west of the clearing's wall, joined to the grove: the way round to the stairs down to the beach
for (let y = 29; y <= 30; y++) for (let x = 43; x <= 46; x++) raised[idx(x, y)] = 1;                                     // plateau, cliff in row 31
for (let y = 32; y <= 33; y++) for (let x = 59; x <= 61; x++) raised[idx(x, y)] = 1;                                     // plateau, cliff in row 34
CL.clean(ground);

// Stairs ({ cell: tile }, left stair 36 over 45): the plateau's, beside its west edge and down to the land; the beach's, from the field's south-west corner and from the
// strip of land west of the boss clearing's wall (outside it, so the closed arena has no way out), down to the sand. The sand islet is painted (cols 0-3, rows 24-26); the beach cells a ring leaves as notches are painted in too.
const stairs = { [idx(5, 6)]: 36, [idx(5, 7)]: 45, [idx(3, 19)]: 36, [idx(3, 20)]: 45, [idx(36, 42)]: 36, [idx(36, 43)]: 45, [idx(54, 43)]: 39, [idx(54, 44)]: 48 };
for (let y = 42; y <= 44; y++) sand[idx(35, y)] = 1;                                                                      // the foot of the arena's west stairs
for (let y = 43; y <= 45; y++) sand[idx(55, y)] = 1;                                                                      // the foot of the arena's own stairs (right stair 39/48 at col 54, down to the dock)
for (const i of Object.keys(stairs)) if (ground[i] && !(+i === idx(5, 6) || +i === idx(5, 7))) throw new Error('a beach stair on land at ' + i);
for (let y = 24; y <= 26; y++) for (let x = 0; x <= 3; x++) sand[idx(x, y)] = 1;

// what the game draws on top of the masks, from the game's own rules (src/terrain.js, tiled/layers.js)
const T0 = terrainLayers({ w: W, h: H, ground, raised, water, sand, stairs }), stairTiles = T0.stairTiles;

// The clearings: the inside (a wobbly ellipse of flat ground), the gaps (straight runs of cells at its edge) and the wall line (the cells around it). The wall line
// holds trees and rocks (a `block` rect under each cell makes the line solid: trunk rects alone leave gaps a Pawn squeezes through), or is already water or a cliff.
const lv = TR.heightGrid({ w: W, h: H, ground, raised, stairTiles, water, sand }), flat = i => lv[i] === TR.LV.GROUND;
function clearing(name, kind, G, gapDefs) {
  const inside = CL.insideOf(shapeOf(G, { amp: G.amp }), flat);
  const gaps = gapDefs.map(([side, span]) => ({ side, cells: CL.carveGap(inside, side, span, flat) }));
  const fixed = CL.insideOf(inside, () => true);
  for (const g of gaps) for (const [c, r] of g.cells) if (!(fixed.has(idx(c + 1, r)) || fixed.has(idx(c - 1, r)) || fixed.has(idx(c, r + 1)) || fixed.has(idx(c, r - 1)))) throw new Error(`${name}: gap cell ${c},${r} lost its inside`);
  const gapSet = new Set(gaps.flatMap(g => g.cells.map(([c, r]) => idx(c, r))));
  const walls = [...CL.ringOf(fixed)].filter(i => !gapSet.has(i));
  return { name, kind, G, inside: fixed, gaps, gapSet, walls, block: walls.filter(i => lv[i] === TR.LV.GROUND || lv[i] === TR.LV.RAISED) };   // (a wall cell on the land or a plateau; the beach and the stairs are no wall)
}
const camp = clearing('camp', 'gnome', { ...CAMP, amp: 0.2 }, [['W', [16, 17, 18]], ['S', [32, 33]]]);
const arena = clearing('arena', 'boss', { ...ARENA, amp: 0.1 }, [['N', [49, 50, 51]]]);
arena.gaps.push({ side: 'E', cells: [[53, 43], [54, 43]] });   // the way down to the dock: the cell before the stairs and their top cell are a second gap, so boulders close it in the fight (a ramp is boarded from the cell beside its top)
if (process.env.DEBUG) for (const cl of [camp, arena]) {
  const ring = CL.ringOf(cl.inside);
  for (let y = 0; y < H; y++) { let row = ''; for (let x = 0; x < W; x++) { const i = idx(x, y); row += cl.inside.has(i) ? '.' : cl.gapSet.has(i) ? 'G' : cl.block.includes(i) ? '#' : ring.has(i) ? '~' : ground[i] ? ',' : ' ' } if (row.trim()) console.log(String(y).padStart(2), row) }
}
let oid = 1;
const P = (name, value, type = 'string', propertytype) => ({ name, type, ...(propertytype && { propertytype }), value });
const centre = (cx, cy) => [cx * T + T / 2, cy * T + T / 2];
const bottom = (cx, cy) => [cx * T + T / 2, (cy + 1) * T]; // bottom centre of a cell
const tileObj = (key, [x, y], cls, props = []) => {
  const t = findTile(key);
  return { id: oid++, name: '', ...(cls && { class: cls }), gid: gidOf(key), x, y, width: t.width, height: t.height, rotation: 0, visible: true, properties: props };
};
const point = (cls, [x, y], props = [], name = cls) => ({ id: oid++, name, class: cls, x, y, width: 0, height: 0, point: true, rotation: 0, visible: true, properties: props });
const objects = [
  tileObj('tree1', bottom(8, 2), 'secret', [P('kind', 'tree', 'string', 'secretKind')]),
  tileObj('tree2', bottom(14, 4)), tileObj('tree4', bottom(4, 9)),
  tileObj('rock1', bottom(11, 8)), tileObj('rock2', bottom(16, 6)),
  tileObj('house1', [14 * T, 12 * T]),
  tileObj('sheep-idle', bottom(7, 9)), tileObj('sheep-idle', bottom(12, 9)), tileObj('sheep-idle', bottom(7, 17)),
  tileObj('pig-idle', [768, 584]),   // Tiled-only art (added in Tiled): keep it across regeneration
  tileObj('gnome-idle', bottom(15, 8), undefined, [P('count', 2, 'int')]),
  tileObj('bush1', bottom(6, 8)), tileObj('bush2', bottom(13, 7)), tileObj('bush3', bottom(3, 7)),
  point('spawn', centre(9, 8)),
  { id: oid++, name: 'entrance', class: 'entrance', x: 19 * T, y: 7 * T, width: T, height: 2 * T, rotation: 0, visible: true, properties: [] },
  point('loot', centre(6, 12), [P('kind', 'duck', 'string', 'lootKind')]),
];
// Resources and secrets (the field south of the first island)
const kind = k => [P('kind', k, 'string', 'secretKind')];
const weapon = (w, tier, [x, y]) => point('loot', [x, y], [P('kind', 'weapon', 'string', 'lootKind'), P('weapon', w), P('tier', tier, 'int')]);
const loot = (k, [x, y], n) => point('loot', [x, y], [P('kind', k, 'string', 'lootKind'), ...(n ? [P('n', n, 'int')] : [])]);
objects.push(
  // gold stones: a pickaxe pops gold and steps each down a size (the old Pawn has no pickaxe: ?hero=new)
  tileObj('gold-stone4', bottom(11, 18)), tileObj('gold-stone6', bottom(14, 18)), tileObj('gold-stone2', bottom(8, 19)),
  // the pocket (rows 14-16, cols 19-20): a tree line closes its mouth; only the middle tree, with the mushroom at its foot, can be chopped.
  // Trunks stand 54 px apart: 18 px between them (the Pawn is 20 wide), 31 px once the middle one is a stump
  tileObj('tree1', [1226, 1091]), tileObj('tree1', [1280, 1091], 'secret', kind('tree')), tileObj('tree1', [1334, 1091]),
  loot('duck', [1280, 15 * T + 32]),
  // a 1-tile dead end closed by a rock pile (hammer, or pickaxe x2); meat and gold behind it
  tileObj('rock4', [672, 1436], 'secret', kind('rock')), tileObj('rock2', [672, 1461], 'secret', kind('rock')),
  loot('meat', [672, 23 * T + 32]), loot('gold', [672, 24 * T + 32], 5),
  // stepping stones across 2 tiles of water (cols 4-5) from the beach west of the dead ends to the sand islet (Water Rocks of class stepstone, overlapping so the line has no gap)
  tileObj('water-rocks4', [256, 1631], 'stepstone'), tileObj('water-rocks2', [302, 1631], 'stepstone'),
  tileObj('water-rocks4', [350, 1631], 'stepstone'), tileObj('water-rocks2', [393, 1631], 'stepstone'),
  loot('gold', [100, 1640], 10), loot('meat', [180, 1655]),
  // weapons on the ground, row 16 (tier colours: 0 blue, 1 red, 2 yellow, 3 purple). The old Pawn takes the axe and hammer, not the pickaxe
  weapon('axe', 1, centre(6, 16)), weapon('hammer', 2, centre(8, 16)), weapon('pickaxe', 0, centre(10, 16)),
  // one-use items, row 20: 2 dynamite and a bomb
  loot('dynamite', centre(6, 20)), loot('dynamite', centre(7, 20)), loot('bomb', centre(9, 20)),
  // a dead end (col 7) plugged with 3 rock piles in a row, gold behind: one blast clears them all (a hammer takes 3 swings)
  tileObj('rock4', [480, 1436], 'secret', kind('rock')), tileObj('rock2', [480, 1461], 'secret', kind('rock')), tileObj('rock4', [480, 1486], 'secret', kind('rock')),
  loot('gold', [480, 23 * T + 40], 12), loot('gold', [480, 24 * T + 32], 8),
  // a rock pile on the tiny islet across 2 water tiles from the field's south beach (row 23): out of reach of any swing, a dynamite thrown south lands next to it
  tileObj('rock2', bottom(13, 27), 'secret', kind('rock')),
);
// The clearings (src/camp.js, tiled/clearing.js). A `camp` polygon is the inside; a `gate` rect marks each gap (the fence pieces or boulders stand there while it is
// closed); `block` rects make the wall line solid, with trees and rocks drawn on them. The gnome camp: a Gnome Hut in the north-east, 4 gnomes, a pond south-west, a
// plateau north-east, gaps west (where the field's path arrives) and south.
const rect = (cls, c0, r0, c1, r1, props = []) => ({ id: oid++, name: cls, class: cls, x: c0 * T, y: r0 * T, width: (c1 - c0 + 1) * T, height: (r1 - r0 + 1) * T, rotation: 0, visible: true, properties: props });
const polyObj = (cls, pts, props = []) => ({ id: oid++, name: cls, class: cls, x: pts[0][0], y: pts[0][1], width: 0, height: 0, rotation: 0, visible: true,
  polygon: pts.map(([x, y]) => ({ x: x - pts[0][0], y: y - pts[0][1] })), properties: props });
const gateOf = g => { const cs = g.cells; return rect('gate', Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])), Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))) };
const gapOf = key => { const b = SEAL.artBoxOf(key, {}); return b.fh - (b.y + b.h) };      // transparent rows under the art: tile objects are placed by the frame's bottom
const feet = (key, x, y) => tileObj(key, [Math.round(x), Math.round(y + gapOf(key))]);       // ... this places the art's feet at x, y
// The wall line of a clearing: a tree or rock group on every cell that needs a wall (in runs of 2-5 cells of one kind, round the clearing), pulled towards the
// inside so a Pawn stops at the trunk; a `block` rect per run of cells in a row; and outside it a thinner scatter of trees and bushes (p = outer) off the lanes
// that lead out of the gaps and off the `keep` boxes (the way to the stairs). Nothing stands on a gap, nor on the inside but a few bushes at its edge.
function wallObjects(cl, seed, outer, keep = []) {
  const rnd = CL.rng(seed), out = [], cs = [...cl.inside].map(CL.xy), mx = cs.reduce((a, c) => a + c[0], 0) / cs.length + 0.5, my = cs.reduce((a, c) => a + c[1], 0) / cs.length + 0.5;
  const toward = (c, r) => { let ix = 0, iy = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cl.inside.has(CL.idx(c + dx, r + dy))) { ix += dx; iy += dy } const L = Math.hypot(ix, iy) || 1; return [ix / L, iy / L] };
  const lane = new Set();
  for (const g of cl.gaps) { const [ox, oy] = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[g.side]; for (const [c, r] of g.cells) for (let k = 0; k <= 6; k++) for (let l = -1; l <= 1; l++) lane.add(CL.idx(c + ox * k - oy * l, r + oy * k + ox * l)) }
  const nearGap = (c, r, d) => cl.gaps.some(g => g.cells.some(([gc, gr]) => Math.hypot(gc - c, gr - r) <= d));
  const hides = (c, r) => cl.gaps.some(g => g.cells.some(([gc, gr]) => r > gr && r - gr <= 3 && Math.abs(c - gc) <= 1));   // a tree's crown reaches ~3 rows up: none south of a gap, or it hides the opening
  const ring = cl.block.map(i => [i, Math.atan2(CL.xy(i)[1] + 0.5 - my, CL.xy(i)[0] + 0.5 - mx)]).sort((a, b) => a[1] - b[1]);
  let run = 0, kind = 'tree';
  for (const [i] of ring) {
    if (run-- <= 0) { kind = rnd() < 0.55 ? 'tree' : 'rock'; run = 2 + Math.floor(rnd() * 4) }
    const [c, r] = CL.xy(i), [ix, iy] = toward(c, r), at = a => [c * T + 32 + 22 * ix - a * iy + (rnd() - 0.5) * 10, r * T + 32 + 22 * iy + a * ix + (rnd() - 0.5) * 8];
    if (kind === 'tree' && !hides(c, r)) for (const a of [-15, 15]) out.push(feet('tree' + (1 + Math.floor(rnd() * 4)), ...at(a)));
    else {                                                           // a pile: two big rocks side by side, a small one in front, one behind
      out.push(feet(['rock4', 'rock2'][Math.floor(rnd() * 2)], ...at(-17)), feet(['rock3', 'rock4'][Math.floor(rnd() * 2)], ...at(17)));
      out.push(feet('rock1', c * T + 32 + 34 * ix - 6 * iy + (rnd() - 0.5) * 20, r * T + 32 + 34 * iy + 8 * ix));
    }
  }
  const byRow = {};
  for (const i of cl.block) { const [c, r] = CL.xy(i); (byRow[r] ||= []).push(c) }
  for (const [r, cols] of Object.entries(byRow)) {
    cols.sort((a, b) => a - b);
    for (let k = 0, j; k < cols.length; k = j) { for (j = k + 1; j < cols.length && cols[j] === cols[j - 1] + 1; j++); out.push(rect('block', cols[k], +r, cols[j - 1], +r)) }
  }
  const all = new Set([...cl.inside, ...CL.ringOf(cl.inside)]), band2 = CL.ringOf(all), band3 = CL.ringOf(new Set([...all, ...band2]));
  const dense = (c, r) => CL.vnoise((c + 0.5 - mx) / 4 + 7, (r + 0.5 - my) / 4 + 7, seed) > 0.5;   // forest sectors: two more rows of trees
  for (const [band, p] of [[band2, outer], [band3, outer * 0.8]]) for (const i of band) {          // the rings outside the wall line
    const [c, r] = CL.xy(i);
    if (lv[i] !== TR.LV.GROUND || lane.has(i) || keep.some(([c0, r0, c1, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1) || hides(...CL.xy(i)) || rnd() > (dense(c, r) ? Math.min(1, p + 0.45) : p * (band === band2 ? 1 : 0.3))) continue;
    out.push(feet(rnd() < 0.72 ? 'tree' + (1 + Math.floor(rnd() * 4)) : 'bush' + (1 + Math.floor(rnd() * 4)), c * T + 32 + (rnd() - 0.5) * 30, r * T + 36 + (rnd() - 0.5) * 24));
  }
  for (const i of cl.inside) {                                       // a few bushes at the inside edge
    const [c, r] = CL.xy(i);
    if (CL.ringOf(new Set([i])).size && [...CL.ringOf(new Set([i]))].some(j => cl.block.includes(j)) && !nearGap(c, r, 4) && rnd() < 0.14) out.push(feet('bush' + (1 + Math.floor(rnd() * 4)), c * T + 32 + (rnd() - 0.5) * 24, r * T + 40));
  }
  return out;
}
const inCl = (cl, cx, cy) => { if (!cl.inside.has(CL.idx(cx, cy))) throw new Error(`${cl.name}: ${cx},${cy} is not inside`); return [cx, cy] };
const GNOME_GAP = 65;                                                  // transparent rows under a gnome's feet in its 192 px frame
const gnome = (cx, cy, n) => (inCl(camp, cx, cy), tileObj('gnome-idle', [cx * T + T / 2, (cy + 1) * T - T / 2 + GNOME_GAP], undefined, n > 1 ? [P('count', n, 'int')] : []));
objects.push(
  polyObj('camp', CL.outline(camp.inside, T), [P('kind', 'gnome')]), ...camp.gaps.map(gateOf), ...wallObjects(camp, 11, 0.22),
  tileObj('gnome-hut', [35 * T, 16 * T]),
  gnome(31, 16, 2), gnome(30, 19, 1), gnome(34, 19, 1),
  tileObj('bush3', bottom(25, 12)), tileObj('bush2', bottom(40, 22)), tileObj('rock3', bottom(25, 23)), tileObj('tree3', bottom(40, 12)),
  loot('meat', centre(39, 21)),
);
// Enemy areas (a gnome stands with 64 px tiles: `gap` = transparent rows under the feet in the 192 / 256 px frame). `n` makes a pack in a ring.
const foe = (key, gap, cx, cy, n) => tileObj(key + '-idle', [cx * T + T / 2, cy * T + T / 2 + gap], undefined, n > 1 ? [P('count', n, 'int')] : []);
objects.push(
  // snake den: slow, then a lunge. Rocks and a bush to dodge round.
  foe('snake', 69, 47, 15, 2), foe('snake', 69, 54, 19, 2),
  tileObj('rock1', bottom(46, 21)), tileObj('rock3', bottom(53, 14)), tileObj('bush1', bottom(51, 22)), tileObj('tree2', bottom(55, 22)),
  // spider glade: three fast ones that skitter
  foe('spider', 55, 31, 4, 3), foe('spider', 55, 37, 5, 2),
  tileObj('tree1', bottom(27, 3)), tileObj('tree4', bottom(39, 3)), tileObj('bush2', bottom(34, 3)), tileObj('rock2', bottom(26, 6)),
  // slingshot grove: three that keep their distance. A rock and a tree stand in the line of fire (an acorn stops at them)
  foe('slingshot', 55, 29, 32), foe('slingshot', 55, 34, 34), foe('slingshot', 55, 31, 36),
  tileObj('rock2', bottom(31, 30)), tileObj('tree3', bottom(35, 30)), tileObj('rock4', bottom(28, 35)), tileObj('bush3', bottom(36, 36)),
  loot('meat', centre(27, 28)),
);
// The boss clearing: a boss `camp` polygon (about 20 x 16 cells of open ground, the Bear in it far from the gap, 3 rock clusters to crash into), its gap in the north
// (the corridor from the snake den arrives there), a plateau and a pond in its wall, and the shore along its south edge, a cliff over the beach. Stairs in its south-east corner lead down to the
// beach and the dock (boulders close them in the fight, like the gap); the stairs on the land west of its wall are the long way round. The dock is one plank section standing on the beach,
// out over the water (a stepstone: feet may stand on it); the boat floats beside it. Standing in the `dock` rect shows the Board prompt, once the Bear is down.
const rocks = (cx, cy) => (inCl(arena, Math.floor(cx), Math.floor(cy)), [feet('rock4', cx * T, cy * T), feet('rock2', cx * T + 50, cy * T - 14), feet('rock3', cx * T + 22, cy * T - 30), feet('rock1', cx * T - 30, cy * T + 4)]);
objects.push(
  polyObj('camp', CL.outline(arena.inside, T), [P('kind', 'boss')]), ...arena.gaps.map(gateOf), ...wallObjects(arena, 29, 0.6, [[35, 30, 41, 43]]),
  foe('bear', 79, 50, 39), ...rocks(46.5, 34), ...rocks(55, 31.5), ...rocks(45.5, 40),
  tileObj('dock', [50 * T + 32, 45 * T + 8 + 158], 'stepstone'),
  tileObj('boat', [52 * T + 38, 45 * T + 242], 'boat'),
  rect('dock', 50, 45, 50, 46),
);
// named spawn points for ?at=<name> (dev shortcut): the first `spawn` above is the default
const at = (name, cx, cy) => point('spawn', centre(cx, cy), [], name);
objects.push(at('field', 10, 17), at('camp', 24, 17), at('snakes', 45, 17), at('spiders', 29, 6), at('grove', 31, 28), at('arena', 50, 22), at('dock', 50, 45), at('beach', 2, 20), at('islet', 1, 25));
// two enterable houses near the spawn. A door is a rect over the doorway in the art (house1.png: door x 51-77, y 126-162 in the
// 128x192 frame) that reaches down past the base shadow, where the walking-up hero's feet stop. Its `interior` is a map path.
const house2 = tileObj('house1', [416, 768]);
objects.push(house2);
for (const [h, interior] of [[[896, 768], 'maps/interiors/house_a.tmj'], [[416, 768], 'maps/interiors/house_b.tmj']])
  objects.push({ id: oid++, name: 'door', class: 'door', x: h[0] - 64 + 48, y: h[1] - 192 + 126, width: 32, height: 52, rotation: 0, visible: true, properties: [P('interior', interior)] });

const map = {
  type: 'map', version: '1.10', tiledversion: '1.12.2', class: 'chunk', orientation: 'orthogonal', renderorder: 'right-down',
  infinite: false, compressionlevel: -1, width: W, height: H, tilewidth: T, tileheight: T, nextlayerid: C.LAYERS.length + 1, backgroundcolor: C.BG, nextobjectid: oid,
  properties: [P('kind', 'landmark', 'string', 'chunkKind'), P('biomes', 'forest'), P('minIsland', 1, 'int'), P('weight', 1, 'float'), P('mirror', false, 'bool')],
  tilesets: C.tilesets(),
  layers: [...T0.layers, { id: T0.layers.length + 1, name: 'Objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects }],
};
fs.writeFileSync(path.join(R, 'maps/test.tmj'), JSON.stringify(map, null, 1) + '\n');
console.log('maps/test.tmj written,', objects.length, 'objects');
