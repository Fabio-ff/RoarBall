import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../src/sim/constants';
import { allPlayers, createMatch } from '../../src/sim/match';
import { LOOSE_BALL_TIMEOUT_TICKS } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import type { PlayerIntent, SimEvent } from '../../src/sim/types';
import { court, playAiMatch, roster, settings } from './ai-match';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
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
function walk(seed: number, frames: Map<string, PlayerIntent>[]) {
  let state = createMatch({ ...settings, seed }, court, roster);
  let lastProgress = 0;
  let maxGap = 0;
  let liveTicks = 0;
  let idleRun = 0;
  let longestIdle = 0;
  const stunned: Record<string, number> = {};
  for (let i = 0; i < frames.length; i++) {
    // Brains emit NO_INTENT outside live play (celebration, inbound): only live frames can idle.
    if (state.phase === 'live') {
      idleRun = [...frames[i].values()].every(isIdle) ? idleRun + 1 : 0;
      longestIdle = Math.max(longestIdle, idleRun);
    } else idleRun = 0;
    const r = tick(state, frames[i], court);
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

describe('AI seed sweep: no soft locks (spec C.7)', () => {
  it.each(SEEDS)(
    'seed %i plays a complete, lively match',
    (seed) => {
      const run = playAiMatch(seed);
      expect(run.state.phase).toBe('finished');
      expect(run.state.score[0]).toBeGreaterThanOrEqual(6);
      expect(run.state.score[1]).toBeGreaterThanOrEqual(6);

      const { maxGap, stunned, liveTicks, longestIdle } = walk(seed, run.intents);
      expect(maxGap).toBeLessThanOrEqual(MAX_PROGRESS_GAP_TICKS);
      for (const id of Object.keys(stunned))
        expect(stunned[id] / liveTicks).toBeLessThan(MAX_STUN_SHARE);

      expect(longestIdle).toBeLessThan(IDLE_STRETCH_TICKS);
    },
    120_000,
  );
});
