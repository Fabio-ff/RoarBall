import { describe, expect, it } from 'vitest';
import { AudioDirector, sfxFor } from '../../src/audio/director';
import type { AudioSink, SfxName } from '../../src/audio/sink';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchState } from '../../src/sim/types';

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

  it('plays the buzzer when regulation ends tied and overtime begins (M6)', () => {
    const rec = new Recorder();
    const director = new AudioDirector(() => rec);
    const court = getCourt('gym');
    const base = createMatch(
      {
        durationMs: 180_000,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: [],
        courtId: 'gym',
        mode: 'match',
      },
      court,
      [
        { id: 'home1', team: 0, characterId: 'rook', character: getCharacter('rook') },
        { id: 'away1', team: 1, characterId: 'rook', character: getCharacter('rook') },
      ],
    );
    director.update(base, { ...base, overtime: true }, 1);
    expect(rec.sfx.map(([n]) => n)).toEqual(['buzzer']);
    director.update({ ...base, overtime: true }, { ...base, overtime: true }, 2);
    expect(rec.sfx.map(([n]) => n)).toEqual(['buzzer']);
  });

  describe('shoe squeaks', () => {
    const court = getCourt('gym');
    const options = {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed: 1,
      ruleIds: [] as string[],
      courtId: 'gym',
      mode: 'match' as const,
    };

    /** Runs the real sim: the human turbo-runs in +X for 40 ticks, then in `second` (a cut). */
    const squeaks = (second: { x: number; y: number }): number => {
      const rec = new Recorder();
      const director = new AudioDirector(() => rec);
      let state = createMatch(options, court, [
        { id: 'home1', team: 0, characterId: 'rook', character: getCharacter('rook') },
        { id: 'away1', team: 1, characterId: 'rook', character: getCharacter('rook') },
      ]);
      for (let i = 0; i < 400 && state.phase !== 'live'; i++) {
        state = tick(state, new Map(), court).state;
      }
      expect(state.phase).toBe('live');
      for (let i = 0; i < 80; i++) {
        const move = i < 40 ? { x: 1, y: 0 } : second;
        const intents = new Map([['home1', { ...NO_INTENT, move, turbo: true }]]);
        const prev = state;
        state = tick(state, intents, court).state;
        director.update(prev, state, state.tick / 60);
      }
      return rec.sfx.filter(([n]) => n === 'squeak').length;
    };

    it('plays when a running player cuts 90 degrees, and not on a straight run', () => {
      expect(squeaks({ x: 0, y: 1 })).toBeGreaterThanOrEqual(1);
      expect(squeaks({ x: 1, y: 0 })).toBe(0);
    });

    it('is throttled to once per 0.25 s per player', () => {
      const rec = new Recorder();
      const director = new AudioDirector(() => rec);
      const base = createMatch(options, court, [
        { id: 'home1', team: 0, characterId: 'rook', character: getCharacter('rook') },
      ]);
      const at = (x: number): MatchState => {
        const s = structuredClone(base);
        const p = s.teams[0].players[0];
        if (p) {
          p.vel = { x, y: 0, z: 0 };
          p.onGround = true;
        }
        return s;
      };
      // Alternating direction every tick: every full window is a reversal, but time barely moves.
      for (let i = 0; i < 60; i++) director.update(at(0), at(i % 24 < 12 ? 5 : -5), i / 60);
      const n = rec.sfx.filter(([name]) => name === 'squeak').length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    });
  });
});
