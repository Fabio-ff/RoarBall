import { sanitizeSetup, type SetupChoice } from './setup-model';

/** Spec E.2: conveniences in localStorage. Blocked or corrupt storage falls back to defaults. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  sound: true,
  music: true,
  vibration: true,
  reduceMotion: false,
});

const SETTINGS_KEY = 'roarball.settings.v1';

/** `window.localStorage`, or null where reading the property itself throws (some private modes). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Parsed JSON object, or null for missing, unreadable, non-object data. */
export function readJson(store: StorageLike | null, key: string): Record<string, unknown> | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function writeJson(store: StorageLike | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the setting simply is not remembered.
  }
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function loadSettings(store: StorageLike | null = browserStorage()): Settings {
  const raw = readJson(store, SETTINGS_KEY) ?? {};
  return {
    sound: bool(raw.sound, DEFAULT_SETTINGS.sound),
    music: bool(raw.music, DEFAULT_SETTINGS.music),
    vibration: bool(raw.vibration, DEFAULT_SETTINGS.vibration),
    reduceMotion: bool(raw.reduceMotion, DEFAULT_SETTINGS.reduceMotion),
  };
}

export function saveSettings(
  settings: Settings,
  store: StorageLike | null = browserStorage(),
): void {
  writeJson(store, SETTINGS_KEY, settings);
}

const SETUP_KEY = 'roarball.setup.v1';

export function loadSetup(store: StorageLike | null = browserStorage()): SetupChoice {
  return sanitizeSetup(readJson(store, SETUP_KEY));
}

export function saveSetup(setup: SetupChoice, store: StorageLike | null = browserStorage()): void {
  writeJson(store, SETUP_KEY, setup);
}
