import type { AbilityDef } from '../../sim/hooks';

export const ROCKET_DUNK_TICKS = 480;
/** Spec D.5: the AI fires it holding the ball this far from the target hoop. */
const AI_MIN_DISTANCE = 3.5;
const AI_MAX_DISTANCE = 6.5;

/** Brick (spec D.3): for 8 s any shot press inside the arc is a dunk, and dunks cannot be blocked. */
export const rocketDunk: AbilityDef = {
  id: 'rocketDunk',
  name: 'Rocket Dunk',
  description: 'For 8 seconds, dunk from anywhere inside the arc. Cannot be blocked.',
  icon: '🚀',
  durationTicks: ROCKET_DUNK_TICKS,
  effect: {
    onActivate: () => {},
    modifyStats: (stats) => ({ ...stats, dunkFromArc: true, unblockableDunk: true }),
  },
  aiWantsToUse(state, player, ctx) {
    if (state.ball.holder !== player.id) return false;
    const d = ctx.math.targetRimDistance(state, player, ctx.court);
    return d >= AI_MIN_DISTANCE && d <= AI_MAX_DISTANCE;
  },
};
