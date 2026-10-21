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
const FEET = { x: 10, top: 6, bottom: 2 };                      // feet box around the feet point: x ±10, y -6..+2
const FEET_HIGH = { x: 16, top: 6, bottom: 8 };                 // on raised ground: the grass stops ~5px inside the tile edge
const HITTABLE = /^(tree|rock|bush|sheep|pig)/;

class TestMap extends Phaser.Scene {
  constructor() { super('TestMap') }
  create() {
    this.ready = false;
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
    const lv = heightGrid(m), rectsAt = new Map(), rects = [];     // rectsAt: cell index -> collision rects touching it
    const cell = (px, py) => [Math.floor(px / T), Math.floor(py / T)];
    const level = (px, py) => { const [x, y] = cell(px, py); return x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : lv[y * m.w + x] };
    const depth = (px, py) => py + (level(px, py) === LV.RAISED ? T : 0);   // one-tile boost on raised ground

    this.hittables = [];
    for (const o of m.objects) {
      if (!o.key) continue;                                        // markers: spawn, entrance, loot...
      const box = artBox(this, o.key), top = o.y - box.fh, left = o.x - box.fw / 2;   // frame top-left in the world
      const fb = o.flipX ? { ...box, x: box.fw - box.x - box.w } : box;   // the art box as drawn (mirrored when flipped)
      const gap = box.fh - (box.y + box.h);                        // transparent rows under the art: the drawn feet sit that much higher
      const s = this.add.sprite(o.x, o.y, o.key).setOrigin(0.5, 1).setFlipX(o.flipX).setDepth(depth(o.x, o.y - 1) - gap);
      if (HITTABLE.test(o.key)) {                                  // circle on the art's base, so it can be hit from any side
        const r = Math.min(36, 0.45 * Math.min(box.w, box.h));
        this.hittables.push({ s, x: left + fb.x + box.w / 2, y: top + box.y + box.h - r, r });
      }
      const anim = this.anims.get(o.key);
      if (anim && anim.repeat === -1) s.play({ key: o.key, startFrame: Phaser.Math.Between(0, anim.frames.length - 1) });
      for (const r of objectRects(o, fb)) {
        const R = { x0: left + r.x, y0: top + r.y, x1: left + r.x + r.w, y1: top + r.y + r.h };
        rects.push(R);
        for (let cy = Math.floor(R.y0 / T); cy <= Math.floor((R.y1 - 1e-6) / T); cy++)
          for (let cx = Math.floor(R.x0 / T); cx <= Math.floor((R.x1 - 1e-6) / T); cx++) {
            const k = cy * m.w + cx; (rectsAt.get(k) || rectsAt.set(k, []).get(k)).push(R);
          }
      }
    }
    // walkable(a -> b): the feet box around b must sit on terrain the unit can step to from a, and touch no object rect
    this.rects = rects;
    const masks = stairMasks(this);
    this.walkable = (ax, ay, bx, by) => {
      const F = level(bx, by) === LV.RAISED ? FEET_HIGH : FEET;
      for (const px of [bx - F.x, bx + F.x]) for (const py of [by - F.top, by + F.bottom])
        if (!cornerOk(m, lv, masks, ax, ay, px, py)) return false;
      const x0 = bx - FEET.x, x1 = bx + FEET.x, y0 = by - FEET.top, y1 = by + FEET.bottom;
      for (let cy = Math.floor(y0 / T); cy <= Math.floor(y1 / T); cy++) for (let cx = Math.floor(x0 / T); cx <= Math.floor(x1 / T); cx++)
        for (const R of rectsAt.get(cy * m.w + cx) || []) if (x1 > R.x0 && x0 < R.x1 && y1 > R.y0 && y0 < R.y1) return false;
      return true;
    };
    this.depthAt = depth;

    const spawn = m.objects.find(o => o.cls === 'spawn') || { x: m.w * T / 2, y: m.h * T / 2 };
    const q = new URLSearchParams(location.search), form = q.get('hero') === 'new' ? 'new' : 'old';
    const weapons = q.get('w') ? q.get('w').split(',') : form === 'new' ? ['axe', 'pickaxe'] : ['axe', 'hammer'];
    this.hero = new Hero(this, spawn.x, spawn.y, { form, weapons });
    this.cameras.main.setBounds(0, 0, m.w * T, m.h * T).startFollow(this.hero.sprite, true, 0.15, 0.15);

    // input: pend holds "pressed this frame" flags (keys, mouse and HUD buttons all feed it)
    const kb = this.input.keyboard;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,SHIFT,K,Q,H');
    this.pend = { swing: false, dash: false, swap: false };
    // presses come from keydown events, not JustDown polling, so a tap shorter than one frame is not lost
    const press = { SPACE: 'swing', J: 'swing', SHIFT: 'dash', K: 'dash', Q: 'swap' };
    for (const [key, act] of Object.entries(press))
      this.on(kb, 'keydown-' + key, e => { if (e.repeat) return; this.pend[act] = true; if (act === 'swing') this.mouseAim = false });
    this.on(kb, 'keydown-H', e => { if (!e.repeat) this.hurtTest = true });
    this.mouseAim = false;                                          // true after the mouse is used, false after a swing key
    this.move = new Phaser.Math.Vector2(); this.aim = new Phaser.Math.Vector2();
    this.on(this.input, 'pointermove', p => { if (!p.wasTouch) this.mouseAim = true });
    this.on(this.input, 'pointerdown', p => { if (!p.wasTouch && p.leftButtonDown()) { this.mouseAim = true; this.pend.swing = true } });

    // things to hit
    this.hits = 0;
    this.on(this.events, 'hero-hit', h => this.onHit(h));
    this.on(this.events, 'hero-hurt', () => this.cameras.main.shake(90, 0.004));
    this.on(this.events, 'hero-dead', () => this.time.delayedCall(2500, () => this.scene.restart()));
    this.dbg = q.has('dbg') && this.add.graphics().setDepth(1e6 - 1);   // ?dbg draws collision rects, the feet box and hit circles

    if (typeof Hud !== 'undefined') {                               // HUD glue: the other agent's ui.js
      this.hud = new Hud(this);
      for (const [ev, k] of [['hud-swing', 'swing'], ['hud-dash', 'dash'], ['hud-swap', 'swap']]) this.on(this.events, ev, () => this.pend[k] = true);
    }
    if (this.dbg || !this.hud) {                                    // dev labels, clear of the HUD's top row
      const y = this.hud ? 112 : 8;
      this.add.text(8, y, `${name}.tmj  ${m.w}×${m.h}  R reloads`, txt(14)).setScrollFactor(0).setDepth(1e6);
      this.readout = this.add.text(8, y + 20, '', txt(14)).setScrollFactor(0).setDepth(1e6);
    }
    this.ready = true;
    document.title = `ready ${m.w}x${m.h} objects ${m.objects.length}`;   // for headless checks
  }
  // listener that removes itself when the scene shuts down (scene.events outlive a restart)
  on(emitter, ev, fn) {
    emitter.on(ev, fn);
    this.events.once('shutdown', () => emitter.off(ev, fn));
  }
  onHit({ x, y, r, damage, weapon }) {
    if (this.dbg) this.dbgHit = { x, y, r, until: this.time.now + 150 };
    for (const t of this.hittables) {
      if (Math.hypot(t.x - x, t.y - y) > r + t.r) continue;
      this.hits++;
      const s = t.s;
      this.tweens.killTweensOf(s); s.x = t.x;
      s.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      if (t.flash) t.flash.remove();
      t.flash = this.time.delayedCall(90, () => s.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      this.tweens.add({ targets: s, x: t.x + 3, duration: 35, yoyo: true, repeat: 2, onComplete: () => s.x = t.x });
      const p = this.add.sprite(t.x, t.y, 'dust1').setDepth(1e5).play('dust1');
      p.once('animationcomplete', () => p.destroy());
    }
  }
  update(time, dt) {
    if (!this.ready) return;
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

    let aim = null;                                                  // desktop: towards the mouse; otherwise the hero uses his move direction
    if (this.mouseAim && !ptr.wasTouch) {
      ptr.updateWorldPoint(this.cameras.main);
      this.aim.set(ptr.worldX - h.x, ptr.worldY - h.y);
      if (this.aim.lengthSq() > 16) aim = this.aim;
    }
    h.update(dt / 1000, { move: mv, aim, swing: pend.swing, dash: pend.dash, swap: pend.swap });
    pend.swing = pend.dash = pend.swap = false;

    if (this.dbg) {
      const g = this.dbg.clear();
      g.lineStyle(1, 0xff4040); for (const R of this.rects) g.strokeRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
      g.lineStyle(1, 0x60ff60).strokeRect(h.x - FEET.x, h.y - FEET.top, 2 * FEET.x, FEET.top + FEET.bottom);
      g.lineStyle(1, 0x60b0ff); for (const t of this.hittables) g.strokeCircle(t.x, t.y, t.r);
      if (this.dbgHit && this.time.now < this.dbgHit.until) g.lineStyle(2, 0xffe066).strokeCircle(this.dbgHit.x, this.dbgHit.y, this.dbgHit.r);
    }
    this.readout?.setText(`${h.weapon}  HP ${h.hp}/${h.maxHp}  hits ${this.hits}  dash ${Math.round(h.dashFrac * 100)}%`);
    if (this.hud) {
      this.hud.setHp(h.hp, h.maxHp); this.hud.setDash(h.dashFrac);
      const sig = h.weapons.join() + h.active;
      if (sig !== this.sig) { this.sig = sig; this.hud.setWeapons(h.weapons.map(key => ({ key, tier: 0 })), h.active) }
    }
  }
}
