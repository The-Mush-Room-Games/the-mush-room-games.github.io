// node test/props-check.js : what each weapon does to trees, rock piles and gold stones, the gold stone sizes, and the sheep's act picker.
const assert = require('assert');
Object.assign(globalThis, require('../src/data.js'));      // props.js reads data.js globals, as in the browser
const { strike, stoneStep, pickAct } = require('../src/props.js');

const run = (kind, weapons) => { const p = { kind, hp: PROPS[kind].hp }; return weapons.map(w => strike(p, w)) };
assert.deepStrictEqual(run('tree', ['axe', 'axe', 'axe']), ['hit', 'hit', 'done'], '3 axe hits fell a secret tree');
assert.deepStrictEqual(run('tree', ['hammer', 'pickaxe', 'knife', 'axe']), ['clank', 'clank', 'clank', 'hit'], 'only the axe counts; clanks do not hurt');
assert.deepStrictEqual(run('rock', ['hammer']), ['done'], 'a hammer breaks a rock pile in 1');
assert.deepStrictEqual(run('rock', ['pickaxe', 'pickaxe']), ['hit', 'done'], 'a pickaxe in 2');
assert.deepStrictEqual(run('rock', ['axe', 'axe', 'knife']), ['clank', 'clank', 'clank'], 'the axe clanks');
assert.deepStrictEqual(run('rock', ['pickaxe', 'axe', 'pickaxe']), ['hit', 'clank', 'done'], 'a clank does not undo progress');
assert.deepStrictEqual(run('stone', ['pickaxe', 'axe', 'hammer', 'pickaxe']), ['done', 'clank', 'clank', 'done'], 'every pickaxe hit is a step; axe and hammer clank');
const p = { kind: 'rock', hp: 2 }; strike(p, 'hammer'); assert.strictEqual(p.hp, 2, 'hp refills after "done" (a stone steps again)');

// gold stones: 6 -> 1 one size per hit, then gone
const sizes = []; for (let k = 'gold-stone6'; k; k = stoneStep(k)) sizes.push(k);
assert.deepStrictEqual(sizes, [6, 5, 4, 3, 2, 1].map(n => 'gold-stone' + n));
assert.strictEqual(stoneStep('gold-stone1'), null);
for (const [k, [lo, hi]] of Object.entries({ stone: [DROPS.stone[0].min, DROPS.stone[0].max] })) assert(lo >= 1 && hi >= lo, k + ' gold amount');
assert.deepStrictEqual(DROPS.sheep, [{ kind: 'gold' }], 'a sheep: 1 gold');

// sheep acts follow their weights, each within its seconds range
let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const n = {}, N = 6000;
for (let i = 0; i < N; i++) {
  const [mode, t] = pickAct(rnd), [w, lo, hi] = SHEEP.acts[mode];
  assert(t >= lo && t < hi, mode + ' seconds ' + t);
  n[mode] = (n[mode] || 0) + 1;
}
const total = Object.values(SHEEP.acts).reduce((a, [w]) => a + w, 0);
for (const [mode, [w]] of Object.entries(SHEEP.acts)) assert(Math.abs(n[mode] / N - w / total) < 0.03, mode + ' share ' + n[mode] / N);
assert.strictEqual(pickAct(() => 0)[0], 'idle'); assert.strictEqual(pickAct(() => 0.999999)[0], 'walk');
console.log('props-check OK');
