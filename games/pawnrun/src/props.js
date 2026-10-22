// Map props that react to the hero's weapons: choppable trees, rock piles, gold stones, and wandering sheep.
// Numbers in data.js (PROPS, STUMP, SHEEP, DROPS). Scene contract (TestMap): scene.hittables, scene.herd, scene.addRects(o, key, high, rs),
// scene.hurtboxOf(o, key), scene.moveFeet(unit, dx, dy), scene.depthOf(unit), scene.walkable, scene.hero; artBox() from TestMap.js.

// Pure. A weapon hit on prop p ({ kind, hp }): 'clank' (the weapon is not listed for it), 'hit', or 'done' (hp used up, refilled for the next step).
function strike(p, weapon, table = PROPS) {
  const d = table[p.kind].dmg[weapon];
  if (!d) return 'clank';
  p.hp -= d;
  if (p.hp > 0) return 'hit';
  p.hp = table[p.kind].hp;
  return 'done';
}
// Pure. The next size down of a gold stone (null after size 1, which is the last).
const stoneStep = key => { const n = +key.slice(-1) - 1; return n ? 'gold-stone' + n : null };
// Pure. A sheep's next act: [mode, seconds]; rnd() is in [0, 1).
function pickAct(rnd = Math.random, acts = SHEEP.acts) {
  const es = Object.entries(acts);
  let r = rnd() * es.reduce((a, [, [w]]) => a + w, 0);
  for (const [mode, [w, lo, hi]] of es) if ((r -= w) < 0) return [mode, lo + rnd() * (hi - lo)];
}

// a dust puff that deletes itself
function puff(scene, x, y) {
  const p = scene.add.sprite(x, y, 'dust1').setDepth(1e5).play('dust1');
  p.once('animationcomplete', () => p.destroy());
}
// n small chips flying out of (x, y); power < 1 for a spark
function chips(scene, x, y, colors, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const c = scene.add.rectangle(x, y, 4, 4, Phaser.Utils.Array.GetRandom(colors)).setDepth(1e5), a = -Math.PI * Math.random(), v = Phaser.Math.Between(20, 40) * power;
    scene.tweens.add({ targets: c, x: x + Math.cos(a) * v, y: y + Math.sin(a) * v + 12 * power, alpha: 0, angle: 180, duration: 350, ease: 'Quad.easeOut', onComplete: () => c.destroy() });
  }
}

// A hittable with hp: a secret tree (-> stump), a secret rock (rock pile), a gold stone (steps down a size). t = its entry in scene.hittables,
// Rs = its collision rects, feet = the ground y of its art. A tree gets a mushroom at its foot as the cue.
class Prop {
  constructor(scene, o, kind, t, Rs, feet) {
    this.scene = scene; this.o = o; this.kind = kind; this.t = t; this.Rs = Rs; this.s = t.s; this.feet = feet; this.key = o.key;
    this.hp = PROPS[kind].hp; this.high = t.high;
    const d = this.s.depth;
    if (kind === 'tree') scene.add.image(o.x + 28, feet + 3, 'odeco02').setOrigin(0.5, 0.85).setDepth(d + 1);
    if (kind === 'stone') this.glint = scene.add.sprite(o.x, o.y, o.key + '-highlight').setOrigin(0.5, 1).setDepth(d + 0.1).play(o.key + '-highlight');
  }
  hit(weapon, x, y) {
    const sc = this.scene, r = strike(this, weapon);
    if (r === 'clank') { SFX.play(sc, 'hit-metal'); return chips(sc, x, y, [0xffffff, 0xffe066], 5, 0.6) }   // a spark; the scene's wobble is the recoil
    SFX.play(sc, this.kind === 'tree' ? (weapon === 'axe' ? 'chop' : 'hit-wood') : 'hit-rock');
    chips(sc, x, y, PROPS[this.kind].chips, r === 'done' ? 10 : 4);
    if (r === 'done') this.done();
  }
  // the prop's last hit (also what a blast calls)
  done() {
    const sc = this.scene, s = this.s;
    SFX.play(sc, this.kind === 'tree' ? 'tree-fall' : 'rock-break');
    if (this.kind === 'tree') {                                 // a stump with its own, smaller collision
      const key = this.key.replace('tree', 'stump'), b = artBox(sc, key);
      this.swap(key, [{ x: b.x + (b.w - STUMP.w) / 2, y: b.y + b.h - 2 - STUMP.h, w: STUMP.w, h: STUMP.h }]);
      this.t.prop = null;
      puff(sc, s.x, this.feet - 8);
    } else if (this.kind === 'stone') {
      dropLoot(sc, DROPS.stone, s.x, this.feet, this.high);
      const key = stoneStep(this.key);
      key ? this.swap(key) : this.vanish();
    } else this.vanish();
  }
  // new art on the same feet, with new collision (rs, else the default band)
  swap(key, rs) {
    const sc = this.scene, s = this.s, b = artBox(sc, key);
    this.Rs.forEach(R => R.gone = true);
    this.key = key;
    s.stop(); s.setTexture(key).setY(this.feet + b.fh - b.y - b.h);
    const at = { ...this.o, key, rects: [], y: s.y };
    this.Rs = sc.addRects(at, key, this.high, rs);
    Object.assign(this.t.hb, sc.hurtboxOf(at, key));
    if (this.glint) this.glint.setY(s.y).play(key + '-highlight');
  }
  vanish() {
    const sc = this.scene;
    this.Rs.forEach(R => R.gone = true);
    sc.hittables = sc.hittables.filter(t => t !== this.t);
    puff(sc, this.s.x, this.feet - 8);
    this.s.destroy(); this.glint && this.glint.destroy();
  }
}

// A sheep: idles, grazes and strolls near its spot; a hit makes it run from the hero for a moment. No hp. The first hit drops 1 gold.
class Sheep {
  constructor(scene, x, y, high) {
    const b = artBox(scene, 'sheep-idle'), e = this;
    this.scene = scene; this.high = high; this.rail = null; this.home = { x, y }; this.mode = 'idle'; this.t = Phaser.Math.FloatBetween(0.2, 2);
    this.fleeT = this.flashT = 0; this.from = { x, y }; this.goal = { x, y }; this.paid = false;
    this.sprite = scene.add.sprite(x, y, 'sheep-idle').setOrigin(0.5, (b.y + b.h) / b.fh).play('sheep-idle');
    this.hb = {};
    scene.herd.push(this);
    scene.hittables.push(this.ht = { s: this.sprite, sheep: this, hb: this.hb, get high() { return e.high } });
  }
  get x() { return this.sprite.x } get y() { return this.sprite.y }
  update(dt) {
    dt = Math.min(dt, 0.05);
    const s = this.sprite, d = SHEEP, sc = this.scene;
    this.t -= dt; this.flashT -= dt;
    let vx = 0, vy = 0, anim = 'sheep-idle', ts = 1;
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      const dx = this.x - this.from.x, dy = this.y - this.from.y, l = Math.hypot(dx, dy) || 1;
      vx = dx / l * d.fleeSpeed; vy = dy / l * d.fleeSpeed; anim = 'sheep-move'; ts = 2;
    } else {
      if (this.t <= 0) {
        [this.mode, this.t] = pickAct();
        if (this.mode === 'walk') {
          const a = Math.random() * 2 * Math.PI, r = Math.sqrt(Math.random()) * d.wander;
          this.goal = { x: this.home.x + Math.cos(a) * r, y: this.home.y + Math.sin(a) * r };
        }
      }
      if (this.mode === 'graze') anim = 'sheep-grass';
      else if (this.mode === 'walk') {
        const dx = this.goal.x - this.x, dy = this.goal.y - this.y, l = Math.hypot(dx, dy);
        if (l < 3) this.t = 0;
        else { vx = dx / l * d.speed; vy = dy / l * d.speed; anim = 'sheep-move'; ts = 0.6 }
      }
    }
    if (vx || vy) {
      const x0 = this.x, y0 = this.y;
      this.sprite.setPosition(...sc.moveFeet(this, vx * dt, vy * dt));
      if (Math.abs(this.x - x0) + Math.abs(this.y - y0) < 0.2 * Math.hypot(vx, vy) * dt) this.t = 0;   // blocked: pick something else
      if (Math.abs(vx) > 1) s.setFlipX(vx < 0);
    }
    s.anims.timeScale = ts; s.play(anim, true);
    if (this.flashT > 0) s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    s.setDepth(sc.depthOf(this));
    const b = d.hurtbox;
    Object.assign(this.hb, { x0: this.x + b[0], y0: this.y + b[1], x1: this.x + b[2], y1: this.y + b[3] });
  }
  hurt(fromX, fromY) {
    SFX.play(this.scene, 'hit-bush');
    this.flashT = SHEEP.flash; this.fleeT = SHEEP.flee; this.from = { x: fromX, y: fromY };
    if (!this.paid) { this.paid = true; dropLoot(this.scene, DROPS.sheep, this.x, this.y, this.high) }
  }
}

if (typeof module === 'object') module.exports = { strike, stoneStep, pickAct };
