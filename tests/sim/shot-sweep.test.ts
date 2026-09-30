import { beforeAll, describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchState, type MissType, type PlayerIntent } from '../../src/sim/types';

/**
 * The shooting contract: over any distance band and approach angle, the actual basket rate
 * through the full tick pipeline stays close to `shotQuality`. Misses may rattle in now and then,
 * but no miss type may score systematically (a fixed on/off switch by distance).
 */

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1);
const press: PlayerIntent = { ...NO_INTENT, action: true };

const MIN_DISTANCE = 2.6;
const MAX_DISTANCE = 26;
const DISTANCE_STEP = 0.4;
const ANGLES_DEG = [0, 45, -45] as const;
const SEEDS_PER_CELL = 40;
const MAX_TICKS = 300;

interface ShotRecord {
  /** Nominal distance; at ±45° beyond ~10.6 m the shooter is clamped to the sideline. */
  distance: number;
  angle: number;
  quality: number;
  missType: MissType | null;
  scored: boolean;
}

/** A standing jump shot at hoop 1 from `distance` m and `angleDeg` around the rim centre. */
function shoot(distance: number, angleDeg: number, seed: number): ShotRecord {
  let state: MatchState = createMatch(
    { durationMs: 600_000, shotClockMs: 14_000, seed, ruleIds: [], courtId: 'gym', mode: 'match' },
    court,
    [{ id: 'p', team: 0, characterId: 'placeholder' }],
  );
  state = tick(state, new Map(), court).state; // tip-off
  const p = findPlayer(state, 'p');
  if (!p) throw new Error('no player');
  const a = (angleDeg * Math.PI) / 180;
  const rim = hoop.rimCenter;
  p.pos = { x: rim.x - distance * Math.cos(a), y: 0, z: rim.z + distance * Math.sin(a) };
  p.facing = Math.atan2(rim.x - p.pos.x, rim.z - p.pos.z);
  giveBall(state, p, []);

  const intents = new Map([['p', press]]);
  let quality = Number.NaN;
  let missType: MissType | null = null;
  let released = false;
  let scored = false;
  for (let i = 0; i < MAX_TICKS && !scored; i++) {
    const result = tick(state, intents, court);
    state = result.state;
    for (const e of result.events) {
      if (e.type === 'shotReleased') {
        released = true;
        quality = e.quality;
        missType = e.missType;
      }
      if (e.type === 'basket') scored = true;
    }
    const { ball } = state;
    if (released && ball.mode === 'free' && ball.pos.y < 0.5) break;
    // The shooter caught their own rebound after the pickup cooldown.
    if (released && ball.mode === 'held') break;
  }
  if (!released) throw new Error(`no release at ${distance} m, ${angleDeg}°`);
  return { distance, angle: angleDeg, quality, missType, scored };
}

function rate(records: readonly ShotRecord[]): { basket: number; quality: number } {
  const n = records.length;
  return {
    basket: records.filter((r) => r.scored).length / n,
    quality: records.reduce((sum, r) => sum + r.quality, 0) / n,
  };
}

const bucketOf = (r: ShotRecord): number => Math.floor(r.distance + 1e-9);

describe('shot sweep: basket rate tracks shotQuality through tick', () => {
  const records: ShotRecord[] = [];

  beforeAll(() => {
    // Distinct seeds per (distance, angle) cell: with shared seeds, every cell would see the
    // same miss-type sequence and a whole miss type could go unsampled.
    let seed = 1;
    for (const angle of ANGLES_DEG) {
      for (let i = 0; MIN_DISTANCE + i * DISTANCE_STEP <= MAX_DISTANCE + 1e-9; i++) {
        const distance = MIN_DISTANCE + i * DISTANCE_STEP;
        for (let k = 0; k < SEEDS_PER_CELL; k++) records.push(shoot(distance, angle, seed++));
      }
    }
  }, 120_000);

  it('overall basket rate is within 0.05 of the mean quality', () => {
    const { basket, quality } = rate(records);
    expect(Math.abs(basket - quality)).toBeLessThan(0.05);
  });

  it('per 1 m bucket and angle, basket rate is within 0.15 of the mean quality', () => {
    const offenders: string[] = [];
    for (const angle of ANGLES_DEG) {
      for (let bucket = Math.floor(MIN_DISTANCE); bucket <= MAX_DISTANCE; bucket++) {
        const cell = records.filter((r) => r.angle === angle && bucketOf(r) === bucket);
        if (cell.length === 0) continue;
        const { basket, quality } = rate(cell);
        if (Math.abs(basket - quality) >= 0.15) {
          offenders.push(`${bucket} m @ ${angle}°: ${basket.toFixed(2)} vs ${quality.toFixed(2)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no miss type scores systematically: < 35% bounce-ins per bucket, angle and miss type', () => {
    const offenders: string[] = [];
    const missTypes: MissType[] = ['frontRim', 'backRim', 'sideRim', 'board'];
    for (const angle of ANGLES_DEG) {
      for (let bucket = Math.floor(MIN_DISTANCE); bucket <= MAX_DISTANCE; bucket++) {
        for (const missType of missTypes) {
          const misses = records.filter(
            (r) => r.angle === angle && bucketOf(r) === bucket && r.missType === missType,
          );
          if (misses.length === 0) continue;
          const bounceIns = misses.filter((r) => r.scored).length / misses.length;
          if (bounceIns >= 0.35) {
            offenders.push(`${bucket} m @ ${angle}° ${missType}: ${bounceIns.toFixed(2)}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
