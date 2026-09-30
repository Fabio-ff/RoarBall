import { describe, expect, it } from 'vitest';
import { InputManager, isNeutral, mergeIntents } from '../../src/input/input-manager';
import type { InputBackend } from '../../src/input/types';
import { NO_INTENT, type PlayerIntent } from '../../src/sim/types';

function fake(kind: InputBackend['kind'], intent: () => PlayerIntent): InputBackend {
  return { kind, sample: intent, dispose: () => {} };
}

const moveUp: PlayerIntent = { ...NO_INTENT, move: { x: 0, y: 1 } };

describe('InputManager', () => {
  it('returns a neutral intent when no backend is active', () => {
    const m = new InputManager([fake('keyboard', () => ({ ...NO_INTENT }))]);
    expect(isNeutral(m.sample())).toBe(true);
    expect(m.activeKind).toBeNull();
  });

  it('merges buttons across backends and takes the first non-zero move', () => {
    const m = new InputManager([
      fake('keyboard', () => ({ ...NO_INTENT, action: true })),
      fake('touch', () => moveUp),
    ]);
    const i = m.sample();
    expect(i.action).toBe(true);
    expect(i.move).toEqual({ x: 0, y: 1 });
  });

  it('tracks the active backend kind and notifies on change', () => {
    let current: PlayerIntent = { ...NO_INTENT };
    const seen: string[] = [];
    const m = new InputManager([
      fake('keyboard', () => ({ ...NO_INTENT })),
      fake('touch', () => current),
    ]);
    m.onActiveKindChange = (k) => seen.push(k);
    m.sample();
    current = moveUp;
    m.sample();
    m.sample();
    expect(m.activeKind).toBe('touch');
    expect(seen).toEqual(['touch']);
  });

  it('rotates the move vector by the camera yaw', () => {
    const m = new InputManager([fake('keyboard', () => ({ ...NO_INTENT, move: { x: 1, y: 0 } }))]);
    m.cameraYaw = Math.PI / 2;
    const i = m.sample();
    expect(i.move.x).toBeCloseTo(0);
    expect(i.move.y).toBeCloseTo(1);
  });
});

describe('mergeIntents', () => {
  it('ORs the buttons', () => {
    const r = mergeIntents({ ...NO_INTENT, pass: true }, { ...NO_INTENT, turbo: true });
    expect(r.pass).toBe(true);
    expect(r.turbo).toBe(true);
    expect(r.action).toBe(false);
  });
});
