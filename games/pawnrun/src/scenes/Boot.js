// Loads every ASSETS entry, makes the 10 fps animations, then starts the scene in registry 'start'.
const ONESHOT = /attack|shoot|throw|interact|dust|explosion|splash|spawn|dead|build|chop|roll|-up$|-down$|^fx-/;
const FAST = /^fx-|^dazed$/;                             // the effect sheets are drawn for 15 fps

class Boot extends Phaser.Scene {
  constructor() { super('Boot') }
  preload() {
    this.sheets = [];                                   // [key, frame height] of every spritesheet
    for (const [k, [file, w, h]] of Object.entries(ASSETS)) {
      w ? this.load.spritesheet(k, 'assets/' + file, { frameWidth: w, frameHeight: h }) : this.load.image(k, 'assets/' + file);
      if (w) this.sheets.push([k, h]);
    }
    for (const { key, url } of SFX.files()) this.load.audio(key, url);   // every effect and music loop (src/sfx.js)
    // art added to the Tiled object tileset loads too, so a new kit image there needs no code change
    this.load.json('objects-tsj', 'maps/objects.tsj');
    this.load.once('filecomplete-json-objects-tsj', (key, type, ts) => {
      for (const t of ts.tiles || []) {
        const k = (t.properties || []).find(p => p.name === 'key')?.value || t.image.split('/').pop().replace(/\.png$/i, '');
        if (ASSETS[k]) continue;
        const url = 'maps/' + t.image, sheet = t.width && t.width < t.imagewidth;
        sheet ? this.load.spritesheet(k, url, { frameWidth: t.width, frameHeight: t.height }) : this.load.image(k, url);
        if (sheet) this.sheets.push([k, t.height]);
      }
    });
  }
  create() {
    SFX.init(this.game);
    // animations are global: make them once here. Every Tiny Swords animation runs at 10 fps.
    const make = (key, frames) => {
      this.anims.create({ key, frames, frameRate: FAST.test(key) ? 15 : 10, repeat: ONESHOT.test(key) ? 0 : -1 });
      keys.push(key);
    };
    const keys = [];
    for (const [k, h] of this.sheets) {
      const tex = this.textures.get(k);
      // single-row sheets with more than 1 frame; multi-row old sheets are listed in ANIMS
      if (tex.frameTotal > 2 && tex.getSourceImage().height === h) make(k, this.anims.generateFrameNumbers(k));
    }
    for (const [key, [sheet, start, end]] of Object.entries(ANIMS))
      make(key, this.anims.generateFrameNumbers(sheet, { start, end }));
    this.registry.set('anims', keys);
    this.scene.start(this.registry.get('start'));
  }
}
