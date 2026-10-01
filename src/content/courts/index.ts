import type { CourtDef } from '../../sim/types';
import { frozen } from './frozen';
import { gym } from './gym';
import { rooftop } from './rooftop';
import { volcano } from './volcano';

/** Spec §7.2 / D.4: the gym (balance baseline) and the three modifier courts. */
export const courts: readonly CourtDef[] = [gym, rooftop, volcano, frozen];
export const DEFAULT_COURT_ID = 'gym';

export function getCourt(id: string): CourtDef {
  const court = courts.find((c) => c.id === id);
  if (!court) throw new Error(`Unknown court: ${id}`);
  return court;
}
