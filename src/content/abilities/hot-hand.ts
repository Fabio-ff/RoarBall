import type { AbilityDef } from '../../sim/hooks';

export const HOT_HAND_SHOTS = 3;

/** Ace (spec D.3): the next three released shots cannot miss; the sim spends `uses` at release. */
export const hotHand: AbilityDef = {
  id: 'hotHand',
  name: 'Hot Hand',
  description: 'Your next three shots cannot miss.',
  icon: '🔥',
  durationTicks: null,
  effect: {
    onActivate(_state, player) {
      if (player.ability) player.ability.uses = HOT_HAND_SHOTS;
    },
  },
  aiWantsToUse: (state, player) => state.possession === player.team,
};
