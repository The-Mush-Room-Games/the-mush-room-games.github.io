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
  gnome: [{ kind: 'gold', min: 2, max: 4 }, { kind: 'meat', p: 0.25 }],
  bush: [{ kind: 'gold', p: 0.2 }],                 // rolled once per bush, on the first hit
  sheep: [{ kind: 'gold' }],                        // the first hit on a sheep
  stone: [{ kind: 'gold', min: 1, max: 2 }],        // every pickaxe hit on a gold stone
};
// Pickups. tex/anim = art, glint = sparkle overlay, dy = how far the art sits above the ground point.
const LOOT = {
  gold: { tex: 'gold', glint: 'gold-highlight', dy: -12 },
  meat: { tex: 'meat', dy: -14 },
  duck: { tex: 'duck', anim: 'duck', tint: 0xffd34d, dy: -14 },
  weapon: { dy: -16 },                              // art = the Tool icon of its weapon (ui.js TOOL_ICON) over a base in the tier colour
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

if (typeof module === 'object') module.exports = { WEAPONS, TIER, HERO, DASH, ENEMIES, DROPS, LOOT, PICKUP, BAG, MEAT_HEAL, PROPS, STUMP, SHEEP };
