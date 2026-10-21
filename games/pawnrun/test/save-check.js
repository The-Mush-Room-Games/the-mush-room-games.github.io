// node test/save-check.js : the save (load / merge with bad data), shop affordability and caps, skill points and the class pick, and the upgrades applied to a new run.
const assert = require('assert');
Object.assign(globalThis, require('../src/data.js'));      // save.js reads data.js globals, as in the browser
const { ASSETS } = require('../src/assets.js');
const S = require('../src/save.js');
const { powerStats } = require('../src/powers.js');
const { canUse } = require('../src/hero.js');
const fresh = () => S.defaultSave();

// merge: anything from storage becomes a valid save, never a throw
assert.deepStrictEqual(S.mergeSave(undefined), fresh()); assert.deepStrictEqual(S.mergeSave(null), fresh()); assert.deepStrictEqual(S.mergeSave('x'), fresh()); assert.deepStrictEqual(S.mergeSave([1]), fresh());
const bad = S.mergeSave({ gold: -5, ducks: 'many', best: NaN, up: { shield: 99, hammer: 'yes', nope: 3, meat: 1.7 }, skills: { hp: 2, dmg: 50, ghost: 1 }, form: 'purple', cls: 'lancer' });
assert.deepStrictEqual(bad, { gold: 0, ducks: 0, up: { shield: 3, meat: 1 }, skills: { hp: 2, dmg: 5 }, form: 'old', cls: 'lancer', best: 0 }, JSON.stringify(bad));   // ranks clamp to their caps, junk drops
assert.strictEqual(S.mergeSave({ cls: 'lancer' }).cls, null, 'a class needs the level');
assert.strictEqual(S.mergeSave({ cls: 'wizard', skills: { hp: 5 } }).cls, null, 'an unknown class');
assert.strictEqual(S.mergeSave({ up: { newpawn: 1 }, form: 'old' }).form, 'new', 'owning the New Pawn means the new form');
const ok = { gold: 12, ducks: 3, up: { hammer: 1, coin: 2 }, skills: { hp: 3, dash: 2 }, form: 'new', cls: 'monk', best: 4 };
assert.deepStrictEqual(S.mergeSave(JSON.parse(JSON.stringify(ok))), ok, 'a good save round-trips');
// storage: a throwing or empty store gives a fresh save, a write that throws is reported
const mem = {}, store = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v } };
assert.deepStrictEqual(S.loadSave(store), fresh());
assert(S.writeSave(ok, store)); assert.deepStrictEqual(S.loadSave(store), ok);
mem[SAVE_KEY] = '{not json'; assert.deepStrictEqual(S.loadSave(store), fresh(), 'corrupt JSON');
assert.deepStrictEqual(S.loadSave({ getItem() { throw new Error('denied') } }), fresh()); assert.deepStrictEqual(S.loadSave(null), fresh());
assert.strictEqual(S.writeSave(ok, { setItem() { throw new Error('quota') } }), false); assert.strictEqual(S.writeSave(ok, null), false);

// the tables hold together: every shop item is sold by exactly one vendor who exists, icons and art are real, costs rise
const sold = Object.values(SHOPS).flat();
assert.deepStrictEqual([...sold].sort(), Object.keys(UPGRADES).sort(), 'every upgrade is on one shelf');
for (const [id, u] of Object.entries(UPGRADES)) {
  assert(['gold', 'ducks'].includes(u.cur) && u.cost.length >= 1 && u.cost.every((c, i) => c > 0 && (!i || c > u.cost[i - 1])), id + ' costs');
  assert(u.icon[0] in ASSETS, id + ' icon ' + u.icon[0]); for (const k of Object.keys(u.perm || {})) assert(k in STAT0, id + ' perm ' + k);
}
for (const [id, k] of Object.entries(SKILLS)) { assert(k.cap >= 1 && k.icon[0] in ASSETS, id); for (const s of Object.keys(k.perm)) assert(s in STAT0, id + ' stat ' + s) }
for (const [id, n] of Object.entries(NPCS)) { assert(n.lines.length && n.avatar in ASSETS && (!n.shop || SHOPS[n.shop]), id); assert(n.key in ASSETS, id + ' art') }
for (const [id, c] of Object.entries(CLASSES)) assert(c.perks.every(([lv]) => lv >= CLASS_LEVEL) && c.text, id);
assert(Object.keys(SHOPS).every(v => Object.values(NPCS).some(n => n.shop === v)), 'every shop has a vendor');
assert(Object.values(NPCS).some(n => n.train), 'a trainer');

// shopping: affordability, caps, the right currency, nothing changes on a refusal
let s = fresh();
assert.deepStrictEqual(S.shopInfo(s, 'shield'), { rank: 0, max: 3, cost: 30, cur: 'gold', state: 'poor' });
assert.strictEqual(S.buy(s, 'shield'), false); assert.deepStrictEqual(s, fresh(), 'a refusal changes nothing');
s.gold = 400; s.ducks = 1;
for (const [want, left] of [[30, 370], [60, 310], [100, 210]]) { assert.strictEqual(S.buy(s, 'shield'), true); assert.strictEqual(s.gold, left, 'paid ' + want) }
assert.strictEqual(S.shopInfo(s, 'shield').state, 'max'); assert.strictEqual(S.buy(s, 'shield'), false, 'capped at +3'); assert.strictEqual(s.up.shield, 3); assert.strictEqual(s.gold, 210);
assert.strictEqual(S.shopInfo(s, 'newpawn').state, 'poor', 'ducks are not gold'); assert.strictEqual(S.buy(s, 'newpawn'), false);
assert.strictEqual(S.shopInfo(s, 'secondwind').state, 'poor', '1 duck < 2'); s.ducks = 5;
assert.strictEqual(S.buy(s, 'newpawn'), true); assert.deepStrictEqual([s.ducks, s.form], [2, 'new']); assert.strictEqual(S.buy(s, 'newpawn'), false, 'one New Pawn');
assert.strictEqual(S.buy(s, 'nope'), false);
for (const id of Object.keys(UPGRADES)) { const t = fresh(); t.gold = t.ducks = 1e6; for (let i = 0; i < UPGRADES[id].cost.length; i++) assert(S.buy(t, id), id + ' rank ' + (i + 1)); assert(!S.buy(t, id), id + ' cap') }   // every upgrade can be bought up to its cap

// skills: the price climbs with the level, whichever stat; caps; refund returns the last price; the class unlocks at CLASS_LEVEL and is for good
s = fresh(); s.gold = 1e5;
assert.deepStrictEqual([0, 1, 2, 3].map(S.skillCost), [20, 35, 50, 65]);
for (let n = 0; n < CLASS_LEVEL; n++) { assert.strictEqual(S.classState(s), 'low'); assert.strictEqual(S.pickClass(s, 'monk'), false); const g = s.gold; assert(S.buySkill(s, Object.keys(SKILLS)[n % 3])); assert.strictEqual(g - s.gold, S.skillCost(n)) }
assert.strictEqual(S.level(s), CLASS_LEVEL); assert.strictEqual(S.classState(s), 'pick');
assert.strictEqual(S.pickClass(s, 'wizard'), false); assert(S.pickClass(s, 'lancer')); assert.strictEqual(s.cls, 'lancer'); assert.strictEqual(S.pickClass(s, 'monk'), false, 'for good'); assert.strictEqual(S.classState(s), 'chosen');
assert.strictEqual(S.refundSkill(s, 'hp'), 0, 'not below the class level'); assert.strictEqual(S.level(s), 5);
assert(S.buySkill(s, 'hp')); const g0 = s.gold; assert.strictEqual(S.refundSkill(s, 'hp'), S.skillCost(5)); assert.strictEqual(s.gold, g0 + S.skillCost(5), 'the refund is the price of the last point'); assert.strictEqual(S.level(s), 5);
t = fresh(); t.gold = 1e5; for (let i = 0; i < SKILLS.charges.cap + 1; i++) S.buySkill(t, 'charges'); assert.strictEqual(t.skills.charges, 1, 'capped');
var t; let spent = 0; const u = fresh(); u.gold = 1e5; for (const id of ['hp', 'dmg', 'dmg']) { S.buySkill(u, id) } for (const id of ['hp', 'dmg', 'dmg']) spent += S.refundSkill(u, id); assert.strictEqual(spent, 20 + 35 + 50); assert.strictEqual(u.gold, 1e5, 'buy then refund everything: back to the start'); assert.deepStrictEqual(u.skills, {});
assert.strictEqual(S.skillInfo(fresh(), 'hp').state, 'poor'); assert.strictEqual(S.buySkill(fresh(), 'hp'), false);

// a run: an empty save = the plain starter (axe, no extras); each upgrade shows up in the hero's start
let r = S.runStart(fresh());
assert.deepStrictEqual(r, { form: 'old', weapons: ['axe'], tiers: [0], active: 0, hp: 99, flip: false, powers: [], perm: {}, revive: 0, items: [] });
const all = fresh(); all.gold = all.ducks = 1e6; for (const id of Object.keys(UPGRADES)) while (S.buy(all, id)); for (const id of Object.keys(SKILLS)) while (S.buySkill(all, id));
r = S.runStart(all);
assert.deepStrictEqual([r.form, r.weapons, r.tiers, r.revive], ['new', ['axe', 'hammer'], [2, 2], 1]); assert(r.weapons.every(k => canUse(r.form, k)));
assert.deepStrictEqual(r.items, ['meat', 'meat'], 'two rations');
const st = powerStats([]); for (const [k, v] of Object.entries(r.perm)) st[k] += v;
assert.strictEqual(st.hp, 3 + 5); assert(Math.abs(st.gold - 1.3) < 1e-9 && Math.abs(st.dmg - 1.4) < 1e-9 && Math.abs(st.speed - 1.2) < 1e-9 && Math.abs(st.dashRate - 1.48) < 1e-9, JSON.stringify(st));
assert.deepStrictEqual([st.slots, st.charges], [2, 2], 'two bags, a second dash charge');
assert.strictEqual(S.runStart(Object.assign(fresh(), { up: { meat: 2 } })).items.length, 2); assert(S.runStart(Object.assign(fresh(), { up: { meat: 2 } })).items.length <= BAG);
assert.deepStrictEqual(S.runStart(Object.assign(fresh(), { up: { hammer: 1 } })).weapons, ['axe', 'hammer']);
// the perm stats do not alias the save, and a hero (no phaser needed) of that state would read them
const q = S.runStart(all); q.perm.hp = 99; assert.strictEqual(S.permStats(all).hp, 8, 'a fresh perm every call');
console.log('save-check OK: ' + Object.keys(UPGRADES).length + ' upgrades, ' + Object.keys(SKILLS).length + ' skills, ' + Object.keys(NPCS).length + ' npcs, level ' + S.level(all) + ' with everything');
