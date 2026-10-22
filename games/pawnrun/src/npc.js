// Townsfolk: a sprite that idles where the map put it (a tile object of class `npc` with a `role`, or inside a house: Interior). The hero standing close shows a
// "talk" prompt over him (E, or a tap on touch, the boat's way) and the nearest one can be spoken to: the Talk scene opens over this one (scenes/Talk.js).
// Scene contract (TestMap, Interior): scene.hero, scene.npcs, scene.leaving, scene.near (the NPC in reach, set here), scene.scene.key. Tunables: data.js (NPCS, TALK).

class Npc {
  constructor(scene, sprite, role, x, y) {          // (x, y) = where the feet stand
    this.scene = scene; this.s = sprite; this.role = role; this.x = x; this.y = y; this.d = NPCS[role];
    // a title over a vendor's head, so a stall reads at a glance
    if (this.d.shop || this.d.train) this.tag = scene.add.text(x, y - artBox(scene, sprite.texture.key).h - 4, this.d.title, txt(16)).setOrigin(0.5).setDepth(1e5 - 1);
  }
  get busy() { const sc = this.scene; return sc.leaving || sc.hero.dead || sc.scene.isPaused() }
  talk() {
    if (this.busy) return false;
    const sc = this.scene; SFX.play(sc, 'talk');
    sc.scene.launch('Talk', { from: sc.scene.key, role: this.role });
    sc.scene.pause();
    return true;
  }
}

// Per frame: the nearest NPC within TALK.range of the hero's feet is `scene.near`, and the prompt hangs over the hero while there is one.
function tickNpcs(scene) {
  const h = scene.hero, list = scene.npcs || [];
  let best = null, bd = TALK.range;
  for (const n of list) { const d = Math.hypot(n.x - h.x, n.y - h.y); if (d < bd && !h.dead && !scene.leaving) { best = n; bd = d } }
  scene.near = best;
  let p = scene.talkPrompt?.c.scene ? scene.talkPrompt : null;      // a restarted scene is the same object: its old prompt is destroyed
  if (!p && list.length) {
    const c = scene.add.container(0, 0).setDepth(1e5).setVisible(false), t = scene.add.text(0, 0, '', txt(16)).setOrigin(0.5);
    c.add(t);
    if (uiTouch(scene)) { c.setSize(120, 36); c.setInteractive(); c.on('pointerdown', () => scene.near?.talk()) }   // a tap on the prompt talks
    p = scene.talkPrompt = { c, t };
  }
  if (!p) return;
  p.c.setVisible(!!best);
  if (!best) return;
  p.t.setText(`${best.d.name}  ${uiTouch(scene) ? 'tap: talk' : 'E talk'}`);
  p.c.setPosition(h.x, h.y - 92 + Math.sin(scene.time.now / 200) * 2);
}
