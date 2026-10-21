const FONT = '"Pixelify Sans"';
const txt = (size, color = '#fff4c9', stroke = '#161c2e') =>
  ({ fontFamily: FONT, fontStyle: '700', fontSize: size + 'px', color, stroke, strokeThickness: stroke ? Math.ceil(size / 6) : 0 });

// ?anims -> AnimGallery, ?ui -> UIGallery, otherwise the Tiled test map (?map=name picks another file in maps/).
const startScene = (q => q.has('anims') ? 'AnimGallery' : q.has('ui') ? 'UIGallery' : 'TestMap')(new URLSearchParams(location.search));

const start = () => window.game = new Phaser.Game({         // window.game: handle for dev checks
  type: Phaser.AUTO,                            // WebGL. Canvas is deprecated and skips NineSlice
  parent: 'game',
  backgroundColor: '#0b0612',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 480, height: 600 },
  scene: [Boot, AnimGallery, UIGallery, TestMap],
  callbacks: { preBoot: g => g.registry.set('start', startScene) },
  banner: false,
});
// Text is drawn once, so wait for the web font (give up after 2.5 s so the game still boots offline)
Promise.race([document.fonts.load('700 16px ' + FONT), new Promise(r => setTimeout(r, 2500))]).then(start, start);
