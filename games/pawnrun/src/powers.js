// Power-ups: the card draw, stacking and the stats they add up to. Pure; the numbers and the list are in data.js (POWERUPS, RARITY, STAT0).
// A hero owns a list of { id, k }: one entry per stack, k = powerK(island) when it was taken (a % card scales with the island).

// Pure. How much stronger a power-up is on island n (1 = no change).
const powerK = (island = 1) => Math.min(POWER_SCALE.cap, 1 + POWER_SCALE.perIsland * (island - 1));
const powerCount = (owned, id) => owned.filter(p => p.id === id).length;
// Pure. [[id, stacks]] in the order first taken (the HUD row).
const powerCounts = owned => [...owned.reduce((m, p) => m.set(p.id, (m.get(p.id) || 0) + 1), new Map())];
// Pure. The ids a card draw may pick from: not `off`, not already at `max` stacks.
const powerPool = owned => Object.keys(POWERUPS).filter(id => !POWERUPS[id].off && !(POWERUPS[id].max && powerCount(owned, id) >= POWERUPS[id].max));
// Pure. n distinct ids drawn by rarity weight (RARITY[r].weight per card); rnd() is in [0, 1). Fewer come back when the pool is smaller.
function drawCards(n, owned = [], rnd = Math.random) {
  const pool = powerPool(owned), out = [];
  while (out.length < n && pool.length) {
    let r = rnd() * pool.reduce((a, id) => a + RARITY[POWERUPS[id].rarity].weight, 0), i = 0;
    for (; i < pool.length - 1; i++) if ((r -= RARITY[POWERUPS[pool[i]].rarity].weight) < 0) break;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
// Pure. The stats of a list of stacks: STAT0 plus each stack's add (x k for a `scale` one).
function powerStats(owned) {
  const s = { ...STAT0 };
  for (const { id, k = 1 } of owned) { const p = POWERUPS[id]; if (p.stat) s[p.stat] += p.add * (p.scale ? k : 1) }
  return s;
}
// Pure. The card's effect line for a power-up taken on `island`: "+15% damage".
function powerText(id, island = 1) {
  const p = POWERUPS[id], v = p.add * (p.scale ? powerK(island) : 1) * (p.pct ? 100 : 1);
  return p.text.replace('{v}', +v.toFixed(1));
}
// Pure. Take power-up id on `island`: it joins the list (an instant card, like a full heal, is not kept). Returns false at `max` stacks.
function addPower(owned, id, island = 1) {
  const p = POWERUPS[id];
  if (!p || (p.max && powerCount(owned, id) >= p.max)) return false;
  if (p.stat) owned.push({ id, k: powerK(island) });
  return true;
}

if (typeof module === 'object') module.exports = { powerK, powerCount, powerCounts, powerPool, drawCards, powerStats, powerText, addPower };
