import { TICK_DT, TICK_MS } from './constants';
import { stepPlayer } from './player-movement';
import { NO_INTENT } from './types';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, SimEvent } from './types';

export interface TickResult {
  state: MatchState;
  events: SimEvent[];
}

/**
 * Advances the match by one fixed step (spec §4.2). Pure: returns a new state and never
 * mutates `state`. Pipeline order is part of the game's definition — keep it stable:
 *   1. court modifier      (phase 5)
 *   2. abilities           (phase 5)
 *   3. resolve intents → actions
 *   4. move players
 *   5. move ball           (phase 2)
 *   6. collisions          (phase 2)
 *   7. rules               (phase 2)
 *   8. scoring / phases
 *   9. timers
 *  10. events
 */
export function tick(
  state: MatchState,
  intents: ReadonlyMap<PlayerId, PlayerIntent>,
  court: CourtDef,
): TickResult {
  if (state.phase === 'paused' || state.phase === 'finished') {
    return { state, events: [] };
  }

  const next = structuredClone(state);
  const events: SimEvent[] = [];
  next.tick += 1;

  for (const team of next.teams) {
    for (const player of team.players) {
      stepPlayer(player, intents.get(player.id) ?? NO_INTENT, court, TICK_DT);
    }
  }

  if (next.phase === 'live') {
    next.clockMs = Math.max(0, next.clockMs - TICK_MS);
    if (next.clockMs === 0) {
      events.push({ type: 'phaseChange', from: 'live', to: 'finished' });
      next.phase = 'finished';
    }
  }

  return { state: next, events };
}
