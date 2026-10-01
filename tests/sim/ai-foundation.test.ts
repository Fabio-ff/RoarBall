import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { AI_PROFILES, isAiProfileId } from '../../src/sim/ai/profile';
import { createAiMemory, hashSeed, resetAiMemory } from '../../src/sim/ai/memory';
import {
  SPOT_NAMES,
  farthestSpot,
  namedSpot,
  pickOpenSpot,
  scoreSpot,
} from '../../src/sim/ai/spots';
import { steerTowards, wantsTurbo } from '../../src/sim/ai/steering';
import { hoopGeometry } from '../../src/sim/hoop';
import { nextFloat } from '../../src/sim/rng';
import { DEFAULT_STATS } from '../../src/sim/stats';
import type { PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1); // +X hoop, side = 1
const rim = hoop.rimCenter;

describe('profiles', () => {
  it('ship easy, fair and hard with the Appendix C numbers', () => {
    expect(AI_PROFILES.fair).toMatchObject({
      reactionTicks: 15,
      shootThreshold: 0.55,
      passBias: 0.1,
      perceptionNoise: 0.08,
      stealRate: 0.4,
      shoveRate: 0.3,
      turboThreshold: 0.4,
    });
    expect(AI_PROFILES.easy.reactionTicks).toBe(24);
    expect(AI_PROFILES.hard.reactionTicks).toBe(8);
    expect(AI_PROFILES.easy.shootThreshold).toBeGreaterThan(AI_PROFILES.hard.shootThreshold);
    expect(AI_PROFILES.easy.stealRate).toBeLessThan(AI_PROFILES.hard.stealRate);
  });
  it('validates ids', () => {
    expect(isAiProfileId('fair')).toBe(true);
    expect(isAiProfileId('brutal')).toBe(false);
  });
});

describe('memory', () => {
  it('seeds a distinct RNG per player from the match seed, deterministically', () => {
    expect(hashSeed(1, 'home2')).toBe(hashSeed(1, 'home2'));
    expect(hashSeed(1, 'home2')).not.toBe(hashSeed(1, 'away1'));
    expect(hashSeed(1, 'home2')).not.toBe(hashSeed(2, 'home2'));
    const a = createAiMemory('home2', 1, 1, true);
    const b = createAiMemory('home2', 1, 1, true);
    expect(nextFloat(a.rng)).toBe(nextFloat(b.rng));
  });

  it('starts planning at its offset and resets goals but keeps the RNG stream', () => {
    const m = createAiMemory('away1', 5, 2, false);
    expect(m.nextDecisionTick).toBe(2);
    expect(m.goal).toEqual({ kind: 'idle' });
    expect(m.favourTeammate).toBe(false);
    nextFloat(m.rng);
    const rngAfterDraw = m.rng.seed;
    m.goal = { kind: 'chase' };
    m.markId = 'home1';
    m.laneClosedCount = 2;
    m.pressedLastTick = true;
    resetAiMemory(m, 600);
    expect(m.goal).toEqual({ kind: 'idle' });
    expect(m.markId).toBeNull();
    expect(m.laneClosedCount).toBe(0);
    expect(m.pressedLastTick).toBe(false);
    expect(m.nextDecisionTick).toBe(602);
    expect(m.rng.seed).toBe(rngAfterDraw);
  });

  it('is plain data', () => {
    const m = createAiMemory('home2', 1, 0, true);
    expect(structuredClone(m)).toEqual(m);
  });
});

describe('spots', () => {
  it('names six spots around the hoop, all on the attacking half and inside the court', () => {
    expect(SPOT_NAMES).toHaveLength(6);
    for (const name of SPOT_NAMES) {
      const s = namedSpot(hoop, name);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(court.playArea.length / 2);
      expect(Math.abs(s.z)).toBeLessThan(court.playArea.width / 2);
    }
    expect(namedSpot(hoop, 'leftCorner').z).toBeLessThan(0);
    expect(namedSpot(hoop, 'rightCorner').z).toBeGreaterThan(0);
    expect(namedSpot(hoop, 'top').z).toBe(0);
    expect(
      Math.hypot(namedSpot(hoop, 'underBasket').x - rim.x, namedSpot(hoop, 'underBasket').z),
    ).toBeLessThan(1.5);
    // Mirrored on the other hoop.
    const other = hoopGeometry(court, 0);
    expect(namedSpot(other, 'top').x).toBeCloseTo(-namedSpot(hoop, 'top').x);
  });

  it('scores openness minus the lane and handler penalties', () => {
    const handler = { x: rim.x - 7, y: 0, z: 0 };
    const wing = namedSpot(hoop, 'rightWing');
    const open = scoreSpot(wing, handler, rim, []);
    const guarded = scoreSpot(wing, handler, rim, [{ x: wing.x, y: 0, z: wing.z + 0.5 }]);
    expect(open).toBeGreaterThan(guarded);
    // A spot on the handler→rim line is penalised.
    const onLane = { x: rim.x - 3.5, y: 0, z: 0 };
    expect(scoreSpot(onLane, handler, rim, [])).toBeLessThan(scoreSpot(wing, handler, rim, []));
    // A spot next to the handler is penalised.
    const nextToHandler = { x: handler.x + 1, y: 0, z: 1 };
    expect(scoreSpot(nextToHandler, handler, rim, [])).toBeLessThan(open);
  });

  it('picks the open side and keeps the current spot unless another wins by the hysteresis', () => {
    const handler = { x: rim.x - 7, y: 0, z: 0 };
    const leftWing = namedSpot(hoop, 'leftWing');
    const rightWing = namedSpot(hoop, 'rightWing');
    // Opponents on the right side: the pick is on the left.
    const opponents = [
      { x: rightWing.x, y: 0, z: rightWing.z },
      { x: namedSpot(hoop, 'rightCorner').x, y: 0, z: namedSpot(hoop, 'rightCorner').z },
    ];
    const pick = pickOpenSpot(hoop, handler, opponents, null);
    expect(pick.spot.z).toBeLessThan(0);
    // Holding the right wing with a marginally better left wing: stay.
    const slightly = [{ x: rightWing.x, y: 0, z: rightWing.z + 5 }];
    const stay = pickOpenSpot(hoop, handler, slightly, { name: 'rightWing', spot: rightWing });
    expect(stay.name).toBe('rightWing');
    // Clearly better elsewhere: move.
    const move = pickOpenSpot(hoop, handler, opponents, { name: 'rightWing', spot: rightWing });
    expect(move.name).not.toBe('rightWing');
    void leftWing;
  });

  it('farthestSpot ignores the handler and maximises distance from the defenders', () => {
    const defenders = [
      { x: rim.x - 2, y: 0, z: 0 },
      { x: rim.x - 5, y: 0, z: 4 },
    ];
    const pick = farthestSpot(hoop, defenders);
    expect(pick.spot.z).toBeLessThan(0);
  });
});

describe('steering', () => {
  const fake = (turbo: number): PlayerState =>
    ({ turbo, stats: { ...DEFAULT_STATS } }) as unknown as PlayerState;

  it('returns a unit step towards the target and zero inside the arrive radius', () => {
    const step = steerTowards({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 });
    expect(step.x).toBeCloseTo(0.6);
    expect(step.y).toBeCloseTo(0.8);
    expect(steerTowards({ x: 0, y: 0, z: 0 }, { x: 0.2, y: 0, z: 0.1 })).toEqual({ x: 0, y: 0 });
  });

  it('asks for turbo only far away and with enough bar for the profile', () => {
    expect(wantsTurbo(fake(0.9), 6, AI_PROFILES.fair)).toBe(true);
    expect(wantsTurbo(fake(0.3), 6, AI_PROFILES.fair)).toBe(false);
    expect(wantsTurbo(fake(0.9), 2, AI_PROFILES.fair)).toBe(false);
    expect(wantsTurbo(fake(0.3), 6, AI_PROFILES.hard)).toBe(true);
  });
});
