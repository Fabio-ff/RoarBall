import { describe, expect, it, vi } from 'vitest';
import {
  applyDeadZone,
  GamepadBackend,
  playRumble,
  readPad,
  rumbleFor,
} from '../../src/input/gamepad';

function pad(
  index: number,
  opts: { axes?: number[]; pressed?: number[]; values?: Record<number, number> } = {},
): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: opts.pressed?.includes(i) ?? false,
    touched: false,
    value: opts.values?.[i] ?? (opts.pressed?.includes(i) ? 1 : 0),
  }));
  return {
    index,
    id: `pad${index}`,
    connected: true,
    mapping: 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons,
    timestamp: 0,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('applyDeadZone (radial 0.2, rescaled)', () => {
  it('zeroes inside the dead zone and rescales outside so the edge is continuous', () => {
    expect(applyDeadZone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const half = applyDeadZone(0.6, 0);
    expect(half.x).toBeCloseTo(0.5);
    const full = applyDeadZone(1, 0);
    expect(full.x).toBeCloseTo(1);
    const diag = applyDeadZone(1, 1);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1); // clamped to the unit circle
  });
});

describe('readPad (spec E.3 standard mapping)', () => {
  it('maps A action, X pass, Y special, RT or B turbo, Start', () => {
    expect(readPad(pad(0, { pressed: [0] }))).toMatchObject({ action: true, pass: false });
    expect(readPad(pad(0, { pressed: [2] })).pass).toBe(true);
    expect(readPad(pad(0, { pressed: [3] })).special).toBe(true);
    expect(readPad(pad(0, { pressed: [1] })).turbo).toBe(true);
    expect(readPad(pad(0, { values: { 7: 0.8 } })).turbo).toBe(true);
    expect(readPad(pad(0, { values: { 7: 0.3 } })).turbo).toBe(false);
    expect(readPad(pad(0, { pressed: [9] })).start).toBe(true);
  });

  it('stick up is +y; the D-pad overrides a neutral stick', () => {
    expect(readPad(pad(0, { axes: [0, -1, 0, 0] })).move.y).toBeCloseTo(1);
    expect(readPad(pad(0, { pressed: [15] })).move).toEqual({ x: 1, y: 0 });
    const diag = readPad(pad(0, { pressed: [12, 14] })).move;
    expect(diag.x).toBeCloseTo(-Math.SQRT1_2);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('GamepadBackend (hot-plug, most recent pad drives)', () => {
  it('is neutral with no pads and follows the pad pressed last', () => {
    let pads: (Gamepad | null)[] = [];
    const backend = new GamepadBackend(() => pads);
    expect(backend.sample()).toMatchObject({ action: false, move: { x: 0, y: 0 } });
    pads = [pad(0, { pressed: [0] }), null];
    expect(backend.sample().action).toBe(true);
    pads = [pad(0), pad(1, { pressed: [2] })];
    expect(backend.sample().pass).toBe(true);
    expect(backend.activePad()?.index).toBe(1);
    pads = [pad(0, { axes: [0.1, 0, 0, 0] }), pad(1)];
    expect(backend.sample().move).toEqual({ x: 0, y: 0 }); // pad 0 drifts inside the dead zone: pad 1 stays active
    expect(backend.activePad()?.index).toBe(1);
  });

  it('a pad that disconnects drops back to neutral', () => {
    let pads: (Gamepad | null)[] = [pad(0, { pressed: [0] })];
    const backend = new GamepadBackend(() => pads);
    backend.sample();
    pads = [null];
    expect(backend.sample().action).toBe(false);
    expect(backend.activePad()).toBeNull();
  });

  it('ignores a pad with connected === false', () => {
    const gone = { ...pad(0, { pressed: [0] }), connected: false } as Gamepad;
    const backend = new GamepadBackend(() => [gone]);
    expect(backend.sample().action).toBe(false);
    expect(backend.activePad()).toBeNull();
  });

  it('survives a pad source that throws (no Gamepad API)', () => {
    const backend = new GamepadBackend(() => {
      throw new Error('not supported');
    });
    expect(backend.sample().action).toBe(false);
  });
});

describe('rumbleFor (plan decision 17)', () => {
  it('rumbles on own-team dunks, blocks suffered, knockdowns suffered and own Earthquake', () => {
    expect(
      rumbleFor(
        { type: 'basket', playerId: 'home2', team: 0, points: 2, shotType: 'dunk' },
        'home1',
        0,
      ),
    ).toEqual({ ms: 200, strong: 0.6, weak: 0.3 });
    expect(
      rumbleFor(
        { type: 'basket', playerId: 'away1', team: 1, points: 2, shotType: 'dunk' },
        'home1',
        0,
      ),
    ).toBeNull();
    expect(rumbleFor({ type: 'block', by: 'away1', shooter: 'home1' }, 'home1', 0)).toEqual({
      ms: 150,
      strong: 0.4,
      weak: 0.6,
    });
    expect(rumbleFor({ type: 'knockdown', by: 'away1', target: 'home1' }, 'home1', 0)).toEqual({
      ms: 300,
      strong: 1,
      weak: 0.5,
    });
    expect(
      rumbleFor(
        { type: 'abilityActivated', playerId: 'home1', abilityId: 'earthquake' },
        'home1',
        0,
      ),
    ).toEqual({ ms: 400, strong: 1, weak: 1 });
    expect(
      rumbleFor(
        { type: 'abilityActivated', playerId: 'away1', abilityId: 'earthquake' },
        'home1',
        0,
      ),
    ).toBeNull();
    expect(rumbleFor({ type: 'rimHit' }, 'home1', 0)).toBeNull();
  });

  it('playRumble uses dual-rumble and never throws', () => {
    const playEffect = vi.fn(() => Promise.resolve('complete'));
    const p = { vibrationActuator: { playEffect } } as unknown as Gamepad;
    playRumble(p, { ms: 200, strong: 0.6, weak: 0.3 });
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: 200,
      strongMagnitude: 0.6,
      weakMagnitude: 0.3,
      startDelay: 0,
    });
    const broken = {
      vibrationActuator: {
        playEffect: () => {
          throw new Error('x');
        },
      },
    } as unknown as Gamepad;
    expect(() => playRumble(broken, { ms: 1, strong: 1, weak: 1 })).not.toThrow();
    expect(() => playRumble(null, { ms: 1, strong: 1, weak: 1 })).not.toThrow();
  });
});
