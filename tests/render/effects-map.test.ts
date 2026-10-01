import { describe, expect, it } from 'vitest';
import { effectsFor, SHAKE } from '../../src/render/effects-map';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';

const COLORS = [0x2f80ed, 0xeb5757] as const;
const court = getCourt('gym');
const state = createMatch(
  {
    durationMs: 180_000,
    shotClockMs: 14_000,
    seed: 1,
    ruleIds: ['shotClock'],
    courtId: 'gym',
    mode: 'match',
  },
  court,
  [
    { id: 'home1', team: 0, characterId: 'rook', character: getCharacter('rook') },
    { id: 'away1', team: 1, characterId: 'brick', character: getCharacter('brick') },
  ],
);

/** The state on a basket tick: the ball is at the rim of hoop 0 (x < 0) or hoop 1 (x > 0). */
const ballAt = (x: number) => ({ ...state, ball: { ...state.ball, pos: { x, y: 3, z: 0 } } });

describe('effectsFor (spec E.5)', () => {
  it('a 2-point basket is a small burst at the rim the ball went through, in the team colour', () => {
    expect(
      effectsFor(
        { type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' },
        ballAt(12),
        court,
        COLORS,
      ),
    ).toEqual([{ kind: 'burst', at: 'rim', hoop: 1, color: COLORS[0], size: 'small' }]);
  });
  it('threes are big; dunks are big plus rim shake and a medium camera shake', () => {
    expect(
      effectsFor(
        { type: 'basket', playerId: 'away1', team: 1, points: 3, shotType: 'jumpshot' },
        ballAt(-12),
        court,
        COLORS,
      ),
    ).toEqual([{ kind: 'burst', at: 'rim', hoop: 0, color: COLORS[1], size: 'big' }]);
    expect(
      effectsFor(
        { type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' },
        ballAt(12),
        court,
        COLORS,
      ),
    ).toEqual([
      { kind: 'burst', at: 'rim', hoop: 1, color: COLORS[0], size: 'big' },
      { kind: 'rimShake', hoop: 1 },
      { kind: 'shake', strength: SHAKE.dunk },
    ]);
  });
  it('blocks and knockdowns shake lightly; Earthquake shakes hard and sends a shockwave', () => {
    expect(
      effectsFor({ type: 'block', by: 'away1', shooter: 'home1' }, state, court, COLORS),
    ).toEqual([{ kind: 'shake', strength: SHAKE.block }]);
    expect(
      effectsFor({ type: 'knockdown', by: 'away1', target: 'home1' }, state, court, COLORS),
    ).toEqual([{ kind: 'shake', strength: SHAKE.knockdown }]);
    expect(
      effectsFor(
        { type: 'abilityActivated', playerId: 'home1', abilityId: 'earthquake' },
        state,
        court,
        COLORS,
      ),
    ).toEqual([
      { kind: 'flash', playerId: 'home1', color: COLORS[0] },
      { kind: 'shockwave', playerId: 'home1' },
      { kind: 'shake', strength: SHAKE.earthquake },
    ]);
    expect(
      effectsFor(
        { type: 'abilityActivated', playerId: 'away1', abilityId: 'blur' },
        state,
        court,
        COLORS,
      ),
    ).toEqual([{ kind: 'flash', playerId: 'away1', color: COLORS[1] }]);
    expect(effectsFor({ type: 'rimHit' }, state, court, COLORS)).toEqual([]);
  });
});
