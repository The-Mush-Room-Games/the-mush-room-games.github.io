// One-use items from the bag (hero.items): meat is eaten, dynamite is thrown, a bomb is set down; the last two light a fuse and blast.
// Tunables in data.js ITEMS. Scene contract (TestMap, not Interior): scene.hero, scene.hittables, scene.walkable(unit, bx, by), scene.blast(rect, circle).

// Pure. Does the circle (cx, cy, r) touch box b = { x0, y0, x1, y1 }?
const circleHitsBox = (cx, cy, r, b) => {
  const dx = Math.max(b.x0 - cx, 0, cx - b.x1), dy = Math.max(b.y0 - cy, 0, cy - b.y1);
  return dx * dx + dy * dy <= r * r;
};
// Pure. The targets ({ box, high, ... }) a blast of item `kind` at (cx, cy) on level `high` reaches: same level, box touching the circle.
const blastHits = (kind, cx, cy, high, targets) => targets.filter(t => !!t.high === !!high && circleHitsBox(cx, cy, ITEMS[kind].radius, t.box));
// Pure. Where dynamite thrown from (x, y) facing (ax, ay) comes down: `range` px away, but it stops short of the first spot where wall(x, y) holds
// (a rock, a tree: water does not stop it), and it comes down on the farthest spot from there back to the hero where ok(x, y) holds.
function landing(x, y, ax, ay, range, ok, wall, step = 8) {
  let far = range;
  for (let d = step; d <= range; d += step) if (wall(x + ax * d, y + ay * d)) { far = d - step; break }
  for (let d = far; d > 0; d -= step) if (ok(x + ax * d, y + ay * d)) return { x: x + ax * d, y: y + ay * d };
  return { x, y };
}
// Pure. Is a fuse flashing t seconds into its `fuse` seconds? The rate climbs from 2 to 12 flashes a second (phase = 2t + 5t^2/fuse).
const blinkOn = (t, fuse) => Math.floor((2 * t + 5 * t * t / fuse) * 2) % 2 === 1;

// Use bag slot i: meat is eaten (not at full hp), the others leave the bag and go off. Interiors have nothing to blast, so only meat works there.
function useItem(scene, i) {
  const h = scene.hero, k = h.items[i];
  if (!k || h.dead || scene.leaving) return;
  if (k === 'meat') return eatMeat(h, i);
  if (!scene.hittables) return;
  h.items.splice(i, 1);
  if (k === 'dynamite') throwDynamite(scene); else plantBomb(scene);
}
// dynamite: up and over to its landing spot (spinning, with a shadow on the ground), then it lies there with the fuse sparking
function throwDynamite(scene) {
  const h = scene.hero, d = ITEMS.dynamite, a = h.aim, hi = h.high;
  const L = landing(h.x, h.y, a.x, a.y, d.range, (x, y) => scene.walkable(h, x, y), (x, y) => scene.solid(h, x, y));
  const s = scene.add.sprite(h.x, h.y - 30, 'odynamite').play('odynamite'), depth = L.y + (hi ? HIGH_DEPTH : 0);
  const sh = scene.add.ellipse(h.x, h.y, 14, 5, 0, 0.3).setDepth(depth - 0.5);
  const x0 = h.x, y0 = h.y;
  s.setDepth(depth + 1);
  scene.tweens.addCounter({ from: 0, to: 1, duration: d.fly * 1000,
    onUpdate: t => {
      const k = t.getValue(), x = Phaser.Math.Linear(x0, L.x, k), y = Phaser.Math.Linear(y0, L.y, k);
      sh.setPosition(x, y);
      s.setPosition(x, Phaser.Math.Linear(y0 - 30, L.y - 8, k) - Math.sin(Math.PI * k) * d.arc).setAngle(80 - 1080 * (1 - k));   // 3 turns, ends lying down
    },
    onComplete: () => { s.setPosition(L.x, L.y - 8).setAngle(80); fuse(scene, 'dynamite', s, L.x, L.y, hi, sh, () => Phaser.Math.RotateAround(new Phaser.Math.Vector2(s.x + 4, s.y - 26), s.x, s.y, s.rotation)) } });
}
// bomb: set down at his feet, lit
function plantBomb(scene) {
  const h = scene.hero;
  const s = scene.add.sprite(h.x, h.y, 'bomb-lit').setOrigin(0.5, 0.62).setDepth(h.y + (h.high ? HIGH_DEPTH : 0) - 1).play('bomb-lit');
  fuse(scene, 'bomb', s, h.x, h.y, h.high, null, () => ({ x: s.x, y: s.y - 24 }));
}
// the fuse burns `fuse` s: sparks at the tip (flashing white, faster and faster), then the item is gone and it blasts
function fuse(scene, kind, s, x, y, high, shadow, tip) {
  const d = ITEMS[kind];
  let last = 0;
  scene.tweens.addCounter({ from: 0, to: d.fuse, duration: d.fuse * 1000,
    onUpdate: t => {
      if (scene.time.now - last > 90) { last = scene.time.now; const p = tip(); chips(scene, p.x, p.y, [0xffd34d, 0xffffff, 0xff8a2a], 2, 0.5) }
      blinkOn(t.getValue(), d.fuse) ? s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL) : s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    },
    onComplete: () => { s.destroy(); shadow && shadow.destroy(); explode(scene, kind, x, y, high) } });
}
// the bang: the kit's Explosion scaled to the blast circle, a shake, damage and a push to enemies, sheep and the hero inside it, and rock piles break
function explode(scene, kind, x, y, high) {
  const d = ITEMS[kind], h = scene.hero, r = d.radius, b = HERO.box;
  const e = scene.add.sprite(x, y - 12, d.art).setDepth(1e5).setScale(r / d.artR).play(d.art);
  e.once('animationcomplete', () => e.destroy());
  scene.cameras.main.shake(180, kind === 'bomb' ? 0.012 : 0.007);
  const targets = scene.hittables.filter(t => t.enemy || t.sheep).map(t => ({ box: t.hb, high: t.high, t }));
  targets.push({ box: { x0: h.x + b[0], y0: h.y + b[1], x1: h.x + b[2], y1: h.y + b[3] }, high: h.high, hero: true });
  for (const t of blastHits(kind, x, y, high, targets)) {
    if (t.hero) h.hurt(d.hero, x, y, d.push);
    else if (t.t.enemy) t.t.enemy.hurt(d.enemy, x, y, d.push);
    else t.t.sheep.hurt(x, y);
  }
  scene.blast({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }, { x, y, r });
}

if (typeof module === 'object') module.exports = { circleHitsBox, blastHits, landing, blinkOn };
