import type { AbilityDef } from '../../sim/hooks';
import type { MatchState, PlayerState } from '../../sim/types';

export const EARTHQUAKE_RADIUS = 4;
export const EARTHQUAKE_STUN_TICKS = 90;

function opponentsInRange(
  state: MatchState,
  player: PlayerState,
  distance: (a: PlayerState) => number,
): PlayerState[] {
  const everyone: PlayerState[] = [...state.teams[0].players, ...state.teams[1].players];
  return everyone.filter((p) => p.team !== player.team && distance(p) <= EARTHQUAKE_RADIUS);
}

/** Rook (spec D.3): every opponent within 4 m, on the ground or in the air, is knocked down. No RNG. */
export const earthquake: AbilityDef = {
  id: 'earthquake',
  name: 'Earthquake',
  description: 'Knock down every opponent within 4 metres.',
  icon: '🌋',
  durationTicks: 'instant',
  effect: {
    onActivate(state, player, ctx) {
      const victims = opponentsInRange(state, player, (p) =>
        ctx.math.v3DistanceXZ(p.pos, player.pos),
      );
      for (const victim of victims) ctx.knockDown(player, victim, EARTHQUAKE_STUN_TICKS);
    },
  },
  aiWantsToUse(state, player, ctx) {
    const near = opponentsInRange(state, player, (p) => ctx.math.v3DistanceXZ(p.pos, player.pos));
    return near.length >= 2 || near.some((p) => p.id === state.ball.holder);
  },
};
