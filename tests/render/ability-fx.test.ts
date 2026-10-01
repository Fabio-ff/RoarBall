import { describe, expect, it } from 'vitest';
import { AbilityFxView, EARTHQUAKE_RADIUS, ShockwavePool } from '../../src/render/ability-fx';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import type { PlayerState } from '../../src/sim/types';

const base = createMatch(
  {
    durationMs: 180_000,
    shotClockMs: 14_000,
    seed: 1,
    ruleIds: ['shotClock'],
    courtId: 'gym',
    mode: 'match',
  },
  getCourt('gym'),
  [
    { id: 'home1', team: 0, characterId: 'brick', character: getCharacter('brick') },
    { id: 'away1', team: 1, characterId: 'ace', character: getCharacter('ace') },
  ],
).teams[0].players[0] as PlayerState;
const with_ = (abilityId: string, ability: PlayerState['ability']): PlayerState => ({
  ...base,
  abilityId,
  ability,
});
const visibleNames = (fx: AbilityFxView): string[] =>
  fx.group.children
    .filter((c) => c.visible)
    .map((c) => c.name)
    .sort();

describe('AbilityFxView (plan decision 27)', () => {
  it('shows nothing without an active ability', () => {
    const fx = new AbilityFxView();
    fx.update(with_('rocketDunk', null), base.pos, 0.016);
    expect(visibleNames(fx)).toEqual([]);
  });
  it('Rocket Dunk shows the flame aura', () => {
    const fx = new AbilityFxView();
    fx.update(with_('rocketDunk', { ticksLeft: 100, uses: 0 }), base.pos, 0.016);
    expect(visibleNames(fx)).toEqual(['rocketAura']);
  });
  it('Hot Hand shows glowing hands and one ring segment per remaining use', () => {
    const fx = new AbilityFxView();
    fx.update(with_('hotHand', { ticksLeft: null, uses: 2 }), base.pos, 0.016);
    expect(visibleNames(fx)).toEqual(['hotHands', 'hotRing0', 'hotRing1']);
  });
  it('Blur shows three ghosts once it has history', () => {
    const fx = new AbilityFxView();
    for (let i = 0; i < 12; i++)
      fx.update(with_('blur', { ticksLeft: 100, uses: 0 }), { x: i * 0.2, y: 0, z: 0 }, 0.016);
    expect(visibleNames(fx)).toEqual(['blurGhost0', 'blurGhost1', 'blurGhost2']);
  });
  it('hides everything again when the ability ends and follows the player', () => {
    const fx = new AbilityFxView();
    fx.update(with_('rocketDunk', { ticksLeft: 5, uses: 0 }), { x: 3, y: 0, z: 2 }, 0.016);
    expect(fx.group.position.x).toBe(3);
    expect(fx.group.position.z).toBe(2);
    fx.update(with_('rocketDunk', null), { x: 3, y: 0, z: 2 }, 0.016);
    expect(visibleNames(fx)).toEqual([]);
  });
});

describe('ShockwavePool', () => {
  it('grows to the Earthquake radius in 0.5 s, then disappears', () => {
    const pool = new ShockwavePool();
    pool.spawn({ x: 1, y: 0, z: 2 });
    pool.update(0.25);
    const ring = pool.group.children.find((c) => c.visible);
    expect(ring?.scale.x).toBeCloseTo(EARTHQUAKE_RADIUS / 2, 1);
    pool.update(0.3);
    expect(pool.group.children.some((c) => c.visible)).toBe(false);
  });
});
