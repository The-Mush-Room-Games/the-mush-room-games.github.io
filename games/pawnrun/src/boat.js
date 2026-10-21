// The boat at the dock: a `boat` object on the water and `dock` rects on the planks beside it. Standing in a dock rect shows a prompt over the hero:
// "Defeat the boss" while scene.boss lives, then "E board" ("tap: board" on touch). E or a tap boards: the screen fades and the Sail scene takes over,
// then the test level starts again on the next island (scenes/Sail.js). Scene contract (TestMap): scene.hero, scene.boss (undefined = no boss), scene.leaving, scene.island, feetHit().

// Pure. The prompt state: 'hidden' (not at the dock), 'locked' (the boss is alive) or 'board'.
const boatState = (open, near) => !near ? 'hidden' : open ? 'board' : 'locked';

class Boat {
  constructor(scene, art, zones) {
    this.scene = scene; this.art = art; this.zones = zones; this.state = 'hidden';
    const c = this.c = scene.add.container(0, 0).setDepth(1e5).setVisible(false), t = this.t = scene.add.text(0, 0, '', txt(16)).setOrigin(0.5);
    c.add(t);
    if (uiTouch(scene)) { c.setSize(120, 36); c.setInteractive(); c.on('pointerdown', () => this.board()) }   // a tap on the prompt boards
  }
  get open() { const b = this.scene.boss; return !b || b.dead }
  update() {
    const sc = this.scene, h = sc.hero;
    const near = !h.dead && lvOf(h) <= 0 && !sc.leaving && this.zones.some(z => feetHit(z, h));
    this.state = boatState(this.open, near);
    this.c.setVisible(this.state !== 'hidden');
    if (this.state === 'hidden') return;
    this.t.setText(this.state === 'locked' ? 'Defeat the boss' : uiTouch(sc) ? 'tap: board' : 'E board');
    this.c.setPosition(h.x, h.y - 92 + Math.sin(sc.time.now / 200) * 2);
  }
  board() {
    const sc = this.scene;
    if (this.state !== 'board' || sc.leaving) return;
    sc.leaving = true; this.c.setVisible(false);
    const cam = sc.cameras.main, run = { island: sc.island + 1, hero: sc.hero.state };
    cam.fadeOut(400);
    cam.once('camerafadeoutcomplete', () => sc.scene.start('Sail', run));
  }
}

if (typeof module === 'object') module.exports = { boatState };
