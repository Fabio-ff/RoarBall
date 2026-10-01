import { describe, expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { brighten, highlightPulse, PlayerView } from '../../src/render/player-view';
import type { PlayerState } from '../../src/sim/types';

const base = {
  id: 'p0',
  team: 0,
  characterId: 'rook',
  pos: { x: 0, y: 0, z: 0 },
  facing: 0,
  vel: { x: 0, y: 0, z: 0 },
  onGround: true,
  action: 'idle',
  actionTicks: 0,
} as unknown as PlayerState;

const state = (y: number): PlayerState => ({ ...base, pos: { x: 0, y, z: 0 } });

const ringOf = (view: PlayerView): Mesh | undefined =>
  view.group.children.find(
    (c): c is Mesh => c instanceof Mesh && c.geometry.type === 'RingGeometry',
  );

describe('highlightPulse', () => {
  it('stays within [1, 1.1] and is not constant', () => {
    const values = Array.from({ length: 200 }, (_, t) => highlightPulse(t));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(1.1);
    }
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe('brighten', () => {
  it('moves every channel toward white without overflowing', () => {
    const c = 0x2f80ed;
    const b = brighten(c, 0.4);
    for (const shift of [16, 8, 0]) {
      const before = (c >> shift) & 0xff;
      const after = (b >> shift) & 0xff;
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after).toBeLessThanOrEqual(255);
    }
  });

  it('is the identity at amount 0', () => {
    expect(brighten(0x2f80ed, 0)).toBe(0x2f80ed);
  });
});

describe('PlayerView highlight ring', () => {
  it('adds a ring only when highlighted', () => {
    expect(ringOf(new PlayerView(0x2f80ed, { highlighted: true }))).toBeDefined();
    expect(ringOf(new PlayerView(0x2f80ed))).toBeUndefined();
  });

  it('keeps the ring on the floor while the player is airborne', () => {
    const view = new PlayerView(0x2f80ed, { highlighted: true });
    view.update(state(0.8), state(0.8), 1, 5);
    const ring = ringOf(view)!;
    expect(view.group.position.y).toBeCloseTo(0.8);
    expect(ring.getWorldPosition(new Vector3()).y).toBeCloseTo(0.01);
  });
});
