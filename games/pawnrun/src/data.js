// Pawn Run tunables. Plain globals for the browser; also loadable from node.

// hitFrame = the animation frame (0-based) where the tool visibly lands, read off the art:
//   old chop 3, old build 3 (swipe / smash trail starts), new axe 2 (slash arc), new hammer 1 (head on the ground),
//   new knife 1 (blade arc), new pickaxe 3 (pick head swings down in front; frame 2 only shows the trail).
// hit = the slash box at the hit frame, [x0, y0, x1, y1] from the feet point facing right, measured off the art.
// speed = animation timeScale (1 = the pack's 10 fps). recover = pause after the swing ends before the next one.
// anim.old / anim.new = swing animation key; the old Pawn only has axe and hammer.
const WEAPONS = {
  axe:     { damage: 2, speed: 1.25, recover: 0.05, hitFrame: { old: 3, new: 2 }, hit: { old: [12, -40, 62, 2], new: [6, -44, 56, 2] }, anim: { old: 'opawn-chop', new: 'pawn-interact-axe' } },
  hammer:  { damage: 5, speed: 0.85, recover: 0.25, hitFrame: { old: 3, new: 1 }, hit: { old: [8, -60, 56, 2], new: [8, -30, 56, 4] }, anim: { old: 'opawn-build', new: 'pawn-interact-hammer' } },
  pickaxe: { damage: 3, speed: 1.0,  recover: 0.12, hitFrame: { new: 3 }, hit: { new: [6, -50, 54, 2] }, anim: { new: 'pawn-interact-pickaxe' } },
  knife:   { damage: 1, speed: 1.4,  recover: 0,    hitFrame: { new: 1 }, hit: { new: [8, -48, 44, 4] }, anim: { new: 'pawn-interact-knife' } },
};

// Weapon tiers 0-3 in the kit's colour order: blue, red, yellow, purple (ui.js TIER_COLOUR; tint = the hex of each, for the ground base and the HUD badge).
// A tier adds `dmg` of the base damage and `speed` of the base swing speed per step: tier 2 = +50% damage, +16% speed.
const TIER = { names: ['blue', 'red', 'yellow', 'purple'], tint: [0x4a8fe0, 0xe0503a, 0xf2c33a, 0xa060e0], dmg: 0.25, speed: 0.08 };

const HERO = {
  old: { hp: 5, speed: 140, idle: 'opawn-idle', run: 'opawn-run', roll: 'opawn-roll', texture: 'opawn', originY: 128 / 192, bodyY: 30 },
  new: { hp: 7, speed: 155, originY: 135 / 192, bodyY: 36 },                      // new Pawn anims are 'pawn-idle-<tool>' / 'pawn-run-<tool>'
  box: [-12, -40, 12, 2],                          // hurtbox from the feet (what a blast overlaps)
  swingSlow: 0.35,                                 // movement multiplier while swinging
  knockback: 40, knockbackTime: 0.12, hurtInvuln: 0.6, flashTime: 0.1,
};

const DASH = { time: 0.3, mult: 1.85, invuln: 0.3, cooldown: 0.9 };

// Enemies (distances in px, 64 = one tile). hp is in weapon damage (axe 2, hammer 5). hitFrame = attack frame where the club lands,
// hitRange = how close the hero must still be then. hurtbox = [x0, y0, x1, y1] from the feet. drops = key in DROPS.
const ENEMIES = {
  gnome: { hp: 4, speed: 80, sight: 5 * 64, lose: 8 * 64, reach: 44, hitRange: 56, hitFrame: 3, damage: 1, cooldown: 0.8,
    stun: 0.3, knockback: 36, kbTime: 0.15, flash: 0.1, fade: 0.35, originY: 127 / 192, hurtbox: [-18, -40, 18, 2], drops: 'gnome',
    idle: 'gnome-idle', run: 'gnome-run', attack: 'gnome-attack' },
};
// Drop tables: one pickup per row; p = chance (default always), min..max = amount (default 1).
const DROPS = {
  gnome: [{ kind: 'gold', min: 2, max: 4 }, { kind: 'meat', p: 0.25 }, { kind: 'dynamite', p: 0.08 }],
  bush: [{ kind: 'gold', p: 0.2 }],                 // rolled once per bush, on the first hit
  sheep: [{ kind: 'gold' }],                        // the first hit on a sheep
  stone: [{ kind: 'gold', min: 1, max: 2 }],        // every pickaxe hit on a gold stone
};
// Pickups. tex/anim = art, glint = sparkle overlay, dy = how far the art sits above the ground point.
const LOOT = {
  gold: { tex: 'gold', glint: 'gold-highlight', dy: -12 },
  meat: { tex: 'meat', dy: -14 },
  duck: { tex: 'duck', anim: 'duck', tint: 0xffd34d, dy: -14 },
  dynamite: { tex: 'odynamite', anim: 'odynamite', dy: -22 },
  bomb: { tex: 'bomb-idle', dy: -22 },
  weapon: { dy: -16 },                              // art = the Tool icon of its weapon (ui.js TOOL_ICON) over a base in the tier colour
};
// One-use items in the bag (the key is what the bag holds; meat heals MEAT_HEAL). dynamite and bomb are blasts: a circle of `radius` px
// around where they go off, `enemy` / `hero` = damage, `push` = knockback in px, `fuse` = seconds from landing (or being set down) to the
// bang, `art` = the explosion sheet and `artR` = the radius of its drawn burst (the sheet is scaled so the burst fills the circle).
// Dynamite is thrown the way the hero faces: `range` px away at most, in `fly` s on an arc `arc` px high; the bomb is set at his feet.
const ITEMS = {
  meat: {},
  dynamite: { range: 192, fly: 0.45, arc: 40, fuse: 1.0, radius: 72, enemy: 3, hero: 1, push: 70, art: 'explosion1', artR: 38 },
  bomb: { fuse: 2.0, radius: 112, enemy: 6, hero: 2, push: 110, art: 'explosion2', artR: 56 },
};
// Map props that react to weapons: hp, and damage per weapon (a weapon that is not listed clanks off). chips = debris colours.
// tree = a `secret` tree (felled into a stump), rock = a `secret` rock (rock pile: broken for good; blast = dynamite breaks it),
// stone = a Gold Stone 1-6 (each pickaxe hit pops gold and steps it down a size, gone after size 1).
const PROPS = {
  tree:  { hp: 3, dmg: { axe: 1 }, chips: [0x8a5a2b, 0x4f9a3a] },
  rock:  { hp: 2, dmg: { hammer: 2, pickaxe: 1 }, chips: [0x8fb0b0, 0x5a7a80], blast: true },
  stone: { hp: 1, dmg: { pickaxe: 1 }, chips: [0xf2c33a, 0xffe888] },
};
const STUMP = { w: 10, h: 8 };                       // a stump's collision (px); a tree trunk is 0.3 of its art's width, so the way past opens
const SHEEP = {                                     // acts: weight and seconds range; walk goes to a spot within `wander` px of home
  speed: 22, wander: 56, flee: 1.2, fleeSpeed: 120, flash: 0.1, hurtbox: [-16, -28, 16, 2],
  acts: { idle: [2, 1.5, 4], graze: [3, 2, 5], walk: [2, 1, 2.5] },
};
const PICKUP = { r: 14, arc: 22, pop: 380, scatter: [18, 34] };   // r = reach around the ground point, arc/pop = drop arc height (px) and time (ms)
const BAG = 3, MEAT_HEAL = 2;                        // item slots, hp one meat heals

// Camps (src/camp.js). A Tiled `camp` rect is the inside; a Wooden Fence ring (the 4x3 sheet `fence`, 64 px tiles) stands on the cells around it,
// with gaps where `gate` rects lie on the ring. The gate pieces only exist while the camp is closed. delay = s from the last gnome to the cards,
// rise / drop = ms for a gate piece to pop up / sink (it moves `sink` px), push = px steps a unit stuck in a closing gate is moved inwards, inset = px from the rect's edge where a gnome that strayed out is put back.
// The cards (scenes/Cards.js) ignore input for `lock` ms after they open (a swing or Space from the last fight must not pick), and show the pick for `confirm` ms.
const CAMP = { delay: 0.5, rise: 240, drop: 200, sink: 18, push: 4, inset: 24, lock: 450, confirm: 560 };
// Fence tiles: the frame [row, col] in the sheet and the collision bands [x0, y0, x1, y1] from the tile's top-left (rails, posts). c = corners,
// hz0/hz1 = a top or bottom run, vl/vr = the left / right side, endL/endR = the post that ends a run next to a gate (rail on its left / right).
const FENCE = {
  tl: [[0, 0], [[20, 30, 64, 48], [24, 30, 42, 64]]], tr: [[0, 3], [[0, 30, 44, 48], [22, 30, 42, 64]]],
  bl: [[2, 0], [[24, 0, 42, 50], [20, 30, 64, 48]]], br: [[2, 3], [[22, 0, 42, 50], [0, 30, 44, 48]]],
  hz0: [[0, 1], [[0, 30, 64, 48]]], hz1: [[0, 2], [[0, 30, 64, 48]]], vl: [[1, 0], [[24, 0, 42, 64]]], vr: [[1, 3], [[22, 0, 43, 64]]],
  endL: [[2, 1], [[0, 30, 46, 48]]], endR: [[2, 2], [[18, 30, 64, 48]]],
};

// Power-ups: 3 cards are drawn when a camp is cleared, by rarity weight (per card), none twice. They stack and last for the run.
// stat = the key of STAT0 it changes by `add` per stack (a % card shows add x 100; `scale` ones grow with the island: add x powerK(island) when taken),
// max = most stacks, heal = hp it gives at once, full = heals to full (an instant card is not kept), off = left out of the draw for now.
// icon = [texture, frame, scale] of the kit art (ui.js icon(); the Tool icons hold 27 px of art, so they are drawn at 2x).
const RARITY = {
  common:   { weight: 6,   ribbon: 'blue',   label: 'Common',   tint: 0x4a8fe0 },
  uncommon: { weight: 3,   ribbon: 'yellow', label: 'Uncommon', tint: 0xf2c33a },
  rare:     { weight: 1.5, ribbon: 'purple', label: 'Rare',     tint: 0xa060e0, special: true },   // special = paper_special
};
const POWER_SCALE = { perIsland: 0.1, cap: 2 };      // powerK(island) = min(cap, 1 + perIsland x (island - 1)): island 1 = 1, island 6 = 1.5
const STAT0 = { dmg: 1, hp: 0, speed: 1, swing: 1, gold: 1, dashRate: 1, reach: 1, kb: 1, meat: 1, charges: 1, twice: 0, thorns: 0, slots: 0 };   // stats with no power-up
const POWERUPS = {
  damage:   { rarity: 'common', name: 'Sharp Edge', text: '+{v}% damage', stat: 'dmg', add: 0.15, pct: true, scale: true, icon: ['tool2', 0, 2] },
  vigor:    { rarity: 'common', name: 'Tough Hide', text: '+1 max HP, heal 1', stat: 'hp', add: 1, heal: 1, icon: ['icon06'] },
  swift:    { rarity: 'common', name: 'Light Boots', text: '+{v}% move speed', stat: 'speed', add: 0.1, pct: true, scale: true, icon: ['icon07'] },
  quick:    { rarity: 'common', name: 'Quick Hands', text: '+{v}% swing speed', stat: 'swing', add: 0.15, pct: true, scale: true, icon: ['tool3', 0, 2] },
  greed:    { rarity: 'common', name: 'Gold Fever', text: '+{v}% gold', stat: 'gold', add: 0.25, pct: true, scale: true, icon: ['icon03'] },
  heal:     { rarity: 'common', name: 'Second Wind', text: 'Heal to full', full: true, icon: ['icon04'] },
  recharge: { rarity: 'uncommon', name: 'Fresh Legs', text: 'Dash recharges {v}% faster', stat: 'dashRate', add: 0.3, pct: true, scale: true, icon: ['icon10'] },
  reach:    { rarity: 'uncommon', name: 'Long Arm', text: 'Longer reach, +{v}%', stat: 'reach', add: 0.25, pct: true, scale: true, icon: ['icon02'] },
  shove:    { rarity: 'uncommon', name: 'Heavy Blows', text: 'Knockback +{v}%', stat: 'kb', add: 0.5, pct: true, scale: true, icon: ['icon01'] },
  feast:    { rarity: 'uncommon', name: 'Big Appetite', text: 'Meat heals double', stat: 'meat', add: 1, icon: ['meat'] },
  twin:     { rarity: 'rare', name: 'Double Dash', text: '+1 dash charge', stat: 'charges', add: 1, max: 2, icon: ['icon08'] },
  echo:     { rarity: 'rare', name: 'Twin Strike', text: 'Every swing hits twice', stat: 'twice', add: 1, max: 1, icon: ['icon05'] },
  thorns:   { rarity: 'rare', name: 'Thorns', text: 'Enemies that hurt you take 1', stat: 'thorns', add: 1, icon: ['icon09'] },
  pockets:  { rarity: 'rare', name: 'Deep Pockets', text: '+1 item slot', stat: 'slots', add: 1, max: 1, icon: ['btn-tiny-square'] },
  ducks:    { rarity: 'rare', name: 'Duck Sense', text: 'Golden ducks show on the map', off: true, icon: ['duck', 0] },   // off: needs the explored map (group 4)
};
const HIT2 = { delay: 0.1, mult: 1 };                // Twin Strike: the second hit lands `delay` s after the first, for `mult` of its damage

if (typeof module === 'object') module.exports = { CAMP, FENCE, RARITY, POWER_SCALE, STAT0, POWERUPS, HIT2, WEAPONS, TIER, ITEMS, HERO, DASH, ENEMIES, DROPS, LOOT, PICKUP, BAG, MEAT_HEAL, PROPS, STUMP, SHEEP };
