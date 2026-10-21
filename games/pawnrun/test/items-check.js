// node test/items-check.js : weapon tiers, what a weapon on the ground does (take / swap / cannot use), swapping, blast overlap and damage.
const assert = require('assert');
Object.assign(globalThis, require('../src/data.js'));      // hero.js reads data.js globals, as in the browser
const { canUse, weaponStat, weaponAction, giveWeapon } = require('../src/hero.js');

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
console.log('items-check OK');
