// The Bear: a boss that sleeps until its arena closes (Camp.close calls wake: it rears and roars), then walks at the hero and picks a move (bossMove): swipe,
// charge or ground slam. Below half its hp it roars and goes faster, with shorter telegraphs (phase 2). Numbers: data.js ENEMIES.bear.boss; the pure rules are in enemies.js.
//   st = 'idle' (asleep) | 'walk' (chasing, then waiting out the rest after a move) | 'swipe' | 'charge' | 'slam' | 'roar' | 'stun' ; ph = the step of the current move; t = seconds left in it.
// Every move has a telegraph (a '!' over its head for the charge and the slam, a pose, a blink, and a ground marker for the charge's line and the slam's ring, pixel-art sprites
// (assets/fx) laid flat on the ground under everyone: the ring is an ellipse GROUND_K as tall as wide) and then a rest in which it only stands and pants: the hero's window.
// It is an Enemy (hurt flash, knockback, loot, death are shared) that draws bigger, collides wider and does not stop for a hit.
// Scene contract (TestMap): as Enemy, plus scene.walkable(unit, bx, by), scene.cameras, scene.hud (boss bar), scene.boss (set by the scene).
const GROUND_K = 0.6;                              // the ground plane's foreshortening: a ring of radius r is drawn r wide and r x GROUND_K tall, and hit the same way
class Boss extends Enemy {
  constructor(scene, kind, x, y, high) {
    super(scene, kind, x, y, high);
    const b = this.b = this.d.boss;
    this.sprite.setScale(b.scale);
    this.phase = 1; this.st = 'idle'; this.ph = ''; this.t = 0; this.last = null; this.hitDone = false;
    this.ring = null; this.pool = []; this.nUsed = 0;   // ring: the slam's radius while it grows; pool: the ground marker sprites (mark)
    this.daze = null;                                // the dazed sparkles over its head while stunned
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
  // A ground marker: the next free pooled sprite showing `key` frame `frame` with its contact point at (x, y) and `below` px of art under it. o = { scale, angle, alpha, tint, ox, oy, crop }.
  // The ground is drawn in one-row layers at their own y (terrain.js), so a marker sorts by its lowest edge (a row cannot cut it), and one lying above its feet stays just under
  // the Bear. sweep() hides what this frame did not use.
  mark(key, frame, x, y, below, o = {}) {
    const s = this.pool[this.nUsed++] ||= this.scene.add.sprite(0, 0, key), bot = y + below + 0.1, lift = this.scene.depthOf(this) - this.y;
    s.setTexture(key, frame).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5).setPosition(Math.round(x), Math.round(y)).setScale(o.scale ?? 1).setAngle(o.angle ?? 0).setAlpha(o.alpha ?? 1)
      .setTint(o.tint ?? 0xffffff).setVisible(true).setDepth(lift + ((o.front ?? y > this.y) ? bot : Math.min(bot, this.y - 0.1)));
    o.crop ? s.setCrop(...o.crop) : s.setCrop();
  }
  sweep() { for (let i = this.nUsed; i < this.pool.length; i++) this.pool[i].setVisible(false); this.nUsed = 0 }
  // points of the slam's ring at radius r (GROUND_K as tall as wide), n of them: [x, y, i]
  ringAt(r, n) { return Array.from({ length: n }, (_, i) => [this.x + Math.cos(2 * Math.PI * i / n) * r, this.y + Math.sin(2 * Math.PI * i / n) * r * GROUND_K, i]) }
  // the slam's warning: the danger zone (fx-zone, a dithered ellipse 190 x 114 px = radius 190, drawn at 2x; in two halves, the upper under the Bear and the lower over the
  // ground rows it reaches) with a ring of pads (fx-eruption frame 0) on its edge. a = 0..1, how strong
  zone(r, a) {
    const k = r / 95, h = 57 * k;
    this.mark('fx-zone', undefined, this.x, this.y, 0, { scale: k, alpha: a, crop: [0, 0, 190, 57] });
    this.mark('fx-zone', undefined, this.x, this.y, h, { scale: k, alpha: a, crop: [0, 57, 190, 57], front: true });
    for (const [x, y] of this.ringAt(r, 22)) this.mark('fx-eruption', 0, x, y, 12, { oy: 0.85, alpha: 0.4 + 0.6 * a, tint: 0xff5a40 });
    this.sweep();
  }
  // the slam's shockwave at radius r: a ring of ground spikes (fx-eruption 1-3, each on its own beat, warm-tinted so it shows on the grass) that fades over its last quarter as p (1 -> 0) falls
  wave(r, p) {
    const f = Math.floor(this.scene.time.now / 66.7);
    for (const [x, y, i] of this.ringAt(r, 28)) this.mark('fx-eruption', p < 0.08 ? 4 : 1 + (f + i) % 3, x, y, 12, { oy: 0.85, tint: 0xffc060, alpha: Math.min(1, 0.3 + 4 * p) });
    this.sweep();
  }
  go(st, ph, t) { this.st = st; this.ph = ph; this.t = t; this.hitDone = false; this.blink = false; this.sweep(); this.daze?.destroy(); this.daze = null }
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
    if (mv !== 'swipe') fx(sc, 'fx-alert', this.x, this.y - 170 * b.scale, { scale: 2, depth: this.y + 3 });   // the '!' over its head: only the big moves (charge, slam)
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
  // the charge's line: from the Bear towards (ux, uy), as wide as it hits (2 x hw) and len long: a row of arrow heads (fx-chevron) down the middle and pads (fx-eruption frame 0)
  // along both edges, fixed to the ground (off = how far it has run, so they stay put and the Bear passes them). a = 0..1, how strong
  lane(ux, uy, hw, len, a, off = 0) {
    const SP = 56, ang = Phaser.Math.RadToDeg(Math.atan2(uy, ux));
    for (let d = 56 - off % SP; d <= len; d += SP) {
      if (d < 52) continue;                          // not under its own feet
      const x = this.x + ux * d, y = this.y + uy * d;
      this.mark('fx-chevron', undefined, x, y, 10, { scale: 2, angle: ang, alpha: a });
      for (const e of [-1, 1]) this.mark('fx-eruption', 0, x - uy * hw * e, y + ux * hw * e, 12, { oy: 0.85, alpha: 0.3 + 0.7 * a, tint: 0xff5a40 });
    }
    this.sweep();
  }
  charge(dx, dy, dist, same, k, dt) {
    const c = this.b.charge, s = this.sprite;
    if (this.ph === 'tele') {                        // it crouches and flashes, then locks its line at the hero as he stands then: moving off the red band dodges it
      const tele = c.tele * k.tele;
      this.blink = Math.floor(this.t * 14) % 2 === 0;
      this.face(dx);
      this.lane(dx / (dist || 1), dy / (dist || 1), c.hitR, c.dist, 0.4 + 0.6 * (1 - Math.max(0, this.t) / tele));
      if (this.t <= 0) {
        this.blink = false; this.ph = 'rush'; this.left = c.dist; this.lv.set(dx, dy).normalize(); this.face(dx);
        s.play('bear-run'); s.anims.timeScale = 1.6;
        this.lane(this.lv.x, this.lv.y, c.hitR, c.dist, 0.8);
      }
      return;
    }
    const want = c.speed * k.speed * dt, moved = this.bstep(this.lv.x * want, this.lv.y * want, false);
    this.left -= moved;
    if (!this.hitDone && same && dist <= c.hitR && this.bite2(c.dmg, c.kb)) this.hitDone = true;
    if (moved < want * 0.4) {                        // a wall or a rock: it crashes and is stunned
      this.go('stun', '', c.stun);
      this.daze = this.scene.add.sprite(this.x, this.y, 'dazed').setScale(2).play('dazed');
      s.anims.timeScale = 1; s.play(this.d.idle); s.anims.pause();
      this.scene.cameras.main.shake(260, 0.012); this.puffs(5); SFX.play(this.scene, 'crash');
    } else if (this.left <= 0) { s.anims.timeScale = 1; this.go('walk', '', c.rec) }
    else this.lane(this.lv.x, this.lv.y, c.hitR, this.left + 30, 0.8 * Math.min(1, this.left / 120), c.dist - this.left);
  }
  // dazed after a crash: it sags, sparkles circle its head, and a hit does more damage
  stun(dt) {
    const s = this.sprite;
    this.daze?.setPosition(this.x, this.y - 135 * this.b.scale).setDepth(this.y + 3);
    if (this.t <= 0) { s.anims.resume(); this.go('walk', '', this.b.charge.rec) }
  }
  slam(dist, same, k, dt) {
    const m = this.b.slam, s = this.sprite, sc = this.scene;
    if (this.ph === 'tele' || this.ph === 'hold') {  // the ring's size is marked on the ground: step out of it, or dash through
      const left = Math.max(0, this.t) + (this.ph === 'tele' ? m.hold : 0), a = 0.1 + 0.25 * (1 - left / ((m.tele + m.hold) * k.tele));
      this.zone(m.r, 0.45 + 0.55 * (a - 0.1) / 0.25);
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
      const r = this.ring, K = GROUND_K, d = Math.hypot(sc.hero.x - this.x, (sc.hero.y - this.y) / K);   // distance on the foreshortened ground
      if (!this.hitDone && same && Math.abs(d - r) <= m.w && this.bite2(m.dmg, m.kb)) this.hitDone = true;   // the ring passes him: only a dash (invulnerable) goes through
      this.wave(r, 1 - r / m.r);
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
    this.pool.forEach(p => p.destroy()); this.daze?.destroy();
    this.scene.cameras.main.shake(500, 0.014); this.puffs(10);
    this.scene.hud?.hideBoss();
    SFX.music(this.scene, 'island', this.scene.island);
    this.scene.tweens.add({ targets: this.sprite, scale: this.b.scale * 1.15, duration: this.d.fade * 1000 });
  }
}
