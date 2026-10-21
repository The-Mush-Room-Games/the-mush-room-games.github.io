// Enemies: idle -> chase -> attack, a stun when hit, then death and loot. Stats in data.js ENEMIES.
// Scene contract (TestMap): scene.hero, scene.moveFeet(unit, dx, dy), scene.depthOf(unit), scene.enemies, scene.hittables, scene.loot.

// Pure. The mode an enemy in `mode` moves to, given the feet distance to the hero. `same` = the hero is alive and on its level,
// `ready` = the attack cooldown is over. An attack ends by itself (Enemy.tickAttack).
function nextMode(mode, dist, same, d, ready) {
  if (mode === 'attack') return mode;
  if (!same) return 'idle';
  if (mode === 'idle') return dist < d.sight ? 'chase' : 'idle';
  if (dist > d.lose) return 'idle';
  return dist <= d.reach && ready ? 'attack' : 'chase';
}

class Enemy {
  constructor(scene, kind, x, y, high) {
    const d = this.d = ENEMIES[kind], e = this;
    this.scene = scene; this.high = high; this.rail = null; this.hp = d.hp; this.mode = 'idle';
    this.cd = this.stunT = this.kbT = this.flashT = 0; this.kbV = new Phaser.Math.Vector2(); this.hit = false;
    this.sprite = scene.add.sprite(x, y, d.idle).setOrigin(0.5, d.originY).play(d.idle);
    this.hb = {};                                    // hurtbox, follows the feet; the scene's onHit reads it
    scene.enemies.push(this);
    scene.hittables.push(this.ht = { s: this.sprite, enemy: this, hb: this.hb, get high() { return e.high } });
  }
  get x() { return this.sprite.x } get y() { return this.sprite.y }
  step(dx, dy) {
    const [x, y] = this.scene.moveFeet(this, dx, dy);
    this.sprite.setPosition(x, y);
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const s = this.sprite, d = this.d, sc = this.scene, h = sc.hero;
    this.cd -= dt; this.stunT -= dt; this.kbT -= dt; this.flashT -= dt;
    const dx = h.x - this.x, dy = h.y - this.y, dist = Math.hypot(dx, dy);
    if (this.kbT > 0) this.step(this.kbV.x * dt, this.kbV.y * dt);
    if (this.stunT > 0) s.play(d.idle, true);
    else if (this.mode === 'attack') this.tickAttack(dist);
    else {
      const m = this.mode = nextMode(this.mode, dist, !h.dead && !!h.high === !!this.high, d, this.cd <= 0);
      if (m === 'attack') { this.hit = false; s.setFlipX(dx < 0); s.play(d.attack) }
      else if (m === 'chase' && dist > d.reach) {   // ponytail: direct chase, BFS flow field in M3
        let vx = dx / dist, vy = dy / dist;
        for (const o of sc.enemies) if (o !== this) {       // don't stack on a pack mate
          const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy);
          if (od > 0 && od < 24) { vx += ox / od; vy += oy / od }
        }
        const v = Math.hypot(vx, vy) || 1;
        this.step(vx / v * d.speed * dt, vy / v * d.speed * dt);
        if (Math.abs(dx) > 4) s.setFlipX(dx < 0);
        s.play(d.run, true);
      } else {                                       // waiting (idle, or next to the hero while the cooldown runs)
        if (m === 'chase' && Math.abs(dx) > 4) s.setFlipX(dx < 0);
        s.play(d.idle, true);
      }
    }
    if (this.flashT > 0) s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    s.setDepth(sc.depthOf(this));
    const b = d.hurtbox;
    Object.assign(this.hb, { x0: this.x + b[0], y0: this.y + b[1], x1: this.x + b[2], y1: this.y + b[3] });
  }
  // the club lands on its hit frame if the hero is still in reach; the swing ends with the animation
  tickAttack(dist) {
    const s = this.sprite, d = this.d, h = this.scene.hero, f = s.anims.currentFrame ? s.anims.currentFrame.index - 1 : 0;
    if (!this.hit && f >= d.hitFrame) {
      this.hit = true;
      if (dist <= d.hitRange && !!h.high === !!this.high) h.hurt(d.damage, this.x, this.y);
    }
    if (!s.anims.isPlaying) { this.mode = 'chase'; this.cd = d.cooldown }
  }

  hurt(dmg, fromX, fromY, kb = this.d.knockback) {      // kb = knockback distance in px (a blast pushes harder)
    if (this.dead) return;
    const d = this.d;
    this.hp -= dmg; this.flashT = d.flash; this.stunT = d.stun; this.mode = 'chase';
    this.kbV.set(this.x - fromX, this.y - fromY);
    if (this.kbV.lengthSq() < 1e-4) this.kbV.set(1, 0);
    this.kbV.normalize().scale(kb / d.kbTime); this.kbT = d.kbTime;
    if (this.hp <= 0) this.die();
  }
  die() {                                            // the Tiny Swords gnome has no death art: a white fade, a dust puff, then loot
    const sc = this.scene, s = this.sprite;
    this.dead = true;
    sc.enemies = sc.enemies.filter(e => e !== this); sc.hittables = sc.hittables.filter(t => t !== this.ht);
    s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    sc.tweens.add({ targets: s, alpha: 0, duration: this.d.fade * 1000, onComplete: () => s.destroy() });
    const p = sc.add.sprite(this.x, this.y - 8, 'dust1').setDepth(s.depth + 1).play('dust1');
    p.once('animationcomplete', () => p.destroy());
    dropLoot(sc, DROPS[this.d.drops], this.x, this.y, this.high);
  }
}

if (typeof module === 'object') module.exports = { nextMode };
