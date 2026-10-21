// A room from a Tiled interior map (maps/interiors/*.tmj), entered through a `door` object of TestMap. Its own 48 px grid.
// Image layers draw the room; each has a `depth` property: under (default, below everything), sort (sliced into strips that
// sort with the hero by their bottom edge, so he walks in front of furniture and behind it) or over (above everything).
// Tile layers (`floor`, `walls`, ... the Room_Builder sheets) draw under everything too; the tiles of the layer named `floor` are where
// feet may stand, and the collision shapes of the tileset's tiles block (see roomShape in tmj.js). Tile objects (furniture, image
// collection tileset) stand with their bottom-centre at x,y, sort with the hero by that bottom edge and block with their own tile
// collision shapes; a tile with the property depth=under (a rug) is drawn on the floor instead.
// Object layers: `floor` rects = where feet may stand, `block` rects = furniture and walls cut out of the floor,
// `spawn` (point: where you appear), `exit` (rect: walking into it, moving down, leaves). Tiled coordinates are pixels.
const STRIP = 4;

class Interior extends TestMap {
  constructor() { super('Interior') }
  init(data) { this.data = data }
  create() {
    this.ready = this.leaving = false;
    this.cameras.main.setBackgroundColor('#0b0612');
    readMap(this.data.map, loadJson).then(m => {
      const files = new Set([...m.images, ...m.objects, ...m.tileLayers.flatMap(l => l.tiles)].map(i => i.image).filter(Boolean));
      const todo = [...files].filter(f => !this.textures.exists(f));
      todo.forEach(f => this.load.image(f, f));                   // the image path doubles as the texture key
      if (!todo.length) return this.buildRoom(m);
      this.load.once('complete', () => this.buildRoom(m)).start();
    }, e => this.fail(e));
  }
  buildRoom(m) {
    const W = m.w * m.tw, H = m.h * m.tw, rects = o => m.objects.filter(r => r.cls === o);
    for (const i of m.images) {
      const d = i.props.depth || 'under';
      if (d !== 'sort') { this.add.image(i.x, i.y, i.image).setOrigin(0).setDepth(d === 'over' ? 1e5 : -1); continue }
      const tex = this.textures.get(i.image), { width, height } = tex.getSourceImage();
      for (let y = 0; y < height; y += STRIP) {
        const n = i.image + ':' + y, h = Math.min(STRIP, height - y);
        if (!tex.has(n)) tex.add(n, 0, 0, y, width, h);
        this.add.image(i.x, i.y + y, i.image, n).setOrigin(0).setDepth(i.y + y + h - 0.5);   // a hero standing on the strip's last row is in front of it
      }
    }
    for (const l of m.tileLayers) for (const t of l.tiles) {
      const tex = this.textures.get(t.image), n = t.sx + ',' + t.sy;
      if (!tex.has(n)) tex.add(n, 0, t.sx, t.sy, t.w, t.h);
      this.add.image(t.col * m.tw, t.row * m.tw, t.image, n).setOrigin(0).setDepth(-1);
    }
    for (const o of m.objects) if (o.image) {
      const under = o.props.depth === 'under';
      this.add.image(o.x, o.y, o.image).setOrigin(0.5, 1).setFlipX(o.flipX).setDepth(under ? -0.5 : o.y - 0.5);
    }
    const { floors, blocks } = roomShape(m);
    this.floors = floors; this.blocks = blocks;
    this.exit = rects('exit')[0];
    const inFloor = (x, y) => floors.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    // ponytail: the box's four corners must be on the floor, so the floor rects should overlap where they meet
    this.walkable = (u, bx, by) => {
      const x0 = bx - FEET.x, x1 = bx + FEET.x, y0 = by - FEET.top, y1 = by + FEET.bottom;
      return inFloor(x0, y0) && inFloor(x1, y0) && inFloor(x0, y1) && inFloor(x1, y1)
        && !blocks.some(r => x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h);
    };
    this.depthOf = u => u.y;
    this.moveFeet = (u, dx, dy) => moveFeet([], this.walkable, u, dx, dy);

    const spawn = rects('spawn')[0] || { x: W / 2, y: H / 2 };
    this.npcs = []; this.near = null;
    const dp = this.data.door.props, n = NPCS[dp.npc];                   // the door names who is home (and where he stands: `npcAt` = "x,y", the feet, in room px)
    if (n) {
      const [nx, ny] = String(dp.npcAt).split(',').map(Number), b = artBox(this, n.key);
      this.npcs.push(new Npc(this, this.add.sprite(nx, ny, n.key).setOrigin(0.5, (b.y + b.h) / b.fh).setDepth(ny).play(n.key), dp.npc, nx, ny));
      blocks.push({ x: nx - 14, y: ny - 8, w: 28, h: 12 });
    }
    this.hero = new Hero(this, spawn.x, spawn.y, this.data.hero);
    this.hero.load(this.data.hero); this.hero.aim.set(0, -1);
    const cam = this.cameras.main;
    this.fitBounds(W, H);
    cam.setRoundPixels(true).startFollow(this.hero.sprite, true, 0.15, 0.15);
    cam.fadeIn(250);

    this.initInput();
    this.dbg = new URLSearchParams(location.search).has('dbg') && this.add.graphics().setDepth(1e6 - 1);
    this.ready = true;
  }
  leave() {
    this.leaving = true;
    const cam = this.cameras.main, d = this.data;
    cam.fadeOut(250);
    cam.once('camerafadeoutcomplete', () => {
      const r = d.door;
      this.scene.wake(d.from, { x: r.x + r.w / 2, y: r.y + r.h + 8, hero: this.hero.state });
      this.scene.stop();
    });
  }
  update(time, dt) {
    if (!this.ready) return;
    const h = this.hero;
    h.update(dt / 1000, this.readInput());
    tickNpcs(this);
    if (!this.leaving && this.move.y > 0.1 && this.exit && feetHit(this.exit, h)) this.leave();
    if (this.dbg) {
      const g = this.dbg.clear(), box = (c, list) => { g.lineStyle(1, c).fillStyle(c, 0.3); for (const r of list) g.fillRect(r.x, r.y, r.w, r.h).strokeRect(r.x, r.y, r.w, r.h) };
      box(0x60ff60, this.floors); box(0xff4040, this.blocks); box(0x60b0ff, [this.exit]);
      g.lineStyle(1, 0xffe066).strokeRect(h.x - FEET.x, h.y - FEET.top, 2 * FEET.x, FEET.top + FEET.bottom);
    }
    this.syncHud();
  }
}
