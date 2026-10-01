import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { resolveDefensivePress } from '../../src/sim/defence';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { distanceToSegmentXZ } from '../../src/sim/math';
import { evaluateShot, resolveShotOutcome, startShot } from '../../src/sim/shooting';
import type { MatchSettings, MatchState, PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const matchSettings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function live(seed = 1): MatchState {
  const s = createMatch({ ...matchSettings, seed }, court, roster);
  s.phase = 'live';
  s.possession = 0;
  return s;
}

function player(state: MatchState, id: string): PlayerState {
  const p = findPlayer(state, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(state: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(state, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

const rim = hoopGeometry(court, 1).rimCenter;

describe('distanceToSegmentXZ', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 10, y: 0, z: 0 };
  it('measures to the interior of the segment', () => {
    expect(distanceToSegmentXZ({ x: 5, y: 0, z: 3 }, a, b)).toBeCloseTo(3);
  });
  it('measures to the nearest endpoint beyond the ends', () => {
    expect(distanceToSegmentXZ({ x: -4, y: 0, z: 3 }, a, b)).toBeCloseTo(5);
    expect(distanceToSegmentXZ({ x: 13, y: 0, z: 4 }, a, b)).toBeCloseTo(5);
  });
  it('ignores y and handles a degenerate segment', () => {
    expect(distanceToSegmentXZ({ x: 3, y: 9, z: 4 }, a, a)).toBeCloseTo(5);
  });
});

describe('evaluateShot', () => {
  it('reports the type and quality the real shot would have, for several spots', () => {
    const spots: [number, number][] = [
      [rim.x - 1.2, 0], // layup range, standing
      [rim.x - 4, 2],
      [rim.x - 7.5, -1],
      [rim.x - 10, 4],
    ];
    for (const [x, z] of spots) {
      const s = live();
      const me = place(s, 'home1', x, z);
      place(s, 'away1', x + 1, z + 0.5);
      place(s, 'away2', rim.x - 2, 1);
      giveBall(s, me, []);
      const evaluation = evaluateShot(s, me, court);
      const check = structuredClone(s);
      const shooter = player(check, 'home1');
      startShot(check, shooter, court);
      const outcome = resolveShotOutcome(check, shooter, court);
      expect(evaluation.type).toBe(shooter.shot?.type);
      expect(evaluation.hoop).toBe(1);
      expect(evaluation.quality).toBeCloseTo(outcome.quality, 6);
      expect(evaluation.distance).toBeCloseTo(Math.hypot(x - rim.x, z), 6);
    }
  });

  it('matches the dunk the real shot picks when driving at the rim', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 1.5, 0);
    me.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, me, []);
    expect(evaluateShot(s, me, court).type).toBe('dunk');
    expect(evaluateShot(s, me, court).quality).toBe(1);
  });

  it('does not mutate the player or the RNG', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 5, 0);
    giveBall(s, me, []);
    const before = JSON.stringify(s);
    evaluateShot(s, me, court);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('evaluates a teammate who does not hold the ball', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 8, 0);
    const mate = place(s, 'home2', rim.x - 2.2, 0);
    giveBall(s, me, []);
    const theirs = evaluateShot(s, mate, court);
    expect(theirs.type).toBe('layup');
    expect(theirs.quality).toBeGreaterThan(evaluateShot(s, me, court).quality);
  });
});

describe('resolveDefensivePress', () => {
  function pressSetup(): { s: MatchState; me: PlayerState; holder: PlayerState } {
    const s = live();
    const holder = place(s, 'home1', rim.x - 5, 0);
    giveBall(s, holder, []);
    const me = place(s, 'away1', rim.x - 5.6, 0); // within steal reach, in front
    me.facing = Math.atan2(holder.pos.x - me.pos.x, holder.pos.z - me.pos.z);
    place(s, 'home2', rim.x - 9, 6);
    place(s, 'away2', rim.x - 9, -6);
    return { s, me, holder };
  }

  it('returns steal when a grounded holder is in reach', () => {
    const { s, me } = pressSetup();
    expect(resolveDefensivePress(s, me, court)).toBe('steal');
  });

  it('returns null while the steal is on cooldown (the sim would do nothing)', () => {
    const { s, me } = pressSetup();
    me.cooldowns.steal = 10;
    expect(resolveDefensivePress(s, me, court)).toBeNull();
  });

  it('returns block when the holder is mid-shot, and jump when the block is on cooldown', () => {
    const { s, me, holder } = pressSetup();
    startShot(s, holder, court);
    expect(resolveDefensivePress(s, me, court)).toBe('block');
    me.cooldowns.block = 5;
    expect(resolveDefensivePress(s, me, court)).toBe('jump');
  });

  it('returns null when I am airborne, action-locked, holding the ball or the phase is not live', () => {
    const { s, me, holder } = pressSetup();
    me.onGround = false;
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    me.onGround = true;
    me.action = 'steal';
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    me.action = 'idle';
    s.phase = 'inbound';
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    s.phase = 'live';
    expect(resolveDefensivePress(s, holder, court)).toBeNull();
  });

  it('returns shove when the nearest opponent is in front and in reach without the ball', () => {
    const s = live();
    const target = place(s, 'home2', 0, 0);
    const me = place(s, 'away1', -1, 0);
    me.facing = Math.PI / 2; // facing +X
    place(s, 'home1', -10, 5);
    giveBall(s, player(s, 'home1'), []);
    place(s, 'away2', 8, 0);
    expect(resolveDefensivePress(s, me, court)).toBe('shove');
    me.cooldowns.shove = 3;
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    me.cooldowns.shove = 0;
    target.shoveImmunityTicks = 5;
    expect(resolveDefensivePress(s, me, court)).toBe('jump');
  });
});
