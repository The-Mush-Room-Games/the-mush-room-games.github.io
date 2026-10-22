// A vendor's shop, over the paused town: a woodtable_wide counter. A big ribbon across its top edge, the purse and a close button, a sword divider, then one row per item
// straight on the wood: a slot frame with the kit icon, the name and what the next rank does, and on the right a paper price tag (price, rank) that IS the buy control, dimmed
// when you cannot pay (or when it is at its cap). What is on sale is SHOPS[NPCS[role].shop] (data.js); the rules are buy() (save.js).
// d = { from, role }.
class Shop extends Sheet {
  constructor() { super('Shop') }
  init(d) { this.d = d; this.n = NPCS[d.role]; this.ids = SHOPS[this.n.shop]; this.msg = '' }
  draw(items, W, H) {
    const vw = Math.min(W - 16, 640), RH = 140, n = this.ids.length, head = 205, vh = head + n * RH + 45, cx = W / 2, vt = Math.round((H - vh - 38) / 2) + 38;
    items.push(woodBoard(this, cx, vt + vh / 2, vw, vh));
    const close = iconButton(this, cx + vw / 2 - 52, vt + 98, 'round', 'tiny', 'icon09', () => this.ok && this.leave());
    items.push(sword(this, cx, vt + 178, Math.min(vw - 60, 360)), close, close.icon);
    items.push(ribbon(this, cx, vt + 6, Math.min(vw - 40, 420), 'blue', 'big', this.n.title + "'s wares"));
    this.purse(items, cx - 20, vt + 98);
    this.ids.forEach((id, i) => this.row(items, id, cx, vt + head + RH / 2 + i * RH, vw - 60));
    items.push(this.add.text(cx, vt + vh - 40, this.msg, txt(24)).setOrigin(0.5).setScrollFactor(0));
  }
  // one item on the wood: slot frame with the icon, name and effect, the price tag on the right
  row(items, id, x, y, w) {
    const u = UPGRADES[id], info = shopInfo(SAVE, id), L = x - w / 2, poor = info.state !== 'buy', max = info.state === 'max', sx = L + 52, tx = sx + 62, rx = x + w / 2 - 52;
    const fr = this.add.image(sx, y, 'btn-small-square').setScrollFactor(0);
    const ic = u.icon[0].startsWith('avatar') ? portrait(this, sx, y, u.icon[0], 76, 76, false) : icon(this, sx, y, u.icon[0], u.icon[1]).setScale(u.icon[2] || 1);
    const name = this.add.text(tx, y - 26, u.name, txt(24)).setOrigin(0, 0.5).setScrollFactor(0);
    const fx = this.add.text(tx, y - 8, upgradeText(id, Math.min(info.rank + 1, info.max)) + (u.stub ? ' (soon)' : ''), { ...txt(16), wordWrap: { width: rx - 52 - tx - 14 } }).setScrollFactor(0);
    items.push(fr, ic, name, fx);
    // the price tag: coin or duck and the price (red when too poor), the rank under it. Press = darker and 4 px down, release buys.
    const tag = uiBox(this, rx, y, []), pan = panel(this, 0, 0, 128, 128), kids = [];
    const rank = info.max > 1 || max ? `${max ? 'Owned' : `Rank ${info.rank}/${info.max}`}` : '', py = rank ? -12 : 0;
    if (!max) {
      const cost = this.add.text(12, py + 1, info.cost, txt(20, poor ? '#b8432e' : UI_BROWN, null, NUMFONT)).setOrigin(0, 0.5).setScrollFactor(0);
      kids.push(u.cur === 'ducks' ? this.add.sprite(-22, py, 'duck', 0).setScale(1.5).setTint(0xffd34d).setScrollFactor(0).play('duck') : icon(this, -22, py, 'icon03'), cost);
    }
    if (rank) kids.push(this.add.text(0, max ? 0 : 24, rank, txt(max ? 20 : 16, max ? UI_BROWN : '#8a6a4a', null, NUMFONT)).setOrigin(0.5).setScrollFactor(0));
    tag.add([pan, ...kids]);
    const base = poor ? 0xa89f92 : 0xffffff;
    pan.setTint(base); if (poor) kids.forEach(o => o.setAlpha(0.6));
    uiHand(this, pan);
    let down = false;
    const press = d => { down = d; pan.setTint(d ? 0xd9cfbf : base); tag.y = y + (d ? 4 : 0) };
    pan.on('pointerdown', () => { press(true); SFX.play(this, 'click') }).on('pointerout', () => down && press(false))
       .on('pointerup', () => { if (down) { press(false); this.ok && this.purchase(id) } });
    items.push(tag);
  }
  purchase(id) {
    const info = shopInfo(SAVE, id);
    if (info.state !== 'buy') { this.msg = info.state === 'max' ? 'You have it already' : `Not enough ${info.cur}`; SFX.play(this, 'error'); this.build(); this.time.delayedCall(1400, () => { this.msg = ''; this.scene.isActive() && this.build() }); return }
    buy(SAVE, id); commit(this); SFX.play(this, 'buy');
    this.msg = UPGRADES[id].name + ' bought!'; this.build();
    chips(this, this.scale.width / 2, this.scale.height / 2, [0xffe888, 0xffffff, 0x9be37a], 14, 1.4);
    this.time.delayedCall(1400, () => { this.msg = ''; this.scene.isActive() && this.build() });
  }
  key(e) {
    if (['Escape', 'KeyE', 'Enter', 'NumpadEnter'].includes(e.code)) this.leave();
    else if (/^Digit[1-9]$/.test(e.code) && this.ids[+e.code[5] - 1]) this.purchase(this.ids[+e.code[5] - 1]);
  }
}
