// Camps: a Tiled `camp` rect (tile-aligned) holds a Gnome Hut / Tower and some gnomes; a Wooden Fence ring stands on the cells around it, with gaps
// where `gate` rects lie on the ring. The hero's feet entering the rect close the gates (their pieces pop up, with dust, and block); when every enemy
// that started inside is dead they open (the pieces sink) and the power-up choice opens (scene.openCards). Cleared is for good. Numbers: data.js (CAMP, FENCE).
// Scene contract (TestMap): scene.hero, scene.enemies, scene.solid(unit, x, y), scene.depthOf, scene.openCards(), place(R) = the scene's way of adding a collision rect.

// Pure. A camp's next state: open -> closed once the hero's feet are inside, closed -> cleared when no starting enemy is left. Cleared stays.
const campNext = (state, inside, alive) => state === 'open' ? (inside ? 'closed' : 'open') : state === 'closed' && alive === 0 ? 'cleared' : state;

// Pure. The fence ring around the inside cells c0..c1 x r0..r1: [{ c, r, type, gate }], type = a FENCE key. A cell inside one of the `gates`
// ({ c0, r0, c1, r1 } cell boxes) is a gate piece (the piece it closes the run with); the cells beside a gap get end posts.
function ringPieces(c0, r0, c1, r1, gates = []) {
  const isGate = (c, r) => gates.some(g => c >= g.c0 && c <= g.c1 && r >= g.r0 && r <= g.r1), out = [];
  for (let r = r0 - 1; r <= r1 + 1; r++) for (let c = c0 - 1; c <= c1 + 1; c++) {
    const top = r < r0, bot = r > r1, left = c < c0, right = c > c1;
    if (!(top || bot || left || right)) continue;
    let type = (top || bot) && (left || right) ? (top ? 't' : 'b') + (left ? 'l' : 'r') : top || bot ? 'hz' + (c & 1) : left ? 'vl' : 'vr';
    const gate = isGate(c, r);
    if (!gate && (top || bot) && !left && !right) type = isGate(c + 1, r) ? 'endL' : isGate(c - 1, r) ? 'endR' : type;
    out.push({ c, r, type, gate });
  }
  return out;
}

class Camp {
  // o = the camp rect (px, from readMap), gates = the gate rects, place = scene's collision-rect adder, T = tile size
  constructor(scene, o, gates, place, T = 64) {
    this.scene = scene; this.state = 'open'; this.foes = [];
    this.rect = o;
    const c0 = Math.round(o.x / T), r0 = Math.round(o.y / T), c1 = Math.round((o.x + o.w) / T) - 1, r1 = Math.round((o.y + o.h) / T) - 1;
    const cells = gates.map(g => ({ c0: Math.floor(g.x / T), r0: Math.floor(g.y / T), c1: Math.ceil((g.x + g.w) / T) - 1, r1: Math.ceil((g.y + g.h) / T) - 1 }))
      .filter(g => g.c1 >= c0 - 1 && g.c0 <= c1 + 1 && g.r1 >= r0 - 1 && g.r0 <= r1 + 1);   // the gates on this camp's ring
    const tex = scene.textures.get('fence');
    this.gates = [];                                 // { img, R: collision rects, y: the piece's resting y }
    for (const p of ringPieces(c0, r0, c1, r1, cells)) {
      const [[fr, fc], bands] = FENCE[p.type], name = `${fr},${fc}`, x = p.c * T, y = p.r * T;
      if (!tex.has(name)) tex.add(name, 0, fc * T, fr * T, T, T);
      const img = scene.add.image(x, y, 'fence', name).setOrigin(0).setDepth(y + Math.max(...bands.map(b => b[3])));
      const Rs = bands.map(b => place({ x0: x + b[0], y0: y + b[1], x1: x + b[2], y1: y + b[3], high: false, gone: p.gate }));
      if (p.gate) this.gates.push({ img: img.setVisible(false), Rs, y });
    }
  }
  has(x, y) { const o = this.rect; return x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h }
  get alive() { return this.foes.filter(e => !e.dead).length }
  update() {
    if (this.state === 'cleared') return;
    const h = this.scene.hero, next = campNext(this.state, !h.dead && !h.high && this.has(h.x, h.y), this.alive);
    if (next === this.state) return;
    this.state = next;
    next === 'closed' ? this.close() : this.open();
  }
  // the gates pop up out of the ground with dust and block; anyone caught in a gap is moved inwards
  close() {
    const sc = this.scene;
    for (const g of this.gates) {
      for (const R of g.Rs) R.gone = false;
      g.img.setVisible(true).setAlpha(0).setY(g.y + CAMP.sink);
      sc.tweens.add({ targets: g.img, y: g.y, alpha: 1, duration: CAMP.rise, ease: 'Back.easeOut' });
      puff(sc, g.img.x + 32, g.y + 46);
    }
    const o = this.rect, cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    for (const u of [sc.hero, ...this.foes.filter(e => !e.dead)])
      for (let i = 0; i < 40 && sc.solid(u, u.x, u.y); i++) {
        const dx = cx - u.x, dy = cy - u.y, d = Math.hypot(dx, dy) || 1;
        u.sprite.setPosition(u.x + dx / d * CAMP.push, u.y + dy / d * CAMP.push);
      }
  }
  // the gates sink away, and the cards open once the dust has settled
  open() {
    const sc = this.scene;
    for (const g of this.gates) {
      for (const R of g.Rs) R.gone = true;
      sc.tweens.add({ targets: g.img, y: g.y + CAMP.sink, alpha: 0, duration: CAMP.drop, onComplete: () => g.img.setVisible(false) });
      puff(sc, g.img.x + 32, g.y + 46);
    }
    sc.time.delayedCall(CAMP.delay * 1000, () => { if (!sc.hero.dead && !sc.leaving) sc.openCards() });
  }
}

if (typeof module === 'object') module.exports = { campNext, ringPieces };
