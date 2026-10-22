// The power-up choice: opens over a paused scene (scene.openCards, after a camp is cleared). 3 cards on paper panels (paper_special for rare), each with a
// small ribbon in the rarity colour, an icon, a name and a one-line effect. Pick by click or tap, keys 1-3, or arrows (or A/D, W/S) and Enter / Space.
// The scene under it is paused (so its tweens, timers and animations stand still); this scene's own tweens run. The pick goes to scene.takePower(id).
// Wide screens put the cards in a row; a tall one (a phone held upright) stacks them with the icon on the left and bigger text.
class Cards extends Phaser.Scene {
  constructor() { super('Cards') }
  init(d) { this.d = d; this.sel = 1; this.ok = this.done = false }
  create() {
    uiCursor(this);
    this.dim = this.add.rectangle(0, 0, 1, 1, 0x0b0612, 0.65).setOrigin(0).setScrollFactor(0);
    this.on(this.scale, 'resize', () => !this.done && this.layout());
    this.on(this.input.keyboard, 'keydown', e => this.key(e));
    this.time.delayedCall(CAMP.lock, () => this.ok = true);
    this.layout(true);
  }
  layout(first) {
    const W = this.scale.width, H = this.scale.height, col = H > W * 1.25, ids = this.d.cards, n = ids.length, gap = 16, HD = 240;
    const cw = col ? Math.min(W - 48, 460) : Phaser.Math.Clamp(Math.floor((W - 48 - (n - 1) * gap) / n), 160, 250), ch = col ? Phaser.Math.Clamp(Math.floor((H - HD - 52 - 2 * gap) / n), 170, 206) : 300;
    const block = HD + (col ? n * ch + (n - 1) * gap : ch) + 44, top = Math.max(8, (H - block) / 2);
    this.dim.setSize(W, H);
    this.box?.destroy();
    const items = [], cards = this.cards = [];
    const title = ribbon(this, W / 2, top + 64, Math.min(W - 40, 440), 'blue', 'big', 'Choose a power-up');
    const div = sword(this, W / 2, top + 172, Math.min(W - 60, 360));
    items.push(div, title);
    ids.forEach((id, i) => {
      const x = col ? W / 2 : W / 2 + (i - (n - 1) / 2) * (cw + gap), y = col ? top + HD + ch / 2 + i * (ch + gap) : top + HD + ch / 2;
      const c = this.card(id, i, x, y, cw, ch, col);
      c.baseY = y; cards.push(c); items.push(c);
    });
    const hint = this.add.text(W / 2, top + block - 14, uiTouch(this) ? 'Tap a card' : 'Click a card, press its number, or use arrows and Enter', txt(16)).setOrigin(0.5).setScrollFactor(0);
    items.push(hint);
    this.box = this.add.container(0, 0, items).setScrollFactor(0);
    this.select(this.sel, true);
    if (first) [title, div, ...cards, hint].forEach((o, i) => {              // everything drops in, one after the other
      const y = o.y, alpha = o.alpha;
      o.setAlpha(0).y = y + 28;
      this.tweens.add({ targets: o, y, alpha, duration: 260, delay: i * 70, ease: 'Back.easeOut' });
    });
  }
  // one card: panel, rarity ribbon on its top edge, icon, name, effect line, and its key (1-3) when there is a keyboard
  card(id, i, x, y, cw, ch, col) {
    const P = POWERUPS[id], R = RARITY[P.rarity], c = uiBox(this, x, y, []), side = col ? -cw / 2 + 84 : 0, ink = R.special ? '#fff4c9' : UI_BROWN, sm = !col && cw < 200;   // paper_special is dark: light ink
    const pan = panel(this, 0, 0, cw, ch, R.special);
    uiHand(this, pan);
    pan.on('pointerover', () => uiDesktop(this) && this.select(i)).on('pointerdown', () => this.pick(i));
    const tag = ribbon(this, 0, -ch / 2 + 6, Math.min(cw - 40, col ? 220 : 180), R.ribbon, 'small', R.label);
    tag.label.setStroke('#161c2e', 2);                                 // the kit's 3 px stroke fills the opening of a small C
    const iy = col ? 14 : -ch / 2 + 112, fr = this.add.image(side, iy, 'btn-tiny-square').setScrollFactor(0);     // the icon sits in a tiny slot frame
    const ic = icon(this, side, iy, P.icon[0], P.icon[1]).setScale(P.icon[2] || 1);
    const tw = col ? cw - 168 : cw - 56, tx = col ? -cw / 2 + 138 : 0;
    const name = this.add.text(tx, col ? -22 : -ch / 2 + 166, P.name, { ...txt(col ? 28 : sm ? 20 : 22, ink, null), wordWrap: { width: tw + 16 } }).setOrigin(col ? 0 : 0.5, 0.5).setScrollFactor(0);
    const fx = this.add.text(tx, col ? 8 : -ch / 2 + 190, powerText(id, this.d.island), { ...txt(col ? 22 : sm ? 17 : 18, ink, null), wordWrap: { width: tw }, align: col ? 'left' : 'center' }).setOrigin(col ? 0 : 0.5, 0).setScrollFactor(0);
    c.pan = pan; c.add([pan, tag, fr, ic, name, fx]);
    if (!uiTouch(this)) {                                              // the key, in the same badge as the HUD's tier numbers
      const bx = col ? cw / 2 - 40 : 0, by = ch / 2 - 44;
      c.add([this.add.rectangle(bx, by, 24, 24, R.tint).setStrokeStyle(2, 0x161c2e).setScrollFactor(0), this.add.text(bx, by, i + 1, numTxt(14)).setOrigin(0.5).setScrollFactor(0)]);
    }
    return c;
  }
  select(i, still) {
    if (!still) SFX.play(this, 'card');
    this.sel = i;
    this.cards.forEach((c, j) => {
      this.tweens.killTweensOf(c);
      const y = c.baseY - (j === i ? 10 : 0);
      c.pan.setTint(j === i ? 0xffffff : 0xcfc6bd);                    // the others are a little darker, the pick is lifted
      still ? c.setPosition(c.x, y) : this.tweens.add({ targets: c, y, duration: 90 });
    });
  }
  key(e) {
    if (!this.ok || this.done || e.repeat) return;
    const n = this.d.cards.length, k = e.code, num = /^(Digit|Numpad)([1-9])$/.exec(k);
    if (num) { if (+num[2] <= n) this.pick(+num[2] - 1) }
    else if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(k)) this.select((this.sel + n - 1) % n);
    else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(k)) this.select((this.sel + 1) % n);
    else if (['Enter', 'NumpadEnter', 'Space'].includes(k)) this.pick(this.sel);
  }
  // the pick pops up with a burst of sparks, the others fade; then the scene underneath gets the power-up and runs again
  pick(i) {
    if (!this.ok || this.done) return;
    this.done = true; SFX.play(this, 'confirm');
    const c = this.cards[i], id = this.d.cards[i], R = RARITY[POWERUPS[id].rarity];
    this.cards.forEach((o, j) => { this.tweens.killTweensOf(o); if (j !== i) this.tweens.add({ targets: o, alpha: 0, duration: 160 }) });
    this.tweens.add({ targets: c, y: c.baseY - 26, alpha: 1, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    chips(this, c.x, c.baseY - 60, [R.tint, 0xffe888, 0xffffff], 18, 1.6);
    this.time.delayedCall(CAMP.confirm, () => {
      const from = this.scene.get(this.d.from);
      this.scene.stop(); this.scene.resume(this.d.from);
      from.takePower(id);
    });
  }
}
Cards.prototype.on = TestMap.prototype.on;                               // the scene's listener helper: removes itself at shutdown
