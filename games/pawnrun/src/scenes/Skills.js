// The trainer's screen over the paused town: one training scroll (a paper panel under a ribbon and a sword). d = { from, role }.
// A row per skill (SKILLS, data.js): the kit icon in a slot, the name and effect, a small bar of its ranks, + buys a point (gold; a point costs more the higher your level, the
// points bought in all) and - gives the last one back for what it cost. The three class stats carry their class down the right side, the kit's idle art in a square frame:
// a grey silhouette until the stat reaches CLASS_RANK, then tap it to make it your class (and tap another unlocked one to switch, free, any time); its perks at the ranks
// above are listed under the bar and light up as the stat climbs. A refund that drops the stat under CLASS_RANK drops the class (save.js).
// ponytail: a class is only saved (SAVE.cls), the hero stays the Pawn; the class's own sprites, weapon and perks are a follow-up.
const SK_ROW = { cls: 126, plain: 56 }, SK_HEAD = 150, SK_FOOT = 42;
class Skills extends Sheet {
  constructor() { super('Skills') }
  init(d) { this.d = d; this.msg = ''; this.bad = false }
  say(msg, bad = true) { this.msg = msg; this.bad = bad; this.time.delayedCall(1800, () => { if (this.msg === msg) { this.msg = ''; this.scene.isActive() && this.build() } }) }
  draw(items, W, H) {
    const ids = Object.keys(SKILLS), rows = ids.map(id => SKILLS[id].cls ? SK_ROW.cls : SK_ROW.plain), pw = Math.min(W - 16, 620);
    const ph = SK_HEAD + rows.reduce((a, b) => a + b, 0) + SK_FOOT, cx = W / 2, top = Math.max(60, (H - ph) / 2 + 20), lv = level(SAVE), cost = skillCost(lv);
    items.push(panel(this, cx, top + ph / 2, pw, ph), sword(this, cx, top + 100, 256), ribbon(this, cx, top + 6, Math.min(pw - 40, 360), 'blue', 'big', 'Training'));
    const close = iconButton(this, cx + pw / 2 - 36, top + 52, 'round', 'tiny', 'icon09', () => this.ok && this.leave());
    items.push(close, close.icon);
    this.purse(items, cx - pw / 2 + 92, top + 100);                                     // beside the sword: left what you have, right your level and the next point's price
    const rx = cx + pw / 2 - 92;
    items.push(this.add.text(rx, top + 86, `Level ${lv}`, txt(20, UI_BROWN, null)).setOrigin(0.5).setScrollFactor(0));
    items.push(icon(this, rx - 30, top + 114, 'icon03').setScale(0.6), this.add.text(rx - 12, top + 116, cost, txt(20, SAVE.gold >= cost ? UI_BROWN : '#b8432e', null)).setOrigin(0, 0.5).setScrollFactor(0));
    let y = top + SK_HEAD;
    ids.forEach((id, i) => { this.row(items, id, cx - pw / 2 + 28, cx + pw / 2 - 28, y + rows[i] / 2, rows[i]); y += rows[i] });
    const hint = this.msg || (SAVE.cls ? `${CLASSES[SAVE.cls].name}. Tap another unlocked class to switch.` : `Rank ${CLASS_RANK} of a stat unlocks its class.`);
    items.push(this.add.text(cx, top + ph - 30, hint, txt(14, this.msg && this.bad ? '#b8432e' : '#8a6a4a', null)).setOrigin(0.5).setScrollFactor(0));
  }
  // one skill: slot + icon, name, effect; the rank bar; - and +; a class stat also has its class frame on the right and its perk list under the bar
  row(items, id, L, R, y, h) {
    const k = SKILLS[id], info = skillInfo(SAVE, id), cls = k.cls, XB = cls ? R - 128 - 12 : R, up = cls ? -28 : 0;
    items.push(this.add.image(L + 32, y + up, 'btn-tiny-square').setScrollFactor(0), icon(this, L + 32, y + up, k.icon[0], k.icon[1]).setScale(k.icon[2] || 1));
    items.push(this.add.text(L + 72, y + up - 13, k.name, txt(22, UI_BROWN, null)).setOrigin(0, 0.5).setScrollFactor(0),
      this.add.text(L + 72, y + up + 11, k.text, txt(14, '#8a6a4a', null)).setOrigin(0, 0.5).setScrollFactor(0));
    const bx = cls ? L + 168 : L + 290, by = cls ? y + 8 : y;                        // the rank bar (192: a 74 px slot) under the name on a class row, after the text on a plain one
    items.push(bar(this, bx, by, 192, 'small').set(info.rank / k.cap), this.add.text(bx, by + 1, `${info.rank}/${k.cap}`, numTxt(13)).setOrigin(0.5).setScrollFactor(0));   // the count on the bar
    const [mx, my, qx, qy] = cls ? [XB - 36, y + 33, XB - 36, y - 29] : [XB - 100, y, XB - 36, y];   // a class row stacks + over -, a plain row has them side by side
    const minus = this.add.image(mx, my, 'btn-tiny-round').setScrollFactor(0), mt = this.add.text(mx, my - 3, '-', txt(28)).setOrigin(0.5).setScrollFactor(0);
    const plus = this.add.image(qx, qy, 'btn-tiny-square').setScrollFactor(0), pt = this.add.text(qx, qy - 2, '+', txt(30)).setOrigin(0.5).setScrollFactor(0);
    uiHand(this, minus); minus.on('pointerup', () => this.ok && this.untrain(id));
    uiHand(this, plus); plus.on('pointerup', () => this.ok && this.train(id));
    if (!info.rank) { minus.setAlpha(0.35); mt.setAlpha(0.35) }
    if (info.state !== 'buy') { plus.setTint(0x8a8a8a); pt.setAlpha(0.6) }
    items.push(minus, mt, plus, pt);
    if (!cls) return;
    const C = CLASSES[cls], st = classState(SAVE, cls);
    let px = L + 72;                                                             // the perk list: lit once the rank is reached
    for (const [r, name] of C.perks) {
      const t = this.add.text(px, y + 38, `${r}: ${name}`, txt(14, info.rank >= r ? UI_BROWN : '#b0a48e', null)).setOrigin(0, 0.5).setScrollFactor(0);
      items.push(t); px += t.width + 14;
    }
    // the class frame: the idle art in a square frame, cropped to its opening; a silhouette until unlocked, pressed in once chosen
    const fx = R - 64, fr = this.add.image(fx, y, st === 'chosen' ? 'btn-small-square-pressed' : 'btn-small-square').setScrollFactor(0);
    const b = artBox(this, C.art), sc = Math.min(1, 84 / b.h), sp = this.add.sprite(fx, y + 38 + (st === 'chosen' ? 4 : 0), C.art).setOrigin(0.5, (b.y + b.h) / b.fh).setScale(sc).setScrollFactor(0).play(C.art);
    sp.setCrop(b.fw / 2 - 44 / sc, (y - 44 - sp.y) / sc + sp.originY * b.fh, 88 / sc, 88 / sc);     // only the frame's opening
    if (st === 'locked') sp.setTint(0x2a2230).setAlpha(0.55);
    const name = this.add.text(fx, y + 46, st === 'locked' ? `Rank ${CLASS_RANK}` : C.name, txt(14, st === 'chosen' ? '#ffd34d' : '#fff4c9')).setOrigin(0.5).setScrollFactor(0);
    uiHand(this, fr); fr.on('pointerup', () => this.ok && this.pick(cls));
    items.push(fr, sp, name);
  }
  train(id) {
    const i = skillInfo(SAVE, id);
    if (i.state === 'max') this.say('Maxed out'); else if (i.state === 'poor') this.say('Not enough gold');
    if (i.state !== 'buy') { SFX.play(this, 'error'); return this.build() }
    buySkill(SAVE, id); commit(this); SFX.play(this, 'train'); this.say(SKILLS[id].name + ' ' + SAVE.skills[id] + ': ' + SKILLS[id].text, false); this.build();
    chips(this, this.scale.width / 2, this.scale.height / 2, [0xffe888, 0xffffff, 0x9be37a], 10, 1.2);
  }
  untrain(id) {
    const had = SAVE.cls, back = refundSkill(SAVE, id);
    if (!back) { SFX.play(this, 'error'); this.say('Nothing to refund'); return this.build() }
    commit(this); SFX.play(this, 'click');
    if (had && !SAVE.cls) this.say(`No longer a ${CLASSES[had].name}`);
    this.build();
  }
  pick(id) {
    const st = classState(SAVE, id), C = CLASSES[id];
    if (st !== 'open') { SFX.play(this, 'error'); this.say(st === 'chosen' ? `You are a ${C.name}` : `${SKILLS[C.stat].name} rank ${CLASS_RANK} unlocks the ${C.name}`); return this.build() }
    pickClass(SAVE, id); commit(this); SFX.play(this, 'class'); this.say(`You are a ${C.name}!`, false); this.build();
    chips(this, this.scale.width / 2, this.scale.height / 2, [0xffe888, 0xffffff, 0x9be37a], 20, 1.8);
  }
  key(e) {
    const k = e.code, m = /^Digit([1-9])$/.exec(k), ids = Object.keys(SKILLS);
    if (k === 'Escape' || k === 'KeyE') return this.leave();
    if (m && ids[m[1] - 1]) this.train(ids[m[1] - 1]);
  }
}
