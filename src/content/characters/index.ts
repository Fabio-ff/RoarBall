import type { CharacterDef } from '../../sim/types';
import { ace } from './ace';
import { brick } from './brick';
import { dash } from './dash';
import { rook } from './rook';

export const characters: readonly CharacterDef[] = [brick, ace, dash, rook];
export const DEFAULT_CHARACTER_ID = 'rook';

export function getCharacter(id: string): CharacterDef {
  const character = characters.find((c) => c.id === id);
  if (!character) throw new Error(`Unknown character: ${id}`);
  return character;
}
