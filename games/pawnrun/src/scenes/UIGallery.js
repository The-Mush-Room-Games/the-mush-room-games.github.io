// Dev page (?ui): every UI kit piece at its smallest and a larger size, pressable buttons, the HUD with fake values, and the touch controls forced on.
// Tap the top strip (left half back, right half forward), or use the left/right arrows. ?page=N jumps to a page.
class UIGallery extends Phaser.Scene {
  constructor() { super('UIGallery') }
  create() {
    this.cameras.main.setBackgroundColor('#47aba9');
    uiCursor(this);
    this.pages = [
      ['paper: min 128 / large', () => {
        panel(this, 80, 100, 128, 128); this.note(80, 180, 'regular 128x128');
        panel(this, 330, 110, 240, 170); this.note(330, 205, 'regular 240x170');
        panel(this, 80, 330, 128, 128, true); this.note(80, 410, 'special 128x128');
        panel(this, 330, 340, 240, 170, true); this.note(330, 435, 'special 240x170');
        this.add.text(330, 110, 'text on paper\n#5a3e2b, no stroke', txt(16, UI_BROWN, null)).setOrigin(0.5).setAlign('center');
      }],
      ['boards: min 256', () => {
        board(this, 140, 160, 256, 256); this.note(140, 300, 'woodtable 256x256');
        board(this, 140, 440, 256, 256, 'banner'); this.note(140, 570, 'banner 256x256');
        this.add.text(300, 160, 'insets 128\nall round\nkeeps curls\nand legs', txt(14)).setLineSpacing(4);
      }],
      ['boards: large', () => {
        board(this, 240, 150, 440, 270); this.note(240, 275, 'woodtable 440x270');
        board(this, 240, 440, 440, 270, 'banner'); this.note(240, 566, 'banner 440x270');
      }],
      ['big ribbons: min 256', () => TIER_COLOUR.forEach((c, i) => ribbon(this, 240, 90 + i * 100, 256, c, 'big', c + ' 256x128'))],
      ['small ribbons + wide', () => {
        TIER_COLOUR.forEach((c, i) => {
          ribbon(this, 100, 70 + i * 60, 128, c, 'small', c);          // smallest 128x64
          ribbon(this, 260, 70 + i * 60, 128, c, 'small', c, 'fishtail');
          ribbon(this, 400, 70 + i * 60, 128, c, 'small', 'tier ' + i);
        });
        this.note(100, 372, 'pointed 128'); this.note(260, 372, 'fishtail 128'); this.note(400, 372, 'tier tags');
        ribbon(this, 240, 440, 440, 'blue', 'big', 'ribbon_big 440 wide'); ribbon(this, 240, 540, 300, 'blue', 'small', 'small 300');
      }],
      ['swords: min 256', () => {
        TIER_COLOUR.forEach((c, i) => sword(this, 240, 60 + i * 90, 256, c));
        sword(this, 240, 520, 440, 'red'); this.note(240, 590, 'sword 256 (left) / 440 (bottom)');
      }],
      ['big buttons (press them)', () => {
        const n = this.add.text(240, 560, 'pressed: -', txt(18)).setOrigin(0.5);
        const go = k => () => n.setText('pressed: ' + k);
        button(this, 100, 110, 128, 128, 'blue', 'blue', go('blue 128'));
        button(this, 280, 110, 128, 128, 'red', 'red', go('red 128'));
        button(this, 240, 270, 320, 128, 'Play again', 'blue', go('Play again'));
        button(this, 240, 400, 220, 140, 'Quit', 'red', go('Quit'));
        this.note(400, 110, '128x128 min'); this.note(70, 480, '320x128, 220x140');
      }],
      ['small / tiny buttons', () => {
        const n = this.add.text(240, 570, 'pressed: -', txt(18)).setOrigin(0.5), go = k => () => n.setText('pressed: ' + k);
        [['round', 100], ['square', 240]].forEach(([sh, x]) => {
          iconButton(this, x, 90, sh, 'small', 'icon05', go('small ' + sh)); this.note(x, 150, 'small ' + sh + ' 128');
          iconButton(this, x, 230, sh, 'tiny', 'icon07', go('tiny ' + sh)); this.note(x, 280, 'tiny ' + sh + ' 64');
          iconButton(this, x, 340, sh, 'tiny', null, go('tiny empty ' + sh));
        });
        slot(this, 380, 90, 'small').setItem('tool2', 0, 2).setActive(false); this.note(380, 150, 'slot small');
        slot(this, 380, 230, 'small').setItem('tool2', 0, 2).setActive(true); this.note(380, 290, 'slot active');
        slot(this, 380, 340, 'tiny').setItem('meat'); this.note(380, 385, 'slot tiny');
        this.note(240, 430, 'tiny buttons have no pressed art:\nthe icon dips 3px instead');
      }],
      ['bars', () => {
        [128, 192, 256, 400].forEach((w, i) => { bar(this, 240, 50 + i * 70, w, 'big').set([0.25, 0.5, 0.75, 1][i]); this.note(240, 82 + i * 70, `big base ${w} wide, ${[25, 50, 75, 100][i]}%`) });
        [128, 192, 256].forEach((w, i) => { bar(this, 240, 360 + i * 60, w, 'small').set([0.2, 0.6, 1][i]); this.note(240, 385 + i * 60, `small base ${w} wide`) });
        const moving = bar(this, 240, 545, 256, 'big');
        this.tweens.addCounter({ from: 0, to: 1, duration: 2500, yoyo: true, repeat: -1, onUpdate: t => moving.set(t.getValue()) });
        this.note(240, 575, 'animated');
      }],
      ['slot frames (kit)', () => {
        this.add.image(110, 110, 'banner-slots').setOrigin(0.5); this.note(110, 220, 'banner-slots 192');
        this.add.image(340, 110, 'woodtable-slots').setOrigin(0.5); this.note(340, 220, 'woodtable-slots 192');
        this.note(240, 260, 'weapon slot (small) + tier tag, tiers 0-4');
        Object.keys(TOOL_ICON).forEach((k, i) => {
          slot(this, 70 + i * 100, 330, 'small').setItem(TOOL_ICON[k], 0, 2).setActive(i === 1);
          ribbon(this, 70 + i * 100, 368, 128, TIER_COLOUR[i], 'small', k);
        });
        this.note(240, 430, 'item slot (tiny): meat / dynamite / bomb');
        ['meat', 'dynamite', 'bomb'].forEach((k, i) => slot(this, 150 + i * 90, 480).setItem(...ITEM_ICON[k]));
        slot(this, 420, 480);
      }],
      ['icons, tools, cursors', () => {
        for (let i = 1; i <= 12; i++) { const x = 40 + ((i - 1) % 6) * 80, y = 50 + Math.floor((i - 1) / 6) * 80; icon(this, x, y, 'icon' + String(i).padStart(2, '0')); this.note(x, y + 32, '' + i) }
        Object.entries(TOOL_ICON).forEach(([k, t], i) => { icon(this, 60 + i * 110, 250, t); icon(this, 60 + i * 110, 300, t).setScale(2); this.note(60 + i * 110, 340, k + ' ' + t + ' 1x/2x') });
        ['cursor01', 'cursor02', 'cursor03'].forEach((c, i) => { icon(this, 70 + i * 100, 420, c); this.note(70 + i * 100, 455, ['arrow', 'hand', 'forbidden'][i]) });
        icon(this, 380, 420, 'cursor04'); this.note(380, 480, 'cursor04 128');
        ['gold', 'meat', 'odynamite', 'bomb-idle'].forEach((k, i) => icon(this, 60 + i * 100, 540, k, k === 'odynamite' ? 0 : undefined));
        icon(this, 460, 540, 'duck', 0).setScale(2);
      }],
      ['avatars (1x windows)', () => {
        for (let i = 1; i <= 5; i++) portrait(this, 50 + (i - 1) * 95, 70, 'avatar0' + i);
        this.note(240, 135, 'blue 1-5: framed 64 window at 1x (hero = 5)');
        ['gnome', 'snake', 'spider', 'slingshot', 'bear', 'panda'].forEach((k, i) => { portrait(this, 60 + i * 80, 220, k + '-avatar'); portrait(this, 100 + (i % 3) * 140, 330 + Math.floor(i / 3) * 140, k + '-avatar', 128, 128, false) });
        this.note(240, 175, 'boss avatars: framed 64 / unframed 128 windows at 1x');
        this.note(240, 590, 'a full avatar is 256x256: too big to show whole,\nand shrinking pixel art is not allowed');
      }],
      ['text styles', () => {
        this.add.text(240, 60, 'txt(): over the world', txt(28)).setOrigin(0.5);
        this.add.text(240, 100, 'txt(16) Pixelify Sans 700', txt(16)).setOrigin(0.5);
        panel(this, 240, 250, 320, 200);
        this.add.text(240, 220, 'On paper', txt(30, UI_BROWN, null)).setOrigin(0.5);
        this.add.text(240, 265, '#5a3e2b, no stroke', txt(18, UI_BROWN, null)).setOrigin(0.5);
        this.note(240, 380, 'stroke #161c2e, thickness = size/6');
      }],
      ['HUD (fake values)', () => { this.hud = this.makeHud(false) }],
      ['HUD + touch controls forced on', () => { this.hud = this.makeHud(true) }],
    ];
    this.pageCount = this.pages.length;
    this.title = this.add.text(this.scale.width / 2, 12, '', txt(14)).setOrigin(0.5).setDepth(2e6).setScrollFactor(0);
    this.fixed = this.children.list.length;
    this.page = Phaser.Math.Clamp((+new URLSearchParams(location.search).get('page') || 1) - 1, 0, this.pageCount - 1);
    this.input.keyboard.on('keydown-LEFT', () => this.go(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.go(1));
    this.input.on('pointerdown', p => { if (Math.abs(p.y - this.title.y) < 14) this.go(p.x < this.scale.width / 2 ? -1 : 1) });
    const again = () => this.show();                                // the screen is any size: lay the page out again
    this.scale.on('resize', again);
    this.events.once('shutdown', () => this.scale.off('resize', again));
    this.show();
  }
  note(x, y, str) { return this.add.text(x, y, str, txt(12)).setOrigin(0.5).setAlign('center') }
  makeHud(touch) {
    const h = new Hud(this, { touch });
    h.setHp(3, 5); h.setGold(120); h.setDucks(2);
    h.setWeapons([{ key: 'axe', tier: 0 }, { key: 'hammer', tier: 2 }], 1);
    h.setItems(['meat', 'dynamite', null]);
    h.showBoss('Bear King', 'bear-avatar'); h.setBossHp(0.7);
    if (touch) this.stickText = this.add.text(this.scale.width / 2, this.scale.height * 0.44, '', txt(12)).setOrigin(0.5).setDepth(2e6);
    ['swing', 'dash', 'swap', 'item', 'map'].forEach(n => this.events.on('hud-' + n, a => this.flash(n + (a === undefined ? '' : ' ' + a))));
    return h;
  }
  flash(msg) { this.title.setText(msg); this.time.delayedCall(700, () => this.title.setText(this.titleStr)) }
  go(d) { this.page = (this.page + d + this.pageCount) % this.pageCount; this.show() }
  update() { if (this.hud && this.stickText) this.stickText.setText(`stick ${this.hud.stick.x.toFixed(2)},${this.hud.stick.y.toFixed(2)}`) }
  show() {
    this.hud?.destroy(); this.hud = this.stickText = null;
    this.tweens.killAll(); this.time.removeAllEvents();
    ['swing', 'dash', 'swap', 'item', 'map'].forEach(n => this.events.off('hud-' + n));
    this.children.list.slice(this.fixed).forEach(o => o.destroy());
    const hud = this.pages[this.page][0].startsWith('HUD');
    this.title.setPosition(this.scale.width / 2, hud ? this.scale.height * 0.4 : 12);
    this.titleStr = `ui ${this.page + 1}/${this.pageCount}: ${this.pages[this.page][0]}`;
    this.title.setText(this.titleStr);
    this.pages[this.page][1]();
    if (!hud) this.add.container((this.scale.width - 480) / 2, (this.scale.height - 600) / 2, this.children.list.slice(this.fixed));   // the pages are laid out for 480x600: centre them
  }
}
