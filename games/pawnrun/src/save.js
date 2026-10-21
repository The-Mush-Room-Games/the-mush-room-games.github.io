// The save and the town's rules, pure (node-loadable): what is kept between runs, what a shop item or a skill point costs, and what a run starts with.
// Tunables: data.js (UPGRADES, SHOPS, SKILLS, SKILL_COST, CLASSES). The save is { gold, ducks, up: { id: rank }, skills: { id: rank }, form, cls, best } in localStorage[SAVE_KEY].
// Gold and ducks live in the game registry while playing; main.js copies them into SAVE and writes it on every change.

const defaultSave = () => ({ gold: 0, ducks: 0, up: {}, skills: {}, form: 'old', cls: null, best: 0 });
const natural = (v, max = 1e9) => Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
const level = save => Object.values(save.skills).reduce((a, n) => a + n, 0);       // the skill points bought
// Pure. Whatever came out of storage -> a valid save: wrong types, unknown ids and ranks over a cap are dropped or clamped. Never throws.
function mergeSave(raw) {
  const s = defaultSave();
  if (!raw || typeof raw !== 'object') return s;
  s.gold = natural(raw.gold); s.ducks = natural(raw.ducks); s.best = natural(raw.best, 999);
  const ranks = (into, from, table, cap) => { for (const id of Object.keys(table)) { const n = natural(from && from[id], cap(table[id])); if (n) into[id] = n } };
  ranks(s.up, raw.up, UPGRADES, u => u.cost.length); ranks(s.skills, raw.skills, SKILLS, k => k.cap);
  s.form = raw.form === 'new' || s.up.newpawn ? 'new' : 'old';
  s.cls = CLASSES[raw.cls] && level(s) >= CLASS_LEVEL ? raw.cls : null;
  return s;
}
// The browser side. ponytail: one save slot, no versioning; a bad or missing save is a fresh one.
const saveStore = () => { try { return localStorage } catch { return null } };
function loadSave(store = saveStore()) { try { return mergeSave(JSON.parse(store.getItem(SAVE_KEY))) } catch { return defaultSave() } }
function writeSave(save, store = saveStore()) { try { store.setItem(SAVE_KEY, JSON.stringify(save)); return true } catch { return false } }
let SAVE;                                                       // the live save (main.js loads it)

// Pure. The rank of a shop item and what its next rank costs: { rank, max, cost (null at the cap), cur, state }, state = 'buy' | 'poor' | 'max'.
function shopInfo(save, id) {
  const u = UPGRADES[id], rank = save.up[id] || 0, max = u.cost.length, cost = rank < max ? u.cost[rank] : null;
  const have = u.cur === 'ducks' ? save.ducks : save.gold;
  return { rank, max, cost, cur: u.cur, state: cost === null ? 'max' : have >= cost ? 'buy' : 'poor' };
}
// Pure. Buy the next rank of a shop item: takes the price from the save. Returns false (and changes nothing) when it is maxed or too dear.
function buy(save, id) {
  const i = UPGRADES[id] && shopInfo(save, id);
  if (!i || i.state !== 'buy') return false;
  save[i.cur === 'ducks' ? 'ducks' : 'gold'] -= i.cost;
  save.up[id] = i.rank + 1;
  if (id === 'newpawn') save.form = 'new';
  return true;
}
// Pure. The price of the next skill point (the level decides it, not the stat), and the same for a skill: { rank, cap, cost, state } (state 'buy' | 'poor' | 'max').
const skillCost = lv => SKILL_COST.base + SKILL_COST.step * lv;
function skillInfo(save, id) {
  const rank = save.skills[id] || 0, cap = SKILLS[id].cap, cost = skillCost(level(save));
  return { rank, cap, cost, state: rank >= cap ? 'max' : save.gold >= cost ? 'buy' : 'poor' };
}
function buySkill(save, id) {
  const i = SKILLS[id] && skillInfo(save, id);
  if (!i || i.state !== 'buy') return false;
  save.gold -= i.cost; save.skills[id] = i.rank + 1;
  return true;
}
// Pure. Give a skill point back for the price of the last one bought (any stat: what you spent is the same sum). Not below a chosen class's level. Returns the gold, or 0.
function refundSkill(save, id) {
  const rank = save.skills[id] || 0, lv = level(save);
  if (!rank || (save.cls && lv - 1 < CLASS_LEVEL)) return 0;
  const back = skillCost(lv - 1);
  save.gold += back; rank > 1 ? save.skills[id] = rank - 1 : delete save.skills[id];
  return back;
}
// Pure. Can a class be picked now? ('pick' = yes, 'low' = level too low, 'chosen' = one was chosen already). Picking is for good.
const classState = save => save.cls ? 'chosen' : level(save) >= CLASS_LEVEL ? 'pick' : 'low';
function pickClass(save, id) {
  if (!CLASSES[id] || classState(save) !== 'pick') return false;
  save.cls = id;
  return true;
}
// Pure. What the shop upgrades and skills add to the hero's stats (STAT0 keys: hp, gold, slots, dmg, speed, dashRate, charges), summed over ranks.
function permStats(save) {
  const out = {};
  for (const [table, owned] of [[UPGRADES, save.up], [SKILLS, save.skills]])
    for (const [id, rank] of Object.entries(owned)) for (const [k, v] of Object.entries(table[id]?.perm || {})) out[k] = (out[k] || 0) + v * rank;
  return out;
}
// Pure. The hero a new run starts with, in Hero.state form: the loadout (axe, plus the hammer if bought), the whetstone's tier, the meat rations (as many as the bag holds),
// the permanent stats (perm) and the Second Wind (revive). hp is a ceiling: Hero.load() clamps it to the max.
function runStart(save) {
  const perm = permStats(save), weapons = ['axe', ...(save.up.hammer ? ['hammer'] : [])], tier = save.up.whetstone || 0;
  return { form: save.form, weapons, tiers: weapons.map(() => tier), active: 0, hp: 99, flip: false, powers: [], perm, revive: save.up.secondwind || 0,
    items: Array((save.up.meat || 0) && Math.min(save.up.meat, BAG + (perm.slots || 0))).fill('meat') };
}

if (typeof module === 'object') module.exports = { defaultSave, mergeSave, loadSave, writeSave, level, shopInfo, buy, skillCost, skillInfo, buySkill, refundSkill, classState, pickClass, permStats, runStart };
