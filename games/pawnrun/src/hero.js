// The hero: movement, swing, dash, hurt, death. One class for both forms (old Pawn / new Pawn).
// Scene contract: scene.moveFeet(unit, dx, dy) -> [x, y], scene.depthOf(unit), scene.walkable(unit, bx, by) (TestMap, Interior). Events on scene.events:
//   'hero-hit' { rect: {x0,y0,x1,y1}, high, damage, weapon }   'hero-hurt' { hp, dmg, x, y }   'hero-dead'   'hero-swap' { weapon }
// update(dt, input): dt in SECONDS; input = { move: Vector2 (len <= 1), swing, dash, swap } (last 3 = pressed this frame).
// Pure. Can this form swing weapon `key`? (the old Pawn has no pickaxe or knife)
const canUse = (form, key) => !!(WEAPONS[key] && WEAPONS[key].anim[form]);
// Pure. A weapon at a tier: damage and swing speed (animation timeScale). Tier steps are TIER.dmg / TIER.speed of the base each.
const weaponStat = (key, tier = 0) => ({ damage: WEAPONS[key].damage * (1 + TIER.dmg * tier), speed: WEAPONS[key].speed * (1 + TIER.speed * tier) });
// Pure. What a weapon on the ground offers hero h (anything with form, weapons): 'cant', 'take' (a free slot), or 'swap' (both slots full: F).
const weaponAction = (h, key) => !canUse(h.form, key) ? 'cant' : h.weapons.length < 2 ? 'take' : 'swap';
// Pure. Give h the weapon: a free slot takes it (null back), else it replaces the active one and that one is returned as { key, tier }.
function giveWeapon(h, key, tier) {
  if (h.weapons.length < 2) { h.weapons.push(key); h.tiers.push(tier); return null }
  const old = { key: h.weapons[h.active], tier: h.tiers[h.active] };
  h.weapons[h.active] = key; h.tiers[h.active] = tier;
  return old;
}

class Hero {
  constructor(scene, x, y, { form = 'old', weapons = ['axe', 'hammer'], tiers = [], high = false, perm = {}, revive = 0 } = {}) {
    this.scene = scene; this.form = form;
    const ws = weapons.map((k, i) => [k, tiers[i] || 0]).filter(([k]) => canUse(form, k)).slice(0, 2);
    if (!ws.length) ws.push(['axe', 0]);
    this.weapons = ws.map(w => w[0]); this.tiers = ws.map(w => w[1]);    // two slots; tiers[i] = tier of weapons[i]
    this.active = 0;
    const st = HERO[form];
    this.perm = { ...perm }; this.revive = revive;    // what the town gave: permanent stats (STAT0 keys, added to the power-ups') and the Second Wind left (src/save.js runStart)
    this.powers = [];                                // power-up stacks { id, k } (powers.js); applyPowers() turns them into stats
    this.applyPowers(); this.hp = this.maxHp; this.dashHave = this.dashMax;
    this.sprite = scene.add.sprite(x, y, form === 'old' ? 'opawn' : 'pawn-idle-' + this.weapons[0]).setOrigin(0.5, st.originY);
    this.aim = new Phaser.Math.Vector2(1, 0);       // facing, one of the 4 directions: swings go this way
    this.swing = null;                               // { w, key, hit } while swinging
    this.swingCd = 0; this.buf = 0;                  // recovery after a swing, buffered swing press
    this.high = high;                                // on a plateau; only ramps change it (scene.moveFeet)
    this.rail = null;                                // set by scene.moveFeet while riding a ramp
    this.dashT = 0; this.dashCd = 0; this.dashDir = new Phaser.Math.Vector2();
    this.inv = 0;                                    // invulnerable seconds left (dash and hurt)
    this.hurtT = 0; this.flashT = 0;                 // blink time, red flash time
    this.kbT = 0; this.kbV = new Phaser.Math.Vector2();
    this.dead = false;
    this.items = [];                                 // the bag: item keys, at most `bag`
    this.sprite.play(this.anim('idle'));
  }
  get x() { return this.sprite.x } get y() { return this.sprite.y }
  get weapon() { return this.weapons[this.active] }
  get tier() { return this.tiers[this.active] }
  get state() { return { form: this.form, weapons: this.weapons.slice(), tiers: this.tiers.slice(), active: this.active, hp: this.hp, flip: this.sprite.flipX, items: this.items.slice(), powers: this.powers.map(p => ({ ...p })), perm: { ...this.perm }, revive: this.revive } }   // carried between scenes
  load(st) {
    this.powers = (st.powers || []).map(p => ({ ...p })); this.perm = { ...st.perm }; this.revive = st.revive || 0; this.applyPowers();
    this.weapons = st.weapons.slice(); this.tiers = st.tiers.slice(); this.active = st.active; this.hp = Math.min(st.hp, this.maxHp); this.items = st.items.slice(); this.sprite.setFlipX(st.flip);
    this.swing = null; this.dashT = this.kbT = this.buf = 0; this.dashHave = this.dashMax; this.sprite.play(this.anim('idle'));
  }
  // the power-up stats (this.pw) and what hangs on them: max hp, speed, dash charges
  applyPowers() {
    const pw = this.pw = powerStats(this.powers), st = HERO[this.form];
    for (const [k, v] of Object.entries(this.perm)) pw[k] += v;
    this.maxHp = st.hp + pw.hp; this.speed = st.speed * pw.speed; this.dashMax = pw.charges;
  }
  // take a power-up (the card the hero picked): its stacks join the list, and what it gives at once (hp, a dash charge) comes with it
  addPower(id, island = 1) {
    const p = POWERUPS[id], charges = this.dashMax;
    if (!addPower(this.powers, id, island)) return false;
    this.applyPowers();
    this.hp = p.full ? this.maxHp : Math.min(this.maxHp, this.hp + (p.heal || 0));
    this.dashHave += this.dashMax - charges;
    return true;
  }
  get bag() { return BAG + this.pw.slots }          // item slots
  get dashTime() { return DASH.cooldown / this.pw.dashRate }   // seconds to win one dash charge back
  get dashFrac() { return this.dashHave >= this.dashMax ? 1 : 1 - Math.max(0, this.dashCd) / this.dashTime }

  anim(kind) {                                       // 'idle' | 'run' | 'roll' (the new Pawn tucks his tool away to roll)
    if (this.form === 'old' && this.aim.y < 0 && (kind === 'idle' || kind === 'run')) return `opawn-back-${kind}`;   // facing up: his back
    return this.form === 'old' ? HERO.old[kind] : kind === 'roll' ? 'pawn-roll' : `pawn-${kind}-${this.weapon}`;
  }
  step(dx, dy) {                                     // the scene slides the feet along walls and carries them along ramps
    const [x, y] = this.scene.moveFeet(this, dx, dy);
    this.sprite.setPosition(x, y);
  }
  puff(x, y) {                                       // a dust1 puff that deletes itself
    const p = this.scene.add.sprite(x, y - 8, 'dust1').setDepth(this.scene.depthOf(this) + 1).play('dust1');
    p.once('animationcomplete', () => p.destroy());
  }

  update(dt, input) {
    dt = Math.min(dt, 0.05);                         // a lag spike must not let a dash step over a wall
    const s = this.sprite, scene = this.scene;
    this.dashCd -= dt; this.swingCd -= dt; this.buf -= dt; this.inv -= dt; this.hurtT -= dt; this.flashT -= dt; this.kbT -= dt;
    if (this.dead) return;
    if (this.dashHave < this.dashMax && this.dashCd <= 0) { this.dashHave++; this.dashCd += this.dashTime }   // a charge is back; the next one starts at once

    const move = input.move, moving = move.lengthSq() > 0.01;
    // facing (Zelda): the direction walked; on a diagonal keep the facing if it is one of the two directions held
    if (moving && !this.swing) {
      const a = this.aim, held = (v, f) => f !== 0 && Math.sign(v) === f && Math.abs(v) > 0.3;
      if (!held(move.x, a.x) && !held(move.y, a.y))
        Math.abs(move.x) >= Math.abs(move.y) ? a.set(Math.sign(move.x), 0) : a.set(0, Math.sign(move.y));
      if (Math.abs(move.x) > 0.1 && this.dashT <= 0) s.setFlipX(move.x < 0);   // a roll keeps its side
    }

    if (input.swap && !this.swing && this.weapons.length > 1) {
      this.active = (this.active + 1) % this.weapons.length;
      scene.events.emit('hero-swap', { weapon: this.weapon });
    }
    if (input.swing) this.buf = 0.2;                 // a press during a swing fires right after it
    if (input.dash && this.dashHave > 0 && this.kbT <= 0) this.startDash(moving ? move : this.aim);
    if (this.buf > 0 && !this.swing && this.swingCd <= 0 && this.dashT <= 0 && this.kbT <= 0) this.startSwing();

    // movement
    if (this.kbT > 0) this.step(this.kbV.x * dt, this.kbV.y * dt);
    else if (this.dashT > 0) {
      const k = 1 - this.dashT / DASH.time;           // roll speed follows the art: slow tuck, fast roll, slow rise
      this.dashT -= dt;
      const d = this.speed * DASH.mult * Math.PI / 2 * Math.sin(Math.PI * k) * dt;
      this.step(this.dashDir.x * d, this.dashDir.y * d);
    } else {
      const k = this.speed * dt * (this.swing ? HERO.swingSlow : 1);
      this.step(move.x * k, move.y * k);
    }

    if (this.swing) this.tickSwing(dt);
    else if (this.dashT <= 0) {                      // the roll plays out on its own (startDash)
      s.anims.timeScale = 1;
      s.play(this.anim(moving ? 'run' : 'idle'), true);
    }

    // look: red flash, blink while hurt-invulnerable
    if (this.flashT > 0) s.setTint(0xff3030).setTintMode(Phaser.TintModes.FILL);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    s.setAlpha(this.hurtT > 0 ? (Math.floor(this.hurtT * 16) % 2 ? 0.35 : 1) : 1);
    s.setDepth(scene.depthOf(this));
  }

  startSwing() {
    const w = WEAPONS[this.weapon], s = this.sprite, st = weaponStat(this.weapon, this.tier);
    st.damage *= this.pw.dmg; st.speed *= this.pw.swing;                // power-ups
    this.buf = 0;
    this.swing = { w, key: this.weapon, hit: false, ...st };           // damage and speed at this tier
    s.anims.timeScale = st.speed;
    const v = this.aim.y < 0 ? 'up' : this.aim.y > 0 ? 'down' : '';   // up/down have their own back/front-view strips
    if (v) s.setFlipX(false);                                         // up/down strips are drawn right-handed: never mirror them
    s.play(v ? `${this.form === 'old' ? 'o' : ''}pawn-${this.weapon}-${v}` : w.anim[this.form]);
  }
  tickSwing(dt) {
    const sw = this.swing, s = this.sprite;
    const frame = s.anims.currentFrame ? s.anims.currentFrame.index - 1 : 0, done = !s.anims.isPlaying;
    if (!sw.hit && (frame >= sw.w.hitFrame[this.form] || done)) {
      sw.hit = true;                                 // the slash box from the art (facing right), turned to the facing:
      let [x0, y0, x1, y1] = sw.w.hit[this.form];
      const k = this.pw.reach, a = this.aim, c = HERO[this.form].bodyY;
      if (k !== 1) { const my = (y0 + y1) / 2, hh = (y1 - y0) / 2 * k; x1 = x0 + (x1 - x0) * k; y0 = my - hh; y1 = my + hh }   // Long Arm: a bigger box
      const w = (y1 - y0) / 2;
      sw.off = a.x > 0 ? [x0, y0, x1, y1] : a.x < 0 ? [-x1, y0, -x0, y1]       // mirrored for left,
        : a.y < 0 ? [-w, -c - x1, w, -c - x0] : [-w, -c + x0, w, -c + x1];     // up/down: around the body's middle
      this.emitHit(sw.damage);
      if (this.pw.twice) sw.again = HIT2.delay;      // Twin Strike
    }
    if (sw.again > 0 && (done || (sw.again -= dt) <= 0)) { sw.again = 0; this.emitHit(sw.damage * HIT2.mult) }
    if (done) { this.swingCd = sw.w.recover; this.swing = null; }
  }
  emitHit(damage) {                                  // the slash box (sw.off, from the feet) where the hero stands now
    const sw = this.swing, [x0, y0, x1, y1] = sw.off;
    this.scene.events.emit('hero-hit', { rect: { x0: this.x + x0, x1: this.x + x1, y0: this.y + y0, y1: this.y + y1 }, high: this.high, damage, weapon: sw.key });
  }

  startDash(dir) {
    if (this.dashHave >= this.dashMax) this.dashCd = this.dashTime;   // a charge spent starts the recharge unless one is already running
    this.dashHave--;
    this.dashT = DASH.time; this.inv = Math.max(this.inv, DASH.invuln);
    this.dashDir.copy(dir).normalize();
    if (Math.abs(this.dashDir.x) > 0.1) this.sprite.setFlipX(this.dashDir.x < 0);
    this.swing = null; this.buf = 0;
    const key = this.anim('roll'), s = this.sprite;
    s.anims.timeScale = 1; s.play({ key, frameRate: this.scene.anims.get(key).frames.length / DASH.time });
    this.puff(this.x, this.y);
  }

  // true when the hit landed (not while invulnerable or dead)
  hurt(dmg, fromX, fromY, kb = HERO.knockback) {      // kb = knockback distance in px (a blast pushes harder)
    if (this.dead || this.inv > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.inv = this.hurtT = HERO.hurtInvuln; this.flashT = HERO.flashTime;
    this.swing = null; this.dashT = 0; this.buf = 0;
    this.kbV.set(this.x - fromX, this.y - fromY);
    if (this.kbV.lengthSq() < 1e-4) this.kbV.set(-(this.sprite.flipX ? -1 : 1), 0);
    this.kbV.normalize().scale(kb / HERO.knockbackTime);
    this.kbT = HERO.knockbackTime;
    this.scene.events.emit('hero-hurt', { hp: this.hp, dmg, x: this.x, y: this.y });
    if (this.hp <= 0) this.revive > 0 ? this.rise() : this.die();
    return true;
  }
  // Second Wind: down, but up again once per run, at half hp and safe for a moment
  rise() {
    this.revive--; this.hp = Math.ceil(this.maxHp / 2); this.inv = 1.5; this.hurtT = 1.5; this.kbT = 0;
    this.scene.events.emit('hero-rise', { x: this.x, y: this.y });
  }
  die() {
    this.dead = true; this.sprite.setVisible(false);
    const s = this.scene.add.sprite(this.x, this.y, 'odead').setOrigin(0.5, 0.72).setDepth(this.scene.depthOf(this)).play('odead-dead');
    s.once('animationcomplete', () => s.play('odead-buried'));
    this.scene.events.emit('hero-dead');
  }
}

if (typeof module === 'object') module.exports = { canUse, weaponStat, weaponAction, giveWeapon };
