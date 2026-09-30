import type { MatchState, TeamIndex } from './types';

export interface Violation {
  ruleId: string;
  team: TeamIndex;
}

/** Spec §4.8: rules are independent checks that a difficulty level enables or disables. */
export interface Rule {
  id: string;
  check(state: MatchState): Violation | null;
}

/** The holder's team must shoot before the shot clock expires; a ball in the air gets its chance. */
export const shotClockRule: Rule = {
  id: 'shotClock',
  check(state) {
    if (state.phase !== 'live' || state.possession === null) return null;
    if (state.ball.mode !== 'held' || state.shotClockMs > 0) return null;
    return { ruleId: 'shotClock', team: state.possession };
  },
};

export const RULES: Readonly<Record<string, Rule>> = Object.freeze({ shotClock: shotClockRule });

export function applyRules(state: MatchState): Violation[] {
  const violations: Violation[] = [];
  for (const id of state.settings.ruleIds) {
    const violation = RULES[id]?.check(state) ?? null;
    if (violation) violations.push(violation);
  }
  return violations;
}
