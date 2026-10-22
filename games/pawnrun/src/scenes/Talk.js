// The town's overlays open over a paused scene (Cards' way: scene.launch + scene.pause, and leave() resumes it). `Sheet` is their shared base: a dimmed screen, a layout
// rebuilt on resize, keys after a short lock (a press that opened it must not also act), and leave() = close, or hand over to the next sheet over the same paused scene.
// `Talk`: an NPC's dialog on a wood board along the bottom (the town still shows above it): the face in a slot, the name on a ribbon over the board's edge, a line a page
// on a paper panel (tap, Space, Enter or E turns it), and on the last page small icon buttons (Trade -> Shop, Train -> Skills, Bye). d = { from, role }.
class Sheet extends Phaser.Scene {
  create() {
    uiCursor(this);
    this.dim = this.add.rectangle(0, 0, 1, 1, 0x0b0612, 0.7).setOrigin(0).setScrollFactor(0);
    this.on(this.scale, 'resize', () => this.build());
    this.on(this.input.keyboard, 'keydown', e => this.ok && !e.repeat && this.key(e));
    this.ok = false; this.time.delayedCall(CAMP.lock, () => this.ok = true);
    this.build();
  }
  build() {
    const W = this.scale.width, H = this.scale.height, items = [];
    this.dim.setSize(W, H); this.box?.destroy();
    this.draw(items, W, H);
    this.box = this.add.container(0, 0, items).setScrollFactor(0);
  }
  leave(next, data) {
    const from = this.d.from;
    SFX.play(this, next ? 'open' : 'close');
    this.scene.stop();
    next ? this.scene.launch(next, { ...this.d, ...data }) : this.scene.resume(from);
  }
  // a button (the label goes in the same container, above it); `go` runs on release
  btn(items, x, y, w, label, colour, go, h = 128) {
    const b = button(this, x, y, w, h, label, colour, go);
    b.label.setFontSize(24).setStroke('#161c2e', 3);                            // 22 px with the full stroke closes the C
    items.push(b, b.label);
    return b;
  }
  // the gold and duck counts: each icon in a tiny slot with its number beside it, the pair centred on (x, y)
  purse(items, x, y) {
    const num = v => this.add.text(0, y + 2, v, numTxt(22)).setOrigin(0, 0.5).setScrollFactor(0), g = num(SAVE.gold), d = num(SAVE.ducks);
    const w1 = 72 + g.width, x0 = x - (w1 + 20 + 72 + d.width) / 2, x1 = x0 + w1 + 20, im = (px, k) => this.add.image(px, y, k).setScrollFactor(0);
    g.setX(x0 + 72); d.setX(x1 + 72);
    items.push(im(x0 + 32, 'btn-tiny-square'), im(x0 + 32, 'icon03'), g, im(x1 + 32, 'btn-tiny-square'), this.add.sprite(x1 + 32, y, 'duck', 0).setScale(1.5).setTint(0xffd34d).setScrollFactor(0).play('duck'), d);
  }
}
Sheet.prototype.on = TestMap.prototype.on;                                  // the scene's listener helper: removes itself at shutdown

class Talk extends Sheet {
  constructor() { super('Talk') }
  init(d) { this.d = d; this.n = NPCS[d.role]; this.page = 0; this.acts = [] }
  create() { super.create(); this.dim.setFillStyle(0x0b0612, 0.45) }         // lighter: the NPC stays visible behind the board
  line() { const lv = level(SAVE); return this.n.lines[this.page].replace('{lv}', lv).replace('{cost}', skillCost(lv)) }
  draw(items, W, H) {
    const n = this.n, last = this.page >= n.lines.length - 1, bw = Math.min(W - 16, 960), bh = 268, cx = W / 2, vt = H - 8 - bh, left = cx - bw / 2;
    items.push(woodBoard(this, cx, vt + bh / 2, bw, bh));
    const fx = left + 78, fy = vt + 96;                                      // the face: the whole head, a little bigger than its slot frame, which shows behind
    const px0 = fx + 64, px1 = left + bw - 24, pt = vt + 34, pw = px1 - px0 + 24, ph = 159;   // the paper's visible part is its size minus the 12 / 20 px margins
    items.push(this.add.image(fx, fy, 'btn-small-square').setScrollFactor(0), portrait(this, fx, fy, n.avatar, 120, 120, false));
    const pan = panel(this, (px0 + px1) / 2, pt - 20 + ph / 2, pw, ph);
    uiHand(this, pan); pan.on('pointerdown', () => this.ok && !last && this.next());
    const text = this.add.text(px0 + 22, pt + 16, this.line(), { ...txt(22, UI_BROWN, null), wordWrap: { width: px1 - px0 - 44 } }).setScrollFactor(0);
    items.push(pan, text);
    const tag = ribbon(this, 0, vt + 2, 192, 'blue', 'small', `${n.name}, ${n.title}`), tw = Math.max(192, tag.label.width + 72);
    tag.label.setStroke('#161c2e', 2); tag.rb.setSize(tw, 64); tag.x = Math.max(fx, left + 6 + tw / 2);
    items.push(tag);
    if (!last) {                                                            // a bobbing arrow: more to say
      const ar = this.add.image(px1 - 30, pt + ph - 56, 'icon07').setScrollFactor(0);
      this.tweens.add({ targets: ar, x: ar.x + 6, duration: 360, yoyo: true, repeat: -1 });
      items.push(ar);
      return;
    }
    this.acts = [];
    if (n.shop) this.acts.push(['Trade', 'icon03', () => this.leave('Shop', { role: this.d.role })]);
    if (n.train) this.acts.push(['Train', 'icon05', () => this.leave('Skills', {})]);
    this.acts.push(['Bye', 'icon09', () => this.leave()]);
    const by = vt + 204, k = this.acts.length;
    this.acts.forEach(([label, ic, go], i) => {                              // the buttons sit along the board's bottom right, the key number on the corner of each
      const x = px1 - 36 - (k - 1 - i) * 88, b = iconButton(this, x, by, 'square', 'tiny', ic, () => this.ok && go());
      items.push(b, b.icon, this.add.text(x, by + 44, label, txt(16)).setOrigin(0.5).setScrollFactor(0));
      if (!uiTouch(this)) items.push(this.add.rectangle(x - 26, by - 26, 24, 24, RARITY.common.tint).setStrokeStyle(2, 0x161c2e).setScrollFactor(0), this.add.text(x - 26, by - 26, i + 1, numTxt(14)).setOrigin(0.5).setScrollFactor(0));
    });
  }
  next() { this.page++; SFX.play(this, 'next'); this.build() }
  key(e) {
    const last = this.page >= this.n.lines.length - 1, k = e.code;
    if (k === 'Escape') return this.leave();
    if (!['Space', 'Enter', 'NumpadEnter', 'KeyE'].includes(k) && !/^Digit[1-3]$/.test(k)) return;
    if (!last) return this.next();
    const act = /^Digit/.test(k) ? this.acts[+k[5] - 1] : this.acts[0];       // Enter takes the first button (Trade, Train), 1-3 the one by number
    act && act[2]();
  }
}
