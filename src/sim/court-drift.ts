import type { Vec3 } from './math';
import type { CourtDef, MatchState } from './types';

/** Spec D.4: the horizontal acceleration (m/s²) the court's weather puts on the ball now, or null. */
export function ballDriftOf(state: MatchState, court: CourtDef): Vec3 | null {
  return court.modifier?.ballDrift?.(state) ?? null;
}
