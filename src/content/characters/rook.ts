import type { CharacterDef } from '../../sim/types';

/** The all-rounder. */
export const rook: CharacterDef = {
  id: 'rook',
  name: 'Rook',
  description: 'Solid at everything, spectacular at nothing.',
  stats: { speed: 6, jump: 6, shooting: 6, dunking: 6, defense: 6, power: 6, stamina: 6 },
  abilityId: 'earthquake',
  appearance: { primaryColor: 0x2980b9, secondaryColor: 0xe67e22 },
};
