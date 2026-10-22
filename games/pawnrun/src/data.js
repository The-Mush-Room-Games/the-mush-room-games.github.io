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
// Extras by kind: snake `lunge` { frame, coil, speed, time } (the attack anim holds on `frame` for `coil` s, then it lunges `speed` px/s for `time` s),
// spider `gait` { burst, rest } (it only moves during a burst), slingshot (`ai: 'sling'`): shoots within `reach` (not closer than `minShot`), backs off under `near`, closes in past `far`,
// the acorn leaves at `hitFrame` as `shot` { speed, range, r (hit circle), kb, dy (drawn this high), ox (leaves this far in front) }.
// The bear (a boss, src/boss.js) has its moves in `boss`.
const ENEMIES = {
  gnome: { hp: 4, speed: 80, sight: 5 * 64, lose: 8 * 64, reach: 44, hitRange: 56, hitFrame: 3, damage: 1, cooldown: 0.8,
    stun: 0.3, knockback: 36, kbTime: 0.15, flash: 0.1, fade: 0.35, originY: 127 / 192, hurtbox: [-18, -40, 18, 2], drops: 'gnome',
    idle: 'gnome-idle', run: 'gnome-run', attack: 'gnome-attack' },
  snake: { hp: 5, speed: 50, sight: 5 * 64, lose: 8 * 64, reach: 108, hitRange: 62, hitFrame: 3, damage: 1, cooldown: 1.2,
    lunge: { frame: 2, coil: 0.35, speed: 400, time: 0.28 },
    stun: 0.3, knockback: 36, kbTime: 0.15, flash: 0.1, fade: 0.35, originY: 123 / 192, hurtbox: [-30, -40, 30, 2], drops: 'snake',
    idle: 'snake-idle', run: 'snake-run', attack: 'snake-attack' },
  spider: { hp: 3, speed: 210, sight: 5 * 64, lose: 8 * 64, reach: 50, hitRange: 58, hitFrame: 4, damage: 1, cooldown: 0.7,
    gait: { burst: 0.4, rest: 0.5 },
    stun: 0.3, knockback: 40, kbTime: 0.15, flash: 0.1, fade: 0.35, originY: 137 / 192, hurtbox: [-30, -48, 30, 2], drops: 'spider',
    idle: 'spider-idle', run: 'spider-run', attack: 'spider-attack' },
  slingshot: { ai: 'sling', hp: 3, speed: 70, backSpeed: 95, sight: 7 * 64, lose: 10 * 64, reach: 5 * 64, near: 3 * 64, far: 5 * 64, minShot: 110, hitFrame: 6, damage: 1, cooldown: 1.6,
    shot: { speed: 240, range: 7 * 64, r: 14, kb: 30, dy: 34, ox: 26 },
    stun: 0.3, knockback: 36, kbTime: 0.15, flash: 0.1, fade: 0.35, originY: 137 / 192, hurtbox: [-18, -48, 18, 2], drops: 'slingshot',
    idle: 'slingshot-idle', run: 'slingshot-run', attack: 'slingshot-shoot' },
  // The Bear: hp is in weapon damage (an old Pawn's tier-0 axe does 2 per swing). `scale` = drawn size, `r` = half width of its collision (it
  // needs more room than a gnome), walk/keep = approach speed and the distance it stops at, dead = px of dx before it turns round,
  // resist = share of a knockback it takes, stunMul = damage multiplier while it is stunned. Below p2At of its hp it is in phase 2: speeds x p2.speed, telegraphs x p2.tele.
  // weights: how often each move is picked, near / far = the hero closer / farther than the swipe's range + 30 (p2w multiplies them in phase 2).
  // swipe: range (px, the hero must also not be behind it), tele = telegraph s, dmg, kb. charge: min = closest it will charge from, tele, speed, dist = longest rush, hitR = half
  // the width it hits and its red band, stun = s dazed after a wall or rock. slam: tele, hold, then a ring grows at `speed` px/s to radius `r` (marked on the ground in advance:
  // walk out of it, or dash), w = half its thickness. rec = s of rest after the move: it stands and pants, the hero's window.
  bear: { hp: 36, speed: 0, lose: 1e9, reach: 0, hitRange: 0, hitFrame: 0, damage: 1, cooldown: 0, stun: 0, knockback: 36, kbTime: 0.15, flash: 0.1, fade: 1.2,
    originY: 177 / 256, hurtbox: [-80, -112, 80, 2], drops: 'bear', idle: 'bear-idle', run: 'bear-run', attack: 'bear-attack',
    boss: { name: 'Bear', avatar: 'bear-avatar', scale: 1.6, r: 56, walk: 110, keep: 115, dead: 24, resist: 0.15, stunMul: 1.5, p2At: 0.5, p2: { speed: 1.2, tele: 0.8 }, roar: 1.0,
      weights: { near: { swipe: 6, slam: 3, charge: 0 }, far: { charge: 5, slam: 3, swipe: 0 } }, p2w: { swipe: 1, slam: 1.5, charge: 1.5 },
      swipe: { range: 135, tele: 0.7, dmg: 1, kb: 50, rec: 0.8 },
      charge: { min: 260, tele: 1.0, speed: 400, dist: 520, hitR: 70, dmg: 1, kb: 70, stun: 1.6, rec: 1.0 },
      slam: { tele: 0.8, hold: 0.2, speed: 240, r: 190, w: 18, dmg: 1, kb: 60, rec: 1.0 } },
  },
};
// Island scaling: an enemy on island n has hp x (1 + hp x (n - 1)) and damage x (1 + dmg x (n - 1)), rounded (never under 1). Island 1 = the numbers above.
const ISLAND = { hp: 0.35, dmg: 0.34 };
// Drop tables: one pickup per row; p = chance (default always), min..max = amount (default 1), weapon + tier = a weapon pickup ('any': a random one the hero can use).
const DROPS = {
  gnome: [{ kind: 'gold', min: 2, max: 4 }, { kind: 'meat', p: 0.25 }, { kind: 'dynamite', p: 0.08 }],
  snake: [{ kind: 'gold', min: 3, max: 5 }, { kind: 'meat', p: 0.2 }],
  spider: [{ kind: 'gold', min: 1, max: 3 }, { kind: 'meat', p: 0.15 }, { kind: 'bomb', p: 0.06 }],
  slingshot: [{ kind: 'gold', min: 2, max: 4 }, { kind: 'meat', p: 0.2 }, { kind: 'dynamite', p: 0.12 }],
  bear: [{ kind: 'duck' }, { kind: 'duck' }, { kind: 'duck' }, { kind: 'gold', min: 10, max: 15 }, { kind: 'weapon', weapon: 'any', tier: 2 }],   // weapon 'any' = one the hero can use
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

// Camps (src/camp.js). A Tiled `camp` (a rect or a polygon) is the inside of a clearing: its cells. The walls are trees, rocks, cliffs and water; `gate` rects mark
// the gaps (tile-aligned, 2-3 cells) that close in a fight: a gnome camp pops up Wooden Fence pieces (the 4x3 sheet `fence`, 64 px tiles), the boss den drops boulders.
// clear = px the hero's feet must be from every gap cell before the camp closes (so he is well inside, not in the doorway). delay = s from the last foe to the cards,
// rise / drop = ms for a fence piece to pop up / sink (it moves `sink` px), push = px steps a unit stuck in a closing gap is moved inwards.
// Boulders: each takes `fall` ms to land (starting `stagger` ms after the one before, from `height` px up), crumbles over `crumble` ms when the camp opens, and is drawn at `scale`.
// The boss: `wake` s after the boulders start to fall the bar shows and the Bear rears and roars for `intro` s, then it fights. foes = gnomes stay idle until the camp closes.
// The cards (scenes/Cards.js) ignore input for `lock` ms after they open (a swing or Space from the last fight must not pick), and show the pick for `confirm` ms.
const CAMP = { delay: 0.5, rise: 240, drop: 200, sink: 18, push: 4, clear: 2.5 * 64, lock: 450, confirm: 560,
  fall: 420, stagger: 110, height: 320, crumble: 500, scale: 1.3, wake: 0.6, intro: 1.0 };
// Fence tiles: the frame [row, col] in the sheet and the collision bands [x0, y0, x1, y1] from the tile's top-left (rails, posts).
// hz0 / hz1 = a run across a gap that is crossed north-south, el / er = its ends (the post mid-cell, the rail to its right / left; the band spans the cell: the wall meets the post), vl / vr = across one crossed east-west (vl on the clearing's
// west side, vr on its east; each has its post at the top), capl / capr = the post head alone, [crop px, drawn dy] of the side piece, capping the bottom of a column.
const FENCE = {
  hz0: [[0, 1], [[0, 30, 64, 48]]], hz1: [[0, 2], [[0, 30, 64, 48]]], el: [[2, 2], [[0, 30, 64, 48]]], er: [[2, 1], [[0, 30, 64, 48]]],
  vl: [[1, 0], [[24, 0, 42, 64]]], vr: [[1, 3], [[22, 0, 43, 64]]], capl: [[1, 0], [], [44, 26]], capr: [[1, 3], [], [44, 26]],
};

// The town's fences, from the same sheet: piece -> [row, col, collision bands [x0, y0, x1, y1] from the tile's top-left]. tl tr bl br = corners, h0 h1 = a run, v = a side,
// er / el = the end of a run left / right of an opening (the post stands at its right / left). A Tiled `fence` rect of one cell names its piece in `p`.
const YARD = {
  tl: [0, 0, [[24, 30, 64, 48], [24, 30, 42, 64]]], tr: [0, 3, [[0, 30, 40, 48], [22, 30, 43, 64]]], bl: [2, 0, [[24, 0, 42, 48], [24, 30, 64, 48]]], br: [2, 3, [[22, 0, 43, 48], [0, 30, 40, 48]]],
  h0: [0, 1, [[0, 30, 64, 48]]], h1: [0, 2, [[0, 30, 64, 48]]], v: [1, 0, [[24, 0, 42, 64]]], er: [2, 1, [[0, 30, 42, 48]]], el: [2, 2, [[22, 30, 64, 48]]],
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
const STAT0 = { dmg: 1, hp: 0, speed: 1, swing: 1, gold: 1, dashRate: 1, reach: 1, kb: 1, meat: 1, charges: 1, twice: 0, thorns: 0, slots: 0, sense: 0 };   // stats with no power-up
const POWERUPS = {
  damage:   { rarity: 'common', name: 'Sharp Edge', text: '+{v}% damage', stat: 'dmg', add: 0.15, pct: true, scale: true, icon: ['tool2', 0, 2] },
  vigor:    { rarity: 'common', name: 'Tough Hide', text: '+1 max HP, heal 1', stat: 'hp', add: 1, heal: 1, icon: ['icon06'] },
  swift:    { rarity: 'common', name: 'Light Boots', text: '+{v}% move speed', stat: 'speed', add: 0.1, pct: true, scale: true, icon: ['icon07'] },
  quick:    { rarity: 'common', name: 'Quick Hands', text: '+{v}% swing speed', stat: 'swing', add: 0.15, pct: true, scale: true, icon: ['tool3', 0, 2] },
  greed:    { rarity: 'common', name: 'Gold Fever', text: '+{v}% gold', stat: 'gold', add: 0.25, pct: true, scale: true, icon: ['icon03'] },
  heal:     { rarity: 'common', name: 'Full Heal', text: 'Heal to full', full: true, icon: ['icon04'] },
  recharge: { rarity: 'uncommon', name: 'Fresh Legs', text: 'Dash recharges {v}% faster', stat: 'dashRate', add: 0.3, pct: true, scale: true, icon: ['icon10'] },
  reach:    { rarity: 'uncommon', name: 'Long Arm', text: 'Longer reach, +{v}%', stat: 'reach', add: 0.25, pct: true, scale: true, icon: ['icon02'] },
  shove:    { rarity: 'uncommon', name: 'Heavy Blows', text: 'Knockback +{v}%', stat: 'kb', add: 0.5, pct: true, scale: true, icon: ['icon01'] },
  feast:    { rarity: 'uncommon', name: 'Big Appetite', text: 'Meat heals double', stat: 'meat', add: 1, icon: ['meat'] },
  twin:     { rarity: 'rare', name: 'Double Dash', text: '+1 dash charge', stat: 'charges', add: 1, max: 2, icon: ['icon08'] },
  echo:     { rarity: 'rare', name: 'Twin Strike', text: 'Every swing hits twice', stat: 'twice', add: 1, max: 1, icon: ['icon05'] },
  thorns:   { rarity: 'rare', name: 'Thorns', text: 'Enemies that hurt you take 1', stat: 'thorns', add: 1, icon: ['icon09'] },
  pockets:  { rarity: 'rare', name: 'Deep Pockets', text: '+1 item slot', stat: 'slots', add: 1, max: 1, icon: ['btn-tiny-square'] },
  ducks:    { rarity: 'rare', name: 'Duck Sense', text: 'Golden ducks show on the map', stat: 'sense', add: 1, max: 1, icon: ['duck', 0] },   // sense: golden ducks within EXPLORE.ducks tiles are remembered on the map (src/map.js)
};
// The explored map (src/map.js, scenes/Map.js). reveal = radius in tiles around the hero that count as seen, ducks = how far Duck Sense reaches (tiles).
// land / obj = the colours of the terrain classes (water, grass, raised, cliff, stairs, sand) and of the blobs on them (tree, rock, building; index 0 = none),
// door = a door's tile, shore = the pale rim on land next to seen water, fog = the unseen part of the map (over the paper), ink = outlines.
const EXPLORE = { reveal: 6.5, ducks: 12, land: ['#47aba9', '#9bb94e', '#6f9a4c', '#506a69', '#c9a46a', '#e9d58a'], obj: [null, '#3d6b3a', '#8f9c9a', '#af7960'],
  door: '#f2c33a', shore: '#e4f3df', fog: 'rgba(90,62,43,0.16)', ink: '#161c2e' };
const HIT2 = { delay: 0.1, mult: 1 };                // Twin Strike: the second hit lands `delay` s after the first, for `mult` of its damage

// ---- Town (src/save.js, src/npc.js, scenes/Talk.js, Shop.js, Skills.js). Everything bought here is saved (localStorage SAVE_KEY) and applied at the start of each run.
// UPGRADES: cur = 'gold' | 'ducks'; cost[i] = the price of rank i + 1, so cost.length is the cap. perm = what each rank adds to the hero's stats (STAT0 keys, like a power-up;
// text {v} = the total of the ranks up to the one shown, {p} = the same as a percentage (src/save.js upgradeText). Without perm the effect is in runStart() (src/save.js): hammer, meat, whetstone, newpawn, secondwind.
// stub = bought and saved but nothing reads it yet.
const SAVE_KEY = 'pawnrun-save';
const UPGRADES = {
  hammer:     { name: 'Hammer', text: 'Start every run with the hammer: it breaks rocks', cur: 'gold', cost: [40], icon: ['tool1', 0, 2] },
  shield:     { name: 'Shield', text: 'Max HP +{v} in every run', cur: 'gold', cost: [30, 60, 100], perm: { hp: 1 }, icon: ['icon06'] },
  meat:       { name: 'Meat Ration', text: 'Start every run with {v} meat', cur: 'gold', cost: [25, 50], icon: ['meat'] },
  coin:       { name: 'Lucky Coin', text: 'Gold pickups +{p}%', cur: 'gold', cost: [40, 90, 160], perm: { gold: 0.1 }, icon: ['icon03'] },
  bag:        { name: 'Big Bag', text: 'Item slots +{v}', cur: 'gold', cost: [70, 150], perm: { slots: 1 }, icon: ['btn-tiny-square'] },
  whetstone:  { name: 'Whetstone', text: 'Weapons start at tier {v}', cur: 'gold', cost: [60, 120], icon: ['icon05'] },
  newpawn:    { name: 'New Pawn', text: 'The new Pawn: more HP and speed, four tools', cur: 'ducks', cost: [3], icon: ['avatar05'] },
  secondwind: { name: 'Second Wind', text: 'Get up once per run when you fall', cur: 'ducks', cost: [2], icon: ['icon08'] },
  spyglass:   { name: 'Spyglass', text: 'Shows the dock on your map', cur: 'ducks', cost: [2], icon: ['icon11'] },
  ferry:      { name: 'Ferry Ticket', text: 'Start at a reached biome', cur: 'ducks', cost: [3], icon: ['icon07'], stub: true },   // ponytail: no biomes yet, the purchase is only recorded
};
// The shops: who sells what. The vendors trade outside, at their own stall (the shop opens over the town).
const SHOPS = {
  blacksmith: ['hammer', 'shield', 'whetstone'],
  healer: ['meat', 'secondwind'],
  market: ['coin', 'bag'],
  steward: ['newpawn', 'spyglass', 'ferry'],
};
// Skills (the trainer): points go into a stat tree. Level = the points bought. The next point costs SKILL_COST.base + step x level (gold, so a refund returns the price of the last
// point whichever stat it comes from). cap = ranks; perm = what a rank adds to the hero's stats. cls = the class this stat line unlocks (CLASSES) at rank CLASS_RANK.
const SKILLS = {
  hp:      { name: 'Vitality', text: '+1 max HP', cap: 5, perm: { hp: 1 }, icon: ['icon06'], cls: 'warrior' },
  dmg:     { name: 'Might', text: '+8% damage', cap: 5, perm: { dmg: 0.08 }, icon: ['tool2', 0, 2], cls: 'lancer' },
  speed:   { name: 'Swiftness', text: '+5% speed', cap: 4, perm: { speed: 0.05 }, icon: ['icon07'] },
  dash:    { name: 'Agility', text: '+12% dash recharge', cap: 5, perm: { dashRate: 0.12 }, icon: ['icon10'], cls: 'archer' },
  charges: { name: 'Double Dash', text: '+1 dash charge', cap: 1, perm: { charges: 1 }, icon: ['icon08'] },
};
const SKILL_COST = { base: 20, step: 15 };
const CLASS_RANK = 3;
// The classes, one per stat line: stat = the SKILLS id that unlocks it at rank CLASS_RANK, perks = [rank, text] of that stat, gained as it climbs past that. art = the idle sheet.
// You switch between unlocked classes at the trainer, free, as often as you like; a refund that drops the stat under CLASS_RANK drops the class.
// ponytail: only the pick and the perk list exist; the hero stays the Pawn (its own sprites, weapon and special move are a follow-up), so a class changes nothing in a run yet.
const CLASSES = {
  warrior: { name: 'Warrior', stat: 'hp', art: 'warrior-idle', text: 'Heavy blows and a thick shield. Fights up close.', perks: [[4, 'Shield bash'], [5, 'Whirlwind']] },
  lancer:  { name: 'Lancer', stat: 'dmg', art: 'lancer-idle', text: 'Long reach and charges. Keeps foes at spear length.', perks: [[4, 'Longer thrust'], [5, 'Charge']] },
  archer:  { name: 'Archer', stat: 'dash', art: 'archer-idle', text: 'Shoots from afar and rolls away. Fragile up close.', perks: [[4, 'Quick draw'], [5, 'Volley']] },
};
// The townsfolk (NPCs on the town map: a tile object of class `npc` with a `role`; or inside a house, set by the door). key = the idle sheet, avatar = the Human Avatar on the dialog,
// shop = a SHOPS id the dialog leads into, train = the skill tree (+ the class pick) instead. lines = what they say, one page each.
const NPCS = {
  blacksmith: { name: 'Brann', title: 'Blacksmith', key: 'warrior-idle', avatar: 'avatar02', shop: 'blacksmith', lines: ['Mind the sparks, Pawn.', 'A hammer cracks rock piles like eggs. Take one on your next run.'] },
  healer: { name: 'Sister Elm', title: 'Healer', key: 'monk-idle', avatar: 'avatar04', shop: 'healer', lines: ['Welcome, child. Rest a moment.', 'Meat for the road, and a second wind for when the road bites back.'] },
  market: { name: 'Pip', title: 'Merchant', key: 'archer-idle', avatar: 'avatar03', shop: 'market', lines: ['Lucky coins, sturdy bags, fair prices!', 'What the islands give you, I can make worth more.'] },
  steward: { name: 'Sir Odo', title: 'Castle Steward', key: 'lancer-idle', avatar: 'avatar01', shop: 'steward', lines: ['The castle keeps what is rare. Golden ducks, mostly.', 'A duck buys a new Pawn, a lucky escape or a look at the sea.'] },
  trainer: { name: 'Dax', title: 'Trainer', key: 'trainer-idle', avatar: 'avatar12', train: true, lines: ['Sweat now, bleed less later.', 'Every point I teach you is a point you keep. You are level {lv}; the next costs {cost} gold.'] },
  folk1: { name: 'Old Hob', title: 'Villager', key: 'folk1-idle', avatar: 'avatar19', lines: ['Cosy, is it not? I have seen forty winters from this chair.', 'Rock piles at the water: dynamite goes where hands cannot.'] },
  folk2: { name: 'Bess', title: 'Villager', key: 'folk2-idle', avatar: 'avatar18', lines: ['Careful on the islands! A mushroom at a tree\'s foot means it can be chopped.', 'And ducks hide in secret places. Always look behind the trees.'] },
};
const TALK = { range: 78 };                          // px from the NPC's feet to the hero's at which the E prompt shows

if (typeof module === 'object') module.exports = { YARD, SAVE_KEY, UPGRADES, SHOPS, SKILLS, SKILL_COST, CLASS_RANK, CLASSES, NPCS, TALK, EXPLORE, ISLAND, CAMP, FENCE, RARITY, POWER_SCALE, STAT0, POWERUPS, HIT2, WEAPONS, TIER, ITEMS, HERO, DASH, ENEMIES, DROPS, LOOT, PICKUP, BAG, MEAT_HEAL, PROPS, STUMP, SHEEP };
