const FONT = '"Pixelify Sans"';
const NUMFONT = '"Silkscreen"';                  // HUD numbers: Pixelify's 5 reads as an S
const txt = (size, color = '#fff4c9', stroke = '#161c2e', font = FONT) =>
  ({ fontFamily: font, fontStyle: font === FONT ? '700' : '400', fontSize: size + 'px', color, stroke, strokeThickness: stroke ? Math.ceil(size / 6) : 0 });

const numTxt = size => txt(size, undefined, undefined, NUMFONT);

// ?anims -> AnimGallery, ?ui -> UIGallery, ?map=<name> -> that Tiled map in maps/ on its own (?map=test: the test level), otherwise the town. ?reset forgets the save.
const query = new URLSearchParams(location.search);
const startScene = query.has('anims') ? 'AnimGallery' : query.has('ui') ? 'UIGallery' : query.has('map') && query.get('map') !== 'town' ? 'TestMap' : 'Town';
// the save: loaded here, gold and ducks (the registry's) are copied into it and written whenever they change
const startSave = reg => {
  if (query.has('reset')) try { localStorage.removeItem(SAVE_KEY) } catch {}
  SAVE = loadSave(); reg.set('gold', SAVE.gold); reg.set('ducks', SAVE.ducks);
  reg.events.on('changedata', (p, k, v) => { if (k === 'gold' || k === 'ducks') { SAVE[k] = v; writeSave(SAVE) } });
};

const start = () => window.game = new Phaser.Game({         // window.game: handle for dev checks
  type: Phaser.AUTO,                            // WebGL. Canvas is deprecated and skips NineSlice
  parent: 'game',
  backgroundColor: '#0b0612',
  pixelArt: true,
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH, width: 600, height: 750 },   // fills the window; 600x750 is the smallest view, the rest is extra world
  scene: [Boot, AnimGallery, UIGallery, TestMap, Town, Interior, Cards, Talk, Shop, Skills, Sail, MapView],
  callbacks: { preBoot: g => { g.registry.set('start', startScene); startSave(g.registry) } },
  banner: false,
});
// Text is drawn once, so wait for the web font (give up after 2.5 s so the game still boots offline)
Promise.race([Promise.all([document.fonts.load('700 16px ' + FONT), document.fonts.load('16px ' + NUMFONT)]), new Promise(r => setTimeout(r, 2500))]).then(start, start);
