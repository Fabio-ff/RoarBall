import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import {
  applyChargeGains,
  ASSIST_WINDOW_TICKS,
  CHARGE_GAIN,
  CHARGE_MAX,
} from '../../src/sim/abilities';
import { NO_ABILITIES, type AbilityDef, type AbilityTable } from '../../src/sim/hooks';
import { createMatch, findPlayer, type RosterEntry } from '../../src/sim/match';
import { nextFloat } from '../../src/sim/rng';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type CourtDef,
  type MatchState,
  type PlayerIntent,
  type PlayerState,
  type SimEvent,
} from '../../src/sim/types';

const gym = getCourt('gym');
const calls: string[] = [];

/** Test-only ability: records every hook call and doubles run speed for 5 ticks. */
const fake: AbilityDef = {
  id: 'fake',
  name: 'Fake',
  description: 'test',
  icon: '?',
  durationTicks: 5,
  effect: {
    onActivate: (state, player) => {
      calls.push(`activate ${player.id} ${state.tick}`);
    },
    onTick: (state, player) => {
      calls.push(`tick ${player.id} ${state.tick}`);
    },
    onEnd: (state, player) => {
      calls.push(`end ${player.id} ${state.tick}`);
    },
    modifyStats: (stats) => ({ ...stats, runSpeed: stats.runSpeed * 2 }),
  },
};
const instant: AbilityDef = {
  ...fake,
  id: 'instant',
  durationTicks: 'instant',
  effect: { onActivate: () => {} },
};
const untimed: AbilityDef = {
  ...fake,
  id: 'untimed',
  durationTicks: null,
  effect: {
    onActivate: (_state, player) => {
      if (player.ability) player.ability.uses = 2;
    },
  },
};
const TABLE: AbilityTable = { fake, instant, untimed };
const special: PlayerIntent = { ...NO_INTENT, special: true };

function entry(id: string, team: 0 | 1, abilityId: string): RosterEntry {
  return { id, team, characterId: 'rook', character: { ...getCharacter('rook'), abilityId } };
}

function live(abilityId = 'fake', court: CourtDef = gym): MatchState {
  const s = createMatch(
    {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed: 3,
      ruleIds: [],
      courtId: court.id,
      mode: 'match',
    },
    court,
    [entry('a', 0, abilityId), entry('b', 0, abilityId), entry('x', 1, abilityId)],
  );
  s.phase = 'live';
  return s;
}

function player(s: MatchState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function step(
  s: MatchState,
  intents: Map<string, PlayerIntent> = new Map(),
  table: AbilityTable = TABLE,
  court: CourtDef = gym,
) {
  return tick(s, intents, court, table);
}

describe('player state (spec D.2)', () => {
  it('starts with base stats, no charge, no ability and an empty court state', () => {
    const s = live();
    const a = player(s, 'a');
    expect(a.stats).toEqual(a.baseStats);
    expect(a.stats).toMatchObject({
      dunkFromArc: false,
      unblockableDunk: false,
      stealAlwaysSucceeds: false,
      unlimitedTurbo: false,
    });
    expect(a.abilityId).toBe('fake');
    expect(a.charge).toBe(0);
    expect(a.ability).toBeNull();
    expect(a.lastCatch).toBeNull();
    expect(s.courtState).toEqual({});
  });

  it('placeholders have no ability', () => {
    const s = createMatch(
      {
        durationMs: 1000,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: [],
        courtId: 'gym',
        mode: 'match',
      },
      gym,
      [{ id: 'p', team: 0, characterId: 'placeholder' }],
    );
    expect(player(s, 'p').abilityId).toBeNull();
  });

  it('rebuilds stats from baseStats every tick', () => {
    const s = live();
    player(s, 'a').stats.runSpeed = 99;
    const { state } = step(s);
    expect(player(state, 'a').stats).toEqual(player(state, 'a').baseStats);
  });
});

describe('activation (spec D.2 step 3)', () => {
  it('a SPECIAL press with a full bar activates: charge 0, timer, event, onActivate, stats at once', () => {
    calls.length = 0;
    const s = live();
    player(s, 'a').charge = CHARGE_MAX;
    const { state, events } = step(s, new Map([['a', special]]));
    const a = player(state, 'a');
    expect(a.charge).toBe(0);
    // durationTicks 5; step 9 of the activation tick already counted one.
    expect(a.ability).toEqual({ ticksLeft: 4, uses: 0 });
    expect(events).toContainEqual({ type: 'abilityActivated', playerId: 'a', abilityId: 'fake' });
    expect(calls).toEqual([`activate a ${state.tick}`]);
    expect(a.stats.runSpeed).toBeCloseTo(a.baseStats.runSpeed * 2);
  });

  const blocked: [string, (s: MatchState) => void, AbilityTable][] = [
    ['with NO_ABILITIES', () => {}, NO_ABILITIES],
    ['below a full bar', (s) => void (player(s, 'a').charge = 99), TABLE],
    ['outside live play', (s) => void (s.phase = 'scored'), TABLE],
    [
      'in the air',
      (s) => {
        const a = player(s, 'a');
        a.onGround = false;
        a.pos.y = 1;
      },
      TABLE,
    ],
    ['while action-locked', (s) => void (player(s, 'a').action = 'steal'), TABLE],
    [
      'while already active',
      (s) => void (player(s, 'a').ability = { ticksLeft: 50, uses: 0 }),
      TABLE,
    ],
    [
      'when SPECIAL was already held',
      (s) => void (player(s, 'a').prevButtons.special = true),
      TABLE,
    ],
  ];
  for (const [name, arrange, table] of blocked) {
    it(`does nothing ${name}`, () => {
      const s = live();
      player(s, 'a').charge = CHARGE_MAX;
      arrange(s);
      const { events } = step(s, new Map([['a', special]]), table);
      expect(events.some((e) => e.type === 'abilityActivated')).toBe(false);
    });
  }
});

describe('timers and expiry (spec D.2 step 9)', () => {
  it('runs onTick after activation and ends after durationTicks ticks, activation tick included', () => {
    calls.length = 0;
    const s0 = live();
    player(s0, 'a').charge = CHARGE_MAX;
    let r = step(s0, new Map([['a', special]]));
    let s = r.state;
    const all: SimEvent[] = [...r.events];
    const t = s.tick;
    for (let i = 0; i < 6; i++) {
      r = step(s);
      s = r.state;
      all.push(...r.events);
    }
    expect(calls).toEqual([
      `activate a ${t}`,
      `tick a ${t + 1}`,
      `tick a ${t + 2}`,
      `tick a ${t + 3}`,
      `tick a ${t + 4}`,
      `end a ${t + 4}`,
    ]);
    expect(all.filter((e) => e.type === 'abilityEnded')).toEqual([
      { type: 'abilityEnded', playerId: 'a', abilityId: 'fake' },
    ]);
    expect(player(s, 'a').ability).toBeNull();
    expect(player(s, 'a').stats.runSpeed).toBeCloseTo(player(s, 'a').baseStats.runSpeed);
  });

  it('an instant ability ends on its activation tick', () => {
    const s = live('instant');
    player(s, 'a').charge = CHARGE_MAX;
    const { state, events } = step(s, new Map([['a', special]]));
    const types = events.map((e) => e.type);
    expect(types.indexOf('abilityActivated')).toBeLessThan(types.indexOf('abilityEnded'));
    expect(player(state, 'a').ability).toBeNull();
  });

  it('an untimed ability lasts until its uses run out', () => {
    const s0 = live('untimed');
    player(s0, 'a').charge = CHARGE_MAX;
    let s = step(s0, new Map([['a', special]])).state;
    expect(player(s, 'a').ability).toEqual({ ticksLeft: null, uses: 2 });
    for (let i = 0; i < 100; i++) s = step(s).state;
    expect(player(s, 'a').ability).toEqual({ ticksLeft: null, uses: 2 });
    const a = player(s, 'a');
    if (a.ability) a.ability.uses = 0;
    const r = step(s);
    expect(r.events).toContainEqual({ type: 'abilityEnded', playerId: 'a', abilityId: 'untimed' });
    expect(player(r.state, 'a').ability).toBeNull();
  });

  it('never mutates the input state while an ability runs', () => {
    const s = live();
    player(s, 'a').ability = { ticksLeft: 3, uses: 0 };
    const snapshot = structuredClone(s);
    step(s, new Map([['a', special]]));
    expect(s).toEqual(snapshot);
  });
});

describe('charge gains (spec D.2)', () => {
  const basket = (playerId: string, points: 2 | 3): SimEvent => ({
    type: 'basket',
    playerId,
    team: 0,
    points,
    shotType: 'jumpshot',
  });

  it('baskets, steals and blocks pay CHARGE_GAIN, capped at 100', () => {
    const s = live();
    applyChargeGains(s, [basket('a', 2)], null);
    expect(player(s, 'a').charge).toBe(CHARGE_GAIN.basket2);
    applyChargeGains(s, [basket('a', 3)], null);
    expect(player(s, 'a').charge).toBe(CHARGE_GAIN.basket2 + CHARGE_GAIN.basket3);
    applyChargeGains(
      s,
      [
        { type: 'steal', by: 'x', from: 'a' },
        { type: 'block', by: 'x', shooter: 'a' },
      ],
      null,
    );
    expect(player(s, 'x').charge).toBe(CHARGE_GAIN.steal + CHARGE_GAIN.block);
    player(s, 'a').charge = 95;
    applyChargeGains(s, [basket('a', 3)], null);
    expect(player(s, 'a').charge).toBe(CHARGE_MAX);
  });

  it('pays nothing while one’s own ability is active', () => {
    const s = live();
    player(s, 'a').ability = { ticksLeft: 10, uses: 0 };
    applyChargeGains(s, [basket('a', 3)], null);
    expect(player(s, 'a').charge).toBe(0);
  });

  it('an assist pays the passer when the receiver scores within 180 ticks of the catch', () => {
    const s = live();
    s.tick = 1000;
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'a');
    expect(player(s, 'b').lastCatch).toEqual({ from: 'a', tick: 1000 });
    s.tick = 1000 + ASSIST_WINDOW_TICKS;
    applyChargeGains(s, [basket('b', 2)], null);
    expect(player(s, 'a').charge).toBe(CHARGE_GAIN.assist);
    expect(player(s, 'b').charge).toBe(CHARGE_GAIN.basket2);
    expect(player(s, 'b').lastCatch).toBeNull();
  });

  it('no assist after the window, and no lastCatch from an opponent’s pass', () => {
    const s = live();
    s.tick = 1000;
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'a');
    s.tick = 1001 + ASSIST_WINDOW_TICKS;
    applyChargeGains(s, [basket('b', 2)], null);
    expect(player(s, 'a').charge).toBe(0);
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'x');
    expect(player(s, 'b').lastCatch).toBeNull();
  });

  it('a turnover or anyone’s basket closes the assist window', () => {
    const s = live();
    s.tick = 1000;
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'a');
    // b's team loses the ball, regains it and b scores within 180 ticks: no assist.
    applyChargeGains(s, [{ type: 'possessionChange', team: 1 }], null);
    expect(player(s, 'b').lastCatch).toBeNull();
    s.tick = 1100;
    applyChargeGains(s, [{ type: 'possessionChange', team: 0 }], null);
    applyChargeGains(s, [basket('b', 2)], null);
    expect(player(s, 'a').charge).toBe(0);

    // A catch by the team that keeps possession is not cleared by its own possessionChange.
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'a');
    applyChargeGains(s, [{ type: 'possessionChange', team: 0 }], null);
    expect(player(s, 'b').lastCatch).not.toBeNull();
    // Another scorer's basket clears it.
    applyChargeGains(s, [basket('x', 2)], null);
    expect(player(s, 'b').lastCatch).toBeNull();
  });

  it('charge persists across phases', () => {
    let s = live();
    player(s, 'a').charge = 40;
    s.phase = 'scored';
    s.phaseTicks = 89;
    for (let i = 0; i < 5; i++) s = step(s).state;
    expect(s.phase).toBe('live');
    expect(player(s, 'a').charge).toBe(40);
  });
});

describe('court modifier hooks and the hook context (spec D.2 step 1, A.7)', () => {
  it('onTick runs first with the match RNG and can emit; modifyStats rebuilds from base with the state', () => {
    const seen: number[] = [];
    const windy: CourtDef = {
      ...gym,
      id: 'windy',
      modifier: {
        id: 'test',
        name: 'Test',
        description: '',
        onTick: (state, ctx) => {
          seen.push(ctx.math.nextFloat(ctx.rng));
          ctx.emit({ type: 'gustEnd' });
          state.courtState.ticks = ((state.courtState.ticks as number | undefined) ?? 0) + 1;
        },
        modifyStats: (stats, state) => ({
          ...stats,
          runSpeed: stats.runSpeed + (state.courtState.ticks as number),
        }),
      },
    };
    const s = live('fake', windy);
    const expected = { seed: s.rng.seed };
    const draw = nextFloat(expected);
    const { state, events } = step(s, new Map(), TABLE, windy);
    expect(seen).toEqual([draw]);
    expect(state.rng.seed).toBe(expected.seed);
    expect(events[0]).toEqual({ type: 'gustEnd' });
    expect(state.courtState).toEqual({ ticks: 1 });
    expect(player(state, 'a').stats.runSpeed).toBeCloseTo(
      player(state, 'a').baseStats.runSpeed + 1,
    );
    expect(s.courtState).toEqual({});
  });
});
