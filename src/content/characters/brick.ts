import type { CharacterDef } from '../../sim/types';

/** The dunker: slow and a poor shooter, but unstoppable at the rim and brutal in a shove. */
export const brick: CharacterDef = {
  id: 'brick',
  name: 'Brick',
  description: 'Slow, strong, lives above the rim.',
  stats: { speed: 4, jump: 6, shooting: 3, dunking: 10, defense: 5, power: 9, stamina: 6 },
  abilityId: 'rocketDunk',
  appearance: { primaryColor: 0xd35400, secondaryColor: 0x2c3e50 },
};
