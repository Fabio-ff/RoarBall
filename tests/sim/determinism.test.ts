import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState, PlayerIntent, SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  // The script only takes long heaves (~5 %); this seed makes one, so the run covers a basket,
  // 'scored' and the inbound. (Seed 7 relied on the heave bounce-in fixed in task 7.)
  seed: 12,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'placeholder' },
  { id: 'away1', team: 1 as const, characterId: 'placeholder' },
];

/** Scripted, varied inputs: circles at different rates, turbo bursts, a press every 90 ticks. */
function scriptedIntent(i: number, offset: number): PlayerIntent {
  const angle = (i + offset) / 40;
  return {
    move: { x: Math.cos(angle), y: Math.sin(angle * 0.7) },
    action: (i + offset) % 90 === 0,
    pass: false,
    special: false,
    turbo: Math.floor((i + offset) / 100) % 2 === 0,
  };
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Second golden run: a 2 s shot clock and a 12 s match with a press only every 400 ticks, so the
 * run goes through shot-clock violations, inbounds, a basket and the end of the match.
 */
const shortSettings: MatchSettings = {
  ...settings,
  durationMs: 12_000,
  shotClockMs: 2000,
  seed: 7,
};

function idleIntent(i: number, offset: number): PlayerIntent {
  return { ...scriptedIntent(i, offset), action: (i + offset) % 400 === 0 };
}

function playShort(): { state: MatchState; events: SimEvent[] } {
  let state = createMatch(shortSettings, court, roster);
  const events: SimEvent[] = [];
  for (let i = 0; i < 1200; i++) {
    const result = tick(
      state,
      new Map([
        ['home1', idleIntent(i, 0)],
        ['away1', idleIntent(i, 37)],
      ]),
      court,
    );
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

function play(): MatchState {
  let state = createMatch(settings, court, roster);
  for (let i = 0; i < 1500; i++) {
    state = tick(
      state,
      new Map([
        ['home1', scriptedIntent(i, 0)],
        ['away1', scriptedIntent(i, 37)],
      ]),
      court,
    ).state;
  }
  return state;
}

describe('determinism (golden)', () => {
  it('two runs with the same seed and inputs end in the identical state', () => {
    const a = play();
    const b = play();
    expect(a).toEqual(b);
    expect(a.score[0] + a.score[1]).toBeGreaterThan(0); // the script actually shoots
  });

  it('matches the pinned hash — update it only for an intentional simulation change', () => {
    expect(fnv1a(JSON.stringify(play()))).toMatchInlineSnapshot(`"6a89b32a"`);
  });

  it('the short-clock run reaches violations and the end of the match, deterministically', () => {
    const a = playShort();
    expect(a).toEqual(playShort());
    const types = new Set(a.events.map((e) => e.type));
    expect(types.has('shotClockViolation')).toBe(true);
    const finished = a.events.some((e) => e.type === 'phaseChange' && e.to === 'finished');
    expect(finished || a.state.overtime).toBe(true);
  });

  it('matches the pinned short-clock hash — update it only for an intentional simulation change', () => {
    expect(fnv1a(JSON.stringify(playShort().state))).toMatchInlineSnapshot(`"ca86c448"`);
  });
});
