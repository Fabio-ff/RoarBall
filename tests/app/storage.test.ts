import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type StorageLike,
} from '../../src/app/storage';

function memory(
  initial: Record<string, string> = {},
): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? (data[k] ?? null) : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('settings storage (spec E.2)', () => {
  it('returns defaults when nothing is stored, storage is null, or it throws', () => {
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      sound: true,
      music: true,
      vibration: true,
      reduceMotion: false,
    });
  });

  it('round-trips under a versioned key', () => {
    const store = memory();
    saveSettings({ sound: false, music: true, vibration: false, reduceMotion: true }, store);
    expect(Object.keys(store.data)).toEqual(['roarball.settings.v1']);
    expect(loadSettings(store)).toEqual({
      sound: false,
      music: true,
      vibration: false,
      reduceMotion: true,
    });
  });

  it('falls back field by field on corrupt or mistyped data', () => {
    expect(loadSettings(memory({ 'roarball.settings.v1': '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(
      loadSettings(memory({ 'roarball.settings.v1': '{"sound":"no","music":false,"extra":1}' })),
    ).toEqual({ ...DEFAULT_SETTINGS, music: false });
    expect(loadSettings(memory({ 'roarball.settings.v1': '[1,2]' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('never throws when saving fails', () => {
    expect(() => saveSettings(DEFAULT_SETTINGS, throwing)).not.toThrow();
    expect(() => saveSettings(DEFAULT_SETTINGS, null)).not.toThrow();
  });
});
