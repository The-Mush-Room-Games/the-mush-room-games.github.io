// Dev scene: draws a Tiled map through tmj.js + terrain.js and lets the old Pawn walk on it.
// R re-reads the map from disk, so the loop is: edit in Tiled, save, press R.
class TestMap extends Phaser.Scene {
  constructor() { super('TestMap') }
  create() {
    this.ready = false;
    this.cameras.main.setBackgroundColor('#47aba9');          // the pack's water colour
    this.input.keyboard.once('keydown-R', () => this.scene.restart());
    const name = new URLSearchParams(location.search).get('map') || 'test';
    const loadJson = p => fetch(p + '?t=' + Date.now()).then(r => r.json());   // never cached, so R sees the save
    readMap(`maps/${name}.tmj`, loadJson).then(m => this.build(m, name), e => this.fail(e));
  }
  fail(e) {
    console.error(e);
    this.add.text(16, 16, 'Map failed to load:\n' + e.message, txt(14)).setScrollFactor(0);
  }
  build(m, name) {
    dressTerrain(this, m);
    const lv = heightGrid(m), blocked = new Uint8Array(m.w * m.h);
    const cell = (px, py) => [Math.floor(px / T), Math.floor(py / T)];
    const level = (px, py) => { const [x, y] = cell(px, py); return x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : lv[y * m.w + x] };
    const depth = (px, py) => py + (level(px, py) === LV.RAISED ? T : 0);   // one-tile boost on raised ground

    for (const o of m.objects) {
      if (!o.key) continue;                                        // markers: spawn, entrance, loot...
      const s = this.add.sprite(o.x, o.y, o.key).setOrigin(0.5, 1).setFlipX(o.flipX).setDepth(depth(o.x, o.y - 1));
      const anim = this.anims.get(o.key);
      if (anim && anim.repeat === -1) s.play({ key: o.key, startFrame: Phaser.Math.Between(0, anim.frames.length - 1) });
      const [bw, bh] = o.block || [0, 0], bx = Math.round(o.x / T - bw / 2), by = Math.floor((o.y - 1) / T);
      for (let y = by - bh + 1; y <= by; y++) for (let x = bx; x < bx + bw; x++)
        if (x >= 0 && y >= 0 && x < m.w && y < m.h) blocked[y * m.w + x] = 1;
    }
    this.walkable = (ax, ay, bx, by) => {
      const [x, y] = cell(bx, by);
      return x >= 0 && y >= 0 && x < m.w && y < m.h && !blocked[y * m.w + x] && canStep(level(ax, ay), level(bx, by));
    };
    this.depthAt = depth;

    const spawn = m.objects.find(o => o.cls === 'spawn') || { x: m.w * T / 2, y: m.h * T / 2 };
    this.player = this.add.sprite(spawn.x, spawn.y, 'opawn').setOrigin(0.5, 0.7).play('opawn-idle');
    this.cameras.main.setBounds(0, 0, m.w * T, m.h * T).startFollow(this.player, true, 0.15, 0.15);
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.vel = new Phaser.Math.Vector2();
    this.add.text(8, 8, `${name}.tmj  ${m.w}×${m.h}  R reloads`, txt(14)).setScrollFactor(0).setDepth(1e6);
    this.ready = true;
    document.title = `ready ${m.w}x${m.h} objects ${m.objects.length}`;   // for headless checks
  }
  update(time, dt) {
    if (!this.ready) return;
    const k = this.keys, p = this.player, ptr = this.input.activePointer, v = this.vel;
    v.set((k.D.isDown || k.RIGHT.isDown) - (k.A.isDown || k.LEFT.isDown),
          (k.S.isDown || k.DOWN.isDown) - (k.W.isDown || k.UP.isDown));
    if (ptr.isDown) v.set(ptr.worldX - p.x, ptr.worldY - p.y);          // hold to walk towards the finger
    if (v.length() < 4 && ptr.isDown) v.reset();
    v.normalize().scale(140 * dt / 1000);
    // each axis moves only if the feet land somewhere walkable, so the unit slides along shores and cliffs
    if (this.walkable(p.x, p.y, p.x + v.x, p.y)) p.x += v.x;
    if (this.walkable(p.x, p.y, p.x, p.y + v.y)) p.y += v.y;
    if (v.x) p.setFlipX(v.x < 0);
    p.play(v.x || v.y ? 'opawn-run' : 'opawn-idle', true).setDepth(this.depthAt(p.x, p.y));
  }
}
