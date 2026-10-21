// Pawn Run tunables. Plain globals for the browser; also loadable from node.

// hitFrame = the animation frame (0-based) where the tool visibly lands, read off the art:
//   old chop 3, old build 3 (swipe / smash trail starts), new axe 2 (slash arc), new hammer 1 (head on the ground),
//   new knife 1 (blade arc), new pickaxe 3 (pick head swings down in front; frame 2 only shows the trail).
// speed = animation timeScale (1 = the pack's 10 fps). recover = pause after the swing ends before the next one.
// anim.old / anim.new = swing animation key; the old Pawn only has axe and hammer.
const WEAPONS = {
  axe:     { damage: 2, reach: 44, radius: 34, speed: 1.25, recover: 0.05, hitFrame: { old: 3, new: 2 }, anim: { old: 'opawn-chop', new: 'pawn-interact-axe' } },
  hammer:  { damage: 5, reach: 50, radius: 48, speed: 0.85, recover: 0.25, hitFrame: { old: 3, new: 1 }, anim: { old: 'opawn-build', new: 'pawn-interact-hammer' } },
  pickaxe: { damage: 3, reach: 46, radius: 34, speed: 1.0,  recover: 0.12, hitFrame: { new: 3 },          anim: { new: 'pawn-interact-pickaxe' } },
  knife:   { damage: 1, reach: 34, radius: 28, speed: 1.4,  recover: 0,    hitFrame: { new: 1 },          anim: { new: 'pawn-interact-knife' } },
};

const HERO = {
  old: { hp: 5, speed: 140, idle: 'opawn-idle', run: 'opawn-run', texture: 'opawn', originY: 128 / 192 },
  new: { hp: 7, speed: 155, originY: 135 / 192 },                      // new Pawn anims are 'pawn-idle-<tool>' / 'pawn-run-<tool>'
  swingSlow: 0.35,                                 // movement multiplier while swinging
  knockback: 40, knockbackTime: 0.12, hurtInvuln: 0.6, flashTime: 0.1,
};

const DASH = { time: 0.16, mult: 3.2, invuln: 0.3, cooldown: 0.9 };

if (typeof module === 'object') module.exports = { WEAPONS, HERO, DASH };
