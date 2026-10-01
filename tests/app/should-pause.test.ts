import { describe, expect, it } from 'vitest';
import { shouldPause } from '../../src/app/match-screen';

describe('shouldPause (during play)', () => {
  it('Start/P pause from any source; Escape pauses; a gamepad B (turbo) does not', () => {
    expect(shouldPause('pause', 'gamepad')).toBe(true);
    expect(shouldPause('pause', 'keyboard')).toBe(true);
    expect(shouldPause('back', 'keyboard')).toBe(true);
    expect(shouldPause('back', 'gamepad')).toBe(false);
    expect(shouldPause('confirm', 'keyboard')).toBe(false);
    expect(shouldPause('up', 'gamepad')).toBe(false);
  });
});
