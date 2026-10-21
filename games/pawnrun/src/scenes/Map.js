// The explored map: opens over a paused TestMap (scene.openMap: M, the HUD's map button, or a tap on the touch one). M, Esc or any click / tap closes it
// and resumes the scene. d = { from, island, w, h, cls, obj, seen, doors, hero: [x, y], ducks: [[x, y]] } (tile units; seen is the live explored grid).
// The island is drawn once to a canvas texture at a whole number of screen pixels per tile (more for a small island, fewer for a big one), fogged where
// it has not been seen; the hero, doors and ducks are small sprites. ponytail: the texture is redrawn on open and on resize, ~12k fillRects for 110x110.
class MapView extends Phaser.Scene {
  constructor() { super('Map') }
  init(d) { this.d = d; this.done = false }
  create() {
    uiCursor(this);
    this.dim = this.add.rectangle(0, 0, 1, 1, 0x0b0612, 0.65).setOrigin(0).setScrollFactor(0);
    this.on(this.scale, 'resize', () => this.layout());
    this.on(this.input.keyboard, 'keydown', e => { if (!e.repeat && (e.code === 'KeyM' || e.code === 'Escape')) this.close() });
    this.on(this.input, 'pointerdown', () => this.close());
    this.events.once('shutdown', () => this.textures.exists('explored') && this.textures.remove('explored'));
    this.layout();
  }
  layout() {
    const d = this.d, W = this.scale.width, H = this.scale.height, PAD = 44, HEAD = 76, FOOT = 44, RIB = 56;   // RIB: the ribbon hangs this far over the panel's top edge
    const ts = Phaser.Math.Clamp(Math.floor(Math.min((Math.min(W - 24, 800) - 2 * PAD) / d.w, (H - RIB - 16 - HEAD - FOOT - PAD) / d.h)), 1, 16);
    const mw = d.w * ts, mh = d.h * ts, pw = Math.max(mw + 2 * PAD, 288), ph = Math.max(mh + HEAD + FOOT + PAD, 288), top = Math.round((H + RIB - 16 - ph) / 2), mx = Math.round((W - mw) / 2), my = top + HEAD;
    this.dim.setSize(W, H);
    this.box?.destroy(true);
    if (this.textures.exists('explored')) this.textures.remove('explored');
    this.paint(mw, mh, ts);
    const items = [panel(this, W / 2, top + ph / 2, pw, ph)];
    items.push(this.add.image(mx, my, 'explored').setOrigin(0).setScrollFactor(0));
    items.push(this.add.rectangle(mx - 1, my - 1, mw + 2, mh + 2).setOrigin(0).setStrokeStyle(2, 0x82564e).setScrollFactor(0));
    const at = ([x, y]) => [mx + x * ts, my + y * ts];
    for (const p of d.ducks) items.push(this.add.image(...at(p), 'duck', 0).setTint(LOOT.duck.tint).setScrollFactor(0));
    const me = this.add.circle(...at(d.hero), 6, 0xffffff).setStrokeStyle(3, 0x161c2e).setScrollFactor(0);
    const ring = this.add.circle(...at(d.hero), 10).setStrokeStyle(2, 0x161c2e).setScrollFactor(0);
    this.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 1100, repeat: -1 });
    items.push(ring, me);
    items.push(ribbon(this, W / 2, top + 14, Math.min(pw - 40, 320), 'blue', 'big', 'Island ' + d.island));
    items.push(this.add.text(W / 2, top + ph - 34, uiTouch(this) ? 'Tap to close' : 'M, Esc or click to close', txt(16, UI_BROWN, null)).setOrigin(0.5).setScrollFactor(0));
    this.box = this.add.container(0, 0, items).setScrollFactor(0);
  }
  // the island to the 'explored' canvas texture: seen tiles in their kit colour (a pale rim on land next to seen water, blobs for trees, rocks, buildings), the rest fogged
  paint(mw, mh, ts) {
    const d = this.d, E = EXPLORE, tex = this.textures.createCanvas('explored', mw, mh), g = tex.getContext(), rim = ts >= 6 ? 2 : 1;
    const at = (x, y) => x >= 0 && y >= 0 && x < d.w && y < d.h && d.seen[y * d.w + x] ? d.cls[y * d.w + x] : -1;   // -1: off the map or not seen
    g.fillStyle = E.fog; g.fillRect(0, 0, mw, mh);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const i = y * d.w + x, c = at(x, y);
      if (c < 0) continue;
      g.fillStyle = E.land[c]; g.fillRect(x * ts, y * ts, ts, ts);
      if (c !== TILE.WATER) {                                                  // land: a rim towards each seen water neighbour
        g.fillStyle = E.shore;
        if (at(x, y - 1) === 0) g.fillRect(x * ts, y * ts, ts, rim);
        if (at(x, y + 1) === 0) g.fillRect(x * ts, (y + 1) * ts - rim, ts, rim);
        if (at(x - 1, y) === 0) g.fillRect(x * ts, y * ts, rim, ts);
        if (at(x + 1, y) === 0) g.fillRect((x + 1) * ts - rim, y * ts, rim, ts);
      }
      const o = d.obj[i];
      if (o) { const s = o === BLOB.HOUSE ? 0 : Math.max(1, Math.round(ts / 6)); g.fillStyle = E.obj[o]; g.fillRect(x * ts + s, y * ts + s, ts - 2 * s, ts - 2 * s) }
    }
    g.fillStyle = E.door;
    for (const [x, y] of d.doors) if (at(x, y) >= 0) g.fillRect(x * ts + 1, y * ts + 1, ts - 2, ts - 2);
    tex.refresh();
  }
  close() {
    if (this.done) return;
    this.done = true;
    this.scene.stop(); this.scene.resume(this.d.from);
  }
}
MapView.prototype.on = TestMap.prototype.on;                              // the scene's listener helper: removes itself at shutdown
