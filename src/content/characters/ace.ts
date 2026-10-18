import type { CharacterDef } from '../../sim/types';

/** Golden, the shooter (id `ace` is kept, spec F.2): deadly from range, soft everywhere else. */
export const ace: CharacterDef = {
  id: 'ace',
  name: 'Golden',
  description: 'A golden-haired sharpshooter: deadly from range, soft everywhere else.',
  stats: { speed: 5, jump: 5, shooting: 10, dunking: 3, defense: 4, power: 3, stamina: 6 },
  abilityId: 'hotHand',
  appearance: { primaryColor: 0x8e44ad, secondaryColor: 0xf1c40f },
  model: { file: 'characters/ace.glb' },
};
