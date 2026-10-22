// Enemies: idle -> chase -> attack, a stun when hit, then death and loot. Stats in data.js ENEMIES. One class, four kinds of behaviour:
// gnome (club), snake (coils, then lunges), spider (moves in bursts), slingshot (keeps its distance and fires acorns). The Bear boss is src/boss.js.
// Scene contract (TestMap): scene.hero, scene.island, scene.moveFeet(unit, dx, dy), scene.depthOf(unit), scene.enemies, scene.hittables, scene.loot,
// scene.shots (acorns in flight), scene.shotBlocked(x, y, high) (does an acorn at this ground point stop?).

// Pure. The mode an enemy in `mode` moves to, given the feet distance to the hero. `same` = the hero is alive and on its level,
// `ready` = the attack cooldown is over. An attack ends by itself (Enemy.tickAttack).
function nextMode(mode, dist, same, d, ready) {
  if (mode === 'attack') return mode;
  if (!same) return 'idle';
  if (mode === 'idle') return dist < d.sight ? 'chase' : 'idle';
  if (dist > d.lose) return 'idle';
  return dist <= d.reach && ready ? 'attack' : 'chase';
}

// Pure. Island scaling of a base number (data.js ISLAND): hp and damage, rounded, never under 1.
const enemyHp = (base, island = 1) => Math.max(1, Math.round(base * (1 + ISLAND.hp * (island - 1))));
const enemyDmg = (base, island = 1) => Math.max(1, Math.round(base * (1 + ISLAND.dmg * (island - 1))));
// Pure. Spider gait g = { go, t }: advance dt; true while it is in a burst of movement (burst s moving, rest s still).
function gaitStep(g, dt, gait) {
  g.t -= dt;
  if (g.t <= 0) { g.go = !g.go; g.t += g.go ? gait.burst : gait.rest }
  return g.go;
}
// Pure. Which way a slingshot gnome moves at distance `dist`: -1 away (under `near`), 1 closer (past `far`), 0 stands and shoots.
const slingMove = (dist, d) => dist < d.near ? -1 : dist > d.far ? 1 : 0;
// Pure. An acorn a = { x, y, vx, vy, left (px of range left), end } flies dt s in a straight line, in steps of at most `step` px; a.end becomes 'wall' where
// blocked(x, y) holds (the point it is in) and 'range' when `left` runs out. Ground-plane coordinates: the sprite is only drawn higher.
function acornStep(a, dt, blocked, step = 6) {
  const sp = Math.hypot(a.vx, a.vy), ux = a.vx / sp, uy = a.vy / sp;
  let move = sp * dt;
  while (move > 0 && !a.end) {
    const k = Math.min(step, move, a.left);
    a.x += ux * k; a.y += uy * k; a.left -= k; move -= k;
    if (blocked(a.x, a.y)) a.end = 'wall'; else if (a.left <= 0) a.end = 'range';
  }
  return a;
}
// Pure. Does the acorn touch hero h (anything with x, y, high, dead)? A circle of a.sh.r around his feet, same level.
const acornHits = (a, h) => !h.dead && (h.high | 0) === (a.high | 0) && Math.hypot(a.x - h.x, a.y - h.y) <= a.sh.r;
// Pure. The Bear's phase (1, or 2 below p2At of its hp) and its speed / telegraph factors.
const bossPhase = (hp, max, b) => hp / max < b.p2At ? 2 : 1;
const bossK = (phase, b) => phase === 2 ? b.p2 : { speed: 1, tele: 1 };
// Pure. The Bear's next move: 'swipe' | 'charge' | 'slam', by the weights for the hero's distance (near = within the swipe's range + 30), times p2w in
// phase 2, never the move it just did (`last`) unless nothing else is possible, and no charge from point-blank (closer than charge.min). rnd() is in [0, 1).
function bossMove(rnd, dist, last, b, phase) {
  const w = { ...b.weights[dist <= b.swipe.range + 30 ? 'near' : 'far'] };
  if (dist < b.charge.min) w.charge = 0;
  if (phase === 2) for (const k in w) w[k] *= b.p2w[k];
  if (last && Object.keys(w).some(k => k !== last && w[k] > 0)) w[last] = 0;
  const ks = Object.keys(w);
  let r = rnd() * ks.reduce((a, k) => a + w[k], 0);
  for (const k of ks) if (w[k] > 0 && (r -= w[k]) < 0) return k;
  return ks.find(k => w[k] > 0);
}

class Enemy {
  constructor(scene, kind, x, y, high) {
    const d = this.d = ENEMIES[kind], e = this;
    this.scene = scene; this.high = high; this.rail = null; this.mode = 'idle'; this.camp = null;   // camp: the Camp this foe belongs to (it stays idle until the camp closes)
    this.hp = this.maxHp = enemyHp(d.hp, scene.island); this.dmg = enemyDmg(d.damage, scene.island);   // scaled by the island
    this.cd = this.stunT = this.kbT = this.flashT = 0; this.kbV = new Phaser.Math.Vector2(); this.hit = false;
    this.gait = { go: false, t: 0 }; this.lv = new Phaser.Math.Vector2(); this.ph = '';
    this.sprite = scene.add.sprite(x, y, d.idle).setOrigin(0.5, d.originY).play(d.idle);
    this.hb = {};                                    // hurtbox, follows the feet; the scene's onHit reads it
    scene.enemies.push(this);
    scene.hittables.push(this.ht = { s: this.sprite, enemy: this, hb: this.hb, get high() { return e.high } });
  }
  get x() { return this.sprite.x } get y() { return this.sprite.y }
  get caged() { return !!this.camp && this.camp.state === 'open' }   // a camp's foe does not see the hero (nor chase him out of the gap) until the camp closes
  step(dx, dy) {
    const [x, y] = this.scene.moveFeet(this, dx, dy);
    this.sprite.setPosition(x, y);
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const s = this.sprite, d = this.d, h = this.scene.hero;
    this.cd -= dt; this.stunT -= dt; this.kbT -= dt; this.flashT -= dt;
    const dx = h.x - this.x, dy = h.y - this.y, dist = Math.hypot(dx, dy);
    if (this.kbT > 0) this.step(this.kbV.x * dt, this.kbV.y * dt);
    if (this.stunT > 0) s.play(d.idle, true);
    else if (this.mode === 'attack') this.tickAttack(dist, dt, dx, dy);
    else this.think(dt, dx, dy, dist);
    this.look();
  }
  // idle / chase: nextMode picks the mode; a chaser walks (a snake only up to its lunge reach, a spider in bursts, a slingshot gnome in its distance band)
  think(dt, dx, dy, dist) {
    const s = this.sprite, d = this.d, h = this.scene.hero;
    const m = this.mode = nextMode(this.mode, dist, !h.dead && lvOf(h) === lvOf(this) && !this.caged, d, this.cd <= 0 && !(d.shot && dist < d.minShot));   // ponytail: a slingshot gnome hugged by the hero will not shoot (it backs off first); cornered, it just stands
    if (m === 'attack') { this.hit = false; s.setFlipX(dx < 0); s.play(d.attack); if (d.lunge) { this.ph = 'coil'; this.pt = d.lunge.coil } return }
    if (m !== 'chase') return void s.play(d.idle, true);
    if (Math.abs(dx) > 4) s.setFlipX(dx < 0);
    let mv = d.ai === 'sling' ? slingMove(dist, d) : dist > d.reach ? 1 : 0;   // ponytail: direct chase, BFS flow field in M3
    if (mv && d.gait && !gaitStep(this.gait, dt, d.gait)) mv = 0;
    if (!mv) return void s.play(d.idle, true);
    let vx = dx / dist * mv, vy = dy / dist * mv;
    if (mv > 0) for (const o of this.scene.enemies) if (o !== this) {       // don't stack on a pack mate
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy);
      if (od > 0 && od < 24) { vx += ox / od; vy += oy / od }
    }
    const v = Math.hypot(vx, vy) || 1, sp = mv < 0 ? d.backSpeed : d.speed;   // ponytail: a backing-off gnome stops at a wall and shoots from there
    this.step(vx / v * sp * dt, vy / v * sp * dt);
    s.play(d.run, true);
  }
  // the club lands on its hit frame if the hero is still in reach; the swing ends with the animation. A snake coils (held on one frame), then lunges; a slingshot gnome fires
  tickAttack(dist, dt, dx, dy) {
    const s = this.sprite, d = this.d, f = s.anims.currentFrame ? s.anims.currentFrame.index - 1 : 0;
    if (d.lunge) {
      const L = d.lunge;
      if (this.ph === 'coil') {
        s.setFlipX(dx < 0);
        if (f >= L.frame) {
          s.anims.pause();
          if ((this.pt -= dt) <= 0) { s.anims.resume(); this.ph = 'lunge'; this.pt = L.time; this.lv.set(dx, dy).normalize() }   // the direction is fixed here: a dash sideways dodges it
        }
        return;
      }
      if (this.ph === 'lunge' && this.pt > 0) {
        this.pt -= dt; this.step(this.lv.x * L.speed * dt, this.lv.y * L.speed * dt);
        if (!this.hit) this.hit = this.bite(dist, d.hitRange);
      }
    } else if (!this.hit && f >= d.hitFrame) {
      this.hit = true;
      d.shot ? this.fire() : this.bite(dist, d.hitRange);
    }
    if (!s.anims.isPlaying) { this.mode = 'chase'; this.cd = d.cooldown }
  }
  // a hit on the hero if he is within range on this level; true if it landed (Thorns hurts us back)
  bite(dist, range) {
    const h = this.scene.hero;
    if (dist > range || lvOf(h) !== lvOf(this) || !h.hurt(this.dmg, this.x, this.y)) return false;
    SFX.play(this.scene, 'bite');
    if (h.pw.thorns) this.hurt(h.pw.thorns, h.x, h.y);
    return true;
  }
  fire() {                                           // an acorn leaves towards where the hero stands now
    SFX.play(this.scene, 'shoot');
    const sc = this.scene, h = sc.hero, sh = this.d.shot, v = new Phaser.Math.Vector2(h.x - this.x, h.y - this.y).normalize();
    sc.shots.push(new Acorn(sc, this.x + v.x * sh.ox, this.y + v.y * sh.ox, v.x * sh.speed, v.y * sh.speed, this.high, sh, this.dmg));
  }
  look() {                                           // flash, tint (this.tint, this.blink), depth and hurtbox
    const s = this.sprite, sc = this.scene, b = this.d.hurtbox;
    if (this.flashT > 0 || this.blink) s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (this.tint) s.setTint(this.tint).setTintMode(Phaser.TintModes.MULTIPLY);
    else s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    s.setDepth(sc.depthOf(this));
    Object.assign(this.hb, { x0: this.x + b[0], y0: this.y + b[1], x1: this.x + b[2], y1: this.y + b[3] });
  }

  hurt(dmg, fromX, fromY, kb = this.d.knockback) {      // kb = knockback distance in px (a blast pushes harder)
    if (this.dead) return;
    const d = this.d;
    SFX.play(this.scene, 'enemy-hurt', this.b && { r: -0.3 });   // the Bear (this.b) lower
    this.hp -= dmg; this.flashT = d.flash; this.stunT = d.stun; this.mode = 'chase'; this.sprite.anims.resume();   // (a coiled snake's pause ends)
    this.kbV.set(this.x - fromX, this.y - fromY);
    if (this.kbV.lengthSq() < 1e-4) this.kbV.set(1, 0);
    this.kbV.normalize().scale(kb / d.kbTime); this.kbT = d.kbTime;
    if (this.hp <= 0) this.die();
  }
  die() {                                            // the Tiny Swords enemies have no death art: a white fade, a dust puff, then loot
    const sc = this.scene, s = this.sprite;
    this.dead = true; SFX.play(sc, this.b ? 'boss-die' : 'enemy-die');
    sc.enemies = sc.enemies.filter(e => e !== this); sc.hittables = sc.hittables.filter(t => t !== this.ht);
    s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    sc.tweens.add({ targets: s, alpha: 0, duration: this.d.fade * 1000, onComplete: () => s.destroy() });
    const p = sc.add.sprite(this.x, this.y - 8, 'dust1').setDepth(s.depth + 1).play('dust1');
    p.once('animationcomplete', () => p.destroy());
    dropLoot(sc, DROPS[this.d.drops], this.x, this.y, this.high);
  }
}

// A slingshot gnome's acorn: flies straight (acornStep) in the ground plane, drawn `dy` px up with a shadow on the ground. It stops at what blocks shots
// (scene.shotBlocked: object rects, cliffs) and at its range, and hurts the hero once (not while he is invulnerable: dashing through it works).
class Acorn {
  constructor(scene, x, y, vx, vy, high, sh, dmg) {
    Object.assign(this, { scene, x, y, vx, vy, high, sh, dmg, left: sh.range, end: null });
    this.sprite = scene.add.sprite(x, y - sh.dy, 'acorn').play('acorn');
    this.shadow = scene.add.ellipse(x, y, 12, 5, 0, 0.3);
    this.place();
  }
  place() {
    const d = this.y + 1 + lift(this.high);
    this.sprite.setPosition(this.x, this.y - this.sh.dy).setDepth(d); this.shadow.setPosition(this.x, this.y).setDepth(d - 0.5);
  }
  update(dt) {
    const sc = this.scene, h = sc.hero;
    acornStep(this, Math.min(dt, 0.05), (x, y) => sc.shotBlocked(x, y, this.high));
    if (!this.end && acornHits(this, h) && h.hurt(this.dmg, this.x - this.vx, this.y - this.vy, this.sh.kb)) this.end = 'hit';
    if (!this.end) return this.place();
    this.sprite.setPosition(this.x, this.y - this.sh.dy);
    chips(sc, this.x, this.y - this.sh.dy, [0x8a5a2b, 0xc89a5a], this.end === 'hit' ? 4 : 3, 0.6);
    this.sprite.destroy(); this.shadow.destroy();
  }
}

if (typeof module === 'object') module.exports = { nextMode, enemyHp, enemyDmg, gaitStep, slingMove, acornStep, acornHits, bossPhase, bossK, bossMove };
