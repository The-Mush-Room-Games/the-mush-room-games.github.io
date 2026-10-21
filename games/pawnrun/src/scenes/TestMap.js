// Dev scene: draws a Tiled map through tmj.js + terrain.js and lets the old Pawn walk on it.
// R re-reads the map from disk, so the loop is: edit in Tiled, save, press R.

// Never cached, so R sees the latest save. XHR rather than fetch: headless Chrome's virtual clock waits for XHR only.
const loadJson = p => new Promise((ok, fail) => {
  const x = new XMLHttpRequest();
  x.open('GET', p + '?t=' + Date.now());
  x.responseType = 'json';
  x.onload = () => x.status === 200 && x.response ? ok(x.response) : fail(new Error(p + ': ' + (x.status === 200 ? 'not valid JSON' : x.status)));
  x.onerror = () => fail(new Error(p + ': could not load'));
  x.send();
});

// Opaque bounding box of frame 0 of a texture, in frame pixels: { x, y, w, h, fw, fh }. Measured once per key, so any art
// (including art added in Tiled only) gets a collision band, a hit circle and a depth line.
const ART_BOX = {};
function artBox(scene, key) {
  if (ART_BOX[key]) return ART_BOX[key];
  const tex = scene.textures.get(key), f = tex.frameTotal > 1 ? tex.get(0) : tex.get(), fw = f.cutWidth, fh = f.cutHeight;
  const c = document.createElement('canvas'); c.width = fw; c.height = fh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(f.source.image, f.cutX, f.cutY, fw, fh, 0, 0, fw, fh);
  const d = g.getImageData(0, 0, fw, fh).data;
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (d[(y * fw + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return ART_BOX[key] = x1 < 0 ? { x: 0, y: 0, w: fw, h: fh, fw, fh } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, fw, fh };
}
// Collision rects of an object in frame pixels: the ones drawn in Tiled, else a band along the bottom of the art
// (only when the object has a `block` footprint). Trees block only the trunk, buildings most of their base.
function objectRects(o, box) {
  if (o.rects && o.rects.length) return o.rects;
  if (!o.block || (!o.block[0] && !o.block[1])) return [];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let w = 0.8 * box.w, h = clamp(0.3 * box.h, 12, 40);
  if (/^tree/.test(o.key)) { w = 0.3 * box.w; h = 14 }
  else if (/^(house|castle|tower|barracks|monastery)/.test(o.key)) { w = 0.9 * box.w; h = 0.4 * box.h }
  return [{ x: box.x + (box.w - w) / 2, y: box.y + box.h - 2 - h, w, h }];
}
const HITTABLE = /^(tree|rock|bush|gold-stone|pig)/;

// Does the unit's feet box (ground level) overlap rect r = { x, y, w, h }?
const feetHit = (r, u) => u.x + FEET.x > r.x && u.x - FEET.x < r.x + r.w && u.y + FEET.bottom > r.y && u.y - FEET.top < r.y + r.h;

class TestMap extends Phaser.Scene {
  constructor(key = 'TestMap') { super(key) }
  create() {
    this.ready = this.leaving = false;
    this.cameras.main.setBackgroundColor('#47aba9');          // the pack's water colour
    this.input.keyboard.once('keydown-R', () => this.scene.restart());
    const name = new URLSearchParams(location.search).get('map') || 'test';
    readMap(`maps/${name}.tmj`, loadJson).then(m => this.build(m, name), e => this.fail(e));
  }
  fail(e) {
    console.error(e);
    this.add.text(16, 16, 'Map failed to load:\n' + e.message, txt(14)).setScrollFactor(0);
  }
  build(m, name) {
    dressTerrain(this, m);
    const lv = heightGrid(m), wg = walkGrids(m), rectsAt = new Map(), rects = [];   // rectsAt: cell index -> collision rects touching it
    const onRaised = (px, py) => lv[Math.floor(py / T) * m.w + Math.floor(px / T)] === LV.RAISED;   // objects: placed on a plateau

    this.hittables = []; this.enemies = []; this.loot = []; this.herd = [];
    const foes = [], flock = [], stones = [];                     // enemy and sheep objects: spawned once walkable exists
    // the art of `key` standing at o: its hurtbox (tall art, trees: only the trunk end) and collision rects (rs: frame-pixel rects, else objectRects)
    this.hurtboxOf = (o, key) => {
      const box = artBox(this, key), fb = o.flipX ? { ...box, x: box.fw - box.x - box.w } : box, tall = box.h > 64, w = tall ? 0.4 * box.w : box.w;
      const cx = o.x - box.fw / 2 + fb.x + box.w / 2, y1 = o.y - box.fh + box.y + box.h;
      return { x0: cx - w / 2, x1: cx + w / 2, y0: y1 - (tall ? 56 : box.h), y1 };
    };
    const place = R => {                                           // a collision rect { x0, y0, x1, y1, high, gone } (gone: broken, no longer blocks)
      rects.push(R);
      for (let cy = Math.floor(R.y0 / T); cy <= Math.floor((R.y1 - 1e-6) / T); cy++)
        for (let cx = Math.floor(R.x0 / T); cx <= Math.floor((R.x1 - 1e-6) / T); cx++) {
          const k = cy * m.w + cx; (rectsAt.get(k) || rectsAt.set(k, []).get(k)).push(R);
        }
      return R;
    };
    this.addRects = (o, key, high, rs) => {
      const box = artBox(this, key), fb = o.flipX ? { ...box, x: box.fw - box.x - box.w } : box, top = o.y - box.fh, left = o.x - box.fw / 2;
      return (rs || objectRects({ ...o, key }, fb)).map(r => place({ x0: left + r.x, y0: top + r.y, x1: left + r.x + r.w, y1: top + r.y + r.h, high, gone: false }));
    };
    for (const o of m.objects) {
      if (!o.key) continue;                                        // markers: spawn, entrance, loot...
      const box = artBox(this, o.key), top = o.y - box.fh, left = o.x - box.fw / 2;   // frame top-left in the world
      const fb = o.flipX ? { ...box, x: box.fw - box.x - box.w } : box;   // the art box as drawn (mirrored when flipped)
      const gap = box.fh - (box.y + box.h);                        // transparent rows under the art: the drawn feet sit that much higher
      const high = onRaised(o.x, o.y - 1);
      if (o.cls === 'enemy') { foes.push({ o, y: o.y - gap, high }); continue }   // an Enemy draws and moves itself
      if (/^sheep/.test(o.key)) { flock.push({ x: o.x, y: o.y - gap, high }); continue }   // so does a Sheep
      const s = this.add.sprite(o.x, o.y, o.key).setOrigin(0.5, 1).setFlipX(o.flipX).setDepth(o.cls === 'stepstone' ? -5 : o.y - gap + (high ? HIGH_DEPTH : 0));
      if (o.cls === 'stepstone') stones.push({ x0: left + fb.x, y0: top + fb.y, x1: left + fb.x + fb.w, y1: top + fb.y + fb.h });   // feet may stand on the art
      const pk = o.cls === 'secret' ? o.props.kind : /^gold-stone\d$/.test(o.key) ? 'stone' : '';   // tree, rock, stone: PROPS
      let t = null;
      if (HITTABLE.test(o.key)) this.hittables.push(t = { s, ox: o.x, high, drop: /^bush/.test(o.key) && 'bush', hb: this.hurtboxOf(o, o.key) });
      const anim = this.anims.get(o.key);
      if (anim && anim.repeat === -1) s.play({ key: o.key, startFrame: Phaser.Math.Between(0, anim.frames.length - 1) });
      const Rs = this.addRects(o, o.key, high);
      if (t && PROPS[pk]) t.prop = new Prop(this, o, pk, t, Rs, o.y - gap);
    }
    // walkable(unit, b): the feet box at b must sit on the unit's own level and touch no object rect on that level
    this.rects = rects;
    this.solid = (u, bx, by) => {                                   // does the feet box at b touch an object rect on the unit's level? (thrown dynamite stops at these)
      const x0 = bx - FEET.x, x1 = bx + FEET.x, y0 = by - FEET.top, y1 = by + FEET.bottom;
      for (let cy = Math.floor(y0 / T); cy <= Math.floor(y1 / T); cy++) for (let cx = Math.floor(x0 / T); cx <= Math.floor(x1 / T); cx++)
        for (const R of rectsAt.get(cy * m.w + cx) || []) if (!R.gone && R.high === !!u.high && x1 > R.x0 && x0 < R.x1 && y1 > R.y0 && y0 < R.y1) return true;
      return false;
    };
    this.walkable = (u, bx, by) => feetOk(m, wg, u.high, bx, by, stones) && !this.solid(u, bx, by);
    this.depthOf = u => u.rail ? u.rail.r.depth : u.y + (u.high ? HIGH_DEPTH : 0);
    const ramps = rampsOf(m);
    this.moveFeet = (u, dx, dy) => moveFeet(ramps, this.walkable, u, dx, dy);   // ramps carry units along their centre line

    // enemies: `count` on the object = a pack, standing in a ring; loot markers drop their `kind` at the start
    for (const { o, y, high } of foes) {
      const kind = o.key.replace(/-idle$/, ''), n = o.props.count || 1;
      if (!ENEMIES[kind]) { console.warn('no ENEMIES.' + kind); continue }
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n, p = n > 1 ? [o.x + 28 * Math.cos(a), y + 28 * Math.sin(a)] : [o.x, y];
        const [x, py] = this.walkable({ high }, ...p) ? p : [o.x, y];
        new Enemy(this, kind, x, py, high);
      }
    }
    // camps: the enemies standing inside a camp rect are the ones to clear; its fence ring and gates are built here
    const gates = m.objects.filter(o => o.cls === 'gate' && o.w > 0);
    this.camps = m.objects.filter(o => o.cls === 'camp' && o.w > 0).map(o => {
      const c = new Camp(this, o, gates, place, T);
      c.foes = this.enemies.filter(e => c.has(e.x, e.y));
      return c;
    });
    for (const f of flock) new Sheep(this, f.x, f.y, f.high);
    for (const o of m.objects) if (o.cls === 'loot' && LOOT[o.props.kind]) spawnLoot(this, o.props.kind, o.x, o.y, onRaised(o.x, o.y - 1), +o.props.n || 1, undefined, { weapon: o.props.weapon, tier: +o.props.tier || 0 });

    const spawn = m.objects.find(o => o.cls === 'spawn') || { x: m.w * T / 2, y: m.h * T / 2 };
    const q = new URLSearchParams(location.search), form = q.get('hero') === 'new' ? 'new' : 'old';
    const weapons = q.get('w') ? q.get('w').split(',') : form === 'new' ? ['axe', 'pickaxe'] : ['axe', 'hammer'];
    this.hero = new Hero(this, spawn.x, spawn.y, { form, weapons, high: onRaised(spawn.x, spawn.y) });
    this.fitBounds(m.w * T, m.h * T);
    this.cameras.main.startFollow(this.hero.sprite, true, 0.15, 0.15);

    this.island = +q.get('island') || 1;                            // island number: power-ups scale with it (powerK)
    this.initInput();

    // doors: Tiled rects of class `door` with an `interior` map path; walking up into one (update) enters it. Coming back
    // out (wake) puts the hero just below the door, facing down.
    this.doors = m.objects.filter(o => o.cls === 'door' && o.props.interior);
    this.on(this.events, 'wake', (sys, d) => {
      const h = this.hero, cam = this.cameras.main;
      h.load(d.hero); h.sprite.setPosition(d.x, d.y); h.aim.set(0, 1);
      this.leaving = false; this.hud?.resetStick?.();
      cam.centerOn(d.x, d.y); cam.fadeIn(250);
    });

    // things to hit
    this.hits = 0;
    this.on(this.events, 'hero-hit', h => this.onHit(h));
    this.on(this.events, 'resume', () => { this.hud?.resetStick?.(); Object.assign(this.pend, { swing: false, dash: false, swap: false, pick: false }) });   // after the cards: no stuck stick or key
    this.on(this.events, 'hero-hurt', () => this.cameras.main.shake(90, 0.004));
    this.on(this.events, 'hero-dead', () => this.time.delayedCall(2500, () => this.scene.restart()));
    this.dbg = q.has('dbg') && this.add.graphics().setDepth(1e6 - 1);   // ?dbg draws collision rects, the feet box and hit circles

    if (this.dbg) {                                                 // dev labels, under the HUD's top row
      this.add.text(8, 76, `${name}.tmj  ${m.w}×${m.h}  R reloads`, txt(14)).setScrollFactor(0).setDepth(1e6);
      this.readout = this.add.text(8, 96, '', txt(14)).setScrollFactor(0).setDepth(1e6);
    }
    this.ready = true;
    document.title = `ready ${m.w}x${m.h} objects ${m.objects.length}`;   // for headless checks
  }
  // keys, mouse and HUD buttons feed `pend` ("pressed this frame" flags); shared with Interior
  initInput() {
    this.sig = this.pj = this.dj = null;                             // syncHud refills the weapon slots, power-up row and dash pips
    const kb = this.input.keyboard;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,SHIFT,K,Q,H,E,ONE,TWO,THREE,FOUR');
    this.pend = { swing: false, dash: false, swap: false, pick: false };
    // presses come from keydown events, not JustDown polling, so a tap shorter than one frame is not lost
    const press = { SPACE: 'swing', J: 'swing', SHIFT: 'dash', K: 'dash', Q: 'swap', F: 'pick' };   // F swaps for the weapon on the ground
    for (const [key, act] of Object.entries(press))
      this.on(kb, 'keydown-' + key, e => { if (!e.repeat) this.pend[act] = true });
    for (const [key, i] of [['E', 0], ['ONE', 0], ['TWO', 1], ['THREE', 2], ['FOUR', 3]])   // bag slots: E and 1 use the first
      this.on(kb, 'keydown-' + key, e => { if (!e.repeat) useItem(this, i) });
    this.on(kb, 'keydown-H', e => { if (!e.repeat) this.hurtTest = true });
    this.move = new Phaser.Math.Vector2();
    this.on(this.input, 'pointerdown', p => { if (!p.wasTouch && p.leftButtonDown()) this.pend.swing = true });   // a click swings; the hero swings the way he faces

    if (typeof Hud !== 'undefined') {                               // HUD glue: ui.js
      this.hud = new Hud(this);
      for (const [ev, k] of [['hud-swing', 'swing'], ['hud-dash', 'dash'], ['hud-swap', 'swap']]) this.on(this.events, ev, () => this.pend[k] = true);
      this.on(this.events, 'hud-item', i => useItem(this, i));       // a tap on a bag slot
    }
  }
  // camera bounds for a W x H world: a world smaller than the screen sits in its middle (the screen is any size, Scale.EXPAND)
  fitBounds(W, H) {
    const cam = this.cameras.main, fit = () => {
      const bw = Math.max(W, cam.width), bh = Math.max(H, cam.height);
      cam.setBounds(Math.round((W - bw) / 2), Math.round((H - bh) / 2), bw, bh);
    };
    fit(); this.on(this.scale, 'resize', fit);
  }
  // listener that removes itself when the scene shuts down (scene.events outlive a restart)
  on(emitter, ev, fn) {
    emitter.on(ev, fn);
    this.events.once('shutdown', () => emitter.off(ev, fn));
  }
  onHit({ rect: h, high, damage, weapon }) {
    if (this.dbg) this.dbgHit = { ...h, until: this.time.now + 150 };
    for (const t of this.hittables) {
      const b = t.hb;                                              // the slash box must overlap the hurtbox, same level only
      if (t.high !== high || h.x1 <= b.x0 || h.x0 >= b.x1 || h.y1 <= b.y0 || h.y0 >= b.y1) continue;
      this.hits++;
      if (t.enemy) { t.enemy.hurt(damage, this.hero.x, this.hero.y, t.enemy.d.knockback * this.hero.pw.kb); continue }
      if (t.sheep) { t.sheep.hurt(this.hero.x, this.hero.y); continue }
      if (t.drop) { dropLoot(this, DROPS[t.drop], t.ox, b.y1 + 4, high); t.drop = false }   // once per bush: rolled on the first hit
      const s = t.s;                                               // every prop wobbles and flashes white; props with hp (t.prop) also react
      this.tweens.killTweensOf(s); s.x = t.ox;
      s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      if (t.flash) t.flash.remove();
      t.flash = this.time.delayedCall(90, () => s.active && s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      this.tweens.add({ targets: s, x: t.ox + 3, duration: 35, yoyo: true, repeat: 2, onComplete: () => s.x = t.ox });
      const x = (Math.max(h.x0, b.x0) + Math.min(h.x1, b.x1)) / 2, y = (Math.max(h.y0, b.y0) + Math.min(h.y1, b.y1)) / 2;   // where the slash met it
      t.prop ? t.prop.hit(weapon, x, y) : puff(this, x, y);
    }
  }
  // dynamite hook: breaks every rock pile whose hurtbox touches rect r = { x0, y0, x1, y1 } (what a blast covers), and the circle c = { x, y, r } if given
  blast(r, c) {
    for (const t of [...this.hittables]) {
      const b = t.hb;
      if (t.prop && PROPS[t.prop.kind].blast && r.x1 > b.x0 && r.x0 < b.x1 && r.y1 > b.y0 && r.y0 < b.y1 && (!c || circleHitsBox(c.x, c.y, c.r, b))) t.prop.done();
    }
  }
  // this frame's hero input; zero while a fade is running
  readInput() {
    const k = this.keys, h = this.hero, ptr = this.input.activePointer, pend = this.pend, mv = this.move;
    mv.set((k.D.isDown || k.RIGHT.isDown) - (k.A.isDown || k.LEFT.isDown),
           (k.S.isDown || k.DOWN.isDown) - (k.W.isDown || k.UP.isDown));
    if (mv.lengthSq() > 1) mv.normalize();
    // touch: the HUD stick when there is one, otherwise hold to walk towards the finger (mouse no longer walks)
    const stick = this.hud && this.hud.stick;
    if (stick && stick.lengthSq() > 0) mv.copy(stick);
    else if (!this.hud && ptr.isDown && ptr.wasTouch) {
      mv.set(ptr.worldX - h.x, ptr.worldY - h.y);
      if (mv.length() < 4) mv.reset(); else mv.normalize();
    }
    if (this.hurtTest) { this.hurtTest = false; const a = Math.random() * Math.PI * 2; h.hurt(1, h.x + Math.cos(a) * 50, h.y + Math.sin(a) * 50) }

    const inp = { move: mv, swing: pend.swing, dash: pend.dash, swap: pend.swap, pick: pend.pick };
    pend.swing = pend.dash = pend.swap = pend.pick = false;
    if (this.leaving) { mv.reset(); return { move: mv, swing: false, dash: false, swap: false, pick: false } }
    return inp;
  }
  syncHud() {
    const h = this.hero;
    if (!this.hud) return;
    this.hud.setHp(h.hp, h.maxHp);
    const gold = this.registry.get('gold') || 0, ducks = this.registry.get('ducks') || 0, bag = Array.from({ length: h.bag }, (_, i) => h.items[i] || null);
    if (gold !== this.hud.v.gold) this.hud.setGold(gold);
    if (ducks !== this.hud.v.ducks) this.hud.setDucks(ducks);
    if (bag.join() !== this.hud.v.items.join()) this.hud.setItems(bag);
    const pj = h.powers.length + h.powers.map(p => p.id).join(), dj = h.dashHave + '/' + h.dashMax;
    if (pj !== this.pj) { this.pj = pj; this.hud.setPowers(powerCounts(h.powers).map(([id, n]) => ({ icon: POWERUPS[id].icon, n, tint: RARITY[POWERUPS[id].rarity].tint }))) }
    if (dj !== this.dj) { this.dj = dj; this.hud.setDash(h.dashHave, h.dashMax) }
    const sig = h.weapons.join() + h.tiers.join() + h.active;
    if (sig !== this.sig) { this.sig = sig; this.hud.setWeapons(h.weapons.map((key, i) => ({ key, tier: h.tiers[i] })), h.active) }
  }
  // the camp's power-up choice: 3 cards drawn by rarity (powers.js) in the Cards scene over this one, which stands still until a card is picked
  openCards(ids = drawCards(3, this.hero.powers)) {
    this.scene.launch('Cards', { from: this.scene.key, cards: ids, island: this.island });
    this.scene.pause();
  }
  // the card that was picked: the hero takes it, and a line of what it gave floats up
  takePower(id) {
    const h = this.hero;
    h.addPower(id, this.island);
    const t = this.add.text(h.x, h.y - 70, powerText(id, this.island), txt(18)).setOrigin(0.5).setDepth(1e5);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, delay: 500, duration: 700, onComplete: () => t.destroy() });
  }
  // a door is entered by walking up into it; the hero's feet box (ground level) must overlap its rect
  enter(d) {
    this.leaving = true;
    const cam = this.cameras.main;
    cam.fadeOut(250);
    cam.once('camerafadeoutcomplete', () => {
      this.scene.sleep();                                             // the outdoor scene keeps its state
      this.scene.launch('Interior', { map: d.props.interior, door: d, from: this.scene.key, hero: this.hero.state });
    });
  }
  update(time, dt) {
    if (!this.ready) return;
    const h = this.hero;
    const inp = this.readInput();
    h.update(dt / 1000, inp);
    for (const e of [...this.enemies, ...this.herd]) e.update(dt / 1000);
    tickLoot(this);
    if (inp.pick) swapPickup(this);
    for (const c of this.camps) c.update();
    if (!this.leaving && !h.high && this.move.y < -0.1) { const d = this.doors.find(d => feetHit(d, h)); if (d) this.enter(d) }

    if (this.dbg) {
      const g = this.dbg.clear();
      g.lineStyle(1, 0xff4040); for (const R of this.rects) if (!R.gone) g.strokeRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
      g.lineStyle(1, 0xffa020); for (const d of this.doors) g.strokeRect(d.x, d.y, d.w, d.h);
      const F = h.high ? FEET_HIGH : FEET;
      g.lineStyle(1, 0x60ff60).strokeRect(h.x - F.x, h.y - F.top, 2 * F.x, F.top + F.bottom);
      g.lineStyle(1, 0x60b0ff); for (const { hb: b } of this.hittables) g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      const d = this.dbgHit;
      if (d && this.time.now < d.until) g.lineStyle(2, 0xffe066).strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
    }
    this.readout?.setText(`${h.weapon}  HP ${h.hp}/${h.maxHp}  hits ${this.hits}  dash ${Math.round(h.dashFrac * 100)}%`);
    this.syncHud();
  }
}
