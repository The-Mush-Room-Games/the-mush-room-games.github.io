// The hero: movement, swing, dash, hurt, death. One class for both forms (old Pawn / new Pawn).
// Scene contract: scene.moveFeet(unit, dx, dy) -> [x, y], scene.depthOf(unit), scene.walkable(unit, bx, by) (TestMap, Interior). Events on scene.events:
//   'hero-hit' { rect: {x0,y0,x1,y1}, high, damage, weapon }   'hero-hurt' { hp, dmg, x, y }   'hero-dead'   'hero-swap' { weapon }
// update(dt, input): dt in SECONDS; input = { move: Vector2 (len <= 1), swing, dash, swap } (last 3 = pressed this frame).
class Hero {
  constructor(scene, x, y, { form = 'old', weapons = ['axe', 'hammer'], high = false } = {}) {
    this.scene = scene; this.form = form;
    this.weapons = weapons.filter(k => WEAPONS[k] && WEAPONS[k].anim[form]).slice(0, 2);   // the old Pawn has no pickaxe or knife
    if (!this.weapons.length) this.weapons = ['axe'];
    this.active = 0;
    const st = HERO[form];
    this.maxHp = this.hp = st.hp; this.speed = st.speed;
    this.sprite = scene.add.sprite(x, y, form === 'old' ? 'opawn' : 'pawn-idle-' + this.weapons[0]).setOrigin(0.5, st.originY);
    this.roll = scene.add.sprite(x, y, this.sprite.texture.key).setVisible(false);   // stands in for the sprite during a dodge roll
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
    this.sprite.play(this.anim('idle'));
  }
  get x() { return this.sprite.x } get y() { return this.sprite.y }
  get weapon() { return this.weapons[this.active] }
  get state() { return { form: this.form, weapons: this.weapons, active: this.active, hp: this.hp, flip: this.sprite.flipX } }   // carried between scenes
  load(st) {
    this.active = st.active; this.hp = st.hp; this.sprite.setFlipX(st.flip);
    this.swing = null; this.dashT = this.kbT = this.buf = 0; this.sprite.play(this.anim('idle'));
  }
  get dashFrac() { return 1 - Math.max(0, this.dashCd) / DASH.cooldown }

  anim(kind) {                                       // 'idle' | 'run'
    return this.form === 'old' ? HERO.old[kind] : `pawn-${kind}-${this.weapon}`;
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

    const move = input.move, moving = move.lengthSq() > 0.01;
    // facing (Zelda): the direction walked; on a diagonal keep the facing if it is one of the two directions held
    if (moving && !this.swing) {
      const a = this.aim, held = (v, f) => f !== 0 && Math.sign(v) === f && Math.abs(v) > 0.3;
      if (!held(move.x, a.x) && !held(move.y, a.y))
        Math.abs(move.x) >= Math.abs(move.y) ? a.set(Math.sign(move.x), 0) : a.set(0, Math.sign(move.y));
      if (Math.abs(move.x) > 0.1) s.setFlipX(move.x < 0);
    }

    if (input.swap && !this.swing && this.weapons.length > 1) {
      this.active = (this.active + 1) % this.weapons.length;
      scene.events.emit('hero-swap', { weapon: this.weapon });
    }
    if (input.swing) this.buf = 0.2;                 // a press during a swing fires right after it
    if (input.dash && this.dashCd <= 0 && this.kbT <= 0) this.startDash(moving ? move : this.aim);
    if (this.buf > 0 && !this.swing && this.swingCd <= 0 && this.dashT <= 0 && this.kbT <= 0) this.startSwing();

    // movement
    if (this.kbT > 0) this.step(this.kbV.x * dt, this.kbV.y * dt);
    else if (this.dashT > 0) {
      this.dashT -= dt;
      const d = this.speed * DASH.mult * dt;
      this.step(this.dashDir.x * d, this.dashDir.y * d);
    } else {
      const k = this.speed * dt * (this.swing ? HERO.swingSlow : 1);
      this.step(move.x * k, move.y * k);
    }

    if (this.swing) this.tickSwing();
    else {
      s.anims.timeScale = 1;
      s.play(this.anim(moving || this.dashT > 0 ? 'run' : 'idle'), true);
    }

    // look: red flash, blink while hurt-invulnerable, hidden while the roll stand-in shows
    if (this.flashT > 0) s.setTint(0xff3030).setTintMode(Phaser.TintModes.FILL);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    s.setAlpha(this.dashT > 0 ? 0 : this.hurtT > 0 ? (Math.floor(this.hurtT * 16) % 2 ? 0.35 : 1) : 1);
    s.setDepth(scene.depthOf(this));
    // dodge roll: the current frame, one full flip around the body's middle, squashed a little mid-roll
    const k = this.dashT > 0 ? 1 - this.dashT / DASH.time : 0, c = HERO[this.form].bodyY;
    this.roll.setVisible(k > 0);
    if (k > 0) this.roll.setTexture(s.texture.key, s.frame.name).setFlipX(s.flipX).setDepth(s.depth)
      .setOrigin(0.5, s.originY - c / s.height).setPosition(s.x, s.y - c)
      .setAngle((s.flipX ? -360 : 360) * k).setScale(1, 1 - 0.15 * Math.sin(Math.PI * k));
  }

  startSwing() {
    const w = WEAPONS[this.weapon], s = this.sprite;
    this.buf = 0;
    this.swing = { w, key: this.weapon, hit: false };
    s.anims.timeScale = w.speed;
    s.play(w.anim[this.form]);
  }
  swoosh(r, dir) {                                   // a white crescent at the slash box, bowed the way of the swing, fading fast
    const scene = this.scene;
    if (!scene.textures.exists('swoosh')) {          // drawn once: 56x26 px, thick in the middle, thin at the tips
      const t = scene.textures.createCanvas('swoosh', 56, 26), g = t.getContext();
      for (let y = 0; y < 26; y++) for (let x = 0; x < 56; x++) {
        const dx = x + 0.5 - 28, dy = y + 0.5 - 32, d = Math.hypot(dx, dy), k = Math.sin(Math.PI * (Math.atan2(dy, dx) + Math.PI * 0.85) / (Math.PI * 0.7));
        if (k > 0 && d > 22 && d < 23 + 8 * k) { g.fillStyle = d > 21 + 8 * k ? '#ffffff' : '#cfe8ff'; g.fillRect(x, y, 1, 1) }
      }
      t.refresh();
    }
    const p = scene.add.image((r.x0 + r.x1) / 2, dir < 0 ? r.y0 + 14 : r.y1 - 14, 'swoosh').setFlipY(dir > 0)
      .setDepth(scene.depthOf(this) + (dir > 0 ? 2 : -1));
    scene.tweens.add({ targets: p, alpha: 0, y: p.y + dir * 6, duration: 140, onComplete: () => p.destroy() });
  }
  tickSwing() {
    const sw = this.swing, s = this.sprite;
    const frame = s.anims.currentFrame ? s.anims.currentFrame.index - 1 : 0, done = !s.anims.isPlaying;
    if (!sw.hit && (frame >= sw.w.hitFrame[this.form] || done)) {
      sw.hit = true;                                 // the slash box from the art (facing right), turned to the facing:
      const [x0, y0, x1, y1] = sw.w.hit[this.form], a = this.aim, c = HERO[this.form].bodyY, w = (y1 - y0) / 2;
      const [rx0, ry0, rx1, ry1] = a.x > 0 ? [x0, y0, x1, y1] : a.x < 0 ? [-x1, y0, -x0, y1]   // mirrored for left,
        : a.y < 0 ? [-w, -c - x1, w, -c - x0] : [-w, -c + x0, w, -c + x1];                       // up/down: around the body's middle
      const rect = { x0: this.x + rx0, x1: this.x + rx1, y0: this.y + ry0, y1: this.y + ry1 };
      this.scene.events.emit('hero-hit', { rect, high: this.high, damage: sw.w.damage, weapon: sw.key });
      if (a.y) this.swoosh(rect, a.y);              // the swing art is side-on: show up/down swings with a slash arc
    }
    if (done) { this.swingCd = sw.w.recover; this.swing = null; }
  }

  startDash(dir) {
    this.dashT = DASH.time; this.dashCd = DASH.cooldown; this.inv = Math.max(this.inv, DASH.invuln);
    this.dashDir.copy(dir).normalize();
    if (Math.abs(this.dashDir.x) > 0.1) this.sprite.setFlipX(this.dashDir.x < 0);
    this.swing = null; this.buf = 0;
    this.puff(this.x, this.y);
  }

  // true when the hit landed (not while invulnerable or dead)
  hurt(dmg, fromX, fromY) {
    if (this.dead || this.inv > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.inv = this.hurtT = HERO.hurtInvuln; this.flashT = HERO.flashTime;
    this.swing = null; this.dashT = 0; this.buf = 0;
    this.kbV.set(this.x - fromX, this.y - fromY);
    if (this.kbV.lengthSq() < 1e-4) this.kbV.set(-(this.sprite.flipX ? -1 : 1), 0);
    this.kbV.normalize().scale(HERO.knockback / HERO.knockbackTime);
    this.kbT = HERO.knockbackTime;
    this.scene.events.emit('hero-hurt', { hp: this.hp, dmg, x: this.x, y: this.y });
    if (this.hp <= 0) this.die();
    return true;
  }
  die() {
    this.dead = true; this.sprite.setVisible(false); this.roll.setVisible(false);
    const s = this.scene.add.sprite(this.x, this.y, 'odead').setOrigin(0.5, 0.72).setDepth(this.scene.depthOf(this)).play('odead-dead');
    s.once('animationcomplete', () => s.play('odead-buried'));
    this.scene.events.emit('hero-dead');
  }
}
