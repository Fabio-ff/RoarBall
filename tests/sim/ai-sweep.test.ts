import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCourt } from '../../src/content/courts';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { TICK_MS } from '../../src/sim/constants';
import { NO_ABILITIES, type AbilityTable } from '../../src/sim/hooks';
import { allPlayers } from '../../src/sim/match';
import { LOOSE_BALL_TIMEOUT_TICKS } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import type { CourtDef, PlayerIntent, SimEvent } from '../../src/sim/types';
import { court, playAiMatch, startState, type AiRun } from './ai-match';

/**
 * The default roster with the human's teammate brain (home2 favours the human, as in the app).
 * 30 seeds, not 20: issue #92's first cut dropped this matchup to 4 points on seed 25, which the
 * 20-seed sweep never played.
 */
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
/** Spec D.7: + 5 seeds on every court with abilities on. */
const COURT_RUNS: [string, number][] = ['gym', 'rooftop', 'volcano', 'frozen'].flatMap((id) =>
  [1, 2, 3, 4, 5].map((seed): [string, number] => [id, seed]),
);
/** A possession must show progress within shot clock + loose-ball timeout (spec C.7), plus slack. */
const MAX_PROGRESS_GAP_TICKS = Math.ceil(14_000 / TICK_MS) + LOOSE_BALL_TIMEOUT_TICKS + 120;
const PROGRESS: ReadonlySet<SimEvent['type']> = new Set([
  'shotReleased',
  'basket',
  'possessionChange',
  'shotClockViolation',
  'phaseChange',
  'steal',
  'intercept',
  'block',
  'pickup',
]);
const IDLE_STRETCH_TICKS = 60;
const MAX_STUN_SHARE = 0.3;

function isIdle(intent: PlayerIntent): boolean {
  return (
    intent.move.x === 0 && intent.move.y === 0 && !intent.action && !intent.pass && !intent.turbo
  );
}

/** Replays the recorded frames to attribute events and stun time to exact ticks. */
function walk(
  seed: number,
  frames: Map<string, PlayerIntent>[],
  matchCourt: CourtDef = court,
  abilities: AbilityTable = NO_ABILITIES,
) {
  let state = startState(seed, matchCourt);
  let lastProgress = 0;
  let maxGap = 0;
  let liveTicks = 0;
  let idleRun = 0;
  let longestIdle = 0;
  const stunned: Record<string, number> = {};
  for (let i = 0; i < frames.length; i++) {
    // Brains emit NO_INTENT outside live play (celebration, inbound): only live frames can idle.
    // A shot in the air is play, not a stall: 8-9 m shots (Hot Hand sure shots reach them) fly for
    // 1.4-1.6 s while everyone waits at the rebound spots.
    const shotInAir = state.ball.mode === 'flight' && state.ball.flight?.kind === 'shot';
    if (state.phase === 'live' && !shotInAir) {
      idleRun = [...frames[i].values()].every(isIdle) ? idleRun + 1 : 0;
      longestIdle = Math.max(longestIdle, idleRun);
    } else idleRun = 0;
    const r = tick(state, frames[i], matchCourt, abilities);
    state = r.state;
    if (state.phase === 'live') {
      liveTicks++;
      for (const p of allPlayers(state)) {
        if (p.action === 'stunned') stunned[p.id] = (stunned[p.id] ?? 0) + 1;
      }
    }
    if (r.events.some((e) => PROGRESS.has(e.type))) {
      maxGap = Math.max(maxGap, i - lastProgress);
      lastProgress = i;
    }
  }
  return { maxGap, stunned, liveTicks, longestIdle };
}

function expectLively(
  run: AiRun,
  seed: number,
  matchCourt: CourtDef = court,
  abilities: AbilityTable = NO_ABILITIES,
): void {
  expect(run.state.phase).toBe('finished');
  expect(run.state.score[0]).toBeGreaterThanOrEqual(6);
  expect(run.state.score[1]).toBeGreaterThanOrEqual(6);
  const { maxGap, stunned, liveTicks, longestIdle } = walk(
    seed,
    run.intents,
    matchCourt,
    abilities,
  );
  expect(maxGap).toBeLessThanOrEqual(MAX_PROGRESS_GAP_TICKS);
  for (const id of Object.keys(stunned))
    expect(stunned[id] / liveTicks).toBeLessThan(MAX_STUN_SHARE);
  expect(longestIdle).toBeLessThan(IDLE_STRETCH_TICKS);
}

describe('AI seed sweep: no soft locks (spec C.7)', () => {
  it.each(SEEDS)(
    'seed %i plays a complete, lively match',
    (seed) => expectLively(playAiMatch(seed), seed),
    120_000,
  );
});

describe('AI seed sweep with abilities, per court (spec D.7)', () => {
  it.each(COURT_RUNS)(
    '%s seed %i plays a complete, lively match',
    (id, seed) => {
      const matchCourt = getCourt(id);
      const run = playAiMatch(seed, AI_PROFILES.fair, { court: matchCourt, abilities: ABILITIES });
      expectLively(run, seed, matchCourt, ABILITIES);
    },
    120_000,
  );
});
