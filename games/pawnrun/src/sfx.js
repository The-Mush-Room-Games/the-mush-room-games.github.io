// Sound: every effect and music loop of the game, by name, played through Phaser's sound manager (Web Audio; one manager for all scenes).
// Files live in assets/audio (all CC0: Kenney's RPG / Impact / Interface packs, Juhani Junkala's retro set and chiptunes; CREDITS.txt there).
//   SFX.play(scene, 'hit')          one of the name's files, at its volume, with a little random pitch; the same name never twice within 40 ms
//   SFX.loop(scene, 'fuse')         a looping effect; returns the sound (stop() it)
//   SFX.music(scene, 'town')        the place's loop, crossfaded from whatever plays; 'island' alternates its two tracks by island number
//   SFX.toggleMute(scene)           N key and the HUD button; kept in localStorage MUTE_KEY
// Tunables: v = volume 0-1, r = pitch jitter (+- rate), files without an extension are .ogg (Kenney), sfx_* / roar are Junkala's .wav.
const MUTE_KEY = 'pawnrun-mute', MUSIC_VOL = 0.35, FADE = 700;
const SOUNDS = {
  // the hero
  swing: { f: ['cloth1', 'cloth2', 'cloth3'], v: 0.6, r: 0.12 },                             // axe, pickaxe, knife
  'swing-heavy': { f: ['cloth4', 'drawKnife1'], v: 0.7, r: 0.08 },                         // the hammer
  step: { f: ['footstep_grass_000', 'footstep_grass_001', 'footstep_grass_002', 'footstep_grass_003', 'footstep_grass_004'], v: 0.35, r: 0.15 },
  'step-wood': { f: ['footstep_wood_000', 'footstep_wood_001', 'footstep_wood_002'], v: 0.4, r: 0.1 },   // the pier, a bridge
  dash: { f: ['cloth2'], v: 0.55, r: 0.2 },
  hurt: { f: ['sfx_damage_hit1', 'sfx_damage_hit2', 'sfx_damage_hit3'], v: 0.7 },
  die: { f: ['sfx_deathscream_human2'], v: 0.8 },
  rise: { f: ['sfx_sounds_powerup17'], v: 0.8 },                                             // Second Wind
  splash: { f: ['drop_002', 'impactSoft_heavy_000'], v: 0.8 },                               // washing up on the beach
  // blows landing
  hit: { f: ['impactSoft_medium_000', 'impactSoft_medium_001', 'impactSoft_medium_002'], v: 0.8, r: 0.1 },          // on a foe
  'hit-wood': { f: ['impactWood_medium_000', 'impactWood_medium_001', 'impactWood_medium_002'], v: 0.8, r: 0.1 },   // a tree, a hut, a fence
  'hit-rock': { f: ['impactMining_000', 'impactMining_001', 'impactMining_002'], v: 0.8, r: 0.1 },                  // a rock, a gold stone
  'hit-bush': { f: ['cloth1', 'cloth2'], v: 0.5, r: 0.2 },
  'hit-metal': { f: ['impactMetal_medium_000', 'impactMetal_medium_001'], v: 0.7, r: 0.1 },                         // a weapon that cannot break this
  chop: { f: ['chop'], v: 0.8, r: 0.1 },
  'tree-fall': { f: ['impactWood_heavy_000', 'impactWood_heavy_001', 'impactWood_heavy_002'], v: 0.9 },
  'rock-break': { f: ['impactPlate_heavy_000', 'impactPlate_heavy_001'], v: 0.9 },
  // foes
  'enemy-hurt': { f: ['impactSoft_medium_001', 'impactSoft_medium_002'], v: 0.6, r: 0.2 },
  'enemy-die': { f: ['sfx_deathscream_alien1', 'sfx_deathscream_alien2', 'sfx_deathscream_alien3'], v: 0.6, r: 0.1 },
  bite: { f: ['impactPunch_medium_000', 'impactPunch_medium_001'], v: 0.7, r: 0.1 },
  shoot: { f: ['beltHandle1'], v: 0.7, r: 0.1 },                                             // the slingshot
  roar: { f: ['roar'], v: 0.9 },                                                             // the boss wakes
  'boss-swipe': { f: ['sfx_wpn_sword1', 'sfx_wpn_sword2'], v: 0.7 },
  crash: { f: ['impactPlate_heavy_000', 'impactPlate_heavy_001'], v: 1 },                    // a charge hits a rock
  slam: { f: ['impactSoft_heavy_000', 'impactSoft_heavy_002'], v: 1 },
  'boss-die': { f: ['sfx_sounds_fanfare3'], v: 0.8 },
  // loot and items
  coin: { f: ['sfx_coin_double1', 'sfx_coin_double2'], v: 0.5, r: 0.1 },
  coins: { f: ['sfx_coin_cluster3'], v: 0.6 },                                               // several at once, a purchase
  duck: { f: ['sfx_sounds_powerup6'], v: 0.7 },
  meat: { f: ['handleSmallLeather'], v: 0.7 },
  eat: { f: ['sfx_sounds_powerup4'], v: 0.7 },
  weapon: { f: ['metalClick'], v: 0.8 },
  item: { f: ['drop_002'], v: 0.7 },
  throw: { f: ['cloth4'], v: 0.6, r: 0.1 },
  fuse: { f: ['tick_001'], v: 0.5, loop: true },
  blast: { f: ['sfx_exp_short_hard2'], v: 0.9 },                                             // dynamite
  'blast-big': { f: ['sfx_exp_medium1'], v: 1 },                                             // the bomb
  // camps and progress
  'camp-close': { f: ['impactWood_heavy_000', 'impactWood_heavy_001', 'impactWood_heavy_002'], v: 0.9, r: 0.1 },   // the fence drops
  'rock-drop': { f: ['impactPlate_heavy_000', 'impactPlate_heavy_001'], v: 0.9, r: 0.1 },                           // the boss den's boulders
  'camp-clear': { f: ['sfx_sounds_fanfare1'], v: 0.8 },
  power: { f: ['sfx_sounds_powerup2'], v: 0.8 },                                             // a power-up card taken
  train: { f: ['sfx_sounds_powerup12'], v: 0.8 },                                            // a skill point
  class: { f: ['sfx_sounds_fanfare2'], v: 0.8 },
  // town and UI
  talk: { f: ['question_001'], v: 0.6 },
  next: { f: ['scroll_001'], v: 0.5 },                                                       // the next line of a dialogue
  open: { f: ['open_001'], v: 0.6 },                                                         // a panel
  close: { f: ['close_001'], v: 0.6 },
  click: { f: ['click_001'], v: 0.6 },
  select: { f: ['select_001'], v: 0.5 },
  confirm: { f: ['confirmation_001'], v: 0.7 },
  error: { f: ['error_004'], v: 0.6 },
  buy: { f: ['handleCoins', 'handleCoins2'], v: 0.8 },
  'map-open': { f: ['bookOpen'], v: 0.7 },
  'map-close': { f: ['bookClose'], v: 0.7 },
  card: { f: ['bookFlip1', 'bookFlip2', 'bookFlip3'], v: 0.7, r: 0.1 },
  door: { f: ['doorOpen_1', 'doorOpen_2'], v: 0.8 },
  'door-close': { f: ['doorClose_1'], v: 0.8 },
  sail: { f: ['creak1', 'creak2'], v: 0.8 },
};
const MUSIC = { town: ['town'], island: ['island1', 'island2'], boss: ['boss'] };
const extOf = f => (/^(sfx_|roar)/.test(f) ? '.wav' : '.ogg');

const SFX = {
  muted: false, last: {}, current: null,                 // current: { key, sound } of the music loop
  files() {                                              // every file to load: [{ key, url }]
    const out = new Map();
    for (const s of Object.values(SOUNDS)) for (const f of s.f) out.set(f, 'assets/audio/sfx/' + f + extOf(f));
    for (const t of Object.values(MUSIC)) for (const f of t) out.set(f, 'assets/audio/music/' + f + '.ogg');
    return [...out].map(([key, url]) => ({ key, url }));
  },
  init(game) {                                           // at boot: the saved mute
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1' } catch {}
    game.sound.mute = this.muted;
  },
  play(scene, name, { v = 1, r = 0 } = {}) {
    const s = SOUNDS[name];
    if (!s) { console.warn('no sound', name); return null }
    const now = scene.time.now;
    if (now - (this.last[name] || -1e9) < 40) return null;
    this.last[name] = now;
    const f = s.f[Math.floor(Math.random() * s.f.length)];
    return scene.sound.play(f, { volume: (s.v ?? 0.7) * v, rate: 1 + r + (s.r ? (Math.random() * 2 - 1) * s.r : 0), loop: !!s.loop });
  },
  loop(scene, name) {
    const s = SOUNDS[name], snd = scene.sound.add(s.f[0], { volume: s.v ?? 0.7, loop: true });
    snd.play();
    return snd;
  },
  music(scene, place, island = 1) {                      // one loop at a time; the same track keeps playing
    const key = place && MUSIC[place] ? MUSIC[place][(island - 1) % MUSIC[place].length] : null;
    if (this.current && this.current.key === key) return;
    this.stopMusic(scene);
    if (!key) return;
    const sound = scene.sound.add(key, { loop: true, volume: 0 });
    sound.play();
    scene.tweens.add({ targets: sound, volume: MUSIC_VOL, duration: FADE });
    this.current = { key, sound };
  },
  stopMusic(scene, ms = FADE) {
    const c = this.current;
    if (!c) return;
    this.current = null;
    if (!scene) return c.sound.stop();
    scene.tweens.add({ targets: c.sound, volume: 0, duration: ms, onComplete: () => c.sound.destroy() });
  },
  toggleMute(scene) {
    this.muted = !this.muted;
    scene.sound.mute = this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0') } catch {}
    return this.muted;
  },
};
if (typeof module === 'object') module.exports = { SOUNDS, MUSIC, SFX, extOf };
