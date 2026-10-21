// The trainer's two screens over the paused town, on paper panels with kit icons. d = { from, role, view }.
// 'tree': the skill tree. Each skill (SKILLS, data.js) has ranks up to a cap; a point costs more the higher your level (the points bought in all). + buys one (gold), - gives the
// last one back for what it cost (the price of the last point, whichever skill). The bar fills towards CLASS_LEVEL.
// 'class': the four classes with their idle art and a line each; tap one, then Choose (from CLASS_LEVEL, for good). Its perks (levels 7, 10, 14) are listed.
// ponytail: a class is only saved (SAVE.cls), the hero stays the Pawn; the class's own sprites, weapon and perks are a follow-up.
class Skills extends Sheet {
  constructor() { super('Skills') }
  init(d) { this.d = d; this.view = d.view || 'tree'; this.sel = SAVE.cls || 'warrior'; this.msg = '' }
  draw(items, W, H) { this.view === 'tree' ? this.tree(items, W, H) : this.classes(items, W, H) }
  say(msg) { this.msg = msg; this.time.delayedCall(1500, () => { if (this.msg === msg) { this.msg = ''; this.scene.isActive() && this.build() } }) }
  tree(items, W, H) {
    const ids = Object.keys(SKILLS), pw = Math.min(W - 24, 560), rh = 72, ph = 330 + ids.length * rh, cx = W / 2, top = Math.max(56, (H - ph) / 2 + 24), lv = level(SAVE), L = -pw / 2 + 40;
    items.push(panel(this, cx, top + ph / 2, pw, ph), ribbon(this, cx, top + 10, Math.min(pw - 40, 360), 'blue', 'big', 'Training'));
    this.purse(items, cx, top + 96);
    items.push(this.add.text(cx + L, top + 140, 'Level ' + lv, txt(24, UI_BROWN, null)).setOrigin(0, 0.5).setScrollFactor(0));
    items.push(bar(this, cx + 50, top + 140, 230, 'small').set(lv / CLASS_LEVEL));
    items.push(this.add.text(cx + pw / 2 - 40, top + 142, lv >= CLASS_LEVEL ? (SAVE.cls ? CLASSES[SAVE.cls].name : 'Class ready!') : 'Class at ' + CLASS_LEVEL, txt(16, UI_BROWN, null)).setOrigin(1, 0.5).setScrollFactor(0));
    ids.forEach((id, i) => this.row(items, id, cx, top + 178 + rh / 2 + i * rh, pw - 56, i));
    const by = top + ph - 62;
    this.btn(items, cx - 80, by, 150, 'Class', 'blue', () => this.ok && (this.view = 'class', this.msg = '', this.build()));
    this.btn(items, cx + 80, by, 150, 'Bye', 'red', () => this.ok && this.leave());
    items.push(this.add.text(cx, top + ph - 118, this.msg, txt(16, '#b8432e', null)).setOrigin(0.5).setScrollFactor(0));
  }
  row(items, id, cx, y, w, i) {
    const k = SKILLS[id], info = skillInfo(SAVE, id), L = cx - w / 2, done = info.state === 'max';
    items.push(this.add.image(L + 32, y, 'btn-tiny-square').setScrollFactor(0), icon(this, L + 32, y, k.icon[0], k.icon[1]).setScale(k.icon[2] || 1));
    items.push(this.add.text(L + 80, y - 14, k.name, txt(24, UI_BROWN, null)).setOrigin(0, 0.5).setScrollFactor(0), this.add.text(L + 80, y + 14, k.text, txt(16, '#8a6a4a', null)).setOrigin(0, 0.5).setScrollFactor(0));
    for (let r = 0; r < k.cap; r++) items.push(this.add.rectangle(L + w - 196 + r * 17, y - 18, 13, 13, r < info.rank ? 0xf2c33a : 0xd9c9a8).setStrokeStyle(2, 0x161c2e).setScrollFactor(0));
    if (!done) items.push(icon(this, L + w - 196, y + 10, 'icon03').setScale(0.6), this.add.text(L + w - 180, y + 11, info.cost, txt(24, info.state === 'poor' ? '#b8432e' : UI_BROWN, null)).setOrigin(0, 0.5).setScrollFactor(0));
    const plus = this.add.image(L + w - 62, y, 'btn-tiny-square').setScrollFactor(0), pt = this.add.text(L + w - 62, y - 2, done ? '' : '+', txt(32)).setOrigin(0.5).setScrollFactor(0);
    uiHand(this, plus); plus.on('pointerup', () => this.ok && this.train(id));
    if (info.state !== 'buy') plus.setTint(0x8a8a8a);
    items.push(plus, pt);
    if (info.rank) {                                                          // refunds only for a skill you have
      const minus = this.add.image(L + w - 18, y, 'btn-tiny-round').setScale(0.75).setScrollFactor(0), mt = this.add.text(L + w - 18, y - 2, '-', txt(24)).setOrigin(0.5).setScrollFactor(0);
      uiHand(this, minus); minus.on('pointerup', () => this.ok && this.untrain(id));
      items.push(minus, mt);
    }
  }
  train(id) {
    const i = skillInfo(SAVE, id);
    if (i.state === 'max') this.say('Maxed out'); else if (i.state === 'poor') this.say('Not enough gold');
    if (i.state !== 'buy') return this.build();
    buySkill(SAVE, id); commit(this); this.say(SKILLS[id].text); this.build();
    chips(this, this.scale.width / 2, this.scale.height / 2, [0xffe888, 0xffffff, 0x9be37a], 10, 1.2);
  }
  untrain(id) {
    const back = refundSkill(SAVE, id);
    back ? commit(this) : this.say(SAVE.skills[id] ? 'Your class needs level ' + CLASS_LEVEL : 'Nothing to refund');
    this.build();
  }
  classes(items, W, H) {
    const ids = Object.keys(CLASSES), two = W < 900, cols = two ? 2 : 4, cw = Math.min(268, Math.floor((W - 24 - (cols - 1) * 10) / cols)), chh = 244, rows = Math.ceil(ids.length / cols), st = classState(SAVE);
    const gh = rows * chh + (rows - 1) * 10, ph = 90 + gh + 150, pw = cols * cw + (cols - 1) * 10 + 40, cx = W / 2, top = Math.max(56, (H - ph) / 2 + 24);
    items.push(panel(this, cx, top + ph / 2, pw, ph), ribbon(this, cx, top + 10, Math.min(pw - 40, 400), st === 'chosen' ? 'yellow' : 'blue', 'big', st === 'chosen' ? 'Your class' : 'Choose a class'));
    ids.forEach((id, i) => this.classCard(items, id, cx - (cols * cw + (cols - 1) * 10) / 2 + cw / 2 + (i % cols) * (cw + 10), top + 78 + chh / 2 + Math.floor(i / cols) * (chh + 10), cw, chh, st));
    const C = CLASSES[this.sel], lv = level(SAVE), py = top + 78 + gh + 10;
    items.push(this.add.text(cx, py, C.perks.map(([l, t]) => `Lv ${l}  ${t}`).join('    '), { ...txt(16, UI_BROWN, null), align: 'center', wordWrap: { width: pw - 40 } }).setOrigin(0.5, 0).setScrollFactor(0));
    const label = st === 'chosen' ? (SAVE.cls === this.sel ? 'Chosen' : 'Locked in') : st === 'low' ? `Level ${CLASS_LEVEL}` : 'Choose';
    const go = this.btn(items, cx + 80, top + ph - 62, 170, label, 'blue', () => this.ok && this.choose());
    if (st !== 'pick') { go.setTint(0x8a8a8a); go.label.setAlpha(0.6) }
    this.btn(items, cx - 80, top + ph - 62, 150, 'Back', 'red', () => this.ok && (this.view = 'tree', this.msg = '', this.build()));
    items.push(this.add.text(cx, top + ph - 124, this.msg || (st === 'pick' ? 'A class is for good' : st === 'low' ? `You are level ${lv}: ${CLASS_LEVEL - lv} more points` : ''), txt(16, this.msg ? '#b8432e' : '#8a6a4a', null)).setOrigin(0.5).setScrollFactor(0));
  }
  classCard(items, id, x, y, w, h, st) {
    const C = CLASSES[id], on = id === this.sel, mine = SAVE.cls === id, dim = st === 'low' || (st === 'chosen' && !mine);
    const pan = panel(this, x, y - (on ? 6 : 0), w, h);
    uiHand(this, pan); pan.on('pointerdown', () => this.ok && (this.sel = id, this.build()));
    pan.setTint(on ? 0xffffff : 0xeadfce);
    const tag = ribbon(this, x, y - h / 2 + 8 - (on ? 6 : 0), Math.min(w - 30, 190), mine ? 'yellow' : on ? 'blue' : 'black', 'small', C.name);
    tag.label.setStroke('#161c2e', 2);
    const sp = this.add.sprite(x, y - 6 - (on ? 6 : 0), C.art).setScale(1.15).setScrollFactor(0).play(C.art).setAlpha(dim ? 0.55 : 1);
    const b = artBox(this, C.art);
    sp.setOrigin(0.5, (b.y + b.h) / b.fh).setY(y - h / 2 + 136 - (on ? 6 : 0));
    const tx = this.add.text(x, y + h / 2 - 52 - (on ? 6 : 0), C.text, { ...txt(16, UI_BROWN, null), align: 'center', wordWrap: { width: w - 36 } }).setOrigin(0.5, 0.5).setScrollFactor(0);
    items.push(pan, sp, tx, tag);
  }
  choose() {
    if (!pickClass(SAVE, this.sel)) { this.say(classState(SAVE) === 'low' ? `Reach level ${CLASS_LEVEL} first` : 'Your class is chosen'); return this.build() }
    commit(this); this.say(CLASSES[this.sel].name + '!'); this.build();
    chips(this, this.scale.width / 2, this.scale.height / 2, [0xffe888, 0xffffff, 0x9be37a], 20, 1.8);
  }
  key(e) {
    const k = e.code;
    if (k === 'Escape') return this.leave();
    if (this.view === 'tree') {
      const m = /^Digit([1-9])$/.exec(k), ids = Object.keys(SKILLS);
      if (m && ids[m[1] - 1]) this.train(ids[m[1] - 1]); else if (k === 'KeyC') { this.view = 'class'; this.build() }
    } else {
      const ids = Object.keys(CLASSES), i = ids.indexOf(this.sel);
      if (['ArrowLeft', 'KeyA'].includes(k)) { this.sel = ids[(i + ids.length - 1) % ids.length]; this.build() }
      else if (['ArrowRight', 'KeyD'].includes(k)) { this.sel = ids[(i + 1) % ids.length]; this.build() }
      else if (['Enter', 'NumpadEnter', 'Space'].includes(k)) this.choose();
      else if (k === 'Backspace') { this.view = 'tree'; this.build() }
    }
  }
}
