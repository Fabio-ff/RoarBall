import type { CharacterDef } from '../../sim/types';

/** The shooter: deadly from range, soft everywhere else. */
export const ace: CharacterDef = {
  id: 'ace',
  name: 'Ace',
  description: 'Deadly from range, soft everywhere else.',
  stats: { speed: 5, jump: 5, shooting: 10, dunking: 3, defense: 4, power: 3, stamina: 6 },
  abilityId: 'hotHand',
  appearance: { primaryColor: 0x8e44ad, secondaryColor: 0xf1c40f },
};
