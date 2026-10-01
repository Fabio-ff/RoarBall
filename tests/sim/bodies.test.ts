import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { deflectBallOffPlayers, separatePlayers } from '../../src/sim/bodies';
import { createMatch, findPlayer } from '../../src/sim/match';
import type { MatchSettings } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};

describe('separatePlayers', () => {
  it('pushes overlapping players apart symmetrically', () => {
    const s = createMatch(settings, court, [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 1, characterId: 'placeholder' },
    ]);
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: 0, y: 0, z: 0 };
    b.pos = { x: 0.3, y: 0, z: 0 };
    separatePlayers([a, b], court);
    expect(b.pos.x - a.pos.x).toBeCloseTo(0.7);
    expect(a.pos.x).toBeCloseTo(-0.2);
    expect(b.pos.x).toBeCloseTo(0.5);
  });

  it('does nothing when a player is well above the other', () => {
    const s = createMatch(settings, court, [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 1, characterId: 'placeholder' },
    ]);
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: 0, y: 0, z: 0 };
    b.pos = { x: 0.3, y: 1.8, z: 0 };
    separatePlayers([a, b], court);
    expect(b.pos.x).toBeCloseTo(0.3);
  });
});

describe('deflectBallOffPlayers', () => {
  it('bounces a high free ball off a player instead of passing through', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.pos = { x: 0, y: 0, z: 0 };
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      // Capsule top at 1.55 + 0.35 reach, ball radius 0.12: at y = 1.7 the ball just overlaps the shoulder.
      pos: { x: -0.4, y: 1.7, z: 0 },
      vel: { x: 6, y: 0, z: 0 },
    };
    deflectBallOffPlayers(s);
    expect(s.ball.vel.x).toBeLessThan(0);
  });

  it('leaves low balls to the pickup logic', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.pos = { x: 0, y: 0, z: 0 };
    s.ball = {
      ...s.ball,
      mode: 'free',
      holder: null,
      flight: null,
      pos: { x: -0.4, y: 1.0, z: 0 },
      vel: { x: 6, y: 0, z: 0 },
    };
    deflectBallOffPlayers(s);
    expect(s.ball.vel.x).toBe(6);
  });
});
