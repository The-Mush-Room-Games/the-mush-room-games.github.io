// The sailing scene between islands: the boat on animated water with a wake (Water Splash puffs), wave streaks and drifting clouds, a fade in, the
// "Island N" banner (banner_wide) and a fade out into the test level on that island (scenes/TestMap.js, init data { island, hero }). About 4 s.
const SAIL = { fade: 350, banner: 700, out: 3500, end: 3950, speed: 260 };   // ms: banner drops in at `banner`, the fade out starts at `out`, the level starts at `end`; px/s the water streams by

class Sail extends Phaser.Scene {
  constructor() { super('Sail') }
  init(d) { this.d = d }
  create() {
    const cam = this.cameras.main, W = this.scale.width, H = this.scale.height, d = this.d;
    cam.setBackgroundColor('#47aba9').fadeIn(SAIL.fade);
    this.on(this.scale, 'resize', () => this.scene.restart(this.d));
    // wave streaks: short pale dashes on the water that stream to the left as the boat sails right
    this.streaks = Array.from({ length: 26 }, () => ({ o: this.add.rectangle(Math.random() * W, Math.random() * H, Phaser.Math.Between(16, 44), 3, 0xc9f0e0, 0.55).setDepth(1), v: Phaser.Math.FloatBetween(0.7, 1.3) }));
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ o: this.add.image(Math.random() * W, 40 + Math.random() * (H - 80), 'clouds' + (1 + (i * 3) % 8)).setAlpha(0.8).setDepth(30 + i), v: 0.25 + 0.1 * i }));
    // the boat bobs in the middle, with the Pawn aboard
    const bx = W / 2, by = H * 0.52;
    this.boat = this.add.sprite(bx, by, 'boat').setScale(1.5).setDepth(10).play('boat');   // the art's bow is on the right (the notched transom on the left), so unflipped it heads right
    const f = d.hero.form, pawn = this.add.sprite(bx + 6, by - 14, f === 'old' ? 'opawn' : 'pawn-idle-' + d.hero.weapons[d.hero.active]).setDepth(11).play(f === 'old' ? 'opawn-idle' : 'pawn-idle-' + d.hero.weapons[d.hero.active]);
    this.tweens.add({ targets: [this.boat, pawn], y: '+=5', duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.time.addEvent({ delay: 140, loop: true, callback: () => this.wake(bx - 96, by + 36) });
    // the banner
    const bw = Math.min(W - 40, 520), box = uiBox(this, W / 2, -200, [board(this, 0, 0, bw, 256, 'banner'), this.add.text(0, 2, 'Island ' + d.island, txt(44)).setOrigin(0.5).setScrollFactor(0)]).setDepth(UI_D);
    this.tweens.add({ targets: box, y: H * 0.24, delay: SAIL.banner, duration: 600, ease: 'Back.easeOut' });
    this.time.delayedCall(SAIL.out, () => cam.fadeOut(SAIL.end - SAIL.out));
    this.time.delayedCall(SAIL.end, () => this.scene.start('TestMap', { island: d.island, hero: d.hero }));
    document.title = 'ready sail ' + d.island;
  }
  // a splash on the water behind the boat that drifts back with the streaks
  wake(x, y) {
    const s = this.add.sprite(x, y + Phaser.Math.Between(-8, 8), 'water-splash').setScale(0.7).setAlpha(0.9).setDepth(5).play('water-splash');
    this.tweens.add({ targets: s, x: x - SAIL.speed * 0.9, duration: 900 });
    s.once('animationcomplete', () => s.destroy());
  }
  update(t, dt) {
    const W = this.scale.width, k = dt / 1000;
    for (const { o, v } of this.streaks) { o.x -= SAIL.speed * v * k; if (o.x < -50) { o.x = W + 50; o.y = Math.random() * this.scale.height } }
    for (const { o, v } of this.clouds) { o.x -= SAIL.speed * v * k; if (o.x < -300) { o.x = W + 300; o.y = 40 + Math.random() * (this.scale.height - 80) } }
  }
}
Sail.prototype.on = TestMap.prototype.on;                                 // the scene's listener helper: removes itself at shutdown
