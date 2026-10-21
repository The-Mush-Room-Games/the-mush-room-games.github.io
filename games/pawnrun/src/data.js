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

const HERO = {
  old: { hp: 5, speed: 140, idle: 'opawn-idle', run: 'opawn-run', texture: 'opawn', originY: 128 / 192, bodyY: 30 },
  new: { hp: 7, speed: 155, originY: 135 / 192, bodyY: 36 },                      // new Pawn anims are 'pawn-idle-<tool>' / 'pawn-run-<tool>'
  swingSlow: 0.35,                                 // movement multiplier while swinging
  knockback: 40, knockbackTime: 0.12, hurtInvuln: 0.6, flashTime: 0.1,
};

const DASH = { time: 0.26, mult: 2.0, invuln: 0.3, cooldown: 0.9 };

if (typeof module === 'object') module.exports = { WEAPONS, HERO, DASH };
