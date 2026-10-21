// Dev page: every animation playing in a grid. Left/right arrows or a tap change page. ?page=N jumps to a page.
const GCOLS = 6, GROWS = 6, GW = 96, GH = 104, GTOP = 28;

class AnimGallery extends Phaser.Scene {
  constructor() { super('AnimGallery') }
  create() {
    this.cameras.main.setBackgroundColor('#47aba9');
    this.keys = this.registry.get('anims');
    this.pages = Math.ceil(this.keys.length / (GCOLS * GROWS));
    this.page = Phaser.Math.Clamp((+new URLSearchParams(location.search).get('page') || 1) - 1, 0, this.pages - 1);
    this.layer = this.add.container();
    this.title = this.add.text(this.scale.width / 2, 14, '', txt(14)).setOrigin(0.5).setDepth(10);
    this.input.keyboard.on('keydown-LEFT', () => this.go(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.go(1));
    this.input.on('pointerdown', p => this.go(p.x < this.scale.width / 3 ? -1 : 1));   // left third = back, rest = forward
    this.show();
  }
  go(d) { this.page = (this.page + d + this.pages) % this.pages; this.show() }
  show() {
    this.layer.removeAll(true);
    this.title.setText(`anims ${this.page + 1}/${this.pages}  (${this.keys.length})`);
    const g = this.add.graphics().lineStyle(1, 0x161c2e, 0.35);    // outline of each frame cell: slicing errors show up here
    this.layer.add(g);
    this.keys.slice(this.page * GCOLS * GROWS, (this.page + 1) * GCOLS * GROWS).forEach((key, i) => {
      const x = (i % GCOLS) * GW + GW / 2, y = GTOP + Math.floor(i / GCOLS) * GH;
      const spr = this.add.sprite(x, y + 40, null).play(key);
      const { width: fw, height: fh } = spr.frame;
      spr.setScale(Math.min(2, GW / fw, 80 / fh));
      g.strokeRect(x - spr.displayWidth / 2, y + 40 - spr.displayHeight / 2, spr.displayWidth, spr.displayHeight);
      // one-shot animations stop on their last frame: replay them after a short pause
      spr.on('animationcomplete', () => this.time.delayedCall(600, () => spr.active && spr.play(key)));
      // long keys wrap at the hyphen nearest the middle
      const cuts = [...key.matchAll(/-/g)].map(m => m.index).sort((a, b) => Math.abs(a - key.length / 2) - Math.abs(b - key.length / 2));
      const wrap = key.length > 13 && cuts.length ? key.slice(0, cuts[0]) + '\n' + key.slice(cuts[0] + 1) : key;
      const t = this.add.text(x, y + 91, wrap, txt(10)).setOrigin(0.5).setLineSpacing(-3).setAlign('center');
      t.setScale(Math.min(1, (GW - 2) / t.width));
      this.layer.add([spr, t]);
    });
  }
}
