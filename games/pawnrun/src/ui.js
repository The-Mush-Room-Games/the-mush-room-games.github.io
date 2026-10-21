// Pawn Run UI kit: every piece is a Tiny Swords repacked-UI piece (build guide section 7) with the guide's nineslice insets.
// Nothing is drawn below its smallest size or below 1x (no downscaling): sizes are clamped, scales are 1 or whole numbers.
// All helpers take (scene, x, y, ...) with x,y = the CENTRE of the piece, and set scrollFactor(0) (screen space).
const UI_D = 1e6;                                              // HUD depth
const TIER_COLOUR = ['blue', 'red', 'yellow', 'purple', 'black'];   // weapon tier 0..4, the kit's colour order
const TOOL_ICON = { hammer: 'tool1', axe: 'tool2', knife: 'tool3', pickaxe: 'tool4' };   // tool1 mallet, tool2 axe, tool3 dagger, tool4 pickaxe
const ITEM_ICON = { meat: ['meat'], dynamite: ['odynamite', 0], bomb: ['bomb-idle'] };   // [texture, frame]
const UI_BROWN = '#5a3e2b';                                    // text colour on paper (no stroke)
const UI_CUR = { arrow: 'url(assets/ui/cursor01.png) 22 17, default', hand: 'url(assets/ui/cursor02.png) 26 17, pointer' };

const uiDesktop = s => s.sys.game.device.os.desktop;
const uiTouch = s => !!s.sys.game.device.input.touch;
const uiMin = (v, m) => Math.max(v, m);
// guide's cursors on desktop: arrow by default, hand over buttons (call once per scene; the setting lives on the canvas)
const uiCursor = s => { if (uiDesktop(s)) s.input.setDefaultCursor(UI_CUR.arrow) };
// hit areas follow the visible art, not the 64/128 canvas (the canvas has transparent margins, so neighbouring buttons would steal each other's taps)
const BTN_HIT = { 'btn-small-round': new Phaser.Geom.Circle(64, 64, 44), 'btn-small-square': new Phaser.Geom.Rectangle(19, 17, 90, 94),
  'btn-tiny-round': new Phaser.Geom.Circle(32, 32, 32), 'btn-tiny-square': new Phaser.Geom.Rectangle(2, 2, 60, 60) };
const uiHand = (s, o, hit = BTN_HIT[o.texture.key]) => {
  const cfg = hit ? { hitArea: hit, hitAreaCallback: hit.type === Phaser.Geom.CIRCLE ? Phaser.Geom.Circle.Contains : Phaser.Geom.Rectangle.Contains } : {};
  return o.setInteractive(uiDesktop(s) ? { ...cfg, cursor: UI_CUR.hand } : cfg);
};
const uiNine = (s, x, y, key, w, h, l, r, t, b) => s.add.nineslice(x, y, key, undefined, w, h, l, r, t, b).setScrollFactor(0);
const uiBox = (s, x, y, objs) => s.add.container(x, y, objs).setScrollFactor(0);   // children of a container are placed relative to x,y

// paper_regular / paper_special, insets 64, smallest 128x128
function panel(s, x, y, w, h, special) {
  return uiNine(s, x, y, special ? 'paper_special' : 'paper_regular', uiMin(w, 128), uiMin(h, 128), 64, 64, 64, 64);
}
// woodtable_wide / banner_wide, insets 128, smallest 256x256
function board(s, x, y, w, h, kind = 'wood') {
  return uiNine(s, x, y, kind === 'banner' ? 'banner_wide' : 'woodtable_wide', uiMin(w, 256), uiMin(h, 256), 128, 128, 128, 128);
}
// ribbon_big_<colour> (320x128, insets 128,128,0,0, smallest 256 wide) or ribbon_small_<colour>_<fishtail|pointed> (192x64, insets 64, smallest 128 wide).
// Returns a container; .label is the text. Sideways stretch only: the height stays the image height.
function ribbon(s, x, y, w, colour = 'blue', size = 'big', label = '', tail = 'pointed') {
  const big = size === 'big', key = big ? 'ribbon_big_' + colour : `ribbon_small_${colour}_${tail}`;
  const ins = big ? 128 : 64, rb = uiNine(s, 0, 0, key, uiMin(w, ins * 2), big ? 128 : 64, ins, ins, 0, 0);
  const lb = s.add.text(0, big ? 4 : 0, label, txt(big ? 24 : 16)).setOrigin(0.5).setScrollFactor(0);
  const c = uiBox(s, x, y, [rb, lb]);
  c.rb = rb; c.label = lb;
  return c;
}
// sword_<colour> divider (320x128, insets 128,128,0,0, smallest 256 wide)
const sword = (s, x, y, w, colour = 'blue') => uiNine(s, x, y, 'sword_' + colour, uiMin(w, 256), 128, 128, 128, 0, 0);

// big button: btn_big_<blue|red> (192x192 art, insets 64, smallest 128x128). Pressed art sits ~11 px lower: swap the texture, no hover art.
// Returns the nineslice (interactive); .label is the text.
function button(s, x, y, w, h, label, colour = 'blue', onClick) {
  const key = 'btn_big_' + colour, b = uiNine(s, x, y, key, uiMin(w, 128), uiMin(h, 128), 64, 64, 64, 64);
  const t = s.add.text(x, y - 4, label, txt(22)).setOrigin(0.5).setScrollFactor(0);
  let down = false;
  const set = d => { down = d; b.setTexture(d ? key + '_pressed' : key); t.y = y - 4 + (d ? 8 : 0) };
  uiHand(s, b, new Phaser.Geom.Rectangle(19, 17, b.width - 38, b.height - 36));
  b.on('pointerdown', () => set(true)).on('pointerout', () => down && set(false))
   .on('pointerup', () => { if (down) { set(false); onClick && onClick() } });
  b.on('destroy', () => t.destroy());
  b.label = t; b.setLabel = v => t.setText(v);
  return b;
}
// small (128 art, has _pressed) or tiny (64 art, no pressed art: the icon dips instead) round/square button with an icon on top, kit icon at 1x.
// Fires onDown on press (touch controls want the press, not the release). Returns the button image; .icon is the icon.
function iconButton(s, x, y, shape, size, iconKey, onDown) {
  const key = `btn-${size}-${shape}`, small = size === 'small', b = s.add.image(x, y, key).setScrollFactor(0);
  const ic = iconKey ? s.add.image(x, y, iconKey).setScrollFactor(0) : null;
  const dy = small ? 6 : 3, set = d => { if (small) b.setTexture(d ? key + '-pressed' : key); if (ic) ic.y = y + (d ? dy : 0) };
  uiHand(s, b);
  b.on('pointerdown', () => { set(true); onDown && onDown() }).on('pointerup', () => set(false)).on('pointerout', () => set(false));
  b.on('destroy', () => ic && ic.destroy());
  b.icon = ic;
  return b;
}
// bar: bar_big_base / bar_small_base (192x64, insets 64,64,0,0, smallest 128 wide) + the 64x64 fill stretched over the slot, which starts 54 px in.
// Returns a container with set(frac 0..1). The fill is cropped (not squeezed) to the fraction.
function bar(s, x, y, w = 192, size = 'big') {
  const base = uiNine(s, 0, 0, `bar_${size}_base`, uiMin(w, 128), 64, 64, 64, 0, 0), sw = base.width - 108;
  const fill = s.add.image(-base.width / 2 + 54, 0, size + 'bar-fill').setOrigin(0, 0.5).setDisplaySize(sw, 64).setScrollFactor(0);
  const c = uiBox(s, x, y, [base, fill]);
  c.set = f => { f = Phaser.Math.Clamp(f, 0, 1); fill.setVisible(f > 0).setCrop(0, 0, Math.round(64 * f), 64); return c };
  return c.set(1);
}
// slot: a kit button used as an empty frame holding one item. 'tiny' = btn-tiny-square (64), 'small' = btn-small-square (128, pressed art = selected).
// Returns a container (interactive hit area on .hit); .setItem(key, frame, scale) / .setActive(bool).
function slot(s, x, y, size = 'tiny') {
  const key = 'btn-' + size + '-square', fr = s.add.image(0, 0, key).setScrollFactor(0), it = s.add.image(0, 0, 'meat').setVisible(false).setScrollFactor(0);
  const c = uiBox(s, x, y, [fr, it]);
  c.setItem = (k, f, sc = 1) => { k ? it.setTexture(k, f).setScale(sc).setVisible(true) : it.setVisible(false); return c };
  c.setActive = a => { if (size === 'small') { fr.setTexture(a ? key + '-pressed' : key); it.y = a ? 5 : -6 } return c };
  c.setActive(false);
  c.fr = fr; c.it = it;
  return c;
}
const icon = (s, x, y, key, frame) => s.add.image(x, y, key, frame).setScrollFactor(0);

// portrait: a 256 avatar is far too big at 1x and can't be shrunk, so show a w x h window of it at 1x.
// framed (default): the 64 window sits in a btn-small-square frame, cropped to the face. frame=false: a big window (about the whole head) for the boss ribbon.
const PORTRAIT_CENTRE = { avatar01: [120, 122], avatar02: [126, 122], avatar03: [134, 109], avatar04: [129, 121], avatar05: [134, 119], 'gnome-avatar': [133, 124], 'snake-avatar': [124, 129], 'spider-avatar': [125, 128], 'slingshot-avatar': [131, 118], 'bear-avatar': [120, 118], 'panda-avatar': [122, 118] };   // alpha-bbox centres of the 256 images
const PORTRAIT_FACE = { avatar05: [150, 138] };                // the Blue Pawn's face is low and right of its bbox centre
function portrait(s, x, y, key, w = 64, h = 64, frame = true) {
  const img = s.add.image(0, 0, key).setOrigin(0).setScrollFactor(0);
  const c = uiBox(s, x, y, frame ? [s.add.image(0, 0, 'btn-small-square').setScrollFactor(0), img] : [img]);
  c.set = k => {
    const [fx, fy] = (frame && PORTRAIT_FACE[k]) || PORTRAIT_CENTRE[k] || [128, 124], dy = frame ? 2 : 0;
    img.setTexture(k).setPosition(-fx, -fy + dy).setCrop(fx - w / 2, fy - h / 2 - dy, w, h); return c;
  };
  return c.set(key);
}

// ---------------------------------------------------------------- HUD (screen space, depth >= 1e6)
// Layout at 600x750: the top row hugs the top corners, the bottom row and touch controls the bottom corners (W, H = screen size). Stick + round buttons only on touch devices (or new Hud(scene, {touch:true})).
class Hud {
  constructor(scene, opts = {}) {
    const s = this.scene = scene, W = s.scale.width, H = s.scale.height;
    this.list = [];
    this._stick = new Phaser.Math.Vector2();
    this.touch = opts.touch ?? uiTouch(s);
    uiCursor(s);
    const A = (o, d = 0) => { o.setDepth(UI_D + d); o.icon?.setDepth(UI_D + d + 1); this.list.push(o); return o };
    const label = (x, y, str, size, ox = 0.5) => A(s.add.text(x, y, str, txt(size)).setOrigin(ox, 0.5).setScrollFactor(0), 3);

    // top left: hero portrait (Blue Pawn), HP bar, dash bar
    A(portrait(s, 52, 52, 'avatar05'));
    this.hp = A(bar(s, 182, 34, 240, 'big'), 1);
    this.hpText = label(272, 36, '', 28, 0);
    this.dash = A(bar(s, 174, 82, 224, 'small'), 1);
    // top right: counters (coin icon, duck frame 0 at 2x)
    A(icon(s, W - 108, 30, 'icon03'));
    this.goldText = label(W - 76, 32, '0', 32, 0);
    A(icon(s, W - 108, 84, 'duck', 0).setScale(2));
    this.duckText = label(W - 76, 86, '0', 32, 0);

    // boss: big ribbon top centre, boss portrait, name, big bar (hidden until showBoss)
    this.boss = A(uiBox(s, W / 2, 150, []), 2);
    const rib = ribbon(s, 0, 0, 440, 'red', 'big', ''), name = s.add.text(30, -18, '', txt(20)).setOrigin(0.5).setScrollFactor(0);
    this.bossBar = bar(s, 30, 14, 256, 'big');
    this.bossFace = portrait(s, -160, 0, 'bear-avatar');
    this.boss.add([rib, this.bossBar, name, this.bossFace]);
    this.bossName = name;
    this.boss.setVisible(false);

    // bottom: 2 weapon slots (small square frame, tier ribbon under it; the active one is shown pressed) + 3 item slots (tiny square)
    this.w = [68, 200].map((x, i) => {
      const sl = A(slot(s, x, H - 95, 'small'), 1), tag = A(ribbon(s, x, H - 28, 128, 'blue', 'small', ''), 2);
      uiHand(s, sl.fr); sl.fr.on('pointerdown', () => s.events.emit('hud-swap'));
      return { sl, tag };
    });
    this.it = [W - 184, W - 112, W - 40].map((x, i) => {
      const sl = A(slot(s, x, H - 90, 'tiny'), 1);
      uiHand(s, sl.fr); sl.fr.on('pointerdown', () => s.events.emit('hud-item', i));
      return sl;
    });

    if (this.touch) this._touchControls(A);
    this.setHp(5, 5); this.setDash(1); this.setWeapons([null, null], 0); this.setItems([null, null, null]);
  }

  _touchControls(A) {
    const s = this.scene, W = s.scale.width, H = s.scale.height, ev = n => () => s.events.emit(n);
    s.input.addPointer(2);                                      // stick + buttons at the same time
    // floating stick: a faint ring waits bottom left; a touch anywhere in the left zone moves it under the thumb
    const home = { x: 88, y: H - 200 }, C = { ...home, r: 52 };
    const ring = A(s.add.image(C.x, C.y, 'btn-tiny-round').setScale(2).setScrollFactor(0).setAlpha(0.4));   // tiny round button at exactly 2x
    this.knob = A(s.add.image(C.x, C.y, 'btn-small-round').setScrollFactor(0).setAlpha(0.4), 1);
    A(iconButton(s, W - 68, H - 212, 'round', 'small', 'icon05', ev('hud-swing')), 1);    // swing: crossed swords
    A(iconButton(s, W - 162, H - 186, 'round', 'small', 'icon07', ev('hud-dash')), 1);     // dash: green play arrow
    A(iconButton(s, W - 40, H - 310, 'round', 'small', 'icon11', ev('hud-map')), 1);       // map: info. Swap = tap a weapon slot
    const zone = new Phaser.Geom.Rectangle(0, 120, W / 2, H - 270), stick = this._stick;
    const place = (x, y, a) => { C.x = x; C.y = y; ring.setPosition(x, y).setAlpha(a); this.knob.setPosition(x, y).setAlpha(a) };
    const move = p => {
      const dx = p.x - C.x, dy = p.y - C.y, d = Math.hypot(dx, dy), k = d > C.r ? C.r / d : 1;
      stick.set(dx * k / C.r, dy * k / C.r); this.knob.setPosition(C.x + dx * k, C.y + dy * k);
    };
    const end = p => { if (p === this.sp) { this.sp = null; stick.set(0, 0); place(home.x, home.y, 0.4) } };
    this.h = {
      pointerdown: p => { if (!this.sp && zone.contains(p.x, p.y)) { this.sp = p; place(p.x, p.y, 1); move(p) } },
      pointermove: p => { if (p === this.sp) move(p) },
      pointerup: end, pointerupoutside: end,
    };
    for (const [e, f] of Object.entries(this.h)) s.input.on(e, f);
  }

  setHp(cur, max) { this.hp.set(cur / max); this.hpText.setText(`${cur}/${max}`) }
  setGold(n) { this.goldText.setText(n) }
  setDucks(n) { this.duckText.setText(n) }
  setDash(frac) { this.dash.set(frac) }
  setWeapons(slots, active) {
    this.w.forEach(({ sl, tag }, i) => {
      const d = slots[i];
      sl.setItem(d && TOOL_ICON[d.key], 0, 2).setActive(i === active);
      tag.setVisible(!!d);
      if (d) tag.rb.setTexture('ribbon_small_' + TIER_COLOUR[d.tier] + '_pointed');
    });
  }
  setItems(items) { this.it.forEach((sl, i) => { const d = ITEM_ICON[items[i]]; sl.setItem(d && d[0], d && d[1]) }) }
  showBoss(name, avatarKey) { this.bossName.setText(name); this.bossFace.set(avatarKey); this.bossBar.set(1); this.boss.setVisible(true) }
  setBossHp(frac) { this.bossBar.set(frac) }
  hideBoss() { this.boss.setVisible(false) }
  get stick() { return this._stick }
  destroy() {
    if (this.h) for (const [e, f] of Object.entries(this.h)) this.scene.input.off(e, f);
    this.list.forEach(o => o.destroy());
    this.list = [];
  }
}
