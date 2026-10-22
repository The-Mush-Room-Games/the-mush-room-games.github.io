// The Bear: a boss that sleeps until its arena closes (Camp.close calls wake: it rears and roars), then walks at the hero and picks a move (bossMove): swipe,
// charge or ground slam. Below half its hp it roars and goes faster, with shorter telegraphs (phase 2). Numbers: data.js ENEMIES.bear.boss; the pure rules are in enemies.js.
//   st = 'idle' (asleep) | 'walk' (chasing, then waiting out the rest after a move) | 'swipe' | 'charge' | 'slam' | 'roar' | 'stun' ; ph = the step of the current move; t = seconds left in it.
// Every move has a telegraph (a pose, a blink, and a ground marker for the charge's line and the slam's ring) and then a rest in which it only stands and pants: the hero's window.
// It is an Enemy (hurt flash, knockback, loot, death are shared) that draws bigger, collides wider and does not stop for a hit.
// Scene contract (TestMap): as Enemy, plus scene.walkable(unit, bx, by), scene.cameras, scene.hud (boss bar), scene.boss (set by the scene).
class Boss extends Enemy {
  constructor(scene, kind, x, y, high) {
    super(scene, kind, x, y, high);
    const b = this.b = this.d.boss;
    this.sprite.setScale(b.scale);
    this.phase = 1; this.st = 'idle'; this.ph = ''; this.t = 0; this.last = null; this.hitDone = false;
    this.ring = null; this.g = scene.add.graphics();
    this.stuckT = 0; this.det = null;                // stuckT: s blocked while walking; det = a sidestep round an obstacle { t, x, y }
  }
  // moves with a wide box: the feet point and points up to b.r to each side must all be on walkable ground, so it stops at a wall or rock with its body, not its toes.
  // slide = false (a charge): a blocked step does not slide along the wall, it stops the whole move (so the charge ends in a crash, not a scrape)
  bstep(dx, dy, slide = true) {
    const sc = this.scene, r = this.b.r, ok = (x, y) => [-r, -r / 2, 0, r / 2, r].every(o => sc.walkable(this, x + o, y));
    let x = this.x, y = this.y;
    if (slide) { if (ok(x + dx, y)) x += dx; if (ok(x, y + dy)) y += dy }
    else if (ok(x + dx, y + dy)) { x += dx; y += dy }
    const moved = Math.hypot(x - this.x, y - this.y);
    this.sprite.setPosition(x, y);
    return moved;
  }
  // the arena closed: it rears up and roars for CAMP.intro s (the 'roar' state), then goes for the hero
  wake() {
    this.go('roar', '', CAMP.intro); this.face(this.scene.hero.x - this.x);
    this.sprite.play('bear-attack-rear'); this.scene.cameras.main.shake(300, 0.01); this.puffs(6);
    SFX.play(this.scene, 'roar'); SFX.music(this.scene, 'boss');
  }
  face(dx) { if (Math.abs(dx) > this.b.dead) this.sprite.setFlipX(dx < 0) }   // a dead zone: with the hero straight above or below it keeps its side
  go(st, ph, t) { this.st = st; this.ph = ph; this.t = t; this.hitDone = false; this.blink = false; this.g.clear() }
  update(dt) {
    dt = Math.min(dt, 0.05);
    const sc = this.scene, h = sc.hero, s = this.sprite, b = this.b, k = bossK(this.phase, b), same = !h.dead && lvOf(h) === lvOf(this);
    this.flashT -= dt; this.kbT -= dt; this.t -= dt;
    const dx = h.x - this.x, dy = h.y - this.y, dist = Math.hypot(dx, dy), push = this.kbT > 0 && this.st !== 'charge';
    if (push) this.bstep(this.kbV.x * dt, this.kbV.y * dt);
    switch (this.st) {
      case 'idle': s.play(this.d.idle, true); break;   // asleep: only the camp wakes it
      case 'walk': this.walk(dx, dy, dist, dt, k, same); break;
      case 'swipe': this.swipe(dx, dist, same); break;
      case 'charge': this.charge(dx, dy, dist, same, k, dt); break;
      case 'slam': this.slam(dist, same, k, dt); break;
      case 'roar':                                   // phase 2 (and waking up): it rears up and roars; it can be hit
        if (this.t <= 0) this.go('walk', '', 0.4);
        break;
      case 'stun': this.stun(dt); break;
    }
    const stun = this.st === 'stun';
    s.setScale(b.scale * (stun ? 1.05 : 1), b.scale * (stun ? 0.92 : 1));   // a stunned bear sags
    this.tint = stun ? 0xd0d8ff : this.phase === 2 ? 0xffb090 : 0;
    this.look();
    this.g.setDepth(this.y + 2);
  }
  // chasing: it walks up to `keep` px and stands there (the rest is the hero's window), then picks. Blocked by a rock or the wall, it sidesteps for a moment instead of pushing on
  walk(dx, dy, dist, dt, k, same) {
    const b = this.b, s = this.sprite, sp = b.walk * k.speed * dt;
    if (!same) return void this.go('idle', '', 0);
    this.face(dx);
    if (this.det && this.det.t > 0) { this.det.t -= dt; this.bstep(this.det.x * sp, this.det.y * sp); s.play(this.d.run, true) }
    else if (dist > b.keep) {
      const moved = this.bstep(dx / dist * sp, dy / dist * sp);
      this.stuckT = moved < sp * 0.3 ? this.stuckT + dt : 0;
      if (this.stuckT > 0.25) { const side = Math.random() < 0.5 ? 1 : -1; this.det = { t: 0.7, x: -dy / dist * side, y: dx / dist * side }; this.stuckT = 0 }
      s.play(this.d.run, true);
    } else s.play(this.d.idle, true);
    if (this.t <= 0) this.pick(dist);
  }
  // the next move; the first look at the hp can start phase 2
  pick(dist) {
    const b = this.b, sc = this.scene;
    if (bossPhase(this.hp, this.maxHp, b) > this.phase) {
      this.phase = 2; this.go('roar', '', b.roar);
      this.sprite.play('bear-attack-rear'); sc.cameras.main.shake(300, 0.01); this.puffs(6); SFX.play(sc, 'roar');
      return;
    }
    const mv = this.last = bossMove(Math.random, dist, this.last, b, this.phase), k = bossK(this.phase, b);
    this.go(mv, 'tele', b[mv].tele * k.tele);
    this.face(sc.hero.x - this.x);                   // it picks its side now and keeps it through a swipe or a slam
    this.sprite.anims.timeScale = 1;
    if (mv === 'slam') this.sprite.play({ key: 'bear-attack-rear', timeScale: 4 / (10 * (b[mv].tele + b[mv].hold) * k.tele) });   // the rear plays over the whole telegraph
    else this.sprite.play('bear-attack-wind');
  }
  swipe(dx, dist, same) {
    const sp = this.b.swipe, s = this.sprite, k = bossK(this.phase, this.b);
    if (this.ph === 'tele') {
      this.blink = Math.floor(this.t * 20) % 2 === 0 && this.t < sp.tele * k.tele * 0.5;
      if (this.t <= 0) { this.go('swipe', 'hit', 0.3); s.play('bear-attack-swipe'); SFX.play(this.scene, 'boss-swipe') }
    } else if (this.ph === 'hit') {
      if (!this.hitDone) {                           // the arc is drawn from its first frame: the blow lands then, on whoever is in front within range
        this.hitDone = true;                         // (in front = not behind it: straight above or below counts)
        const front = dx * (s.flipX ? -1 : 1) > -this.b.dead;
        if (same && front && dist <= sp.range) this.bite2(sp.dmg, sp.kb);
      }
      if (this.t <= 0) this.go('walk', '', sp.rec);
    }
  }
  // the charge's line: a red band on the ground from the bear towards (ux, uy), as wide as it hits, filling as the telegraph runs out
  lane(ux, uy, hw, len, a) {
    const g = this.g, nx = -uy * hw, ny = ux * hw, x = this.x, y = this.y;
    g.clear().fillStyle(0xff3030, a).fillPoints([{ x: x + nx, y: y + ny }, { x: x + ux * len + nx, y: y + uy * len + ny }, { x: x + ux * len - nx, y: y + uy * len - ny }, { x: x - nx, y: y - ny }], true);
  }
  charge(dx, dy, dist, same, k, dt) {
    const c = this.b.charge, s = this.sprite;
    if (this.ph === 'tele') {                        // it crouches and flashes, then locks its line at the hero as he stands then: moving off the red band dodges it
      const tele = c.tele * k.tele;
      this.blink = Math.floor(this.t * 14) % 2 === 0;
      this.face(dx);
      this.lane(dx / (dist || 1), dy / (dist || 1), c.hitR, c.dist, 0.1 + 0.2 * (1 - Math.max(0, this.t) / tele));
      if (this.t <= 0) {
        this.blink = false; this.ph = 'rush'; this.left = c.dist; this.lv.set(dx, dy).normalize(); this.face(dx);
        s.play('bear-run'); s.anims.timeScale = 1.6;
        this.lane(this.lv.x, this.lv.y, c.hitR, c.dist, 0.3);
      }
      return;
    }
    const want = c.speed * k.speed * dt, moved = this.bstep(this.lv.x * want, this.lv.y * want, false);
    this.left -= moved;
    if (!this.hitDone && same && dist <= c.hitR && this.bite2(c.dmg, c.kb)) this.hitDone = true;
    if (moved < want * 0.4) {                        // a wall or a rock: it crashes and is stunned
      this.go('stun', '', c.stun);
      s.anims.timeScale = 1; s.play(this.d.idle); s.anims.pause();
      this.scene.cameras.main.shake(260, 0.012); this.puffs(5); SFX.play(this.scene, 'crash');
    } else if (this.left <= 0) { s.anims.timeScale = 1; this.go('walk', '', c.rec) }
    else this.lane(this.lv.x, this.lv.y, c.hitR, this.left + 30, 0.25 * Math.min(1, this.left / 120));
  }
  // dazed after a crash: it sags, stars circle its head, and a hit does more damage
  stun(dt) {
    const g = this.g, s = this.sprite, t = this.scene.time.now / 1000;
    g.clear().fillStyle(0xffe066, 1);
    for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.094; g.fillCircle(this.x + Math.cos(a) * 46, this.y - 92 * this.b.scale / 1.6 + Math.sin(a) * 9, 5) }
    if (this.t <= 0) { s.anims.resume(); this.go('walk', '', this.b.charge.rec) }
  }
  slam(dist, same, k, dt) {
    const m = this.b.slam, s = this.sprite, g = this.g, sc = this.scene;
    if (this.ph === 'tele' || this.ph === 'hold') {  // the ring's size is marked on the ground: step out of it, or dash through
      const left = Math.max(0, this.t) + (this.ph === 'tele' ? m.hold : 0), a = 0.1 + 0.25 * (1 - left / ((m.tele + m.hold) * k.tele));
      g.clear().fillStyle(0xff3030, a * 0.5).fillCircle(this.x, this.y, m.r).lineStyle(3, 0xff6040, a + 0.2).strokeCircle(this.x, this.y, m.r);
    }
    if (this.ph === 'tele') {
      if (this.t <= 0) { this.ph = 'hold'; this.t = m.hold; s.anims.timeScale = 1 }
    } else if (this.ph === 'hold') {                 // arms up for a beat
      this.blink = Math.floor(this.t * 20) % 2 === 0;
      if (this.t <= 0) {                             // down it comes: the ring starts at its feet
        this.blink = false; this.ph = 'ring'; this.ring = 0;
        s.play('bear-attack-wind'); sc.cameras.main.shake(220, 0.01); this.puffs(8); SFX.play(sc, 'slam');
      }
    } else if (this.ph === 'ring') {
      this.ring += m.speed * k.speed * dt;
      const r = this.ring, d = Math.hypot(sc.hero.x - this.x, sc.hero.y - this.y);
      if (!this.hitDone && same && Math.abs(d - r) <= m.w && this.bite2(m.dmg, m.kb)) this.hitDone = true;   // the ring passes him: only a dash (invulnerable) goes through
      g.clear().lineStyle(2 * m.w, 0xfff4c9, Math.max(0.2, 1 - r / m.r)).strokeCircle(this.x, this.y, r)
        .lineStyle(4, 0xffffff, 0.9).strokeCircle(this.x, this.y, r + m.w);
      if (r >= m.r) { this.ring = null; this.go('walk', '', m.rec) }
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
    SFX.music(this.scene, 'island', this.scene.island);
    this.scene.tweens.add({ targets: this.sprite, scale: this.b.scale * 1.15, duration: this.d.fade * 1000 });
  }
}
