// A vendor's shop, over the paused town: a woodtable_wide counter with one paper card per item: a kit icon, the name, what the next rank does, the rank, the price (coin or
// duck icon) and a blue Buy button, greyed out when you cannot pay (or when it is at its cap). What is on sale is SHOPS[NPCS[role].shop] (data.js); the rules are buy() (save.js).
// d = { from, role }.
class Shop extends Sheet {
  constructor() { super('Shop') }
  init(d) { this.d = d; this.n = NPCS[d.role]; this.ids = SHOPS[this.n.shop]; this.msg = '' }
  draw(items, W, H) {
    const cw = Math.min(W - 16, 580), chh = 156, gap = 0, n = this.ids.length, bh = 190 + n * (chh + gap) + 30, cx = W / 2, top = Math.max(8, (H - bh) / 2) + 28;
    items.push(board(this, cx, top + bh / 2, cw, bh));
    items.push(ribbon(this, cx, top + 6, Math.min(cw - 40, 420), 'blue', 'big', this.n.title + "'s wares"));
    this.purse(items, cx, top + 96);
    const close = iconButton(this, cx + cw / 2 - 52, top + 92, 'round', 'tiny', 'icon09', () => this.ok && this.leave());
    items.push(close, close.icon);
    this.ids.forEach((id, i) => this.card(items, id, cx, top + 150 + chh / 2 + i * (chh + gap), cw - 96, chh));
    items.push(this.add.text(cx, top + bh - 48, this.msg, txt(24)).setOrigin(0.5).setScrollFactor(0));
  }
  // one item: slot frame with the icon, name and effect, price and rank along the bottom, Buy on the right (the paper has a 22 px margin all round)
  card(items, id, x, y, w, h) {
    const u = UPGRADES[id], info = shopInfo(SAVE, id), L = -w / 2, poor = info.state !== 'buy', max = info.state === 'max';
    const pan = panel(this, x, y, w, h), at = (dx, dy) => [x + dx, y + dy], tx = L + 128;
    const fr = this.add.image(...at(L + 76, 0), 'btn-small-square').setScrollFactor(0);
    const ic = u.icon[0].startsWith('avatar') ? portrait(this, ...at(L + 76, 0), u.icon[0], 76, 76, false) : icon(this, ...at(L + 76, 0), u.icon[0], u.icon[1]).setScale(u.icon[2] || 1);
    const name = this.add.text(...at(tx, -h / 2 + 30), u.name, txt(24, UI_BROWN, null)).setScrollFactor(0);
    const fx = this.add.text(...at(tx, -h / 2 + 62), upgradeText(id, Math.min(info.rank + 1, info.max)) + (u.stub ? ' (soon)' : ''), { ...txt(16, UI_BROWN, null), wordWrap: { width: w - 128 - 134 } }).setScrollFactor(0);
    items.push(pan, fr, ic, name, fx);
    const by = y + h / 2 - 38;                                                // the bottom line: price, then rank
    if (!max) {
      const ico = u.cur === 'ducks' ? this.add.sprite(x + tx + 8, by, 'duck', 0).setScale(1.25).setTint(0xffd34d).setScrollFactor(0).play('duck') : icon(this, x + tx + 8, by, 'icon03').setScale(0.6);
      items.push(ico, this.add.text(x + tx + 26, by + 1, info.cost, txt(24, poor ? '#b8432e' : UI_BROWN, null)).setOrigin(0, 0.5).setScrollFactor(0));
    }
    if (info.max > 1 || max) items.push(this.add.text(x + tx + 100, by + 1, max ? 'Owned' : `Rank ${info.rank}/${info.max}`, txt(16, '#8a6a4a', null)).setOrigin(0, 0.5).setScrollFactor(0));
    const b = this.btn(items, x + w / 2 - 78, y, 124, max ? 'Owned' : 'Buy', 'blue', () => this.ok && this.purchase(id));
    if (poor) { b.setTint(0x8a8a8a); b.label.setAlpha(0.6) }
  }
  purchase(id) {
    const info = shopInfo(SAVE, id);
    if (info.state !== 'buy') { this.msg = info.state === 'max' ? 'You have it already' : `Not enough ${info.cur}`; this.build(); this.time.delayedCall(1400, () => { this.msg = ''; this.scene.isActive() && this.build() }); return }
    buy(SAVE, id); commit(this);
    this.msg = UPGRADES[id].name + ' bought!'; this.build();
    chips(this, this.scale.width / 2, this.scale.height / 2, [0xffe888, 0xffffff, 0x9be37a], 14, 1.4);
    this.time.delayedCall(1400, () => { this.msg = ''; this.scene.isActive() && this.build() });
  }
  key(e) {
    if (['Escape', 'KeyE', 'Enter', 'NumpadEnter'].includes(e.code)) this.leave();
    else if (/^Digit[1-9]$/.test(e.code) && this.ids[+e.code[5] - 1]) this.purchase(this.ids[+e.code[5] - 1]);
  }
}
