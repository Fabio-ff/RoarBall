import { describe, expect, it } from 'vitest';
import { buttonsOf, justPressed } from '../../src/sim/buttons';
import { NO_BUTTONS, NO_INTENT } from '../../src/sim/types';

describe('buttons', () => {
  it('extracts the four buttons from an intent', () => {
    expect(buttonsOf({ ...NO_INTENT, action: true, turbo: true })).toEqual({
      action: true,
      pass: false,
      special: false,
      turbo: true,
    });
  });

  it('detects a press only on the rising edge', () => {
    const held = { ...NO_INTENT, action: true };
    expect(justPressed(NO_BUTTONS, held, 'action')).toBe(true);
    expect(justPressed({ ...NO_BUTTONS, action: true }, held, 'action')).toBe(false);
    expect(justPressed(NO_BUTTONS, NO_INTENT, 'action')).toBe(false);
  });
});
