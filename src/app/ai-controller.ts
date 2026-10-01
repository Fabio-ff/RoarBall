import { decide } from '../sim/ai/brain';
import { createAiMemory, type AiMemory } from '../sim/ai/memory';
import type { AbilityTable } from '../sim/hooks';
import type { AiProfile } from '../sim/ai/profile';
import type { CourtDef, PlayerId } from '../sim/types';
import type { Controller } from './controller';

export interface AiControllerOptions {
  profile: AiProfile;
  /** The match seed; the brain derives its own stream from it and the player id (spec C.2). */
  seed: number;
  /** Slot in team: 0 or 1; cadence phase = slot * 3 on the match clock. */
  slot: number;
  favourTeammate: boolean;
  /** The ability table the match runs with (spec D.5); none by default. */
  abilities?: AbilityTable;
}

export interface AiController {
  readonly id: PlayerId;
  /** Exposed read-only for the `?debug` overlay (goal.kind). */
  readonly memory: AiMemory;
  readonly controller: Controller;
}

/** Wraps the pure brain as a Controller; all state lives in `memory`. */
export function createAiController(
  id: PlayerId,
  court: CourtDef,
  options: AiControllerOptions,
): AiController {
  const memory = createAiMemory(id, options.seed, options.slot, options.favourTeammate);
  return {
    id,
    memory,
    controller: (state) => decide(state, memory, options.profile, court, options.abilities),
  };
}
