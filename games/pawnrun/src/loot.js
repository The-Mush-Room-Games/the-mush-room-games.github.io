// Loot: drop rolls, pickups on the ground, the bag. Tunables in data.js (DROPS, LOOT, PICKUP, BAG, MEAT_HEAL); the bag's size is hero.bag (BAG + power-ups).
// Gold and ducks live in scene.registry ('gold', 'ducks', so they outlive a restart); the bag is hero.items (carried by Hero.state/load).
// Weapons lie there too ({ kind: 'weapon', weapon, tier }): a free slot takes them, else a prompt over the pickup (scene.prompt) offers F to swap.
// Scene contract: scene.hero, scene.loot (array), scene.walkable(unit, bx, by).

// Pure. Rows of a drop table -> [{ kind, n }]; rnd() is in [0, 1).
const rollDrops = (table, rnd = Math.random) => table.filter(r => r.p === undefined || rnd() < r.p)
  .map(r => ({ kind: r.kind, n: r.min === undefined ? 1 : r.min + Math.floor(rnd() * (r.max - r.min + 1)), ...(r.weapon && { weapon: r.weapon, tier: r.tier || 0 }) }));
// Pure. Does unit u's feet box F (on its own level) overlap the square of half-size r around pickup p?
const pickedUp = (F, u, p, r = PICKUP.r) => (u.high | 0) === (p.high | 0) &&
  u.x + F.x > p.x - r && u.x - F.x < p.x + r && u.y + F.bottom > p.y - r && u.y - F.top < p.y + r;
// Pure. Eat the meat in bag slot i: heals up to max, not at full hp. True when eaten.
function eatMeat(h, i, heal = MEAT_HEAL) {
  if (h.dead || h.items[i] !== 'meat' || h.hp >= h.maxHp) return false;
  h.items.splice(i, 1); h.hp = Math.min(h.maxHp, h.hp + heal);
  return true;
}

// A pickup at ground point (x, y). `from` = [x, y] it pops out of (arcs down to the ground); without it, it is just there.
function spawnLoot(scene, kind, x, y, high, n = 1, from, extra) {
  const L = LOOT[kind], c = scene.add.container(x, y), p = { c, kind, n, x, y, high: high | 0, landed: false, ...extra };
  if (kind === 'weapon')                                                    // a base in the tier colour, and the tier number on it
    c.add([scene.add.ellipse(0, -3, 38, 14, TIER.tint[p.tier], 0.8).setStrokeStyle(2, 0x161c2e),
      ...(p.tier ? [scene.add.text(0, -3, p.tier, txt(11, undefined, undefined, NUMFONT)).setOrigin(0.5)] : [])]);
  const art = scene.add.sprite(0, L.dy, L.tex || TOOL_ICON[p.weapon]);
  if (L.anim) art.play(L.anim);
  if (L.tint) art.setTint(L.tint);
  c.add(art);
  if (L.glint) c.add(scene.add.sprite(0, L.dy, L.glint).play(L.glint));     // sparkle overlay
  c.setDepth(y - 1 + lift(high));
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
  for (const { kind, n, weapon, tier } of rollDrops(table)) {
    const w = weapon === 'any' ? Phaser.Utils.Array.GetRandom(Object.keys(WEAPONS).filter(k => canUse(scene.hero.form, k))) : weapon;
    let tx = x, ty = y;
    for (let i = 0; i < 6; i++) {                                           // a few tries for a walkable landing spot
      const a = Math.random() * 2 * Math.PI, r = Phaser.Math.Between(...PICKUP.scatter), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (scene.walkable({ high }, px, py)) { tx = px; ty = py; break }
    }
    spawnLoot(scene, kind, tx, ty, high, n, [x, y - 16], w && { weapon: w, tier });
  }
}
// Take pickup p: a weapon into a free slot, an item into the bag if it has room. Gold and ducks add to the registry.
function collect(scene, p) {
  const h = scene.hero, reg = scene.registry;
  if (p.kind === 'weapon') { if (weaponAction(h, p.weapon) !== 'take') return false; giveWeapon(h, p.weapon, p.tier) }
  else if (ITEMS[p.kind]) { if (h.items.length >= h.bag) return false; h.items.push(p.kind) }   // meat, dynamite, bomb: the bag, if it has room
  else { const k = p.kind === 'duck' ? 'ducks' : 'gold'; reg.set(k, (reg.get(k) || 0) + (k === 'gold' ? Math.round(p.n * h.pw.gold) : p.n)) }   // Gold Fever
  scene.tweens.killTweensOf(p.c);
  scene.tweens.add({ targets: p.c, y: p.c.y - 14, scale: 1.5, alpha: 0, duration: 160, onComplete: () => p.c.destroy() });
  return true;
}
// Per frame: collect what the hero's feet box touches (landed pickups only). A weapon he stands on but cannot take gets the prompt.
function tickLoot(scene) {
  const h = scene.hero;
  if (h.dead) return setPrompt(scene);
  const F = lvOf(h) > 0 ? FEET_HIGH : FEET;
  scene.loot = scene.loot.filter(p => !(p.landed && pickedUp(F, h, p) && collect(scene, p)));
  const w = scene.loot.find(p => p.kind === 'weapon' && p.landed && pickedUp(F, h, p));
  setPrompt(scene, w, w && weaponAction(h, w.weapon));
}
// The prompt over weapon pickup p: 'swap' = "F swap" (a tap on touch), 'cant' = the kit's forbidden cursor and "can't use". No p hides it.
function setPrompt(scene, p, action) {
  let pr = scene.prompt;
  if (!pr) {
    const c = scene.add.container(0, 0).setDepth(1e5).setVisible(false), t = scene.add.text(0, 0, '', txt(16)).setOrigin(0.5), no = scene.add.image(0, 0, 'cursor03');
    c.add([no, t]);
    if (uiTouch(scene)) { c.setSize(90, 36); c.setInteractive(); c.on('pointerdown', () => scene.pend.pick = true) }   // a tap on the prompt swaps
    pr = scene.prompt = { c, t, no, action: null };
  }
  pr.action = p ? action : null;
  pr.p = p;
  pr.c.setVisible(!!p);
  if (!p) return;
  pr.no.setVisible(action === 'cant').setPosition(-42, 0);
  pr.t.setText(action === 'cant' ? "can't use" : uiTouch(scene) ? 'tap: swap' : 'F swap').setX(action === 'cant' ? 8 : 0);
  pr.c.setPosition(p.x, p.y - 92 + Math.sin(scene.time.now / 200) * 2);
}
// F (or a tap on the prompt): swap the weapon under the hero with his active one; the old one lies where the new one was.
function swapPickup(scene) {
  const pr = scene.prompt, h = scene.hero;
  if (!pr || pr.action !== 'swap' || h.dead) return false;
  const p = pr.p, old = giveWeapon(h, p.weapon, p.tier);
  scene.tweens.killTweensOf(p.c); p.c.destroy();
  scene.loot = scene.loot.filter(q => q !== p);
  spawnLoot(scene, 'weapon', p.x, p.y, p.high, 1, undefined, { weapon: old.key, tier: old.tier });
  setPrompt(scene);
  return true;
}

if (typeof module === 'object') module.exports = { rollDrops, pickedUp, eatMeat };
