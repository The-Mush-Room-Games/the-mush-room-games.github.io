// node test/loot-check.js : drop tables, the pickup overlap rule, eating meat, the enemy mode machine.
const assert = require('assert');
Object.assign(globalThis, require('../src/data.js'));     // loot.js / enemies.js read data.js globals, as in the browser
const { FEET, FEET_HIGH } = require('../src/terrain.js');
const { rollDrops, pickedUp, eatMeat } = require('../src/loot.js');
const { nextMode } = require('../src/enemies.js');

// seeded rng so the rolls are repeatable
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const run = (table, n) => { const r = rng(7), out = []; for (let i = 0; i < n; i++) out.push(rollDrops(table, r)); return out };

// gnome: always one gold pickup of 2..4, meat about 25% of the time
const g = run(DROPS.gnome, 4000);
assert(g.every(d => d[0].kind === 'gold' && d[0].n >= 2 && d[0].n <= 4), 'gold is 2..4');
assert.deepStrictEqual([2, 3, 4].map(n => g.some(d => d[0].n === n)), [true, true, true], 'every amount shows up');
const meat = g.filter(d => d.some(x => x.kind === 'meat')).length / g.length;
assert(Math.abs(meat - 0.25) < 0.03, 'meat ~25%: ' + meat);
// bush: 20% for exactly 1 gold
const b = run(DROPS.bush, 4000), hit = b.filter(d => d.length);
assert(Math.abs(hit.length / b.length - 0.2) < 0.03, 'bush ~20%: ' + hit.length / b.length);
assert(hit.every(d => d.length === 1 && d[0].kind === 'gold' && d[0].n === 1), 'bush drops 1 gold');
assert.deepStrictEqual(rollDrops(DROPS.bush, () => 0.19999), [{ kind: 'gold', n: 1 }]);
assert.deepStrictEqual(rollDrops(DROPS.bush, () => 0.2), []);
for (const t of Object.values(DROPS)) for (const r of t) assert(LOOT[r.kind], 'drop kind has loot art: ' + r.kind);

// pickup: the feet box touches the square around the pickup, same level only
const p = { x: 100, y: 100, high: false }, hero = (x, y, high = false) => ({ x, y, high });
const r = PICKUP.r;
assert(pickedUp(FEET, hero(100, 100), p), 'on top');
assert(pickedUp(FEET, hero(100 + r + FEET.x - 1, 100), p) && !pickedUp(FEET, hero(100 + r + FEET.x, 100), p), 'right edge');
assert(pickedUp(FEET, hero(100 - r - FEET.x + 1, 100), p) && !pickedUp(FEET, hero(100 - r - FEET.x, 100), p), 'left edge');
assert(pickedUp(FEET, hero(100, 100 + r + FEET.top - 1), p) && !pickedUp(FEET, hero(100, 100 + r + FEET.top), p), 'below: the feet box reaches up by top');
assert(pickedUp(FEET, hero(100, 100 - r - FEET.bottom + 1), p) && !pickedUp(FEET, hero(100, 100 - r - FEET.bottom), p), 'above: by bottom');
assert(!pickedUp(FEET, hero(100, 100, true), p) && pickedUp(FEET_HIGH, hero(100, 100, true), { ...p, high: true }), 'levels apart');

// bag: meat heals MEAT_HEAL up to max, never at full hp, and leaves the bag
const h = { items: ['meat', 'meat'], hp: 2, maxHp: 5 };
assert(eatMeat(h, 1) && h.hp === 2 + MEAT_HEAL && h.items.length === 1);
h.hp = 4; assert(eatMeat(h, 0) && h.hp === 5 && !h.items.length, 'capped at max');
assert(!eatMeat({ items: ['meat'], hp: 5, maxHp: 5 }, 0), 'full hp keeps the meat');
assert(!eatMeat({ items: [], hp: 1, maxHp: 5 }, -1) && !eatMeat({ items: ['meat'], hp: 1, maxHp: 5, dead: true }, 0), 'nothing / dead');

// enemy modes: sight 5 tiles, give up past 8, attack when adjacent and the cooldown is over
const d = ENEMIES.gnome, m = (mode, dist, same = true, ready = true) => nextMode(mode, dist, same, d, ready);
assert.strictEqual(m('idle', d.sight - 1), 'chase');
assert.strictEqual(m('idle', d.sight + 1), 'idle');
assert.strictEqual(m('idle', d.sight - 1, false), 'idle', 'not across levels');
assert.strictEqual(m('chase', d.lose - 1), 'chase');
assert.strictEqual(m('chase', d.lose + 1), 'idle');
assert.strictEqual(m('chase', d.reach), 'attack');
assert.strictEqual(m('chase', d.reach, true, false), 'chase', 'cooldown');
assert.strictEqual(m('attack', 500, false), 'attack', 'a swing finishes');
assert.strictEqual(m('chase', 10, false), 'idle', 'hero dead or elsewhere');
assert(d.hp === 4 && WEAPONS.axe.damage * 2 >= d.hp && WEAPONS.axe.damage < d.hp && WEAPONS.hammer.damage >= d.hp, 'gnome: 2 axe hits or 1 hammer hit');
console.log('loot-check OK');
