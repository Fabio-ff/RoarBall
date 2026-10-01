import { createAiController, type AiController } from './ai-controller';
import type { Controller } from './controller';
import { defenderDummy, teammateDummy } from './dummies';
import { MatchRunner } from './match-runner';
import type { GameOptions } from './url-options';
import { getCharacter } from '../content/characters';
import { AI_PROFILES } from '../sim/ai/profile';
import { createMatch, type RosterEntry } from '../sim/match';
import type { CourtDef, MatchSettings, PlayerId, TeamIndex } from '../sim/types';

export const HUMAN_ID: PlayerId = 'home1';

/** Spec C.1 rosters: 2v2 in a match; the Phase 3 trio (human, dummy teammate, dummy defender) in shootaround. */
export function buildRoster(options: GameOptions): RosterEntry[] {
  const entry = (id: PlayerId, team: TeamIndex, characterId: string): RosterEntry => ({
    id,
    team,
    characterId,
    character: getCharacter(characterId),
  });
  if (options.mode === 'shootaround') {
    return [
      entry(HUMAN_ID, 0, options.characterId),
      entry('home2', 0, 'rook'),
      entry('away1', 1, 'brick'),
    ];
  }
  return [
    entry(HUMAN_ID, 0, options.characterId),
    entry('home2', 0, options.teammateId),
    entry('away1', 1, options.opponentIds[0]),
    entry('away2', 1, options.opponentIds[1]),
  ];
}

/** Spec A.5 defaults; only the seed and the mode vary. */
export function buildSettings(options: GameOptions, court: CourtDef, seed: number): MatchSettings {
  return {
    durationMs: 180_000,
    shotClockMs: 14_000,
    seed,
    ruleIds: ['shotClock'],
    courtId: court.id,
    mode: options.mode,
  };
}

export interface Session {
  runner: MatchRunner;
  controllers: Map<PlayerId, Controller>;
  ais: AiController[];
}

/** A match and its controllers for `seed`; built again with `seed + 1` on restart (spec C.6). */
export function buildSession(
  options: GameOptions,
  court: CourtDef,
  seed: number,
  human: Controller,
): Session {
  const runner = new MatchRunner(
    court,
    createMatch(buildSettings(options, court, seed), court, buildRoster(options)),
  );
  const controllers = new Map<PlayerId, Controller>([[HUMAN_ID, human]]);
  const ais: AiController[] = [];
  if (options.mode === 'shootaround') {
    controllers.set('home2', teammateDummy('home2', HUMAN_ID, court));
    controllers.set('away1', defenderDummy('away1', HUMAN_ID, court));
  } else {
    const profile = AI_PROFILES[options.aiProfile];
    const brains: [PlayerId, number, boolean][] = [
      ['home2', 1, true],
      ['away1', 0, false],
      ['away2', 1, false],
    ];
    for (const [id, slot, favourTeammate] of brains) {
      const ai = createAiController(id, court, { profile, seed, slot, favourTeammate });
      ais.push(ai);
      controllers.set(id, ai.controller);
    }
  }
  return { runner, controllers, ais };
}
