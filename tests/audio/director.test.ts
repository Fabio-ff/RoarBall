import { describe, expect, it } from 'vitest';
import { AudioDirector, sfxFor } from '../../src/audio/director';
import type { AudioSink, SfxName } from '../../src/audio/sink';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import type { MatchState } from '../../src/sim/types';

class Recorder implements AudioSink {
  sfx: [SfxName, number][] = [];
  ducks: number[] = [];
  playSfx(name: SfxName, gain = 1): void {
    this.sfx.push([name, gain]);
  }
  setMusic(): void {}
  duck(s: number): void {
    this.ducks.push(s);
  }
  setEnabled(): void {}
}

describe('sfxFor (spec E.4 event map)', () => {
  it('maps every sounding event', () => {
    expect(sfxFor({ type: 'bounce', speed: 8 })).toEqual([{ name: 'bounce', gain: 1 }]);
    expect(sfxFor({ type: 'bounce', speed: 0.4 })).toEqual([{ name: 'bounce', gain: 0.15 }]);
    expect(
      sfxFor({ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }).map(
        (s) => s.name,
      ),
    ).toEqual(['swish', 'crowd']);
    expect(
      sfxFor({ type: 'basket', playerId: 'home1', team: 0, points: 3, shotType: 'jumpshot' }).map(
        (s) => s.name,
      ),
    ).toEqual(['swish', 'crowdBig']);
    expect(
      sfxFor({ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }).map(
        (s) => s.name,
      ),
    ).toEqual(['dunk', 'crowdBig']);
    expect(sfxFor({ type: 'rimHit' })[0]?.name).toBe('rim');
    expect(sfxFor({ type: 'boardHit' })[0]?.name).toBe('board');
    expect(sfxFor({ type: 'pass', from: 'a', to: 'b', lob: false })[0]?.name).toBe('pass');
    expect(sfxFor({ type: 'steal', by: 'a', from: 'b' })[0]?.name).toBe('steal');
    expect(sfxFor({ type: 'intercept', playerId: 'a' })[0]?.name).toBe('steal');
    expect(sfxFor({ type: 'block', by: 'a', shooter: 'b' })[0]?.name).toBe('block');
    expect(sfxFor({ type: 'shove', by: 'a', target: 'b' })[0]?.name).toBe('shove');
    expect(sfxFor({ type: 'knockdown', by: 'a', target: 'b' })[0]?.name).toBe('shove');
    expect(sfxFor({ type: 'shotClockViolation', team: 0 })[0]?.name).toBe('buzzer');
    expect(sfxFor({ type: 'phaseChange', from: 'live', to: 'finished' })[0]?.name).toBe('buzzer');
    expect(sfxFor({ type: 'phaseChange', from: 'scored', to: 'inbound' })).toEqual([]);
    for (const id of ['rocketDunk', 'hotHand', 'blur', 'earthquake'] as const) {
      expect(sfxFor({ type: 'abilityActivated', playerId: 'a', abilityId: id })[0]?.name).toBe(id);
    }
    expect(sfxFor({ type: 'catch', playerId: 'a' })).toEqual([]);
  });
});

describe('AudioDirector', () => {
  it('plays through the current sink and ducks music for dunks and abilities', () => {
    const rec = new Recorder();
    const director = new AudioDirector(() => rec);
    director.handleEvents([
      { type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' },
      { type: 'abilityActivated', playerId: 'home1', abilityId: 'blur' },
    ]);
    expect(rec.sfx.map(([n]) => n)).toEqual(['dunk', 'crowdBig', 'blur']);
    expect(rec.ducks).toEqual([0.8, 1]);
  });

  it('squeaks on a sharp turn at speed, at most every 0.25 s per player (plan decision 21)', () => {
    const rec = new Recorder();
    const director = new AudioDirector(() => rec);
    const court = getCourt('gym');
    const base = createMatch(
      {
        durationMs: 180_000,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: ['shotClock'],
        courtId: 'gym',
        mode: 'match',
      },
      court,
      [{ id: 'home1', team: 0, characterId: 'rook', character: getCharacter('rook') }],
    );
    const withVel = (x: number, z: number, y = 0): MatchState => {
      const s = structuredClone(base);
      const p = s.teams[0].players[0];
      if (p) {
        p.vel = { x, y: 0, z };
        p.onGround = y === 0;
      }
      return s;
    };
    director.update(withVel(5, 0), withVel(0, 5), 1); // 90 degree turn at 5 m/s: squeak
    director.update(withVel(0, 5), withVel(-5, 0), 1.1); // too soon
    director.update(withVel(-5, 0), withVel(0, -5), 1.3); // ok again
    director.update(withVel(1, 0), withVel(0, 1), 2); // too slow
    director.update(withVel(5, 0, 1), withVel(0, 5, 1), 3); // airborne
    expect(rec.sfx.filter(([n]) => n === 'squeak').length).toBe(2);
  });
});
