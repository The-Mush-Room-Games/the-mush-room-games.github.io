// The Bear: a boss that sleeps until the hero is near, then walks at him and picks a move (bossMove): swipe, charge or ground slam. Below half its hp it
// roars and goes faster, with shorter telegraphs (phase 2). Numbers: data.js ENEMIES.bear.boss; the pure rules are in enemies.js.
//   st = 'idle' | 'walk' (chasing, waiting out `rest`) | 'swipe' | 'charge' | 'slam' | 'roar' | 'stun' ; ph = the step of the current move; t = seconds left in it.
// It is an Enemy (hurt flash, knockback, loot, death are shared) that draws bigger, collides wider and does not stop for a hit.
// Scene contract (TestMap): as Enemy, plus scene.walkable(unit, bx, by), scene.cameras, scene.hud (boss bar), scene.boss (set by the scene).
class Boss extends Enemy {
  constructor(scene, kind, x, y, high) {
    super(scene, kind, x, y, high);
    const b = this.b = this.d.boss;
    this.sprite.setScale(b.scale);
    this.phase = 1; this.st = 'idle'; this.ph = ''; this.t = 0; this.last = null; this.hitDone = false;
    this.ring = null; this.g = scene.add.graphics();
  }
  // moves with a wide box: the feet point and a point b.r to each side must all be on walkable ground, so it stops at the fence with its body, not its toes
  bstep(dx, dy) {
    const sc = this.scene, r = this.b.r, ok = (x, y) => [-r, 0, r].every(o => sc.walkable(this, x + o, y));
    let x = this.x, y = this.y;
    if (ok(x + dx, y)) x += dx;
    if (ok(x, y + dy)) y += dy;
    const moved = Math.hypot(x - this.x, y - this.y);
    this.sprite.setPosition(x, y);
    return moved;
  }
  face(dx) { if (Math.abs(dx) > 4) this.sprite.setFlipX(dx < 0) }
  go(st, ph, t) { this.st = st; this.ph = ph; this.t = t; this.hitDone = false; this.blink = false }
  update(dt) {
    dt = Math.min(dt, 0.05);
    const sc = this.scene, h = sc.hero, s = this.sprite, b = this.b, k = bossK(this.phase, b), same = !h.dead && !!h.high === !!this.high;
    this.flashT -= dt; this.kbT -= dt; this.t -= dt;
    const dx = h.x - this.x, dy = h.y - this.y, dist = Math.hypot(dx, dy), push = this.kbT > 0 && this.st !== 'charge';
    if (push) this.bstep(this.kbV.x * dt, this.kbV.y * dt);
    switch (this.st) {
      case 'idle':
        if (same && dist < this.d.sight) this.go('walk', '', 0.6);
        else s.play(this.d.idle, true);
        break;
      case 'walk':
        if (!same) { this.go('idle', '', 0); break }
        this.face(dx);
        if (dist > b.keep) { this.bstep(dx / dist * b.walk * k.speed * dt, dy / dist * b.walk * k.speed * dt); s.play(this.d.run, true) }
        else s.play(this.d.idle, true);
        if (this.t <= 0) this.pick(dist);
        break;
      case 'swipe': this.swipe(dx, dist, same, k); break;
      case 'charge': this.charge(dx, dy, dist, same, k, dt); break;
      case 'slam': this.slam(dx, dy, dist, same, k, dt); break;
      case 'roar':                                   // phase 2: it rears up and roars; it can be hit
        if (this.t <= 0) this.go('walk', '', 0.4);
        break;
      case 'stun':                                   // a charge ended in a wall
        s.anims.pause();
        if (this.t <= 0) { s.anims.resume(); this.blink = false; this.go('walk', '', b.rest) }
        break;
    }
    this.tint = this.phase === 2 ? 0xffb090 : 0;
    this.look();
    this.g.setDepth(this.y + 2);
  }
  // the next move; the first look at the hp can start phase 2
  pick(dist) {
    const b = this.b, sc = this.scene;
    if (bossPhase(this.hp, this.maxHp, b) > this.phase) {
      this.phase = 2; this.go('roar', '', b.roar);
      this.sprite.play('bear-attack-rear'); sc.cameras.main.shake(300, 0.01); this.puffs(6);
      return;
    }
    const mv = this.last = bossMove(Math.random, dist, this.last, b, this.phase), k = bossK(this.phase, b);
    this.go(mv, 'tele', b[mv].tele * k.tele);
    this.face(this.scene.hero.x - this.x);
    this.sprite.anims.timeScale = 1;
    if (mv === 'slam') this.sprite.play({ key: 'bear-attack-rear', timeScale: 4 / (10 * b[mv].tele * k.tele) });   // the rear plays over the whole telegraph
    else this.sprite.play('bear-attack-wind');
  }
  swipe(dx, dist, same, k) {
    const sp = this.b.swipe, s = this.sprite;
    if (this.ph === 'tele') {
      this.blink = Math.floor(this.t * 20) % 2 === 0 && this.t < sp.tele * k.tele * 0.5;
      this.face(this.scene.hero.x - this.x);
      if (this.t <= 0) { this.go('swipe', 'hit', 0.3); s.play('bear-attack-swipe') }
    } else if (this.ph === 'hit') {
      if (!this.hitDone) {                           // the arc is drawn from its first frame: the blow lands then, on whoever is in front within range
        this.hitDone = true;
        const front = (dx > 0) === !s.flipX;
        if (same && front && dist <= sp.range) this.bite2(sp.dmg, sp.kb);
      }
      if (this.t <= 0) this.go('walk', '', sp.rec + this.b.rest);
    }
  }
  charge(dx, dy, dist, same, k, dt) {
    const c = this.b.charge, s = this.sprite;
    if (this.ph === 'tele') {                        // it crouches and flashes, then locks its line at the hero as he stands then: a dash sideways dodges it
      this.blink = Math.floor(this.t * 14) % 2 === 0;
      this.face(dx);
      if (this.t <= 0) {
        this.blink = false; this.ph = 'rush'; this.left = c.dist; this.lv.set(dx, dy).normalize(); this.face(dx);
        s.play('bear-run'); s.anims.timeScale = 1.6;
      }
      return;
    }
    const want = c.speed * k.speed * dt, moved = this.bstep(this.lv.x * want, this.lv.y * want);
    this.left -= moved;
    if (!this.hitDone && same && dist <= c.hitR && this.bite2(c.dmg, c.kb)) this.hitDone = true;
    if (moved < want * 0.4) {                        // a wall (the fence, a rock): it crashes and is stunned
      this.go('stun', '', c.stun);
      s.anims.timeScale = 1; s.play('bear-attack-wind'); this.blink = false;
      this.scene.cameras.main.shake(260, 0.012); this.puffs(5);
    } else if (this.left <= 0) { s.anims.timeScale = 1; this.go('walk', '', c.rec + this.b.rest) }
  }
  slam(dx, dy, dist, same, k, dt) {
    const m = this.b.slam, s = this.sprite, g = this.g, sc = this.scene;
    if (this.ph === 'tele') {
      if (this.t <= 0) { this.ph = 'hold'; this.t = m.hold; s.anims.timeScale = 1 }
    } else if (this.ph === 'hold') {                 // arms up for a beat
      this.blink = Math.floor(this.t * 20) % 2 === 0;
      if (this.t <= 0) {                             // down it comes: the ring starts at its feet
        this.blink = false; this.ph = 'ring'; this.ring = 0;
        s.play('bear-attack-wind'); sc.cameras.main.shake(220, 0.01); this.puffs(8);
      }
    } else if (this.ph === 'ring') {
      this.ring += m.speed * k.speed * dt;
      const r = this.ring, d = Math.hypot(sc.hero.x - this.x, sc.hero.y - this.y);
      if (!this.hitDone && same && Math.abs(d - r) <= m.w && this.bite2(m.dmg, m.kb)) this.hitDone = true;   // the ring passes him: only a dash (invulnerable) goes through
      g.clear().lineStyle(2 * m.w, 0xfff4c9, Math.max(0.2, 1 - r / m.r)).strokeCircle(this.x, this.y, r)
        .lineStyle(4, 0xffffff, 0.9).strokeCircle(this.x, this.y, r + m.w);
      if (r >= m.r) { g.clear(); this.ring = null; this.go('walk', '', m.rec + this.b.rest) }
    }
  }
  // a hit on the hero (same level is checked by the caller); true if it landed
  bite2(dmg, kb) {
    const h = this.scene.hero, dm = enemyDmg(dmg, this.scene.island);
    if (!h.hurt(dm, this.x, this.y, kb)) return false;
    if (h.pw.thorns) this.hurt(h.pw.thorns, h.x, h.y);
    return true;
  }
  puffs(n) {
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * i / n, p = this.scene.add.sprite(this.x + Math.cos(a) * 70, this.y - 8 + Math.sin(a) * 30, 'dust1').setDepth(1e5).setScale(1.5).play('dust1');
      p.once('animationcomplete', () => p.destroy());
    }
  }
  // it takes a fraction of any knockback and keeps doing what it was doing (an Enemy would stun and chase); a stunned bear takes more
  hurt(dmg, fromX, fromY, kb) {
    if (this.dead) return;
    const keep = this.st, ph = this.ph, b = this.b;
    super.hurt(keep === 'stun' ? dmg * b.stunMul : dmg, fromX, fromY, (kb ?? this.d.knockback) * b.resist);
    if (this.dead) return;
    this.st = keep; this.ph = ph; this.stunT = 0;
    if (keep === 'stun') this.sprite.anims.pause();
    this.scene.hud?.setBossHp(Math.max(0, this.hp / this.maxHp));
  }
  die() {
    super.die();
    this.g.destroy();
    this.scene.cameras.main.shake(500, 0.014); this.puffs(10);
    this.scene.hud?.hideBoss();
    this.scene.tweens.add({ targets: this.sprite, scale: this.b.scale * 1.15, duration: this.d.fade * 1000 });
  }
}
