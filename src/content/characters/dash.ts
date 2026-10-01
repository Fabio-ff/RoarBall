import type { CharacterDef } from '../../sim/types';

/** The speedster: fastest on the court and a natural thief. */
export const dash: CharacterDef = {
  id: 'dash',
  name: 'Dash',
  description: 'Fastest on the court; steals for fun.',
  stats: { speed: 10, jump: 7, shooting: 5, dunking: 4, defense: 8, power: 3, stamina: 8 },
  abilityId: 'blur',
  appearance: { primaryColor: 0x27ae60, secondaryColor: 0xecf0f1 },
};
