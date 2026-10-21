// Loot: drop rolls, pickups on the ground, the bag. Tunables in data.js (DROPS, LOOT, PICKUP, BAG, MEAT_HEAL).
// Gold and ducks live in scene.registry ('gold', 'ducks', so they outlive a restart); the bag is hero.items (carried by Hero.state/load).
// Scene contract: scene.hero, scene.loot (array), scene.walkable(unit, bx, by).

// Pure. Rows of a drop table -> [{ kind, n }]; rnd() is in [0, 1).
const rollDrops = (table, rnd = Math.random) => table.filter(r => r.p === undefined || rnd() < r.p)
  .map(r => ({ kind: r.kind, n: r.min === undefined ? 1 : r.min + Math.floor(rnd() * (r.max - r.min + 1)) }));
// Pure. Does unit u's feet box F (on its own level) overlap the square of half-size r around pickup p?
const pickedUp = (F, u, p, r = PICKUP.r) => !!u.high === !!p.high &&
  u.x + F.x > p.x - r && u.x - F.x < p.x + r && u.y + F.bottom > p.y - r && u.y - F.top < p.y + r;
// Pure. Eat the meat in bag slot i: heals up to max, not at full hp. True when eaten.
function eatMeat(h, i, heal = MEAT_HEAL) {
  if (h.dead || h.items[i] !== 'meat' || h.hp >= h.maxHp) return false;
  h.items.splice(i, 1); h.hp = Math.min(h.maxHp, h.hp + heal);
  return true;
}

// A pickup at ground point (x, y). `from` = [x, y] it pops out of (arcs down to the ground); without it, it is just there.
function spawnLoot(scene, kind, x, y, high, n = 1, from) {
  const L = LOOT[kind], c = scene.add.container(x, y), p = { c, kind, n, x, y, high: !!high, landed: false };
  const art = scene.add.sprite(0, L.dy, L.tex);
  if (L.anim) art.play(L.anim);
  if (L.tint) art.setTint(L.tint);
  c.add(art);
  if (L.glint) c.add(scene.add.sprite(0, L.dy, L.glint).play(L.glint));     // sparkle overlay
  c.setDepth(y - 1 + (high ? HIGH_DEPTH : 0));
  const land = () => {
    p.landed = true; c.setPosition(x, y);
    scene.tweens.add({ targets: c, y: y - 3, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });   // bob
  };
  if (!from) land();
  else {
    c.setPosition(from[0], from[1]);
    scene.tweens.addCounter({ from: 0, to: 1, duration: PICKUP.pop, ease: 'Sine.easeOut', onComplete: land,
      onUpdate: t => { const k = t.getValue(); c.setPosition(Phaser.Math.Linear(from[0], x, k), Phaser.Math.Linear(from[1], y, k) - Math.sin(Math.PI * k) * PICKUP.arc) } });
  }
  scene.loot.push(p);
  return p;
}
// Roll a drop table and scatter the results around (x, y), onto ground the unit's level can stand on.
function dropLoot(scene, table, x, y, high) {
  for (const { kind, n } of rollDrops(table)) {
    let tx = x, ty = y;
    for (let i = 0; i < 6; i++) {                                           // a few tries for a walkable landing spot
      const a = Math.random() * 2 * Math.PI, r = Phaser.Math.Between(...PICKUP.scatter), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (scene.walkable({ high }, px, py)) { tx = px; ty = py; break }
    }
    spawnLoot(scene, kind, tx, ty, high, n, [x, y - 16]);
  }
}
// Take pickup p if the bag has room (meat). Gold and ducks add to the registry.
function collect(scene, p) {
  const h = scene.hero, reg = scene.registry;
  if (p.kind === 'meat') { if (h.items.length >= BAG) return false; h.items.push('meat') }
  else { const k = p.kind === 'duck' ? 'ducks' : 'gold'; reg.set(k, (reg.get(k) || 0) + p.n) }
  scene.tweens.killTweensOf(p.c);
  scene.tweens.add({ targets: p.c, y: p.c.y - 14, scale: 1.5, alpha: 0, duration: 160, onComplete: () => p.c.destroy() });
  return true;
}
// Per frame: collect what the hero's feet box touches (landed pickups only).
function tickLoot(scene) {
  const h = scene.hero;
  if (h.dead) return;
  const F = h.high ? FEET_HIGH : FEET;
  scene.loot = scene.loot.filter(p => !(p.landed && pickedUp(F, h, p) && collect(scene, p)));
}

if (typeof module === 'object') module.exports = { rollDrops, pickedUp, eatMeat };
