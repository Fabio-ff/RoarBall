import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { allPlayers, createMatch, findPlayer } from '../../src/sim/match';
import { inbound, inboundPosition, placeFormation } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState, SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'placeholder' },
  { id: 'home2', team: 0 as const, characterId: 'placeholder' },
  { id: 'away1', team: 1 as const, characterId: 'placeholder' },
  { id: 'away2', team: 1 as const, characterId: 'placeholder' },
];

function scattered(mode: MatchSettings['mode'] = 'match'): MatchState {
  const s = createMatch({ ...settings, mode }, court, roster);
  s.phase = 'live';
  let i = 0;
  for (const p of allPlayers(s)) {
    p.pos = { x: 3 - i * 2, y: 0, z: 1 + i };
    p.action = 'run';
    i++;
  }
  return s;
}

describe('formation (spec C.6)', () => {
  it('places the receiver at the baseline, the teammate on the wing and the defenders at the key', () => {
    const s = scattered();
    placeFormation(s, court, 1);
    const away1 = findPlayer(s, 'away1')!;
    const away2 = findPlayer(s, 'away2')!;
    const home1 = findPlayer(s, 'home1')!;
    const home2 = findPlayer(s, 'home2')!;
    expect(away1.pos).toEqual(inboundPosition(court, 1));
    expect(away2.pos.x).toBeCloseTo(court.playArea.length / 4);
    expect(Math.abs(away2.pos.z)).toBeCloseTo(4);
    // Team 1 attacks hoop 0 (−X): the defenders stand at the top of its key.
    for (const d of [home1, home2]) {
      expect(d.pos.x).toBeCloseTo(court.hoops[0].pos.x + 5.8);
      expect(Math.abs(d.pos.z)).toBeCloseTo(1.5);
      expect(d.action).toBe('idle');
    }
    expect(home1.pos.z).not.toBeCloseTo(home2.pos.z);
  });

  it('a match inbound uses the formation and hands the receiver the ball', () => {
    const s = scattered();
    s.pendingInbound = 0;
    s.phase = 'inbound';
    const events: SimEvent[] = [];
    inbound(s, court, events);
    expect(s.ball.holder).toBe('home1');
    expect(findPlayer(s, 'home1')!.pos).toEqual(inboundPosition(court, 0));
    expect(findPlayer(s, 'away1')!.pos.x).toBeCloseTo(court.hoops[1].pos.x - 5.8);
    expect(s.phase).toBe('live');
  });

  it('a shootaround inbound moves only the receiver (B.1 unchanged)', () => {
    const s = scattered('shootaround');
    const before = structuredClone(findPlayer(s, 'away1')!.pos);
    s.pendingInbound = 0;
    s.phase = 'inbound';
    inbound(s, court, []);
    expect(findPlayer(s, 'away1')!.pos).toEqual(before);
    expect(s.ball.holder).toBe('home1');
  });

  it('a match tip-off starts everyone in formation', () => {
    const s = tick(createMatch(settings, court, roster), new Map(), court).state;
    expect(s.phase).toBe('live');
    const holder = findPlayer(s, s.ball.holder ?? '')!;
    expect(Math.abs(holder.pos.x)).toBeCloseTo(court.playArea.length / 2 - 1.5);
    for (const p of allPlayers(s))
      expect([0, 4, 1.5]).toContain(Math.abs(Math.round(p.pos.z * 10) / 10));
  });
});
