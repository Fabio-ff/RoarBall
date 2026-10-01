import type { AbilityDef } from '../../sim/hooks';
import type { PlayerState } from '../../sim/types';

export const BLUR_TICKS = 360;
const AI_DEFEND_RANGE = 5;
const AI_FAR_FROM_HOOP = 10;

/** Dash (spec D.3): 6 s of double speed, unlimited turbo and steals that always succeed. */
export const blur: AbilityDef = {
  id: 'blur',
  name: 'Blur',
  description: 'For 6 seconds: double speed, unlimited turbo, every steal succeeds.',
  icon: '⚡',
  durationTicks: BLUR_TICKS,
  effect: {
    onActivate: () => {},
    modifyStats: (stats) => ({
      ...stats,
      runSpeed: stats.runSpeed * 2,
      turboSpeed: stats.turboSpeed * 2,
      acceleration: stats.acceleration * 2,
      deceleration: stats.deceleration * 2,
      unlimitedTurbo: true,
      stealAlwaysSucceeds: true,
    }),
  },
  aiWantsToUse(state, player, ctx) {
    const holderId = state.ball.holder;
    if (holderId === null) return false;
    if (holderId === player.id)
      return ctx.math.targetRimDistance(state, player, ctx.court) > AI_FAR_FROM_HOOP;
    const everyone: PlayerState[] = [...state.teams[0].players, ...state.teams[1].players];
    const holder = everyone.find((p) => p.id === holderId);
    return (
      holder !== undefined &&
      holder.team !== player.team &&
      ctx.math.v3DistanceXZ(holder.pos, player.pos) <= AI_DEFEND_RANGE
    );
  },
};
