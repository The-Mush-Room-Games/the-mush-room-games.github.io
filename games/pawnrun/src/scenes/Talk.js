// The town's overlays open over a paused scene (Cards' way: scene.launch + scene.pause, and leave() resumes it). `Sheet` is their shared base: a dimmed screen, a layout
// rebuilt on resize, keys after a short lock (a press that opened it must not also act), and leave() = close, or hand over to the next sheet over the same paused scene.
// `Talk`: an NPC's dialog on a paper panel with the avatar, the name on a ribbon, a line a page (tap, Space, Enter or E turns it), and on the last page the buttons
// (Trade -> Shop, Train and Class -> Skills, Bye). d = { from, role }.
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
  // the gold and duck counts as the kit's coin and duck icons with numbers, centred on (x, y)
  purse(items, x, y) {
    const g = SAVE.gold, d = SAVE.ducks, a = this.add.image(0, y, 'icon03').setScrollFactor(0), b = this.add.text(0, y + 2, g, txt(22)).setOrigin(0, 0.5).setScrollFactor(0);
    const c = this.add.sprite(0, y, 'duck', 0).setScale(1.5).setTint(0xffd34d).setScrollFactor(0).play('duck'), e = this.add.text(0, y + 2, d, txt(22)).setOrigin(0, 0.5).setScrollFactor(0);
    const w1 = 40 + b.width, w2 = 36 + e.width, x0 = x - (w1 + 24 + w2) / 2;
    a.setX(x0 + 16); b.setX(x0 + 40); c.setX(x0 + w1 + 24 + 14); e.setX(x0 + w1 + 24 + 36);
    items.push(a, b, c, e);
  }
}
Sheet.prototype.on = TestMap.prototype.on;                                  // the scene's listener helper: removes itself at shutdown

class Talk extends Sheet {
  constructor() { super('Talk') }
  init(d) { this.d = d; this.n = NPCS[d.role]; this.page = 0; this.acts = [] }
  line() { const lv = level(SAVE); return this.n.lines[this.page].replace('{lv}', lv).replace('{cost}', skillCost(lv)) }
  draw(items, W, H) {
    const n = this.n, last = this.page >= n.lines.length - 1, pw = Math.min(W - 24, 560), ph = 310, cx = W / 2, cy = H / 2, top = cy - ph / 2;
    const pan = panel(this, cx, cy, pw, ph);
    uiHand(this, pan); pan.on('pointerdown', () => this.ok && !last && this.next());
    const tag = ribbon(this, cx, top + 4, Math.min(pw - 40, 380), 'blue', 'small', `${n.name}, ${n.title}`);
    tag.label.setStroke('#161c2e', 2);
    const left = cx - pw / 2 + 44, face = portrait(this, left + 66, top + 112, n.avatar, 132, 132, false);
    const text = this.add.text(left + 150, top + 56, this.line(), { ...txt(24, UI_BROWN, null), wordWrap: { width: pw - 250 } }).setScrollFactor(0);
    items.push(pan, tag, face, text);
    if (!last) {                                                            // a bobbing arrow: more to say
      const ar = this.add.image(cx + pw / 2 - 56, top + ph - 52, 'icon07').setScrollFactor(0);
      this.tweens.add({ targets: ar, x: ar.x + 6, duration: 360, yoyo: true, repeat: -1 });
      items.push(ar);
      return;
    }
    this.acts = [];
    if (n.shop) this.acts.push(['Trade', 'blue', () => this.leave('Shop', { role: this.d.role })]);
    if (n.train) this.acts.push(['Train', 'blue', () => this.leave('Skills', { view: 'tree' })], ['Class', 'blue', () => this.leave('Skills', { view: 'class' })]);
    this.acts.push(['Bye', 'red', () => this.leave()]);
    const bw = 150, gap = 8, x0 = cx - (this.acts.length * bw + (this.acts.length - 1) * gap) / 2 + bw / 2, by = top + ph - 64;
    this.acts.forEach(([label, colour, go], i) => this.btn(items, x0 + i * (bw + gap), by, bw, label, colour, go));
  }
  next() { this.page++; this.build() }
  key(e) {
    const last = this.page >= this.n.lines.length - 1, k = e.code;
    if (k === 'Escape') return this.leave();
    if (!['Space', 'Enter', 'NumpadEnter', 'KeyE'].includes(k) && !/^Digit[1-3]$/.test(k)) return;
    if (!last) return this.next();
    const act = /^Digit/.test(k) ? this.acts[+k[5] - 1] : this.acts[0];       // Enter takes the first button (Trade, Train), 1-3 the one by number
    act && act[2]();
  }
}
