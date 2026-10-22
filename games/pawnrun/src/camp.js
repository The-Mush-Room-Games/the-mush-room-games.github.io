// Camps: a clearing walled in by trees, rocks, cliffs and water, with 1-2 gaps. A Tiled `camp` (a rect or a polygon) is the inside; each `gate` rect on its edge
// is a gap. The hero's feet well inside the clearing (CAMP.clear px from every gap cell) close the gaps, and until then the camp's foes stay idle (Enemy.caged,
// the Bear sleeps). Gnome camp: Wooden Fence pieces pop up across each gap (with dust). Boss den (kind=boss): boulders fall into the gap (dust, shake), the boss
// bar shows and the Bear rears and roars, then fights; the boulders crumble when it dies. Every foe that started inside is dead -> the gaps open and the
// power-up choice opens (scene.openCards; none for a boss). Cleared is for good. Numbers: data.js (CAMP, FENCE).
// A camp is just cells and gaps (campSpec), so the island generator can build one without Tiled: { cells: Set(row * mw + col), gaps: [{ cells: [[col, row]], dir: 'h' | 'v' }], boss, mw, T }.
// Scene contract (TestMap): scene.hero, scene.enemies, scene.solid(unit, x, y), scene.depthOf, scene.openCards(), scene.hud, place(R) = the scene's way of adding a collision rect.

// Pure. A camp's next state: open -> closed once the hero is in (campEntered), closed -> cleared when no starting enemy is left. Cleared stays.
const campNext = (state, entered, alive) => state === 'open' ? (entered ? 'closed' : 'open') : state === 'closed' && alive === 0 ? 'cleared' : state;

// Pure. The cell index of a point, and whether (x, y) is inside the polygon pts [[x, y]] (even-odd).
const cellAt = (x, y, T, mw) => Math.floor(y / T) * mw + Math.floor(x / T);
function inPoly(pts, x, y) {
  let in_ = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) in_ = !in_;
  return in_;
}
// Pure. The inside cells (a Set of row * mw + col) of a `camp` object from readMap: a rect holds its cells, a polygon the cells whose centre it covers.
function campCells(o, T, mw) {
  const out = new Set(), P = o.poly && o.poly.map(p => [o.x + p.x, o.y + p.y]);
  const x0 = Math.floor((P ? Math.min(...P.map(p => p[0])) : o.x) / T), x1 = Math.ceil((P ? Math.max(...P.map(p => p[0])) : o.x + o.w) / T);
  const y0 = Math.floor((P ? Math.min(...P.map(p => p[1])) : o.y) / T), y1 = Math.ceil((P ? Math.max(...P.map(p => p[1])) : o.y + o.h) / T);
  for (let r = y0; r < y1; r++) for (let c = x0; c < x1; c++) if (!P || inPoly(P, (c + 0.5) * T, (r + 0.5) * T)) out.add(r * mw + c);
  return out;
}
// Pure. The gaps of a clearing: the `gate` rects (readMap objects) with a cell touching the inside (8 neighbours). dir = how the gap is closed: 'h' (a run
// of fence along a row: the inside is above or below the gap) or 'v' (along a column).
function campGaps(gates, cells, T, mw) {
  const has = (c, r) => cells.has(r * mw + c), out = [];
  for (const g of gates) {
    const gc = [];
    for (let r = Math.floor(g.y / T); r < Math.ceil((g.y + g.h) / T); r++) for (let c = Math.floor(g.x / T); c < Math.ceil((g.x + g.w) / T); c++) gc.push([c, r]);
    if (!gc.some(([c, r]) => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => has(c + dx, r + dy))))) continue;
    const ns = gc.filter(([c, r]) => has(c, r - 1) || has(c, r + 1)).length, ew = gc.filter(([c, r]) => has(c - 1, r) || has(c + 1, r)).length;
    out.push({ cells: gc, dir: ns >= ew ? 'h' : 'v' });
  }
  return out;
}
// Pure. What stands in each cell of a gap: [{ c, r, type }], type = a FENCE key, or 'rock' (a boulder) for a boss den. A 'v' fence piece is 'vl' when the inside is east of it.
const gapPieces = (gap, cells, mw, boss) => gap.cells.map(([c, r]) => ({ c, r, type: boss ? 'rock' : gap.dir === 'h' ? 'hz' + (c & 1) : cells.has(r * mw + c + 1) ? 'vl' : 'vr' }));
// Pure. The collision of one gap piece in world px: a boulder fills its cell, a fence piece has its rail / post bands (FENCE).
const pieceRects = (p, T) => (p.type === 'rock' ? [[0, 0, T, T]] : FENCE[p.type][1]).map(b => ({ x0: p.c * T + b[0], y0: p.r * T + b[1], x1: p.c * T + b[2], y1: p.r * T + b[3] }));
// Pure. The camp spec for a `camp` object and the map's `gate` objects.
const campSpec = (o, gates, T, mw) => { const cells = campCells(o, T, mw); return { cells, gaps: campGaps(gates, cells, T, mw), boss: !!(o.props && o.props.kind === 'boss'), mw, T } };
// Pure. Is a hero with feet at (x, y) in the clearing and at least `clear` px from the centre of every gap cell?
const campEntered = (spec, x, y, clear = CAMP.clear) => spec.cells.has(cellAt(x, y, spec.T, spec.mw)) &&
  spec.gaps.every(g => g.cells.every(([c, r]) => Math.hypot(x - (c + 0.5) * spec.T, y - (r + 0.5) * spec.T) >= clear));

class Camp {
  constructor(scene, spec, place) {
    Object.assign(this, spec);                       // cells, gaps, boss, mw, T
    this.scene = scene; this.state = 'open'; this.foes = []; this.spec = spec;
    const T = this.T, cs = [...this.cells].map(i => [i % this.mw, Math.floor(i / this.mw)]);
    this.cx = (cs.reduce((a, c) => a + c[0], 0) / cs.length + 0.5) * T; this.cy = (cs.reduce((a, c) => a + c[1], 0) / cs.length + 0.5) * T;
    this.pieces = [];                                // { imgs, Rs: collision rects, y: resting y, rock }
    const tex = scene.textures.get('fence');
    for (const gap of this.gaps) for (const p of gapPieces(gap, this.cells, this.mw, this.boss)) {
      const x = p.c * T, y = p.r * T;
      if (p.type === 'rock') {                       // a boulder fills its whole cell, and a small rock beside it
        const rest = y + T - 6, big = ['rock4', 'rock2', 'rock3'][(p.c + p.r) % 3], mk = (k, dx, s) => scene.add.image(x + 32 + dx, rest, k).setOrigin(0.5, 1).setScale(s).setDepth(rest + (dx > 0 ? 1 : 0)).setVisible(false);
        this.pieces.push({ imgs: [mk(big, 0, CAMP.scale), mk('rock1', p.c % 2 ? -18 : 18, 1)], Rs: pieceRects(p, T).map(R => place({ ...R, high: false, gone: true })), y: rest, rock: true });
        continue;
      }
      const [[fr, fc], bands] = FENCE[p.type], name = `${fr},${fc}`;
      if (!tex.has(name)) tex.add(name, 0, fc * T, fr * T, T, T);
      const img = scene.add.image(x, y, 'fence', name).setOrigin(0).setDepth(y + Math.max(...bands.map(b => b[3]))).setVisible(false);
      this.pieces.push({ imgs: [img], Rs: pieceRects(p, T).map(R => place({ ...R, high: false, gone: true })), y });
    }
  }
  has(x, y) { return this.cells.has(cellAt(x, y, this.T, this.mw)) }
  // the foes that started inside are this camp's: they stay idle until it closes
  adopt(list) { this.foes = list.filter(e => this.has(e.x, e.y)); for (const e of this.foes) e.camp = this }
  get alive() { return this.foes.filter(e => !e.dead).length }
  update() {
    if (this.state === 'cleared') return;
    const h = this.scene.hero, next = campNext(this.state, !h.dead && lvOf(h) === 0 && campEntered(this.spec, h.x, h.y), this.alive);
    if (next === this.state) return;
    this.state = next;
    next === 'closed' ? this.close() : this.open();
  }
  // the gaps close (fence pieces pop up out of the ground, boulders fall). A foe that somehow got out is put back at the nearest inside cell (a safety net: caged foes
  // never leave), and anyone caught in a gap is moved inwards
  close() {
    const sc = this.scene, T = this.T;
    if (!this.boss) SFX.play(sc, 'camp-close');         // (the boss den's boulders sound as each lands, drop)
    for (const e of this.foes) if (!e.dead && !this.has(e.x, e.y)) {
      let best = null, bd = 1e12;
      for (const i of this.cells) { const x = (i % this.mw + 0.5) * T, y = (Math.floor(i / this.mw) + 0.5) * T, d = Math.hypot(x - e.x, y - e.y); if (d < bd) { bd = d; best = [x, y] } }
      puff(sc, e.x, e.y - 8); e.sprite.setPosition(...best); puff(sc, e.x, e.y - 8);
    }
    this.pieces.forEach((g, i) => {
      for (const R of g.Rs) R.gone = false;
      if (g.rock) return this.drop(g, i);
      const img = g.imgs[0];
      img.setVisible(true).setAlpha(0).setY(g.y + CAMP.sink);
      sc.tweens.add({ targets: img, y: g.y, alpha: 1, duration: CAMP.rise, ease: 'Back.easeOut' });
      puff(sc, img.x + 32, g.y + 46);
    });
    for (const u of [sc.hero, ...this.foes.filter(e => !e.dead)])
      for (let i = 0; i < 40 && sc.solid(u, u.x, u.y); i++) {
        const dx = this.cx - u.x, dy = this.cy - u.y, d = Math.hypot(dx, dy) || 1;
        u.sprite.setPosition(u.x + dx / d * CAMP.push, u.y + dy / d * CAMP.push);
      }
    if (this.boss) sc.time.delayedCall(CAMP.wake * 1000, () => {      // the bar shows and the Bear rears, once the boulders are down
      const b = this.foes[0];
      if (!b || b.dead || sc.hero.dead) return;
      sc.hud?.showBoss(b.b.name, b.b.avatar); sc.hud?.setBossHp(b.hp / b.maxHp); b.wake();
    });
  }
  // a boulder falls from above its cell with a shadow growing under it; it lands with dust, chips and a shake
  drop(g, i) {
    const sc = this.scene, [big, small] = g.imgs, x = big.x, delay = i * CAMP.stagger;
    const sh = g.shadow = sc.add.ellipse(x, g.y - 4, 60, 20, 0, 0.3).setDepth(g.y - 1).setScale(0.3).setAlpha(0);
    sc.tweens.add({ targets: sh, scale: 1, alpha: 0.3, delay, duration: CAMP.fall, ease: 'Quad.easeIn' });
    for (const img of g.imgs) {
      const to = img.y;
      img.setVisible(true).setAlpha(1).setY(to - CAMP.height);
      sc.tweens.add({ targets: img, y: to, delay, duration: CAMP.fall, ease: 'Quad.easeIn', onComplete: () => {
        if (img !== big) return;
        puff(sc, x, g.y - 10); chips(sc, x, g.y - 20, [0x8fb0b0, 0x5a7a80, 0xc9d6d6], 8); sc.cameras.main.shake(180, 0.008); SFX.play(sc, 'rock-drop');
        small.setScale(1.2); sc.tweens.add({ targets: small, scale: 1, duration: 120 });
      } });
    }
  }
  // the gaps open: the fence pieces sink away, the boulders crumble, and the cards open once the dust has settled
  open() {
    const sc = this.scene;
    if (!this.boss) SFX.play(sc, 'camp-clear');         // (the Bear's death has its own fanfare)
    for (const g of this.pieces) {
      for (const R of g.Rs) R.gone = true;
      if (g.rock) {
        const x = g.imgs[0].x;
        sc.tweens.killTweensOf(g.imgs); g.shadow?.destroy();
        for (const img of g.imgs) sc.tweens.add({ targets: img, scale: img.scale * 0.6, alpha: 0, y: img.y + 10, duration: CAMP.crumble, onComplete: () => img.setVisible(false) });
        chips(sc, x, g.y - 24, [0x8fb0b0, 0x5a7a80, 0xc9d6d6], 12); puff(sc, x - 14, g.y - 10); puff(sc, x + 14, g.y - 14);
        continue;
      }
      const img = g.imgs[0];
      sc.tweens.add({ targets: img, y: g.y + CAMP.sink, alpha: 0, duration: CAMP.drop, onComplete: () => img.setVisible(false) });
      puff(sc, img.x + 32, g.y + 46);
    }
    if (this.boss) return void sc.hud?.hideBoss();
    sc.time.delayedCall(CAMP.delay * 1000, () => { if (!sc.hero.dead && !sc.leaving) sc.openCards() });
  }
}

if (typeof module === 'object') module.exports = { pieceRects, campNext, campCells, campGaps, gapPieces, campSpec, campEntered, inPoly };
