import type { CourtDef } from '../../sim/types';
import { gym } from './gym';

export const courts: readonly CourtDef[] = [gym];

export function getCourt(id: string): CourtDef {
  const court = courts.find((c) => c.id === id);
  if (!court) throw new Error(`Unknown court: ${id}`);
  return court;
}
