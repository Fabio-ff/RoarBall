import { describe, expect, it } from 'vitest';
import { InputManager, isNeutral, mergeIntents, stickToCourt } from '../../src/input/input-manager';
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
    expect(i.move.x).toBeCloseTo(0);
    expect(i.move.y).toBeCloseTo(-1); // stick up → −Z after stickToCourt at yaw 0
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

  it('maps stick space to court space for the +Z broadcast camera (yaw 0)', () => {
    const right = new InputManager([
      fake('keyboard', () => ({ ...NO_INTENT, move: { x: 1, y: 0 } })),
    ]);
    const r = right.sample().move;
    expect(r.x).toBeCloseTo(1); // stick right → +X, which is screen right for a camera on +Z
    expect(r.y).toBeCloseTo(0);
    const up = new InputManager([fake('keyboard', () => ({ ...NO_INTENT, move: { x: 0, y: 1 } }))]);
    const u = up.sample().move;
    expect(u.x).toBeCloseTo(0);
    expect(u.y).toBeCloseTo(-1); // stick up → −Z, away from the camera
  });

  it('follows the camera yaw: at yaw PI the camera is on −Z and both axes flip', () => {
    const m = new InputManager([fake('keyboard', () => ({ ...NO_INTENT, move: { x: 1, y: 1 } }))]);
    m.cameraYaw = Math.PI;
    const i = m.sample().move;
    expect(i.x).toBeCloseTo(-1);
    expect(i.y).toBeCloseTo(1);
  });
});

describe('stickToCourt', () => {
  it('is a reflection of y at yaw 0', () => {
    const c = stickToCourt({ x: 0.6, y: 0.8 }, 0);
    expect(c.x).toBeCloseTo(0.6);
    expect(c.y).toBeCloseTo(-0.8);
  });

  it('preserves length', () => {
    const c = stickToCourt({ x: 0.6, y: 0.8 }, 1.234);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(1);
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
