// node test/items-check.js : weapon tiers, what a weapon on the ground does (take / swap / cannot use), swapping, and the dynamite / bomb maths (blast overlap, landing, fuse).
const assert = require('assert');
Object.assign(globalThis, require('../src/data.js'));      // hero.js reads data.js globals, as in the browser
const { canUse, weaponStat, weaponAction, giveWeapon } = require('../src/hero.js');
const { circleHitsBox, blastHits, landing, blinkOn } = require('../src/items.js');
const { rollDrops } = require('../src/loot.js');

// tiers: +TIER.dmg damage and +TIER.speed swing speed of the base per step; tier 0 is the base weapon
const near = (a, b) => assert(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
for (const k of Object.keys(WEAPONS)) {
  assert.deepStrictEqual(weaponStat(k), { damage: WEAPONS[k].damage, speed: WEAPONS[k].speed }, k + ' tier 0 = base');
  let last = weaponStat(k, 0);
  for (let t = 1; t < TIER.names.length; t++) { const s = weaponStat(k, t); assert(s.damage > last.damage && s.speed > last.speed, k + ' tier ' + t + ' is better'); last = s }
}
near(weaponStat('axe', 1).damage, 2.5); near(weaponStat('axe', 2).damage, 3); near(weaponStat('hammer', 2).damage, 7.5); near(weaponStat('hammer', 3).speed, 0.85 * 1.24);
assert.strictEqual(TIER.names.length, 4); assert.strictEqual(TIER.tint.length, 4); assert.deepStrictEqual(TIER.names, ['blue', 'red', 'yellow', 'purple'], "the kit's colour order");
assert(weaponStat('axe', 3).damage < ENEMIES.gnome.hp, 'a tier 3 axe still needs 2 hits on a gnome');

// who can use what: the old Pawn only has axe and hammer
assert(canUse('old', 'axe') && canUse('old', 'hammer') && !canUse('old', 'pickaxe') && !canUse('old', 'knife'));
assert(['axe', 'hammer', 'pickaxe', 'knife'].every(k => canUse('new', k)) && !canUse('new', 'sword'));

// the ground: a free slot takes it, full slots offer a swap, a weapon the form has no art for is refused either way
const hero = (form, weapons) => ({ form, weapons: weapons.slice(), tiers: weapons.map(() => 0), active: 0 });
assert.strictEqual(weaponAction(hero('old', ['axe']), 'hammer'), 'take');
assert.strictEqual(weaponAction(hero('old', ['axe', 'hammer']), 'axe'), 'swap');
assert.strictEqual(weaponAction(hero('old', ['axe']), 'pickaxe'), 'cant', 'old Pawn, free slot');
assert.strictEqual(weaponAction(hero('old', ['axe', 'hammer']), 'knife'), 'cant', 'old Pawn, full slots');
assert.strictEqual(weaponAction(hero('new', ['axe']), 'pickaxe'), 'take');

// giving: into the free slot (nothing back), else it replaces the active weapon and hands that one back with its tier
const h = hero('new', ['axe']);
assert.strictEqual(giveWeapon(h, 'hammer', 2), null);
assert.deepStrictEqual([h.weapons, h.tiers], [['axe', 'hammer'], [0, 2]]);
h.active = 1; h.tiers[0] = 1;
assert.deepStrictEqual(giveWeapon(h, 'knife', 3), { key: 'hammer', tier: 2 }, 'the active slot is swapped');
assert.deepStrictEqual([h.weapons, h.tiers, h.active], [['axe', 'knife'], [1, 3], 1]);
h.active = 0;
assert.deepStrictEqual(giveWeapon(h, 'pickaxe', 0), { key: 'axe', tier: 1 });
assert.deepStrictEqual([h.weapons, h.tiers], [['pickaxe', 'knife'], [0, 3]]);

// blast circle vs boxes: touching counts, a hair outside does not; corners use the real distance, not the circle's bounding box
const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
assert(circleHitsBox(0, 0, 10, box(5, -5, 15, 5)) && circleHitsBox(0, 0, 10, box(10, -5, 20, 5)) && !circleHitsBox(0, 0, 10, box(10.01, -5, 20, 5)), 'side edge');
assert(circleHitsBox(0, 0, 10, box(-5, -5, 5, 5)) && circleHitsBox(0, 0, 1, box(-50, -50, 50, 50)), 'centre inside the box / box around the circle');
assert(circleHitsBox(0, 0, 10, box(7, 7, 20, 20)) && !circleHitsBox(0, 0, 10, box(8, 8, 20, 20)), 'corner: 7,7 is 9.9 away, 8,8 is 11.3');
assert.strictEqual(ITEMS.dynamite.enemy, 3); assert.strictEqual(ITEMS.dynamite.hero, 1); assert.strictEqual(ITEMS.bomb.enemy, 6); assert.strictEqual(ITEMS.bomb.hero, 2);
assert(ITEMS.bomb.radius > ITEMS.dynamite.radius && ITEMS.bomb.fuse > ITEMS.dynamite.fuse && ITEMS.bomb.push > ITEMS.dynamite.push, 'the bomb is the bigger blast with the longer fuse');
assert(ITEMS.dynamite.range === 3 * 64 && ITEMS.dynamite.range > ITEMS.dynamite.radius + HERO.box[2], 'thrown 3 tiles: far enough that the thrower is outside his own blast');
assert(ENEMIES.gnome.hp > ITEMS.dynamite.enemy && ENEMIES.gnome.hp <= ITEMS.bomb.enemy, 'a gnome survives one dynamite, not a bomb');
const T3 = [{ box: box(90, -10, 110, 10), high: false, id: 'near' }, { box: box(200, -10, 220, 10), high: false, id: 'far' }, { box: box(90, -10, 110, 10), high: true, id: 'up' }, { box: box(-5, -20, 5, 2), high: false, id: 'hero' }];
assert.deepStrictEqual(blastHits('dynamite', 0, 0, false, T3).map(t => t.id), ['hero'], 'dynamite (72): only what is at its feet');
assert.deepStrictEqual(blastHits('bomb', 0, 0, false, T3).map(t => t.id), ['near', 'hero'], 'bomb (112): the near one too; the far one and the other level stay out');
assert.deepStrictEqual(blastHits('bomb', 0, 0, true, T3).map(t => t.id), ['up'], 'a blast on the plateau only reaches the plateau');
const heroBox = { x0: 192 - 12, y0: -40, x1: 192 + 12, y1: 2 };
assert(!circleHitsBox(0, 0, ITEMS.dynamite.radius, heroBox), 'a 3-tile throw does not hurt him');

// landing: the full range, back-stepping off bad ground, stopping short of a wall but not of water
const open = () => true, none = () => false;
assert.deepStrictEqual(landing(0, 0, 0, 1, 192, open, none), { x: 0, y: 192 }, '3 tiles down');
assert.deepStrictEqual(landing(10, 5, -1, 0, 192, open, none), { x: -182, y: 5 }, 'facing left');
assert.deepStrictEqual(landing(0, 0, 1, 0, 192, x => x <= 100, none), { x: 96, y: 0 }, 'ground ends at 100: it comes down at 96 (steps of 8)');
assert.deepStrictEqual(landing(0, 0, 1, 0, 192, (x, y) => !(x > 50 && x < 120), none), { x: 192, y: 0 }, 'water in the middle: it flies over');
assert.deepStrictEqual(landing(0, 0, 1, 0, 192, open, x => x >= 100), { x: 96, y: 0 }, 'a wall at 100: it stops before it');
assert.deepStrictEqual(landing(0, 0, 1, 0, 192, x => x < 40, x => x >= 100), { x: 32, y: 0 }, 'wall and bad ground: back off to good ground');
assert.deepStrictEqual(landing(5, 7, 0, 1, 192, none, none), { x: 5, y: 7 }, 'nowhere to land: at his feet');

// fuse blink: from 2 to 12 flashes a second, so the last half second flashes much more than the first
const flashes = (a, b, fuse) => { let n = 0, prev = blinkOn(a, fuse); for (let t = a; t <= b; t += 0.002) { const on = blinkOn(t, fuse); if (on && !prev) n++; prev = on } return n };
assert.strictEqual(blinkOn(0, 2), false);
assert(flashes(0, 0.5, 2) <= 2 && flashes(1.5, 2, 2) >= 4, 'flashes: ' + flashes(0, 0.5, 2) + ' in the first half second, ' + flashes(1.5, 2, 2) + ' in the last');
assert(flashes(0, 2, 2) > 10 && flashes(0, 2, 2) < 16, 'about 14 flashes over the 2 s fuse');

// drops: dynamite is a small chance on a gnome, and has art
assert(LOOT.dynamite && LOOT.bomb && LOOT.weapon && ITEMS.dynamite && ITEMS.bomb);
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, N = 8000;
let dyn = 0; for (let i = 0; i < N; i++) if (rollDrops(DROPS.gnome, rnd).some(r => r.kind === 'dynamite')) dyn++;
assert(Math.abs(dyn / N - 0.08) < 0.015, 'gnome dynamite ~8%: ' + dyn / N);
console.log('items-check OK');
