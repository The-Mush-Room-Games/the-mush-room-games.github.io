// The hero: movement, swing, dash, hurt, death. One class for both forms (old Pawn / new Pawn).
// Scene contract: scene.walkable(ax, ay, bx, by), scene.depthAt(x, y). Events on scene.events:
//   'hero-hit' { x, y, r, damage, weapon }   'hero-hurt' { hp, dmg, x, y }   'hero-dead'   'hero-swap' { weapon }
// update(dt, input): dt in SECONDS; input = { move: Vector2 (len <= 1), aim: Vector2|null, swing, dash, swap } (last 3 = pressed this frame).
class Hero {
  constructor(scene, x, y, { form = 'old', weapons = ['axe', 'hammer'] } = {}) {
    this.scene = scene; this.form = form;
    this.weapons = weapons.filter(k => WEAPONS[k] && WEAPONS[k].anim[form]).slice(0, 2);   // the old Pawn has no pickaxe or knife
    if (!this.weapons.length) this.weapons = ['axe'];
    this.active = 0;
    const st = HERO[form];
    this.maxHp = this.hp = st.hp; this.speed = st.speed;
    this.sprite = scene.add.sprite(x, y, form === 'old' ? 'opawn' : 'pawn-idle-' + this.weapons[0]).setOrigin(0.5, st.originY);
    this.aim = new Phaser.Math.Vector2(1, 0);       // last aim direction (unit)
    this.swing = null;                               // { w, dir, hit } while swinging
    this.swingCd = 0; this.buf = 0;                  // recovery after a swing, buffered swing press
    this.dashT = 0; this.dashCd = 0; this.dashDir = new Phaser.Math.Vector2();
    this.inv = 0;                                    // invulnerable seconds left (dash and hurt)
    this.hurtT = 0; this.flashT = 0;                 // blink time, red flash time
    this.kbT = 0; this.kbV = new Phaser.Math.Vector2();
    this.dead = false;
    this.sprite.play(this.anim('idle'));
  }
  get x() { return this.sprite.x } get y() { return this.sprite.y }
  get weapon() { return this.weapons[this.active] }
  get dashFrac() { return 1 - Math.max(0, this.dashCd) / DASH.cooldown }

  anim(kind) {                                       // 'idle' | 'run'
    return this.form === 'old' ? HERO.old[kind] : `pawn-${kind}-${this.weapon}`;
  }
  step(dx, dy) {                                     // per-axis slide: each axis moves only if the feet land somewhere walkable
    const s = this.sprite, w = this.scene.walkable;
    if (w(s.x, s.y, s.x + dx, s.y)) s.x += dx;
    if (w(s.x, s.y, s.x, s.y + dy)) s.y += dy;
  }
  puff(x, y) {                                       // a dust1 puff that deletes itself
    const p = this.scene.add.sprite(x, y - 8, 'dust1').setDepth(this.scene.depthAt(x, y) + 1).play('dust1');
    p.once('animationcomplete', () => p.destroy());
  }

  update(dt, input) {
    dt = Math.min(dt, 0.05);                         // a lag spike must not let a dash step over a wall
    const s = this.sprite, scene = this.scene;
    this.dashCd -= dt; this.swingCd -= dt; this.buf -= dt; this.inv -= dt; this.hurtT -= dt; this.flashT -= dt; this.kbT -= dt;
    if (this.dead) return;

    const move = input.move, moving = move.lengthSq() > 0.01;
    // aim: given aim > movement direction > last direction. Facing only changes when aim.x is clearly left or right.
    if (!this.swing) {
      const a = input.aim && input.aim.lengthSq() > 1e-4 ? input.aim : moving ? move : this.aim;
      this.aim.copy(a).normalize();
      if (Math.abs(this.aim.x) > 0.1) s.setFlipX(this.aim.x < 0);
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

    // look: red flash, blink while hurt-invulnerable, slightly see-through while dashing
    if (this.flashT > 0) s.setTint(0xff3030).setTintMode(Phaser.TintModes.FILL);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    s.setAlpha(this.hurtT > 0 ? (Math.floor(this.hurtT * 16) % 2 ? 0.35 : 1) : this.dashT > 0 ? 0.7 : 1);
    s.setDepth(scene.depthAt(s.x, s.y));
  }

  startSwing() {
    const w = WEAPONS[this.weapon], s = this.sprite;
    this.buf = 0;
    this.swing = { w, key: this.weapon, dir: this.aim.clone(), hit: false };
    s.anims.timeScale = w.speed;
    s.play(w.anim[this.form]);
  }
  tickSwing() {
    const sw = this.swing, s = this.sprite;
    const frame = s.anims.currentFrame ? s.anims.currentFrame.index - 1 : 0, done = !s.anims.isPlaying;
    if (!sw.hit && (frame >= sw.w.hitFrame[this.form] || done)) {
      sw.hit = true;
      this.scene.events.emit('hero-hit', { x: this.x + sw.dir.x * sw.w.reach, y: this.y + sw.dir.y * sw.w.reach, r: sw.w.radius, damage: sw.w.damage, weapon: sw.key });
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
    this.dead = true; this.sprite.setVisible(false);
    const s = this.scene.add.sprite(this.x, this.y, 'odead').setOrigin(0.5, 0.72).setDepth(this.scene.depthAt(this.x, this.y)).play('odead-dead');
    s.once('animationcomplete', () => s.play('odead-buried'));
    this.scene.events.emit('hero-dead');
  }
}
