# RoarBall Phase 6 — Menus, Gamepad, Audio, Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RoarBall becomes a complete small game: a Title → Setup → Match ⇄ Pause → Results flow navigable by touch, mouse, keyboard and gamepad; a gamepad backend with rumble; fully synthesized sound effects and music; and event-driven visual effects — without changing a line of the simulation.

**Architecture:** `app.ts` becomes a screen state machine (`AppShell`) over DOM screens in `src/ui/screens/`. Today's `startGame` body moves into a disposable `MatchScreen` (`src/app/match-screen.ts`) that owns the scene, views, HUD, input and loop and reports a `MatchResult` (with a `BoxScore` built from sim events) when the match ends. A single `MenuInput` (keyboard + gamepad commands) drives `MenuNav` focus in every menu and the pause key in the match. Audio lives in `src/audio/` (Web Audio synthesis: `AudioEngine`, `SfxBank` patches, `MusicPlayer` step sequencer, `AudioDirector` mapping events → sounds). Effects are pooled Three.js objects in `src/render/` driven by a pure `effectsFor(event)` map. Settings and the last setup persist in `localStorage` through a defensive `storage` helper.

**Tech Stack:** unchanged (Vite 8, TypeScript 5.9 strict, Three.js 0.186, Vitest 5 + jsdom, ESLint 10 boundaries). New dev dependency in Task 8 only: `playwright` (headless Chromium smoke test). No runtime dependencies (no Howler: spec E.4).

**Spec:** `docs/superpowers/specs/2026-09-30-roarball-design.md` — **Appendix E (Phase 6 decisions)** first, then §8 (input), §9 (rendering, UI, audio), §10.2 (testing), and D.6 for the HUD this phase builds on.

## Plan decisions

Details the spec leaves open or that the code forced, decided here (one line each, with the reason):

1. Pause is an overlay owned by `MatchScreen`, not a separate shell screen: the scene must stay alive underneath. Shell screens are `title | setup | match | results`.
2. `MatchScreen.pause()` stops the `GameLoop` (`loop.stop()`); `resume()` restarts it. `GameLoop.start()` already resets `lastTime`, so no catch-up burst.
3. One `MenuInput` (`src/input/menu-input.ts`) turns keyboard keys and gamepad edges into `MenuCommand`s (`up down left right confirm back pause`). Menus and the in-match pause key both consume it; the gameplay `GamepadBackend` stays separate (it samples per tick).
4. `MenuNav` (`src/ui/menu-nav.ts`) navigates a grid: each focusable element carries `data-nav-row="<n>"`; up/down change row (keeping the column index clamped), left/right move within the row, confirm clicks the focused element, back calls the screen's `onBack`. Pointer and touch use ordinary `click` handlers on the same elements.
5. Opponent "random" is resolved at START by the app with an injectable `rand: () => number` (default `Math.random`; allowed outside `src/sim`). Teammate and the human's character have no random card (E.1).
6. Court cards show `court.description` and `court.modifier?.name ?? 'No modifier'` (spec E.1 as amended; no new `CourtDef` field, so `src/content` is unchanged).
7. `Settings = { sound, music, vibration, reduceMotion }` (booleans; defaults `true, true, true, false`); mix volumes are constants in `src/audio/engine.ts` (E.2 as amended).
8. Storage keys `roarball.settings.v1` and `roarball.setup.v1`; a stored setup whose ids no longer exist falls back field by field to the defaults.
9. URL shortcuts: `hasMatchParams(search)` is true when any of `mode character teammate opponents court ai seed duration` is present; then the shell starts straight in `match` with `readGameOptions`. Back from that match (Quit, or Results → Title) goes to the Title as usual.
10. `?duration=<seconds>` (integer 5..600) sets `GameOptions.durationMs`; default 180 000 (A.5). `buildSettings` reads it. Only the app changes; the sim already takes `durationMs` from settings.
11. `GameOptions` gains `durationMs`; a setup from the menus always uses 180 000.
12. The game-ending basket's banner: when the phase becomes `finished`, `Hud.tick` first drains the event queue (so "DUNK!" shows for its 1.2 s), then shows the sticky final banner; `MatchScreen` calls `onFinished` **2.5 s** (wall time, frames rendered) after the `finished` phase is first seen.
13. Restart from Pause and Rematch both build a new session with `seed + 1`; C.6's press-to-restart on the final banner is removed (Results replaces it). `primeHeldButtons` stays (Pause → Restart can be confirmed with a held button).
14. `BoxScore` assist rule mirrors the sim's: on `pass` remember `{from, team}` per receiver id; on `catch` by that receiver set `lastCatch = {from, tick}`; `possessionChange` and any `basket` clear every `lastCatch` (after the basket's own check); a `basket` whose scorer has `lastCatch` with `tick − lastCatch.tick ≤ 180` credits `from` with an assist. `intercept` clears the pending pass.
15. `MatchResult = { score, humanTeam, overtime, lines: BoxLine[], options }`; `BoxLine = { id, team, name, points, dunks, threes, assists, steals, blocks, abilityUses }`.
16. Gamepad backend takes an injectable `getPads: () => readonly (Gamepad | null)[]` (default `() => navigator.getGamepads?.() ?? []`). "Most recently pressed pad drives": the backend remembers the index of the last pad with any non-neutral input and samples only that pad.
17. Rumble: `rumbleFor(event, humanId, humanTeam) → { ms, strong, weak } | null` — any `basket` with `shotType === 'dunk'` by the human's team (200 ms, 0.6/0.3), `block` whose `shooter` is the human (150 ms, 0.4/0.6), `knockdown` whose `target` is the human (300 ms, 1.0/0.5), the human's own `abilityActivated` for `earthquake` (400 ms, 1.0/1.0). Played through `pad.vibrationActuator?.playEffect('dual-rumble', …)` in a try/catch.
18. Audio is created lazily by the shell on the first user gesture (`pointerdown` / `keydown` / gamepad button), as `AudioContext` must be resumed inside a gesture on iOS. Before that, `AudioDirector` calls go to a `NullAudioSink`.
19. `AudioSink` is the seam: `{ playSfx(name, opts?), setMusic(track | null), duck(seconds), setEnabled(sound, music) }`. `AudioEngine` implements it with Web Audio; tests use a recording fake.
20. Voice cap 12: the engine keeps active voices with their end time; starting a 13th stops the oldest.
21. Shoe squeak: `AudioDirector.update(prev, next)` plays `squeak` when a player on the ground with speed > 3 m/s turns their velocity by > 70° between consecutive states, at most once per player per 0.25 s.
22. Music tempo/keys: gym 112 bpm A minor funk; rooftop 132 bpm E minor driving; volcano 100 bpm D minor heavy; frozen 120 bpm C major bright; menu 96 bpm F major. 16 steps per bar, 4 bars per loop. Win jingle and lose jingle are one-shot 2-bar patterns.
23. Sequencer scheduling uses the standard look-ahead pattern: a 25 ms `setInterval` schedules every step whose time falls within the next 100 ms (`stepsToSchedule` is pure and tested).
24. Effects: one `BurstPool` (`InstancedMesh`, capacity 300 particles, small boxes), gravity 9.8, life 0.9 s; small burst 24 particles, big 60. Rim shake: the hoop view's rim group rotates ±0.08 rad, decaying over 0.5 s (needs a handle on the rim group from `court-view.ts`).
25. Camera shake: `shakeOffset(time, strength)` = sum of two sines per axis, amplitude `strength × 0.25 m`; strength decays ×e^(−8t); strengths dunk 0.6, earthquake 1.0, block 0.3, knockdown 0.3. `reduceMotion` makes `shake()` a no-op.
26. Ball trail: a `Line` with a 24-point ring buffer of ball positions, visible while `ball.mode === 'flight'` and fading 0.3 s after; colour white, orange (`0xff8a00`) when the flight is a shot by a player whose `ability` is active with id `hotHand` or `rocketDunk` (read from state at `shotReleased`).
27. Ability visuals are one `AbilityFxView` per player keyed by id: Rocket Dunk an additive orange cone above the head, Hot Hand two glowing spheres at the hands and a three-segment floor ring (one segment per remaining use), Blur 3 ghost capsules at positions 3, 6, 9 frames back (opacity 0.35/0.2/0.1); Earthquake an expanding floor ring (0 → 4 m in 0.5 s, the D.3 radius) spawned on `abilityActivated`.
28. Three.js disposal: `disposeObject3D(root)` traverses and disposes every geometry, material (all of an array) and material texture; `MatchScreen.dispose()` calls it on the scene, then `renderer.dispose()` and `renderer.forceContextLoss()`.
29. Smoke test: `playwright` + `scripts/smoke.mjs` against `vite preview`, run in CI as its own step after the build (not part of `npm run check`, which must stay browser-free).
30. Phase 6 never edits `src/sim/` or `src/content/`. Tests under `tests/sim/` change only in Task 8 (test-strength minors, E.6). Every PR's review starts with `git diff origin/main --stat -- src/sim src/content`.

**Spec vs code, resolved:** E.1's `CourtDef.blurb` was replaced by the existing `description` (spec amended before this plan); E.2's volumes became on/off toggles (amended).

## Global Constraints

Everything from the Phase 1–5 plans still applies (60 Hz fixed tick, `src/sim` purity enforced by ESLint + `tsconfig.sim.json` + `tests/lint/boundaries.test.ts`, team 0 on −X attacking +X, camera on +Z, touch targets ≥ 56 px, strict TS, `npm run format && npm run check` green per commit, CI green before every merge). In addition, from Appendix E:

- **No change to `src/sim/` or `src/content/`**; every golden, pinned score and determinism test passes unchanged (E, decision 30).
- Flow: `Title → Setup → Match ⇄ Pause → Results → Rematch (Match) | Change setup (Setup) | Title`; a bare URL opens the Title; any match URL parameter skips the menus (E.1).
- Setup: You, Teammate, Opponents (two slots, each with "random"), Court; difficulty Easy / Fair / Hard, default Fair; duplicates allowed; DOM cards, no 3D previews (E.1).
- Pause: Esc, P, gamepad Start, HUD ⏸; stops the loop; Resume, Restart, Sound, Music, Vibration, Reduce motion, Quit to title; auto-pause when the tab is hidden (E.1).
- Results: final score, WIN / LOSS / OVERTIME WIN, box score (points, dunks, 3-pointers, assists, steals, blocks, ability uses); the final basket's banner shows before Results (E.1).
- Screens: landscape-first, min 56 px targets, safe-area insets, rotate hint in portrait; touch, mouse, keyboard (arrows/Tab + Enter/Space, Esc back), gamepad (stick/D-pad + A, B back) (E.1).
- Storage: last setup + settings in `localStorage`, versioned keys, try/catch + validation, defaults on failure (E.2).
- Gamepad: standard mapping — left stick or D-pad move (radial dead zone 0.2, rescaled), A action, X pass, Y special, RT or B turbo, Start pause; hot-plug; presses latched; rumble on dunk, block suffered, Earthquake; vibration on by default (E.3).
- Audio: synthesized Web Audio only, unlocked on first gesture, 12-voice SFX cap, one music loop per court + menu loop + win/lose jingles, ducking; `audio/` never writes state (E.4).
- Effects: basket bursts (big for threes and dunks, rim shake on dunks), camera shake (off with Reduce motion), ball trail (orange during Hot Hand / Rocket Dunk), ability visuals; pooled; within §7.3 (E.5).
- Testing per E.7.

---

## Execution process

As Phases 1–5: one GitHub issue per task, Sonnet 5.5 implements on `task/<N>-<slug>`, one PR per task, Opus 5.5 reviews on the PR (comment review, first line `VERDICT: …`), merge only after approval **and** green `gh pr checks`, final whole-phase Opus review, hardening if needed, Fable reassessment on the epic. Milestone **"Phase 6 – Menus, gamepad, audio, effects"**, labels `task`, `phase-6`, `epic`. Tasks run in order 1 → 8; each needs the previous one merged. Branches: `task/1-app-shell`, `task/2-setup`, `task/3-results`, `task/4-gamepad`, `task/5-audio-sfx`, `task/6-music`, `task/7-effects`, `task/8-hardening`.

Each implementer runs `npm test -- <file>` while iterating and `npm run format && npm run check` before every commit. Commit messages end with:

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JtcKrCXptNT4ocdP5U9a4d
```

(The `git commit -m` lines below show only the subject; add a blank line and the two trailer lines.)

**Browser check.** Tasks 1–7 change what the player sees or hears. After the PR is opened, the controller (main session) runs `npm run dev` and checks the flow in Chrome via the chrome-devtools MCP (screenshots attached to the PR), as in Phase 5's presentation task.

**DOM tests** start with `// @vitest-environment jsdom` (see `vitest.config.ts`).

## File map

| File | Task | Responsibility |
|---|---|---|
| `src/app/screens.ts` | 1 | Pure screen state machine `transition(screen, event)` |
| `src/app/storage.ts` | 1 (setup fields in 2) | `loadSettings/saveSettings/loadSetup/saveSetup` with a `StorageLike` |
| `src/app/match-screen.ts` | 1 | Today's `startGame` body as a disposable screen with pause/resume |
| `src/app/dispose.ts` | 1 | `disposeObject3D` |
| `src/app.ts` | 1 | `AppShell`: mounts screens, owns `MenuInput`, settings, (audio from Task 5) |
| `src/app/url-options.ts` | 1 | + `hasMatchParams`, `durationMs` |
| `src/input/menu-input.ts` | 1 (gamepad in 4) | Keyboard (+ gamepad) → `MenuCommand` |
| `src/ui/menu-nav.ts` | 1 | Grid focus navigation |
| `src/ui/screens/screens.css` | 1 | Shared menu styles |
| `src/ui/screens/title.ts` | 1 | Title screen |
| `src/ui/screens/pause.ts` | 1 | Pause overlay |
| `src/ui/screens/setup.ts` | 2 | Setup screen |
| `src/app/setup-model.ts` | 2 | `SetupChoice`, defaults, `toGameOptions` |
| `src/app/box-score.ts` | 3 | `BoxScore` aggregator, `MatchResult` |
| `src/ui/screens/results.ts` | 3 | Results screen |
| `src/input/gamepad.ts` | 4 | `GamepadBackend`, `readPad`, `rumbleFor` |
| `src/audio/sink.ts` | 5 | `AudioSink`, `SfxName`, `TrackId`, `NullAudioSink` |
| `src/audio/engine.ts` | 5 (music in 6) | `AudioEngine` (Web Audio) |
| `src/audio/sfx.ts` | 5 | Synth patches |
| `src/audio/director.ts` | 5 (music calls in 6) | Events/state → sink calls |
| `src/audio/sequencer.ts` | 6 | `stepsToSchedule`, `MusicPlayer` |
| `src/audio/tracks.ts` | 6 | Pattern data |
| `src/render/effects-map.ts` | 7 | Pure `effectsFor(event, state)` |
| `src/render/burst-pool.ts` | 7 | Instanced particle pool |
| `src/render/ball-trail.ts` | 7 | Trail line |
| `src/render/ability-fx.ts` | 7 | Per-player ability visuals, earthquake ring |
| `src/render/camera.ts` | 7 | + `shake`, `shakeOffset` |
| `scripts/smoke.mjs` | 8 | Playwright smoke |

---

## Task 1: App shell, MatchScreen, Title, Pause, URL shortcuts, storage

**Files:**
- Create: `src/app/screens.ts`, `src/app/storage.ts`, `src/app/match-screen.ts`, `src/app/dispose.ts`, `src/input/menu-input.ts`, `src/ui/menu-nav.ts`, `src/ui/screens/screens.css`, `src/ui/screens/title.ts`, `src/ui/screens/pause.ts`
- Modify: `src/app.ts` (becomes the shell), `src/main.ts`, `src/app/url-options.ts`, `src/app/session.ts` (`buildSettings` reads `durationMs`), `src/ui/hud.ts` (⏸ button, queue drain when final), `src/ui/hud.css`
- Test: `tests/app/screens.test.ts`, `tests/app/storage.test.ts`, `tests/app/url-options.test.ts` (extend), `tests/app/session.test.ts` (extend), `tests/app/dispose.test.ts`, `tests/input/menu-input.test.ts`, `tests/ui/menu-nav.test.ts`, `tests/ui/screens/title.test.ts`, `tests/ui/screens/pause.test.ts`, `tests/ui/hud.test.ts` (extend)

**Interfaces:**
- Consumes: `buildSession`, `HUMAN_ID` (`src/app/session.ts`), `GameLoop`, all render views, `Hud`, `InputManager`, `KeyboardBackend`, `TouchBackend` — unchanged APIs.
- Produces (later tasks rely on these exact names):
  - `src/app/screens.ts`: `type ScreenId = 'title' | 'setup' | 'match' | 'results'`; `type ShellEvent = { type: 'play' } | { type: 'start' } | { type: 'back' } | { type: 'finished' } | { type: 'quit' } | { type: 'rematch' } | { type: 'changeSetup' } | { type: 'toTitle' }`; `transition(screen: ScreenId, event: ShellEvent): ScreenId`.
  - `src/app/storage.ts`: `interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }`; `interface Settings { sound: boolean; music: boolean; vibration: boolean; reduceMotion: boolean }`; `DEFAULT_SETTINGS`; `loadSettings(store?: StorageLike | null): Settings`; `saveSettings(s: Settings, store?: StorageLike | null): void`; `browserStorage(): StorageLike | null`.
  - `src/input/menu-input.ts`: `type MenuCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause'`; `class MenuInput { constructor(target: Window); onCommand: ((c: MenuCommand) => void) | null; poll(): void; dispose(): void }` (`poll` is a no-op until Task 4 adds gamepads).
  - `src/ui/menu-nav.ts`: `class MenuNav { constructor(root: HTMLElement, onBack?: () => void); handle(c: MenuCommand): boolean; focusFirst(): void; refresh(): void }`.
  - `src/app/match-screen.ts`: `interface MatchScreenDeps { root: HTMLElement; options: GameOptions; settings: Settings; onFinished(result: MatchFinish): void; onQuit(): void; onSettingsChange(s: Settings): void }`; `interface MatchFinish { state: MatchState; options: GameOptions }` (Task 3 replaces it with `MatchResult`); `class MatchScreen { constructor(deps: MatchScreenDeps); pause(): void; resume(): void; handleCommand(c: MenuCommand): void; readonly paused: boolean; dispose(): void }`.
  - `src/app/dispose.ts`: `disposeObject3D(root: Object3D): void`.
  - `src/app/url-options.ts`: `hasMatchParams(search: string): boolean`; `GameOptions.durationMs: number`; `DEFAULT_DURATION_MS = 180_000`.
  - `src/app.ts`: `class AppShell { constructor(root: HTMLElement, opts: { initial: GameOptions | null; store?: StorageLike | null }); show(screen: ScreenId): void; dispose(): void; readonly screen: ScreenId }`.

- [ ] **Step 1: Screen state machine — failing test**

`tests/app/screens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { transition, type ScreenId, type ShellEvent } from '../../src/app/screens';

describe('transition (spec E.1 flow)', () => {
  const cases: [ScreenId, ShellEvent['type'], ScreenId][] = [
    ['title', 'play', 'setup'],
    ['setup', 'start', 'match'],
    ['setup', 'back', 'title'],
    ['match', 'finished', 'results'],
    ['match', 'quit', 'title'],
    ['results', 'rematch', 'match'],
    ['results', 'changeSetup', 'setup'],
    ['results', 'toTitle', 'title'],
    ['results', 'back', 'title'],
  ];
  it.each(cases)('%s + %s → %s', (from, type, to) => {
    expect(transition(from, { type } as ShellEvent)).toBe(to);
  });

  it('ignores events that do not apply to the current screen', () => {
    expect(transition('title', { type: 'finished' })).toBe('title');
    expect(transition('match', { type: 'play' })).toBe('match');
    expect(transition('setup', { type: 'rematch' })).toBe('setup');
  });
});
```

- [ ] **Step 2: Run** `npm test -- tests/app/screens.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/app/screens.ts`**

```ts
/** Spec E.1: the shell's screens. Pause is an overlay inside the match (plan decision 1). */
export type ScreenId = 'title' | 'setup' | 'match' | 'results';

export type ShellEvent =
  | { type: 'play' }
  | { type: 'start' }
  | { type: 'back' }
  | { type: 'finished' }
  | { type: 'quit' }
  | { type: 'rematch' }
  | { type: 'changeSetup' }
  | { type: 'toTitle' };

const TABLE: Record<ScreenId, Partial<Record<ShellEvent['type'], ScreenId>>> = {
  title: { play: 'setup' },
  setup: { start: 'match', back: 'title' },
  match: { finished: 'results', quit: 'title' },
  results: { rematch: 'match', changeSetup: 'setup', toTitle: 'title', back: 'title' },
};

/** Title → Setup → Match → Results → Match | Setup | Title; anything else is ignored. */
export function transition(screen: ScreenId, event: ShellEvent): ScreenId {
  return TABLE[screen][event.type] ?? screen;
}
```

- [ ] **Step 4: Run** the test — Expected: PASS. **Commit** `feat(app): screen state machine for the Phase 6 flow`.

- [ ] **Step 5: Storage — failing test**

`tests/app/storage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type StorageLike,
} from '../../src/app/storage';

function memory(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
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
    expect(DEFAULT_SETTINGS).toEqual({ sound: true, music: true, vibration: true, reduceMotion: false });
  });

  it('round-trips under a versioned key', () => {
    const store = memory();
    saveSettings({ sound: false, music: true, vibration: false, reduceMotion: true }, store);
    expect(Object.keys(store.data)).toEqual(['roarball.settings.v1']);
    expect(loadSettings(store)).toEqual({ sound: false, music: true, vibration: false, reduceMotion: true });
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
```

- [ ] **Step 6: Run** — FAIL. **Implement `src/app/storage.ts`:**

```ts
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

export function saveSettings(settings: Settings, store: StorageLike | null = browserStorage()): void {
  writeJson(store, SETTINGS_KEY, settings);
}
```

Run — PASS. **Commit** `feat(app): defensive settings storage`.

- [ ] **Step 7: URL shortcuts and duration — failing tests** (append to `tests/app/url-options.test.ts`; keep existing tests):

```ts
import { DEFAULT_DURATION_MS, hasMatchParams, readGameOptions } from '../../src/app/url-options';

describe('hasMatchParams (spec E.1 URL shortcuts)', () => {
  it('is false for a bare URL or debug alone', () => {
    expect(hasMatchParams('')).toBe(false);
    expect(hasMatchParams('?debug')).toBe(false);
  });
  it.each(['mode=shootaround', 'character=ace', 'teammate=dash', 'opponents=a,b', 'court=volcano', 'ai=hard', 'seed=3', 'duration=20'])(
    'is true with %s',
    (param) => {
      expect(hasMatchParams(`?${param}`)).toBe(true);
      expect(hasMatchParams(`?debug&${param}`)).toBe(true);
    },
  );
});

describe('duration', () => {
  it('defaults to 180 s and reads ?duration= seconds within 5..600', () => {
    expect(readGameOptions('', 0).durationMs).toBe(DEFAULT_DURATION_MS);
    expect(DEFAULT_DURATION_MS).toBe(180_000);
    expect(readGameOptions('?duration=20', 0).durationMs).toBe(20_000);
    expect(readGameOptions('?duration=2', 0).durationMs).toBe(DEFAULT_DURATION_MS);
    expect(readGameOptions('?duration=601', 0).durationMs).toBe(DEFAULT_DURATION_MS);
    expect(readGameOptions('?duration=abc', 0).durationMs).toBe(DEFAULT_DURATION_MS);
  });
});
```

And in `tests/app/session.test.ts`:

```ts
it('buildSettings takes the duration from the options (spec E.1 ?duration)', () => {
  const options = { ...readGameOptions('?duration=30', 0) };
  expect(buildSettings(options, getCourt('gym'), 1).durationMs).toBe(30_000);
});
```

(Use the file's existing imports; add `readGameOptions` from `../../src/app/url-options` and `getCourt` if missing.)

- [ ] **Step 8: Implement.** In `src/app/url-options.ts`: add `durationMs: number` to `GameOptions` (doc: "Match length (spec A.5 default; `?duration=` seconds, E.1)"), export `DEFAULT_DURATION_MS = 180_000`, `MATCH_PARAMS = ['mode','character','teammate','opponents','court','ai','seed','duration'] as const`, and:

```ts
/** Spec E.1: any match parameter skips the menus; `?debug` alone does not. */
export function hasMatchParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return MATCH_PARAMS.some((name) => params.has(name));
}

function durationOr(value: string | null): number {
  const seconds = Number.parseInt(value ?? '', 10);
  return Number.isFinite(seconds) && seconds >= 5 && seconds <= 600 ? seconds * 1000 : DEFAULT_DURATION_MS;
}
```

and `durationMs: durationOr(params.get('duration'))` in `readGameOptions`. In `src/app/session.ts` `buildSettings`: `durationMs: options.durationMs`. Update the doc comment ("Spec A.5 defaults; the seed, mode and duration vary"). Fix every other `GameOptions` literal in tests (search `teammateId:` under `tests/`) by adding `durationMs: 180_000`. Run `npm test` — all PASS (no sim golden moves: they build settings without `buildSettings` or with 180 000). **Commit** `feat(app): ?duration and hasMatchParams URL shortcuts`.

- [ ] **Step 9: `disposeObject3D` — failing test** `tests/app/dispose.test.ts`:

```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject3D } from '../../src/app/dispose';

describe('disposeObject3D (plan decision 28)', () => {
  it('disposes every geometry, material (arrays too) and material texture once', () => {
    const geo = new BoxGeometry();
    const map = new Texture();
    const a = new MeshStandardMaterial({ map });
    const b = new MeshBasicMaterial();
    const root = new Group();
    const child = new Group();
    root.add(new Mesh(geo, a), child);
    child.add(new Mesh(geo, [a, b]));
    const spies = [geo, map, a, b].map((o) => vi.spyOn(o, 'dispose'));
    disposeObject3D(root);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

Implement `src/app/dispose.ts`:

```ts
import { Material, Mesh, Texture, type BufferGeometry, type Object3D } from 'three';

/** Frees GPU resources under `root` (plan decision 28). Shared resources are disposed once. */
export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh>;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach((x) => materials.add(x));
    else if (m instanceof Material) materials.add(m);
  });
  const textures = new Set<Texture>();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
```

(InstancedMesh, Line and Points also carry `geometry`/`material`, so the duck-typed check covers them.) Run — PASS. **Commit** `feat(app): disposeObject3D`.

- [ ] **Step 10: `MenuInput` — failing test** `tests/input/menu-input.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { MenuInput, type MenuCommand } from '../../src/input/menu-input';

let input: MenuInput | null = null;
afterEach(() => input?.dispose());

function press(code: string, key = ''): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { code, key, cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('MenuInput keyboard (spec E.1)', () => {
  it('maps arrows, WASD, Enter/Space, Escape/Backspace and P', () => {
    input = new MenuInput(window);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    for (const code of ['ArrowUp', 'KeyS', 'ArrowLeft', 'KeyD', 'Enter', 'Space', 'Escape', 'Backspace', 'KeyP']) press(code);
    expect(got).toEqual(['up', 'down', 'left', 'right', 'confirm', 'confirm', 'back', 'back', 'pause']);
  });

  it('reports Escape as pause too, so the match can pause with it', () => {
    input = new MenuInput(window);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    press('Escape');
    expect(got).toEqual(['back']);
    // The match screen treats 'back' as pause (see MatchScreen.handleCommand).
  });

  it('ignores key repeats and stops listening after dispose', () => {
    input = new MenuInput(window);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', repeat: true }));
    input.dispose();
    press('ArrowUp');
    expect(got).toEqual([]);
  });
});
```

Implement `src/input/menu-input.ts`:

```ts
/** Spec E.1: one navigation vocabulary for every menu and the in-match pause key. */
export type MenuCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';

const KEYS: Readonly<Record<string, MenuCommand>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyP: 'pause',
};

/** Keyboard (and, from Task 4, gamepad) → MenuCommand. Repeats are ignored. */
export class MenuInput {
  onCommand: ((command: MenuCommand) => void) | null = null;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
  }

  /** Called once per animation frame by the shell; gamepads are polled here (Task 4). */
  poll(): void {}

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.onCommand = null;
  }

  protected emit(command: MenuCommand): void {
    this.onCommand?.(command);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const command = KEYS[e.code];
    if (command) this.emit(command);
  };
}
```

Note: Tab is left to the browser (native focus order). Space during a match is ACTION for the `KeyboardBackend` and `confirm` here; the match screen ignores `confirm` while not paused (Step 14). Run — PASS. **Commit** `feat(input): MenuInput keyboard commands`.

- [ ] **Step 11: `MenuNav` — failing test** `tests/ui/menu-nav.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MenuNav } from '../../src/ui/menu-nav';

function grid(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML =
    '<button data-nav-row="0">a0</button><button data-nav-row="0">a1</button><button data-nav-row="0">a2</button>' +
    '<button data-nav-row="1">b0</button><button data-nav-row="1" disabled>b1</button>' +
    '<button data-nav-row="2">c0</button><button data-nav-row="2">c1</button>';
  document.body.appendChild(root);
  return root;
}
const focused = (): string => (document.activeElement as HTMLElement).textContent ?? '';

describe('MenuNav (plan decision 4)', () => {
  it('focuses the first element, moves within and across rows, clamps the column', () => {
    const nav = new MenuNav(grid());
    nav.focusFirst();
    expect(focused()).toBe('a0');
    nav.handle('right');
    nav.handle('right');
    expect(focused()).toBe('a2');
    nav.handle('right');
    expect(focused()).toBe('a2'); // no wrap
    nav.handle('down');
    expect(focused()).toBe('b0'); // column 2 clamped to the last enabled element of row 1
    nav.handle('down');
    expect(focused()).toBe('c0');
    nav.handle('right');
    nav.handle('up');
    expect(focused()).toBe('b0');
  });

  it('confirm clicks the focused element; back calls onBack; returns whether it handled', () => {
    const onBack = vi.fn();
    const root = grid();
    const nav = new MenuNav(root, onBack);
    const click = vi.fn();
    root.querySelector('button')?.addEventListener('click', click);
    nav.focusFirst();
    expect(nav.handle('confirm')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(nav.handle('back')).toBe(true);
    expect(onBack).toHaveBeenCalledOnce();
    expect(new MenuNav(root).handle('back')).toBe(false);
    expect(nav.handle('pause')).toBe(false);
  });

  it('starts from the first element when focus is outside the menu', () => {
    const nav = new MenuNav(grid());
    (document.body as HTMLElement).focus();
    nav.handle('down');
    expect(focused()).toBe('a0');
  });
});
```

Implement `src/ui/menu-nav.ts`:

```ts
import type { MenuCommand } from '../input/menu-input';

/**
 * Grid focus navigation (plan decision 4): elements with `data-nav-row="<n>"` form rows in
 * DOM order; disabled or hidden elements are skipped. Pointer input uses ordinary clicks.
 */
export class MenuNav {
  private rows: HTMLElement[][] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly onBack?: () => void,
  ) {
    this.refresh();
  }

  /** Re-reads the rows (call after the screen re-renders cards). */
  refresh(): void {
    const byRow = new Map<number, HTMLElement[]>();
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-nav-row]')) {
      if (el.hidden || (el as HTMLButtonElement).disabled) continue;
      const row = Number(el.dataset.navRow);
      byRow.set(row, [...(byRow.get(row) ?? []), el]);
    }
    this.rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, els]) => els);
  }

  focusFirst(): void {
    this.rows[0]?.[0]?.focus();
  }

  handle(command: MenuCommand): boolean {
    if (command === 'back') {
      if (!this.onBack) return false;
      this.onBack();
      return true;
    }
    if (command === 'pause') return false;
    this.refresh();
    const pos = this.position();
    if (!pos) {
      this.focusFirst();
      return true;
    }
    const [r, c] = pos;
    if (command === 'confirm') {
      this.rows[r]?.[c]?.click();
      return true;
    }
    const nr = command === 'up' ? Math.max(0, r - 1) : command === 'down' ? Math.min(this.rows.length - 1, r + 1) : r;
    const row = this.rows[nr] ?? [];
    const nc = nr !== r ? Math.min(c, row.length - 1) : command === 'left' ? Math.max(0, c - 1) : command === 'right' ? Math.min(row.length - 1, c + 1) : c;
    row[nc]?.focus();
    return true;
  }

  private position(): [number, number] | null {
    const active = document.activeElement;
    for (let r = 0; r < this.rows.length; r++) {
      const c = this.rows[r]?.indexOf(active as HTMLElement) ?? -1;
      if (c >= 0) return [r, c];
    }
    return null;
  }
}
```

(Prettier will reflow the long ternaries.) Run — PASS. **Commit** `feat(ui): MenuNav grid focus navigation`.

- [ ] **Step 12: Shared menu CSS** `src/ui/screens/screens.css` (no test; checked in the browser):

```css
.screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(12px, 3vh, 28px);
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  box-sizing: border-box;
  background: radial-gradient(ellipse at 50% 30%, #23324a 0%, var(--bg) 70%);
  color: var(--fg);
  overflow-y: auto;
  z-index: 20;
}
.screen.is-overlay {
  background: rgb(10 12 16 / 0.72);
  backdrop-filter: blur(4px);
}
.screen-title {
  margin: 0;
  font-size: clamp(40px, 9vw, 96px);
  font-weight: 900;
  letter-spacing: 0.04em;
  font-style: italic;
  color: #ffb020;
  text-shadow: 0 4px 0 #b4400c, 0 8px 24px rgb(0 0 0 / 0.5);
}
.screen-heading {
  margin: 0;
  font-size: clamp(22px, 4vw, 36px);
  font-weight: 800;
}
.menu-button {
  min-width: 200px;
  min-height: 56px;
  padding: 0 28px;
  border: 0;
  border-radius: 14px;
  background: #2f80ed;
  color: #fff;
  font: 800 clamp(18px, 2.6vw, 24px) / 1 system-ui, sans-serif;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.menu-button.is-secondary {
  background: #39424f;
}
.menu-button:focus-visible,
.menu-button:focus {
  outline: 4px solid #ffb020;
  outline-offset: 3px;
}
.menu-button.is-primary {
  animation: menu-pulse 1.2s ease-in-out infinite;
}
@keyframes menu-pulse {
  50% {
    transform: scale(1.05);
  }
}
.menu-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}
.rotate-hint {
  display: none;
}
@media (orientation: portrait) and (max-width: 900px) {
  .rotate-hint {
    display: block;
    font-size: 14px;
    opacity: 0.8;
  }
}
@media (prefers-reduced-motion: reduce) {
  .menu-button.is-primary {
    animation: none;
  }
}
```

- [ ] **Step 13: Title and Pause screens — failing tests**

`tests/ui/screens/title.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { TitleScreen } from '../../../src/ui/screens/title';

describe('TitleScreen', () => {
  it('renders PLAY and a sound toggle; PLAY calls onPlay; the toggle flips the setting', () => {
    const root = document.createElement('div');
    const onPlay = vi.fn();
    const onSound = vi.fn();
    const screen = new TitleScreen(root, { sound: true, onPlay, onSoundChange: onSound });
    const play = root.querySelector<HTMLButtonElement>('[data-action="play"]');
    const sound = root.querySelector<HTMLButtonElement>('[data-action="sound"]');
    expect(play?.dataset.navRow).toBe('0');
    expect(sound?.textContent).toBe('SOUND: ON');
    play?.click();
    expect(onPlay).toHaveBeenCalledOnce();
    sound?.click();
    expect(onSound).toHaveBeenCalledWith(false);
    expect(sound?.textContent).toBe('SOUND: OFF');
    screen.dispose();
    expect(root.children.length).toBe(0);
  });

  it('handles menu commands through MenuNav (confirm on the focused PLAY)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onPlay = vi.fn();
    const screen = new TitleScreen(root, { sound: true, onPlay, onSoundChange: vi.fn() });
    screen.handleCommand('confirm');
    expect(onPlay).toHaveBeenCalledOnce();
    screen.dispose();
  });
});
```

`tests/ui/screens/pause.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/app/storage';
import { PauseOverlay } from '../../../src/ui/screens/pause';

function make() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const handlers = { onResume: vi.fn(), onRestart: vi.fn(), onQuit: vi.fn(), onSettingsChange: vi.fn() };
  const overlay = new PauseOverlay(root, { settings: { ...DEFAULT_SETTINGS }, ...handlers });
  const button = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  return { root, overlay, handlers, button };
}

describe('PauseOverlay (spec E.1)', () => {
  it('lists Resume, Restart, Sound, Music, Vibration, Reduce motion, Quit in that order', () => {
    const { root } = make();
    expect([...root.querySelectorAll('button')].map((b) => b.dataset.action)).toEqual([
      'resume', 'restart', 'sound', 'music', 'vibration', 'reduceMotion', 'quit',
    ]);
  });

  it('toggles a setting and reports the whole new settings object', () => {
    const { button, handlers } = make();
    button('vibration')?.click();
    expect(handlers.onSettingsChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, vibration: false });
    expect(button('vibration')?.textContent).toBe('VIBRATION: OFF');
    button('reduceMotion')?.click();
    expect(handlers.onSettingsChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, vibration: false, reduceMotion: true });
  });

  it('back and pause commands resume; buttons call their handlers', () => {
    const { overlay, button, handlers } = make();
    overlay.handleCommand('back');
    overlay.handleCommand('pause');
    expect(handlers.onResume).toHaveBeenCalledTimes(2);
    button('restart')?.click();
    button('quit')?.click();
    expect(handlers.onRestart).toHaveBeenCalledOnce();
    expect(handlers.onQuit).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 14: Implement Title and Pause.**

`src/ui/screens/title.ts`:

```ts
import type { MenuCommand } from '../../input/menu-input';
import { MenuNav } from '../menu-nav';
import './screens.css';

export interface TitleOptions {
  sound: boolean;
  onPlay(): void;
  onSoundChange(sound: boolean): void;
}

const soundLabel = (on: boolean): string => `SOUND: ${on ? 'ON' : 'OFF'}`;

/** Spec E.1 Title: logo, PLAY, sound on/off. */
export class TitleScreen {
  private readonly el: HTMLDivElement;
  private readonly nav: MenuNav;

  constructor(parent: HTMLElement, options: TitleOptions) {
    let sound = options.sound;
    this.el = document.createElement('div');
    this.el.className = 'screen screen-title-page';
    this.el.innerHTML =
      '<h1 class="screen-title">ROARBALL</h1>' +
      '<div class="menu-column">' +
      '<button class="menu-button is-primary" data-action="play" data-nav-row="0">PLAY</button>' +
      `<button class="menu-button is-secondary" data-action="sound" data-nav-row="1">${soundLabel(sound)}</button>` +
      '</div><p class="rotate-hint">Turn your device sideways to play</p>';
    parent.appendChild(this.el);
    const play = this.el.querySelector<HTMLButtonElement>('[data-action="play"]');
    const toggle = this.el.querySelector<HTMLButtonElement>('[data-action="sound"]');
    play?.addEventListener('click', () => options.onPlay());
    toggle?.addEventListener('click', () => {
      sound = !sound;
      toggle.textContent = soundLabel(sound);
      options.onSoundChange(sound);
    });
    this.nav = new MenuNav(this.el);
    this.nav.focusFirst();
  }

  handleCommand(command: MenuCommand): void {
    this.nav.handle(command);
  }

  dispose(): void {
    this.el.remove();
  }
}
```

`src/ui/screens/pause.ts`:

```ts
import type { Settings } from '../../app/storage';
import type { MenuCommand } from '../../input/menu-input';
import { MenuNav } from '../menu-nav';
import './screens.css';

export interface PauseOptions {
  settings: Settings;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onSettingsChange(settings: Settings): void;
}

const TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: 'sound', label: 'SOUND' },
  { key: 'music', label: 'MUSIC' },
  { key: 'vibration', label: 'VIBRATION' },
  { key: 'reduceMotion', label: 'REDUCE MOTION' },
];

/** Spec E.1 Pause overlay over the frozen match. */
export class PauseOverlay {
  private readonly el: HTMLDivElement;
  private readonly nav: MenuNav;
  private settings: Settings;

  constructor(parent: HTMLElement, private readonly options: PauseOptions) {
    this.settings = { ...options.settings };
    this.el = document.createElement('div');
    this.el.className = 'screen is-overlay';
    const column = document.createElement('div');
    column.className = 'menu-column';
    const heading = document.createElement('h2');
    heading.className = 'screen-heading';
    heading.textContent = 'PAUSED';
    let row = 0;
    const add = (action: string, text: string, secondary: boolean, onClick: (b: HTMLButtonElement) => void): void => {
      const b = document.createElement('button');
      b.className = `menu-button${secondary ? ' is-secondary' : ''}`;
      b.dataset.action = action;
      b.dataset.navRow = String(row++);
      b.textContent = text;
      b.addEventListener('click', () => onClick(b));
      column.appendChild(b);
    };
    add('resume', 'RESUME', false, () => options.onResume());
    add('restart', 'RESTART', true, () => options.onRestart());
    for (const { key, label } of TOGGLES) {
      add(key, `${label}: ${this.settings[key] ? 'ON' : 'OFF'}`, true, (b) => {
        this.settings = { ...this.settings, [key]: !this.settings[key] };
        b.textContent = `${label}: ${this.settings[key] ? 'ON' : 'OFF'}`;
        options.onSettingsChange({ ...this.settings });
      });
    }
    add('quit', 'QUIT TO TITLE', true, () => options.onQuit());
    this.el.append(heading, column);
    parent.appendChild(this.el);
    this.nav = new MenuNav(this.el, () => options.onResume());
    this.nav.focusFirst();
  }

  handleCommand(command: MenuCommand): void {
    if (command === 'pause') this.options.onResume();
    else this.nav.handle(command);
  }

  dispose(): void {
    this.el.remove();
  }
}
```

Run both tests — PASS. **Commit** `feat(ui): Title screen and Pause overlay`.

- [ ] **Step 15: HUD — ⏸ button and final-banner queue drain — failing tests** (append to `tests/ui/hud.test.ts`, reusing its `court`/`settings` fixtures):

```ts
describe('Hud pause button and final banner (spec E.1, plan decision 12)', () => {
  it('renders a ⏸ button that calls onPause', () => {
    const parent = document.createElement('div');
    const onPause = vi.fn();
    const hud = new Hud(parent, 0, { onPause });
    const button = parent.querySelector<HTMLButtonElement>('.hud-pause');
    expect(button?.getAttribute('aria-label')).toBe('Pause');
    button?.click();
    expect(onPause).toHaveBeenCalledOnce();
    hud.dispose();
  });

  it('shows the game-ending basket banner before the sticky final', () => {
    const parent = document.createElement('div');
    const hud = new Hud(parent, 0);
    const state = createMatch(settings, court, roster());
    hud.handleEvents([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }], state);
    const finished = { ...state, phase: 'finished' as const, score: [21, 18] as [number, number] };
    hud.update(finished);
    hud.tick(0.016);
    const banner = parent.querySelector<HTMLDivElement>('.hud-banner');
    expect(banner?.textContent).toBe('DUNK!');
    hud.tick(1.3);
    hud.update(finished);
    expect(banner?.textContent).toMatch(/^FINAL 21–18/);
    hud.dispose();
  });
});
```

(If the file has no `roster()` helper, build the roster as the existing tests in the file do; add `vi` to the vitest import.)

- [ ] **Step 16: Implement in `src/ui/hud.ts`:** `HudOptions.onPause?: () => void`; add `<button class="hud-pause" aria-label="Pause" type="button">⏸</button>` to the HUD markup (hidden when `onPause` is absent); its click calls `onPause`. Final handling: keep `this.final` tracking, but in `update` write the final banner only when `this.queue.length === 0 && this.bannerLeft <= 0`, and in `tick` stop the early `return` while the queue still has entries — the queue drains normally, and the sticky final appears once it is empty. Make sure the "new match" reset branch still clears everything. In `src/ui/hud.css` add:

```css
.hud-pause {
  position: absolute;
  top: max(8px, env(safe-area-inset-top));
  right: max(8px, env(safe-area-inset-right));
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.45);
  color: #fff;
  font-size: 24px;
  pointer-events: auto;
  cursor: pointer;
}
```

(The `.hud` root is `pointer-events: none` — check `hud.css`; the button opts back in.) Run `npm test -- tests/ui/hud.test.ts` — PASS. **Commit** `feat(ui): HUD pause button; final basket banner before the final`.

- [ ] **Step 17: `MatchScreen`.** Move the body of today's `startGame` (`src/app.ts`) into `src/app/match-screen.ts` as `class MatchScreen` with the Interfaces above. Changes while moving:
  - Constructor takes `MatchScreenDeps`; creates its own container `div.match-screen` (position fixed, inset 0) inside `deps.root` and puts the canvas, HUD and touch controls in it.
  - **Remove** C.6's press-to-restart (`RESTART_BUTTONS`, `prevHumanButtons` logic) — decision 13.
  - Add `restart()` (seed + 1, `buildSession(... intents)` as today, `weather.reset()`, reset finish timer, `resume()`), used by Pause → Restart.
  - Finish: in the render callback, when `next.phase === 'finished'` record `finishedAt ??= performance.now()`; once `performance.now() - finishedAt >= 2500` call `deps.onFinished({ state: next, options })` exactly once and stop the loop.
  - Pause: `pause()` → `loop.stop()`, creates `PauseOverlay` in the container with `deps.settings` and handlers (`onResume: resume`, `onRestart: restart`, `onQuit: deps.onQuit`, `onSettingsChange: (s) => { this.settings = s; deps.onSettingsChange(s); }`); `resume()` disposes the overlay and `loop.start()`. Both are idempotent; neither does anything after finish.
  - `handleCommand(c)`: if paused → `overlay.handleCommand(c)`; else if `c === 'pause' || c === 'back'` → `pause()`; other commands are ignored (gameplay reads its own backends).
  - HUD gets `onPause: () => this.pause()`.
  - `document.addEventListener('visibilitychange', …)`: when `document.hidden` and not finished → `pause()` (E.1 auto-pause).
  - `dispose()`: stop loop, remove listeners, dispose overlay, HUD, debug overlay, input; `disposeObject3D(scene.scene)`; `scene.dispose()`; add `GameScene.dispose()` → `this.renderer.dispose(); this.renderer.forceContextLoss();` (decision 28); remove the container.
  - Keep everything else (views, interpolation, debug overlay, SP readiness) exactly as today.

- [ ] **Step 18: `AppShell` in `src/app.ts`.** Replace `startGame` with:

```ts
import { MatchScreen, type MatchFinish } from './app/match-screen';
import { transition, type ScreenId, type ShellEvent } from './app/screens';
import { browserStorage, loadSettings, saveSettings, type Settings, type StorageLike } from './app/storage';
import type { GameOptions } from './app/url-options';
import { MenuInput, type MenuCommand } from './input/menu-input';
import { PauseOverlay } from './ui/screens/pause';
import { TitleScreen } from './ui/screens/title';

export type { GameOptions } from './app/url-options';
export { buildRoster, buildSession, buildSettings, type Session } from './app/session';

interface ScreenHandle {
  handleCommand(command: MenuCommand): void;
  dispose(): void;
}

/** Spec E.1 / §9: the screen flow as a state machine over DOM screens. */
export class AppShell {
  private current: ScreenId = 'title';
  private handle: ScreenHandle | null = null;
  private settings: Settings;
  private readonly menuInput: MenuInput;
  private rafId = 0;
  private options: GameOptions | null;
  private readonly store: StorageLike | null;

  constructor(
    private readonly root: HTMLElement,
    opts: { initial: GameOptions | null; store?: StorageLike | null },
  ) {
    this.store = opts.store === undefined ? browserStorage() : opts.store;
    this.settings = loadSettings(this.store);
    this.options = opts.initial;
    this.menuInput = new MenuInput(window);
    this.menuInput.onCommand = (c) => this.handle?.handleCommand(c);
    const poll = (): void => {
      this.menuInput.poll();
      this.rafId = requestAnimationFrame(poll);
    };
    this.rafId = requestAnimationFrame(poll);
    this.show(opts.initial ? 'match' : 'title');
  }

  get screen(): ScreenId {
    return this.current;
  }

  dispatch(event: ShellEvent): void {
    this.show(transition(this.current, event));
  }

  show(screen: ScreenId): void {
    this.handle?.dispose();
    this.handle = null;
    this.current = screen;
    switch (screen) {
      case 'title':
        this.handle = new TitleScreen(this.root, {
          sound: this.settings.sound,
          onPlay: () => this.dispatch({ type: 'play' }),
          onSoundChange: (sound) => this.updateSettings({ ...this.settings, sound }),
        });
        break;
      case 'match':
        if (!this.options) return this.show('title');
        this.handle = new MatchScreen({
          root: this.root,
          options: this.options,
          settings: this.settings,
          onFinished: (finish) => this.onFinished(finish),
          onQuit: () => this.dispatch({ type: 'quit' }),
          onSettingsChange: (s) => this.updateSettings(s),
        });
        break;
      case 'setup':
      case 'results':
        // Task 2 adds Setup and Task 3 adds Results; until then go straight to a default match / back to the title.
        if (screen === 'setup') {
          this.options ??= defaultOptions();
          return this.dispatch({ type: 'start' });
        }
        return this.show('title');
    }
  }

  private onFinished(_finish: MatchFinish): void {
    this.dispatch({ type: 'finished' });
  }

  private updateSettings(settings: Settings): void {
    this.settings = settings;
    saveSettings(settings, this.store);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.handle?.dispose();
    this.menuInput.dispose();
  }
}
```

`defaultOptions()` = `readGameOptions('', Date.now())` (import it). `PauseOverlay` import is not needed in the shell (MatchScreen owns it) — remove it if ESLint flags it. `src/main.ts`:

```ts
import { AppShell } from './app';
import { hasMatchParams, readGameOptions } from './app/url-options';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const search = window.location.search;
new AppShell(root, { initial: hasMatchParams(search) ? readGameOptions(search, Date.now()) : null });
```

`?debug` alone: the menus path must still honour it — `defaultOptions()` reads `window.location.search` instead of `''` so `?debug` reaches the match (`readGameOptions(window.location.search, Date.now())`).

- [ ] **Step 19: Shell test** `tests/app/shell.test.ts` (jsdom). `MatchScreen` needs WebGL, so mock it:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const created: { deps: { onFinished(f: unknown): void; onQuit(): void } }[] = [];
vi.mock('../../src/app/match-screen', () => ({
  MatchScreen: class {
    constructor(public deps: { onFinished(f: unknown): void; onQuit(): void }) {
      created.push(this);
    }
    handleCommand(): void {}
    dispose(): void {}
  },
}));

const { AppShell } = await import('../../src/app');
const { readGameOptions } = await import('../../src/app/url-options');

describe('AppShell (spec E.1)', () => {
  it('a bare start shows the Title; PLAY goes on to a match (Setup arrives in Task 2)', () => {
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store: null });
    expect(shell.screen).toBe('title');
    root.querySelector<HTMLButtonElement>('[data-action="play"]')?.click();
    expect(shell.screen).toBe('match');
    shell.dispose();
  });

  it('URL shortcuts start in the match; quitting returns to the Title', () => {
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: readGameOptions('?court=volcano', 0), store: null });
    expect(shell.screen).toBe('match');
    created.at(-1)?.deps.onQuit();
    expect(shell.screen).toBe('title');
    shell.dispose();
  });

  it('remembers the sound toggle in storage', () => {
    const data: Record<string, string> = {};
    const store = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    const root = document.createElement('div');
    const shell = new AppShell(root, { initial: null, store });
    root.querySelector<HTMLButtonElement>('[data-action="sound"]')?.click();
    expect(JSON.parse(data['roarball.settings.v1'] ?? '{}').sound).toBe(false);
    shell.dispose();
  });
});
```

Run — PASS. Run the whole suite and `npm run check` — PASS; `git diff origin/main --stat -- src/sim src/content` is empty. **Commit** `feat(app): AppShell screen flow, MatchScreen with pause and disposal`.

- [ ] **Step 20: Browser check (controller).** `npm run dev`: bare URL shows the Title; PLAY starts a match; ⏸, Esc and P pause; Resume/Restart/Quit work; hiding the tab pauses; `?court=volcano` boots straight into a match; `?duration=10` ends quickly and returns to the Title after the final banner (Results arrives in Task 3). No console errors. Open PR `Phase 6 Task 1: app shell, MatchScreen, Title, Pause` (closes the task issue).

---
## Task 2: Setup screen (cards, random, difficulty, remembered setup)

**Files:**
- Create: `src/app/setup-model.ts`, `src/ui/screens/setup.ts`, `src/ui/screens/setup.css`
- Modify: `src/app/storage.ts` (`loadSetup`/`saveSetup`), `src/app.ts` (real Setup screen)
- Test: `tests/app/setup-model.test.ts`, `tests/app/storage.test.ts` (extend), `tests/ui/screens/setup.test.ts`, `tests/app/shell.test.ts` (extend)

**Interfaces:**
- Consumes: `characters`, `getCharacter` (`src/content/characters`), `courts` (`src/content/courts`), `ABILITIES` (`src/content/abilities`), `AI_PROFILES`, `AiProfileId`, `DEFAULT_AI_PROFILE_ID` (`src/sim/ai/profile`), `readJson`/`writeJson`/`StorageLike` (Task 1), `MenuNav`, `MenuCommand` (Task 1), `GameOptions`, `DEFAULT_DURATION_MS` (Task 1).
- Produces:
  - `src/app/setup-model.ts`: `const RANDOM = 'random'`; `interface SetupChoice { characterId: string; teammateId: string; opponentIds: [string, string]; courtId: string; aiProfile: AiProfileId }` (opponent ids may be `RANDOM`); `DEFAULT_SETUP: Readonly<SetupChoice>`; `sanitizeSetup(raw: Record<string, unknown> | null): SetupChoice`; `toGameOptions(setup: SetupChoice, seed: number, rand?: () => number, debug?: boolean): GameOptions`.
  - `src/app/storage.ts`: `loadSetup(store?): SetupChoice`, `saveSetup(setup, store?): void` (key `roarball.setup.v1`).
  - `src/ui/screens/setup.ts`: `class SetupScreen { constructor(parent: HTMLElement, opts: { setup: SetupChoice; catalog: SetupCatalog; onStart(setup: SetupChoice): void; onBack(): void }); handleCommand(c: MenuCommand): void; dispose(): void }`.

- [ ] **Step 1: Setup model — failing test** `tests/app/setup-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETUP, RANDOM, sanitizeSetup, toGameOptions } from '../../src/app/setup-model';

describe('setup model (spec E.1, plan decisions 5 and 8)', () => {
  it('defaults match the URL defaults: Rook with Ace vs Brick and Dash on the gym, fair', () => {
    expect(DEFAULT_SETUP).toEqual({
      characterId: 'rook',
      teammateId: 'ace',
      opponentIds: ['brick', 'dash'],
      courtId: 'gym',
      aiProfile: 'fair',
    });
  });

  it('sanitizes stored data field by field', () => {
    expect(sanitizeSetup(null)).toEqual(DEFAULT_SETUP);
    expect(
      sanitizeSetup({ characterId: 'ace', teammateId: 'nobody', opponentIds: ['random', 7], courtId: 'volcano', aiProfile: 'hard' }),
    ).toEqual({ characterId: 'ace', teammateId: 'ace', opponentIds: [RANDOM, 'dash'], courtId: 'volcano', aiProfile: 'hard' });
    expect(sanitizeSetup({ opponentIds: 'brick', aiProfile: 'insane', characterId: RANDOM })).toEqual(DEFAULT_SETUP);
  });

  it('resolves random opponents with the injected rand and builds match options', () => {
    const setup = { ...DEFAULT_SETUP, opponentIds: [RANDOM, RANDOM] as [string, string] };
    const rolls = [0, 0.99];
    const options = toGameOptions(setup, 42, () => rolls.shift() ?? 0);
    expect(options.opponentIds).toEqual(['brick', 'rook']); // characters order: brick, ace, dash, rook
    expect(options).toMatchObject({
      mode: 'match',
      characterId: 'rook',
      teammateId: 'ace',
      courtId: 'gym',
      aiProfile: 'fair',
      seed: 42,
      durationMs: 180_000,
      debug: false,
    });
    expect(toGameOptions(DEFAULT_SETUP, 1, Math.random, true).debug).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Implement `src/app/setup-model.ts`:**

```ts
import { DEFAULT_DURATION_MS, DEFAULT_OPPONENT_IDS, DEFAULT_TEAMMATE_ID, type GameOptions } from './url-options';
import { characters, DEFAULT_CHARACTER_ID } from '../content/characters';
import { courts, DEFAULT_COURT_ID } from '../content/courts';
import { DEFAULT_AI_PROFILE_ID, isAiProfileId, type AiProfileId } from '../sim/ai/profile';

/** An opponent slot that is rolled when the match starts (spec E.1). */
export const RANDOM = 'random';

export interface SetupChoice {
  characterId: string;
  teammateId: string;
  /** Character ids or RANDOM. */
  opponentIds: [string, string];
  courtId: string;
  aiProfile: AiProfileId;
}

export const DEFAULT_SETUP: Readonly<SetupChoice> = Object.freeze({
  characterId: DEFAULT_CHARACTER_ID,
  teammateId: DEFAULT_TEAMMATE_ID,
  opponentIds: [DEFAULT_OPPONENT_IDS[0], DEFAULT_OPPONENT_IDS[1]] as [string, string],
  courtId: DEFAULT_COURT_ID,
  aiProfile: DEFAULT_AI_PROFILE_ID,
});

const isCharacter = (v: unknown): v is string => typeof v === 'string' && characters.some((c) => c.id === v);

/** Stored data → a valid setup; anything unknown falls back to the default field (plan decision 8). */
export function sanitizeSetup(raw: Record<string, unknown> | null): SetupChoice {
  const r = raw ?? {};
  const opp = Array.isArray(r.opponentIds) ? r.opponentIds : [];
  const slot = (i: 0 | 1): string => {
    const v: unknown = opp[i];
    return v === RANDOM || isCharacter(v) ? v : DEFAULT_SETUP.opponentIds[i];
  };
  return {
    characterId: isCharacter(r.characterId) ? r.characterId : DEFAULT_SETUP.characterId,
    teammateId: isCharacter(r.teammateId) ? r.teammateId : DEFAULT_SETUP.teammateId,
    opponentIds: [slot(0), slot(1)],
    courtId: typeof r.courtId === 'string' && courts.some((c) => c.id === r.courtId) ? r.courtId : DEFAULT_SETUP.courtId,
    aiProfile: typeof r.aiProfile === 'string' && isAiProfileId(r.aiProfile) ? r.aiProfile : DEFAULT_SETUP.aiProfile,
  };
}

/** Rolls RANDOM slots (outside the sim, so Math.random is fine) and builds the match options. */
export function toGameOptions(setup: SetupChoice, seed: number, rand: () => number = Math.random, debug = false): GameOptions {
  const roll = (id: string): string =>
    id === RANDOM ? (characters[Math.min(characters.length - 1, Math.floor(rand() * characters.length))]?.id ?? DEFAULT_SETUP.opponentIds[0]) : id;
  return {
    mode: 'match',
    characterId: setup.characterId,
    teammateId: setup.teammateId,
    opponentIds: [roll(setup.opponentIds[0]), roll(setup.opponentIds[1])],
    courtId: setup.courtId,
    aiProfile: setup.aiProfile,
    seed,
    durationMs: DEFAULT_DURATION_MS,
    debug,
  };
}
```

(Export `DEFAULT_OPPONENT_IDS`/`DEFAULT_TEAMMATE_ID` already exist in `url-options.ts`; `isAiProfileId` and `DEFAULT_AI_PROFILE_ID` exist in `src/sim/ai/profile.ts` — import types/values from sim is allowed for `app/`.) Run — PASS. **Commit** `feat(app): setup model with random opponents`.

- [ ] **Step 3: Setup storage — failing test** (append to `tests/app/storage.test.ts`, reusing `memory()` and `throwing`):

```ts
import { loadSetup, saveSetup } from '../../src/app/storage';
import { DEFAULT_SETUP } from '../../src/app/setup-model';

describe('setup storage (spec E.2)', () => {
  it('round-trips and sanitizes', () => {
    const store = memory();
    const setup = { ...DEFAULT_SETUP, characterId: 'dash', opponentIds: ['random', 'ace'] as [string, string] };
    saveSetup(setup, store);
    expect(Object.keys(store.data)).toEqual(['roarball.setup.v1']);
    expect(loadSetup(store)).toEqual(setup);
    expect(loadSetup(memory({ 'roarball.setup.v1': '{"characterId":"zz"}' }))).toEqual(DEFAULT_SETUP);
    expect(loadSetup(throwing)).toEqual(DEFAULT_SETUP);
    expect(() => saveSetup(setup, throwing)).not.toThrow();
  });
});
```

Implement in `src/app/storage.ts`:

```ts
import { sanitizeSetup, type SetupChoice } from './setup-model';

const SETUP_KEY = 'roarball.setup.v1';

export function loadSetup(store: StorageLike | null = browserStorage()): SetupChoice {
  return sanitizeSetup(readJson(store, SETUP_KEY));
}

export function saveSetup(setup: SetupChoice, store: StorageLike | null = browserStorage()): void {
  writeJson(store, SETUP_KEY, setup);
}
```

Run — PASS. **Commit** `feat(app): remember the last setup`.

- [ ] **Step 4: Setup screen — failing test** `tests/ui/screens/setup.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildSetupCatalog, DEFAULT_SETUP, RANDOM } from '../../../src/app/setup-model';
import { SetupScreen } from '../../../src/ui/screens/setup';

function make(setup = DEFAULT_SETUP) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onStart = vi.fn();
  const onBack = vi.fn();
  const screen = new SetupScreen(root, { setup: { ...setup }, catalog: buildSetupCatalog(), onStart, onBack });
  const q = (sel: string) => root.querySelector<HTMLElement>(sel);
  return { root, screen, onStart, onBack, q };
}

describe('SetupScreen (spec E.1)', () => {
  it('renders the rows You, Teammate, Opponent 1, Opponent 2, Court, Difficulty, Start', () => {
    const { root } = make();
    expect([...root.querySelectorAll('[data-row-label]')].map((e) => e.textContent)).toEqual([
      'YOU', 'TEAMMATE', 'OPPONENT 1', 'OPPONENT 2', 'COURT', 'DIFFICULTY',
    ]);
    // 4 characters in the first two rows; 4 + RANDOM in each opponent row; 4 courts; 3 profiles.
    expect(root.querySelectorAll('[data-nav-row="0"]').length).toBe(4);
    expect(root.querySelectorAll('[data-nav-row="2"]').length).toBe(5);
    expect(root.querySelectorAll('[data-nav-row="4"]').length).toBe(4);
    expect(root.querySelectorAll('[data-nav-row="5"]').length).toBe(3);
    expect(root.querySelector('[data-nav-row="6"]')?.textContent).toBe('START');
  });

  it('marks the current choices selected', () => {
    const { q } = make();
    expect(q('[data-field="characterId"][data-value="rook"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-field="aiProfile"][data-value="fair"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-field="characterId"][data-value="ace"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('character cards show the ability and seven stat bars; court cards the description and modifier', () => {
    const { q } = make();
    const ace = q('[data-field="characterId"][data-value="ace"]');
    expect(ace?.textContent).toContain('Hot Hand');
    expect(ace?.querySelectorAll('.stat-bar').length).toBe(7);
    expect(q('[data-field="courtId"][data-value="rooftop"]')?.textContent).toContain('Gusts');
    expect(q('[data-field="courtId"][data-value="gym"]')?.textContent).toContain('No modifier');
  });

  it('clicking cards changes the choice; START reports it; back calls onBack', () => {
    const { q, onStart, screen, onBack } = make();
    q('[data-field="characterId"][data-value="dash"]')?.click();
    q('[data-field="opponent1"][data-value="random"]')?.click();
    q('[data-field="courtId"][data-value="frozen"]')?.click();
    q('[data-field="aiProfile"][data-value="easy"]')?.click();
    q('[data-action="start"]')?.click();
    expect(onStart).toHaveBeenCalledWith({
      ...DEFAULT_SETUP,
      characterId: 'dash',
      opponentIds: ['brick', RANDOM],
      courtId: 'frozen',
      aiProfile: 'easy',
    });
    screen.handleCommand('back');
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('starts with focus on START so a quick confirm plays the remembered setup', () => {
    const { screen, onStart } = make();
    screen.handleCommand('confirm');
    expect(onStart).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 5: Implement `src/ui/screens/setup.ts`** (`ui/` must not import `content/`, so the **app** passes the data in). The screen's options carry a `catalog` (the test above already passes one) of this exact shape:

```ts
export interface SetupCatalog {
  characters: { id: string; name: string; color: number; abilityName: string; abilityIcon: string; stats: Record<'speed' | 'jump' | 'shooting' | 'dunking' | 'defense' | 'power' | 'stamina', number> }[];
  courts: { id: string; name: string; description: string; modifierName: string; floorColor: number; skyColor: number }[];
  profiles: { id: AiProfileId; label: string }[];
}
```

and build it in the app with `buildSetupCatalog()` in `src/app/setup-model.ts`:

```ts
export function buildSetupCatalog(): SetupCatalog {
  return {
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.appearance.primaryColor,
      abilityName: ABILITIES[c.abilityId]?.name ?? c.abilityId,
      abilityIcon: ABILITIES[c.abilityId]?.icon ?? '',
      stats: { ...c.stats },
    })),
    courts: courts.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      modifierName: c.modifier?.name ?? 'No modifier',
      floorColor: c.dressing.floorColor,
      skyColor: c.lighting.skyColor,
    })),
    profiles: [
      { id: 'easy', label: 'EASY' },
      { id: 'fair', label: 'FAIR' },
      { id: 'hard', label: 'HARD' },
    ],
  };
}
```

(`SetupCatalog` is declared in `src/ui/screens/setup.ts` and imported as a type by `setup-model.ts`; `app/` may import `ui/`.) `buildSetupCatalog` also needs `import { ABILITIES } from '../content/abilities'` and `import type { SetupCatalog } from '../ui/screens/setup'`.

Screen structure (one `<section>` per row, cards are `<button>`s):

```ts
import type { SetupChoice } from '../../app/setup-model';
import type { MenuCommand } from '../../input/menu-input';
import type { AiProfileId } from '../../sim/ai/profile';
import { MenuNav } from '../menu-nav';
import './screens.css';
import './setup.css';

const RANDOM = 'random';
const STAT_ORDER = ['speed', 'jump', 'shooting', 'dunking', 'defense', 'power', 'stamina'] as const;
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

type Field = 'characterId' | 'teammateId' | 'opponent0' | 'opponent1' | 'courtId' | 'aiProfile';
```

Rows: `[label, field, navRow]` = `YOU/characterId/0`, `TEAMMATE/teammateId/1`, `OPPONENT 1/opponent0/2`, `OPPONENT 2/opponent1/3`, `COURT/courtId/4`, `DIFFICULTY/aiProfile/5`, then `START` (`data-action="start"`, `data-nav-row="6"`, class `menu-button is-primary`). Each row: `<section class="setup-row"><h3 data-row-label>LABEL</h3><div class="setup-cards">…cards…</div></section>`. Character card: `<button class="setup-card" data-field data-value aria-pressed data-nav-row style="--card-color:#hex">` containing `<strong>Name</strong><span class="setup-ability">icon abilityName</span><span class="setup-stats">` + 7 × `<span class="stat-bar" title="speed 5"><span style="width:50%"></span></span>` + `</span>`. Random card (opponent rows only, last): `<button class="setup-card is-random" data-value="random">?<strong>RANDOM</strong></button>`. Court card: name, description, `<span class="setup-modifier">modifierName</span>`, background `linear-gradient(160deg, sky 0%, floor 100%)`. Difficulty: three `menu-button is-secondary` with `aria-pressed`. Clicking a card sets the field (`opponent0`/`opponent1` write `opponentIds[0|1]`), updates `aria-pressed` within its row, and leaves focus on the card. START calls `onStart({ ...choice, opponentIds: [...] })`. After building, `nav = new MenuNav(el, opts.onBack)` and focus START (`el.querySelector('[data-action="start"]').focus()`). `handleCommand` → `nav.handle`.

`src/ui/screens/setup.css`:

```css
.screen-setup {
  justify-content: flex-start;
  gap: 10px;
}
.setup-row {
  width: min(1100px, 100%);
}
.setup-row h3 {
  margin: 0 0 6px;
  font-size: 13px;
  letter-spacing: 0.14em;
  opacity: 0.75;
}
.setup-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.setup-card {
  min-height: 72px;
  padding: 10px 12px;
  border: 3px solid transparent;
  border-radius: 14px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--card-color, #39424f) 70%, #000), #1b2028);
  color: #fff;
  font: 600 14px/1.25 system-ui, sans-serif;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
}
.setup-card strong {
  font-size: 18px;
  font-weight: 900;
}
.setup-card[aria-pressed='true'] {
  border-color: #ffb020;
  box-shadow: 0 0 0 2px rgb(255 176 32 / 0.35);
}
.setup-card:focus {
  outline: 4px solid #fff;
  outline-offset: 2px;
}
.setup-stats {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
  align-items: end;
  height: 26px;
}
.stat-bar {
  display: flex;
  align-items: flex-end;
  height: 100%;
  background: rgb(255 255 255 / 0.12);
  border-radius: 2px;
  writing-mode: vertical-lr;
}
.stat-bar > span {
  display: block;
  width: 100%;
  background: #ffb020;
  border-radius: 2px;
}
.setup-card.is-random {
  align-items: center;
  justify-content: center;
  font-size: 28px;
}
@media (max-height: 520px) {
  .setup-card {
    min-height: 56px;
    padding: 6px 10px;
  }
  .setup-stats {
    height: 18px;
  }
}
```

For the stat bars use the height instead of width: `<span style="height:${stat * 10}%">` and drop `writing-mode` (simpler; adjust the CSS so `.stat-bar > span { height: …}` is driven inline). Run the test — PASS. **Commit** `feat(ui): Setup screen with character, court and difficulty cards`.

- [ ] **Step 6: Wire Setup into the shell.** In `AppShell`: hold `setup: SetupChoice = loadSetup(store)`; `show('setup')` creates `SetupScreen` with `catalog: buildSetupCatalog()`, `onStart: (s) => { this.setup = s; saveSetup(s, this.store); this.options = toGameOptions(s, Date.now() >>> 0, Math.random, new URLSearchParams(window.location.search).has('debug')); this.dispatch({ type: 'start' }); }`, `onBack: () => this.dispatch({ type: 'back' })`. Remove the Task 1 placeholder for `setup` (keep the `results` placeholder: `return this.show('title')`, Task 3 replaces it). Update `tests/app/shell.test.ts`: the first test becomes "Title → PLAY → Setup → START → match", and add "Setup back returns to the Title" and "START stores the setup in `roarball.setup.v1`". Run `npm run check` — PASS. **Commit** `feat(app): Setup screen in the flow`.

- [ ] **Step 7: Browser check (controller)** on a desktop viewport and a 1024×768 and 812×375 (phone landscape) emulation: all rows fit or scroll, cards ≥ 56 px tall, keyboard navigation reaches every card and START, the remembered setup is preselected after reload. PR `Phase 6 Task 2: Setup screen`.

---

## Task 3: Results screen and box score

**Files:**
- Create: `src/app/box-score.ts`, `src/ui/screens/results.ts`, `src/ui/screens/results.css`
- Modify: `src/app/match-screen.ts` (feed `BoxScore`, report `MatchResult`), `src/app.ts` (Results screen, rematch)
- Test: `tests/app/box-score.test.ts`, `tests/ui/screens/results.test.ts`, `tests/app/shell.test.ts` (extend)

**Interfaces:**
- Consumes: `SimEvent`, `MatchState`, `PlayerId`, `TeamIndex` (sim types), `MatchScreen` (Task 1), `getCharacter`.
- Produces:
  - `src/app/box-score.ts`: `interface BoxLine { id: PlayerId; team: TeamIndex; name: string; points: number; dunks: number; threes: number; assists: number; steals: number; blocks: number; abilityUses: number }`; `class BoxScore { constructor(players: { id: PlayerId; team: TeamIndex; name: string }[]); record(events: readonly SimEvent[], tick: number): void; lines(): BoxLine[] }`; `const ASSIST_WINDOW_TICKS = 180`; `interface MatchResult { score: [number, number]; humanTeam: TeamIndex; overtime: boolean; lines: BoxLine[]; options: GameOptions }`.
  - `MatchScreenDeps.onFinished(result: MatchResult)` (replaces `MatchFinish`).
  - `src/ui/screens/results.ts`: `class ResultsScreen { constructor(parent, opts: { result: MatchResult; humanId: PlayerId; onRematch(): void; onChangeSetup(): void; onTitle(): void }); handleCommand(c): void; dispose(): void }`; exported pure `resultHeadline(result: MatchResult): 'YOU WIN!' | 'YOU LOSE' | 'OVERTIME WIN!'`.

- [ ] **Step 1: BoxScore — failing test** `tests/app/box-score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BoxScore } from '../../src/app/box-score';
import type { SimEvent } from '../../src/sim/types';

const players = [
  { id: 'home1', team: 0 as const, name: 'Rook' },
  { id: 'home2', team: 0 as const, name: 'Ace' },
  { id: 'away1', team: 1 as const, name: 'Brick' },
  { id: 'away2', team: 1 as const, name: 'Dash' },
];
const line = (box: BoxScore, id: string) => box.lines().find((l) => l.id === id);

describe('BoxScore (spec E.1, plan decision 14)', () => {
  it('counts points, dunks, threes, steals, blocks and ability uses', () => {
    const box = new BoxScore(players);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }], 10);
    box.record([{ type: 'basket', playerId: 'home2', team: 0, points: 3, shotType: 'jumpshot' }], 20);
    box.record([{ type: 'steal', by: 'away1', from: 'home1' }, { type: 'block', by: 'away2', shooter: 'home2' }], 30);
    box.record([{ type: 'abilityActivated', playerId: 'away1', abilityId: 'rocketDunk' }], 40);
    expect(line(box, 'home1')).toMatchObject({ points: 2, dunks: 1, threes: 0 });
    expect(line(box, 'home2')).toMatchObject({ points: 3, threes: 1 });
    expect(line(box, 'away1')).toMatchObject({ steals: 1, abilityUses: 1 });
    expect(line(box, 'away2')).toMatchObject({ blocks: 1 });
  });

  it('credits an assist when the receiver scores within 180 ticks of catching a teammate pass', () => {
    const box = new BoxScore(players);
    const pass: SimEvent = { type: 'pass', from: 'home2', to: 'home1', lob: false };
    box.record([pass], 100);
    box.record([{ type: 'catch', playerId: 'home1' }], 120);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }], 300);
    expect(line(box, 'home2')?.assists).toBe(1);
  });

  it('no assist after the window, after a possession change, or after an interception', () => {
    const late = new BoxScore(players);
    late.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    late.record([{ type: 'catch', playerId: 'home1' }], 10);
    late.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }], 191);
    expect(line(late, 'home2')?.assists).toBe(0);

    const turnover = new BoxScore(players);
    turnover.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    turnover.record([{ type: 'catch', playerId: 'home1' }], 10);
    turnover.record([{ type: 'possessionChange', team: 1 }], 20);
    turnover.record([{ type: 'possessionChange', team: 0 }], 30);
    turnover.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }], 40);
    expect(line(turnover, 'home2')?.assists).toBe(0);

    const picked = new BoxScore(players);
    picked.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    picked.record([{ type: 'intercept', playerId: 'away1' }, { type: 'catch', playerId: 'away1' }], 5);
    picked.record([{ type: 'basket', playerId: 'away1', team: 1, points: 2, shotType: 'layup' }], 50);
    expect(line(picked, 'home2')?.assists).toBe(0);
  });

  it('a basket clears every pending assist (the next basket needs a new pass)', () => {
    const box = new BoxScore(players);
    box.record([{ type: 'pass', from: 'home2', to: 'home1', lob: false }], 0);
    box.record([{ type: 'catch', playerId: 'home1' }], 5);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }], 20);
    box.record([{ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }], 60);
    expect(line(box, 'home2')?.assists).toBe(1);
  });

  it('lines keep the roster order', () => {
    expect(new BoxScore(players).lines().map((l) => l.id)).toEqual(['home1', 'home2', 'away1', 'away2']);
  });
});
```

- [ ] **Step 2: Implement `src/app/box-score.ts`:**

```ts
import type { GameOptions } from './url-options';
import type { PlayerId, SimEvent, TeamIndex } from '../sim/types';

/** Spec D.2's assist window, mirrored from the sim's charge rule. */
export const ASSIST_WINDOW_TICKS = 180;

export interface BoxLine {
  id: PlayerId;
  team: TeamIndex;
  name: string;
  points: number;
  dunks: number;
  threes: number;
  assists: number;
  steals: number;
  blocks: number;
  abilityUses: number;
}

export interface MatchResult {
  score: [number, number];
  humanTeam: TeamIndex;
  overtime: boolean;
  lines: BoxLine[];
  options: GameOptions;
}

/** Spec E.1: the Results box score, built from sim events only (plan decision 14). */
export class BoxScore {
  private readonly byId = new Map<PlayerId, BoxLine>();
  /** Receiver → passer of a pass in the air. */
  private readonly pending = new Map<PlayerId, PlayerId>();
  /** Receiver → passer and catch tick. */
  private readonly caught = new Map<PlayerId, { from: PlayerId; tick: number }>();

  constructor(players: readonly { id: PlayerId; team: TeamIndex; name: string }[]) {
    for (const p of players) {
      this.byId.set(p.id, { ...p, points: 0, dunks: 0, threes: 0, assists: 0, steals: 0, blocks: 0, abilityUses: 0 });
    }
  }

  record(events: readonly SimEvent[], tick: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'pass':
          this.pending.set(e.to, e.from);
          break;
        case 'intercept':
          this.pending.clear();
          break;
        case 'catch': {
          const from = this.pending.get(e.playerId);
          this.pending.delete(e.playerId);
          if (from !== undefined && this.byId.get(from)?.team === this.byId.get(e.playerId)?.team) {
            this.caught.set(e.playerId, { from, tick });
          }
          break;
        }
        case 'possessionChange':
          this.caught.clear();
          this.pending.clear();
          break;
        case 'basket': {
          const scorer = this.byId.get(e.playerId);
          if (scorer) {
            scorer.points += e.points;
            if (e.shotType === 'dunk') scorer.dunks += 1;
            if (e.points === 3) scorer.threes += 1;
          }
          const c = this.caught.get(e.playerId);
          if (c && tick - c.tick <= ASSIST_WINDOW_TICKS) {
            const passer = this.byId.get(c.from);
            if (passer) passer.assists += 1;
          }
          this.caught.clear();
          break;
        }
        case 'steal':
          this.bump(e.by, 'steals');
          break;
        case 'block':
          this.bump(e.by, 'blocks');
          break;
        case 'abilityActivated':
          this.bump(e.playerId, 'abilityUses');
          break;
        default:
          break;
      }
    }
  }

  lines(): BoxLine[] {
    return [...this.byId.values()].map((l) => ({ ...l }));
  }

  private bump(id: PlayerId, key: 'steals' | 'blocks' | 'abilityUses'): void {
    const l = this.byId.get(id);
    if (l) l[key] += 1;
  }
}
```

Run — PASS. **Commit** `feat(app): BoxScore from sim events`.

- [ ] **Step 3: Cross-check against the sim** — add to `tests/app/box-score.test.ts` a test that plays one full AI match headless and feeds each tick's events to a `BoxScore`. `playAiMatch` (`tests/sim/ai-match.ts:53`) flattens events without ticks, so copy its loop (it uses `startState`, `roster`, `createAiMemory`, `decide`, `tick`, `AI_PROFILES.fair`, all importable as in that file) and after each `tick(...)` call `box.record(r.events, r.state.tick)`; use seed 7, the gym and `ABILITIES`. Players: `roster.map((e) => ({ id: e.id, team: e.team, name: e.character.name }))`. Assert per team `sum(points) === state.score[team]` and that the total assists are ≥ 0 and ≤ the number of baskets. Run — PASS. **Commit** `test(app): BoxScore agrees with the sim's score`.

- [ ] **Step 4: MatchScreen reports `MatchResult`.** In `match-screen.ts`: build `box = new BoxScore(roster.map(({ id, team, characterId }) => ({ id, team, name: getCharacter(characterId).name })))` (roster via `buildRoster(options)`) on construction and on restart; after each `runner.step` call `box.record(events, runner.current.tick)`; `onFinished({ score: [...state.score], humanTeam: 0, overtime: state.overtime, lines: box.lines(), options })`. Delete `MatchFinish`. Update the shell.

- [ ] **Step 5: Results screen — failing test** `tests/ui/screens/results.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { MatchResult } from '../../../src/app/box-score';
import { readGameOptions } from '../../../src/app/url-options';
import { ResultsScreen, resultHeadline } from '../../../src/ui/screens/results';

const line = (id: string, team: 0 | 1, name: string, points: number) => ({
  id, team, name, points, dunks: 1, threes: 0, assists: 2, steals: 0, blocks: 1, abilityUses: 1,
});
const result = (score: [number, number], overtime = false): MatchResult => ({
  score,
  humanTeam: 0,
  overtime,
  lines: [line('home1', 0, 'Rook', 12), line('home2', 0, 'Ace', 9), line('away1', 1, 'Brick', 10), line('away2', 1, 'Dash', 8)],
  options: readGameOptions('', 0),
});

describe('resultHeadline', () => {
  it('reads the human team', () => {
    expect(resultHeadline(result([21, 18]))).toBe('YOU WIN!');
    expect(resultHeadline(result([18, 21]))).toBe('YOU LOSE');
    expect(resultHeadline(result([23, 21], true))).toBe('OVERTIME WIN!');
    expect(resultHeadline(result([21, 23], true))).toBe('YOU LOSE');
  });
});

describe('ResultsScreen (spec E.1)', () => {
  it('shows score, headline and a box score row per player with the human marked', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const screen = new ResultsScreen(root, { result: result([21, 18]), humanId: 'home1', onRematch: vi.fn(), onChangeSetup: vi.fn(), onTitle: vi.fn() });
    expect(root.querySelector('.results-headline')?.textContent).toBe('YOU WIN!');
    expect(root.querySelector('.results-score')?.textContent).toBe('21 – 18');
    const rows = root.querySelectorAll('tbody tr');
    expect(rows.length).toBe(4);
    expect(rows[0]?.classList.contains('is-you')).toBe(true);
    expect([...root.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['', 'PTS', 'DNK', '3PT', 'AST', 'STL', 'BLK', 'ABL']);
    screen.dispose();
  });

  it('REMATCH has focus; buttons and back call their handlers', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const opts = { result: result([21, 18]), humanId: 'home1', onRematch: vi.fn(), onChangeSetup: vi.fn(), onTitle: vi.fn() };
    const screen = new ResultsScreen(root, opts);
    screen.handleCommand('confirm');
    expect(opts.onRematch).toHaveBeenCalledOnce();
    root.querySelector<HTMLButtonElement>('[data-action="setup"]')?.click();
    expect(opts.onChangeSetup).toHaveBeenCalledOnce();
    screen.handleCommand('back');
    expect(opts.onTitle).toHaveBeenCalledOnce();
    screen.dispose();
  });
});
```

- [ ] **Step 6: Implement `src/ui/screens/results.ts`** — structure: `div.screen.screen-results` › `h1.results-headline` (team-0 blue `#2f80ed` when winning, grey otherwise), `div.results-score` (`${home} – ${away}`, en dash with spaces), `table.results-box` with `thead` (`''`, `PTS`, `DNK`, `3PT`, `AST`, `STL`, `BLK`, `ABL`) and one `tbody tr` per line (`class="team-0|team-1"` plus `is-you` for `humanId`; first cell the name with a small team-colour dot), then a `menu-column` row of three buttons: `REMATCH` (`data-action="rematch"`, primary, row 0, column 0), `CHANGE SETUP` (`data-action="setup"`, row 0), `TITLE` (`data-action="title"`, row 0). `MenuNav(el, onTitle)`; focus REMATCH. `resultHeadline`: human won → `overtime ? 'OVERTIME WIN!' : 'YOU WIN!'`, else `'YOU LOSE'`. CSS in `results.css`: compact table, tabular numbers, `.is-you` row highlighted with `#ffb020` left border, buttons laid out in a row (`flex-direction: row; flex-wrap: wrap`). Run — PASS. **Commit** `feat(ui): Results screen with box score`.

- [ ] **Step 7: Shell wiring.** `show('results')` creates `ResultsScreen` from the stored last `MatchResult`; `onRematch` → `this.options = { ...result.options, seed: (result.options.seed + 1) >>> 0 }` then `dispatch({ type: 'rematch' })`; `onChangeSetup` → `dispatch({ type: 'changeSetup' })`; `onTitle` → `dispatch({ type: 'toTitle' })`. `onFinished(result)` stores it and dispatches `finished`. Extend `tests/app/shell.test.ts`: calling the mocked `MatchScreen`'s `deps.onFinished(fakeResult)` shows Results; REMATCH starts a match whose `options.seed` is `seed + 1` (assert on the mock's received `deps.options.seed`). Run `npm run check` — PASS. **Commit** `feat(app): Results in the flow with rematch`.

- [ ] **Step 8: Browser check (controller)** with `?duration=15`: the last basket's banner shows, then FINAL, then Results ~2.5 s later; box score totals match the final score; Rematch/Change setup/Title work by touch, keyboard. PR `Phase 6 Task 3: Results and box score`.

---
## Task 4: Gamepad (backend, hot-plug, menus, rumble)

**Files:**
- Create: `src/input/gamepad.ts`
- Modify: `src/input/menu-input.ts` (gamepad polling), `src/app/match-screen.ts` (backend + rumble), `src/app.ts` (pass `getPads` through for tests only if needed)
- Test: `tests/input/gamepad.test.ts`, `tests/input/menu-input.test.ts` (extend)

**Interfaces:**
- Consumes: `InputBackend`, `BackendKind` (`src/input/types.ts`), `MenuCommand`, `MenuInput` (Task 1), `Settings.vibration` (Task 1), `SimEvent`.
- Produces:
  - `src/input/gamepad.ts`: `type PadSource = () => readonly (Gamepad | null)[]`; `defaultPadSource: PadSource`; `const DEAD_ZONE = 0.2`; `applyDeadZone(x: number, y: number): { x: number; y: number }`; `readPad(pad: Gamepad): PlayerIntent & { start: boolean }` (stick space, y up); `class GamepadBackend implements InputBackend { kind = 'gamepad'; constructor(getPads?: PadSource); sample(): PlayerIntent; activePad(): Gamepad | null; dispose(): void }`; `interface Rumble { ms: number; strong: number; weak: number }`; `rumbleFor(event: SimEvent, humanId: PlayerId, humanTeam: TeamIndex): Rumble | null`; `playRumble(pad: Gamepad | null, rumble: Rumble): void`.
  - `MenuInput` constructor gains `getPads: PadSource = defaultPadSource`; `poll()` emits commands on gamepad button/stick edges.

Standard mapping indices (W3C "standard" layout): buttons 0 A, 1 B, 2 X, 3 Y, 7 RT, 9 Start, 12 up, 13 down, 14 left, 15 right; axes 0 left-x, 1 left-y (down is +). RT is analog: pressed when `value > 0.5` or `pressed`.

- [ ] **Step 1: Failing tests** `tests/input/gamepad.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { applyDeadZone, GamepadBackend, playRumble, readPad, rumbleFor } from '../../src/input/gamepad';

function pad(index: number, opts: { axes?: number[]; pressed?: number[]; values?: Record<number, number> } = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: opts.pressed?.includes(i) ?? false,
    touched: false,
    value: opts.values?.[i] ?? (opts.pressed?.includes(i) ? 1 : 0),
  }));
  return { index, id: `pad${index}`, connected: true, mapping: 'standard', axes: opts.axes ?? [0, 0, 0, 0], buttons, timestamp: 0, vibrationActuator: null } as unknown as Gamepad;
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

  it('survives a pad source that throws (no Gamepad API)', () => {
    const backend = new GamepadBackend(() => {
      throw new Error('not supported');
    });
    expect(backend.sample().action).toBe(false);
  });
});

describe('rumbleFor (plan decision 17)', () => {
  it('rumbles on own-team dunks, blocks suffered, knockdowns suffered and own Earthquake', () => {
    expect(rumbleFor({ type: 'basket', playerId: 'home2', team: 0, points: 2, shotType: 'dunk' }, 'home1', 0)).toEqual({ ms: 200, strong: 0.6, weak: 0.3 });
    expect(rumbleFor({ type: 'basket', playerId: 'away1', team: 1, points: 2, shotType: 'dunk' }, 'home1', 0)).toBeNull();
    expect(rumbleFor({ type: 'block', by: 'away1', shooter: 'home1' }, 'home1', 0)).toEqual({ ms: 150, strong: 0.4, weak: 0.6 });
    expect(rumbleFor({ type: 'knockdown', by: 'away1', target: 'home1' }, 'home1', 0)).toEqual({ ms: 300, strong: 1, weak: 0.5 });
    expect(rumbleFor({ type: 'abilityActivated', playerId: 'home1', abilityId: 'earthquake' }, 'home1', 0)).toEqual({ ms: 400, strong: 1, weak: 1 });
    expect(rumbleFor({ type: 'abilityActivated', playerId: 'away1', abilityId: 'earthquake' }, 'home1', 0)).toBeNull();
    expect(rumbleFor({ type: 'rimHit' }, 'home1', 0)).toBeNull();
  });

  it('playRumble uses dual-rumble and never throws', () => {
    const playEffect = vi.fn(() => Promise.resolve('complete'));
    const p = { vibrationActuator: { playEffect } } as unknown as Gamepad;
    playRumble(p, { ms: 200, strong: 0.6, weak: 0.3 });
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', { duration: 200, strongMagnitude: 0.6, weakMagnitude: 0.3, startDelay: 0 });
    const broken = { vibrationActuator: { playEffect: () => { throw new Error('x'); } } } as unknown as Gamepad;
    expect(() => playRumble(broken, { ms: 1, strong: 1, weak: 1 })).not.toThrow();
    expect(() => playRumble(null, { ms: 1, strong: 1, weak: 1 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run** — FAIL. **Implement `src/input/gamepad.ts`:**

```ts
import { v2Normalize } from '../sim/math';
import type { PlayerId, PlayerIntent, SimEvent, TeamIndex } from '../sim/types';
import type { InputBackend } from './types';

export type PadSource = () => readonly (Gamepad | null)[];

export const defaultPadSource: PadSource = () =>
  typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];

/** Spec E.3: radial dead zone, rescaled so the stick still reaches every speed. */
export const DEAD_ZONE = 0.2;

export function applyDeadZone(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= DEAD_ZONE) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - DEAD_ZONE) / (1 - DEAD_ZONE));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

const B = { a: 0, b: 1, x: 2, y: 3, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

function held(pad: Gamepad, i: number): boolean {
  const b = pad.buttons[i];
  return !!b && (b.pressed || b.value > 0.5);
}

/** Spec E.3 standard mapping → an intent in stick space (y up) plus Start. */
export function readPad(pad: Gamepad): PlayerIntent & { start: boolean } {
  const dx = (held(pad, B.right) ? 1 : 0) - (held(pad, B.left) ? 1 : 0);
  const dy = (held(pad, B.up) ? 1 : 0) - (held(pad, B.down) ? 1 : 0);
  const move = dx !== 0 || dy !== 0 ? v2Normalize({ x: dx, y: dy }) : applyDeadZone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
  return {
    move,
    action: held(pad, B.a),
    pass: held(pad, B.x),
    special: held(pad, B.y),
    turbo: held(pad, B.rt) || held(pad, B.b),
    start: held(pad, B.start),
  };
}

function isActive(i: PlayerIntent & { start: boolean }): boolean {
  return i.move.x !== 0 || i.move.y !== 0 || i.action || i.pass || i.special || i.turbo || i.start;
}

const NEUTRAL = (): PlayerIntent => ({ move: { x: 0, y: 0 }, action: false, pass: false, special: false, turbo: false });

/**
 * Spec §8 / E.3 gamepad backend, polled once per tick. Hot-plug: the pad with input most
 * recently drives the human (plan decision 16). Polling at 60 Hz sees every press a player
 * can make, so no latching beyond the poll is needed.
 */
export class GamepadBackend implements InputBackend {
  readonly kind = 'gamepad' as const;
  private activeIndex: number | null = null;
  private lastPads: readonly (Gamepad | null)[] = [];

  constructor(private readonly getPads: PadSource = defaultPadSource) {}

  sample(): PlayerIntent {
    try {
      this.lastPads = this.getPads();
    } catch {
      this.lastPads = [];
    }
    for (const pad of this.lastPads) {
      if (pad && pad.index !== this.activeIndex && isActive(readPad(pad))) this.activeIndex = pad.index;
    }
    const active = this.activePad();
    if (!active) {
      this.activeIndex = null;
      return NEUTRAL();
    }
    const { start: _start, ...intent } = readPad(active);
    return intent;
  }

  activePad(): Gamepad | null {
    return this.lastPads.find((p) => p?.index === this.activeIndex) ?? null;
  }

  dispose(): void {
    this.lastPads = [];
    this.activeIndex = null;
  }
}

export interface Rumble {
  ms: number;
  strong: number;
  weak: number;
}

/** Plan decision 17. */
export function rumbleFor(event: SimEvent, humanId: PlayerId, humanTeam: TeamIndex): Rumble | null {
  switch (event.type) {
    case 'basket':
      return event.shotType === 'dunk' && event.team === humanTeam ? { ms: 200, strong: 0.6, weak: 0.3 } : null;
    case 'block':
      return event.shooter === humanId ? { ms: 150, strong: 0.4, weak: 0.6 } : null;
    case 'knockdown':
      return event.target === humanId ? { ms: 300, strong: 1, weak: 0.5 } : null;
    case 'abilityActivated':
      return event.playerId === humanId && event.abilityId === 'earthquake' ? { ms: 400, strong: 1, weak: 1 } : null;
    default:
      return null;
  }
}

export function playRumble(pad: Gamepad | null, rumble: Rumble): void {
  try {
    void pad?.vibrationActuator?.playEffect('dual-rumble', {
      duration: rumble.ms,
      strongMagnitude: rumble.strong,
      weakMagnitude: rumble.weak,
      startDelay: 0,
    })?.catch(() => undefined);
  } catch {
    // Unsupported actuator: no rumble.
  }
}
```

(`isActive` uses the dead-zoned move, so a drifting idle pad never steals control. If `@types` lacks `vibrationActuator.playEffect`'s `'dual-rumble'` overload in this TS version, narrow through a local `interface Actuator { playEffect(type: 'dual-rumble', params: {...}): Promise<unknown> }` cast.) Note the A.6 latching requirement: the keyboard and touch latch because their events arrive between samples; the gamepad *is* the sample, so a press shorter than one 16.7 ms tick can be missed only if it is also shorter than the browser's own gamepad poll — accepted and documented in the class comment above. Run — PASS. **Commit** `feat(input): gamepad backend, dead zone, rumble`.

- [ ] **Step 3: Menu commands from the gamepad — failing test** (append to `tests/input/menu-input.test.ts`, reusing a `pad()` helper copied from `gamepad.test.ts`):

```ts
describe('MenuInput gamepad (spec E.1)', () => {
  it('emits on press edges: D-pad/stick directions, A confirm, B back, Start pause', () => {
    let pads: (Gamepad | null)[] = [pad(0)];
    input = new MenuInput(window, () => pads);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    input.poll();
    pads = [pad(0, { pressed: [13] })];
    input.poll();
    input.poll(); // held: no repeat yet
    pads = [pad(0, { axes: [0.9, 0, 0, 0] })];
    input.poll();
    pads = [pad(0, { pressed: [0] })];
    input.poll();
    pads = [pad(0, { pressed: [1] })];
    input.poll();
    pads = [pad(0, { pressed: [9] })];
    input.poll();
    expect(got).toEqual(['down', 'right', 'confirm', 'back', 'pause']);
  });

  it('repeats a held direction after 400 ms, then every 150 ms', () => {
    let now = 0;
    const pads = [pad(0, { pressed: [12] })];
    input = new MenuInput(window, () => pads, () => now);
    const got: MenuCommand[] = [];
    input.onCommand = (c) => got.push(c);
    input.poll(); // edge
    now = 399;
    input.poll();
    now = 400;
    input.poll();
    now = 550;
    input.poll();
    expect(got).toEqual(['up', 'up', 'up']);
  });
});
```

Implement: `MenuInput` constructor `(target: Window = window, getPads: PadSource = defaultPadSource, now: () => number = () => performance.now())`. `poll()` reads every connected pad, ORs them into one set of logical commands: direction from D-pad buttons or the stick past 0.5 on its dominant axis, `confirm` = A, `back` = B, `pause` = Start. Emits on the rising edge; a held direction repeats after 400 ms and then every 150 ms (stored `heldSince`/`lastRepeat` per command); buttons do not repeat. Wrap `getPads()` in try/catch. Run — PASS. **Commit** `feat(input): menu navigation with a gamepad`.

- [ ] **Step 4: Wire into `MatchScreen`.** Add `new GamepadBackend()` to the `InputManager` backends (`[keyboard, touch, gamepad]`); `onActiveKindChange` already hides touch for any non-touch kind. After each `runner.step`, when `settings.vibration` is on, for each event `const r = rumbleFor(e, HUMAN_ID, 0); if (r) playRumble(gamepad.activePad(), r);`. Start is handled by `MenuInput` (→ `pause`), so the `GamepadBackend` intent ignores it. Add `?debug` overlay `inputKind` already shows `gamepad`. Run `npm run check` — PASS. **Commit** `feat(app): gamepad play and rumble in the match`.

- [ ] **Step 5: Browser check (controller):** with a real pad if available; otherwise in Chrome via the DevTools console, inject a fake `navigator.getGamepads` returning a pad with button 0 pressed and verify the Title's PLAY fires (documented in the PR). PR `Phase 6 Task 4: gamepad`.

---
## Task 5: Audio engine and synthesized SFX

**Files:**
- Create: `src/audio/sink.ts`, `src/audio/engine.ts`, `src/audio/sfx.ts`, `src/audio/director.ts`, `tests/audio/fake-context.ts`
- Modify: `src/app.ts` (lazy engine on first gesture, menu sounds, settings), `src/app/match-screen.ts` (director per match), `tsconfig`/ESLint only if `src/audio` needs adding to an include list (check `tsconfig.json` `include`)
- Test: `tests/audio/engine.test.ts`, `tests/audio/sfx.test.ts`, `tests/audio/director.test.ts`, `tests/app/shell.test.ts` (extend)

**Interfaces:**
- Consumes: `SimEvent`, `MatchState`, `PlayerState` (sim types), `Settings` (Task 1), `MenuCommand` (Task 1), `ScreenId` (Task 1).
- Produces:
  - `src/audio/sink.ts`:
    ```ts
    export type SfxName =
      | 'bounce' | 'swish' | 'rim' | 'board' | 'squeak' | 'pass' | 'steal' | 'block' | 'shove'
      | 'dunk' | 'crowd' | 'crowdBig' | 'buzzer' | 'rocketDunk' | 'hotHand' | 'blur'
      | 'earthquake' | 'menuMove' | 'menuConfirm';
    export const SFX_NAMES: readonly SfxName[];
    export type TrackId = 'menu' | 'gym' | 'rooftop' | 'volcano' | 'frozen' | 'win' | 'lose';
    export interface AudioSink {
      playSfx(name: SfxName, gain?: number): void;
      setMusic(track: TrackId | null): void;
      duck(seconds: number): void;
      setEnabled(sound: boolean, music: boolean): void;
    }
    export class NullAudioSink implements AudioSink { /* all no-ops */ }
    ```
  - `src/audio/engine.ts`: `MAX_VOICES = 12`; `MIX = { master: 0.9, sfx: 0.8, music: 0.45 }`; `class AudioEngine implements AudioSink { constructor(ctx: AudioContext); static create(): AudioEngine | null; resume(): void; dispose(): void; readonly context: AudioContext; readonly musicBus: GainNode }` (`create` returns null where Web Audio is missing).
  - `src/audio/sfx.ts`: `interface Voice { ctx: BaseAudioContext; out: AudioNode; t: number; gain: number; noise: AudioBuffer }`; `type Patch = (v: Voice) => number` (returns duration in s); `SFX_PATCHES: Record<SfxName, Patch>`; helpers `tone`, `noiseBurst`; `makeNoiseBuffer(ctx): AudioBuffer`.
  - `src/audio/director.ts`: `class AudioDirector { constructor(sink: () => AudioSink); handleEvents(events: readonly SimEvent[]): void; update(prev: MatchState, next: MatchState, nowSeconds: number): void }`; `sfxFor(event: SimEvent): { name: SfxName; gain: number }[]` (pure); `ABILITY_STINGERS: Record<string, SfxName>`.

The director takes a **getter** for the sink so the shell can swap `NullAudioSink` for the real engine after the first gesture without rebuilding the match (plan decision 18).

- [ ] **Step 1: Fake AudioContext for tests** `tests/audio/fake-context.ts`:

```ts
/** Just enough of Web Audio to run patches and the engine in Node: nodes record their wiring. */
export interface FakeNode {
  kind: string;
  connections: FakeNode[];
  disconnected: boolean;
  started: number | null;
  stopped: number | null;
  connect(target: FakeNode): FakeNode;
  disconnect(): void;
  [key: string]: unknown;
}

function param(value = 0) {
  return {
    value,
    events: [] as [string, number, number][],
    setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this; },
    linearRampToValueAtTime(v: number, t: number) { this.events.push(['linear', v, t]); return this; },
    exponentialRampToValueAtTime(v: number, t: number) {
      if (v <= 0) throw new RangeError('exponential ramp to a non-positive value');
      this.events.push(['exp', v, t]);
      return this;
    },
    setTargetAtTime(v: number, t: number) { this.events.push(['target', v, t]); return this; },
    cancelScheduledValues() { return this; },
  };
}

export function fakeAudioContext(currentTime = 0) {
  const nodes: FakeNode[] = [];
  const node = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
    const n: FakeNode = {
      kind,
      connections: [],
      disconnected: false,
      started: null,
      stopped: null,
      connect(target) { this.connections.push(target); return target; },
      disconnect() { this.disconnected = true; },
      start(t = 0) { this.started = t as number; },
      stop(t = 0) { this.stopped = t as number; },
      ...extra,
    };
    nodes.push(n);
    return n;
  };
  const ctx = {
    currentTime,
    sampleRate: 48_000,
    state: 'suspended' as AudioContextState,
    destination: node('destination'),
    nodes,
    resume() { ctx.state = 'running'; return Promise.resolve(); },
    close() { ctx.state = 'closed'; return Promise.resolve(); },
    createGain: () => node('gain', { gain: param(1) }),
    createOscillator: () => node('osc', { type: 'sine', frequency: param(440), detune: param(0) }),
    createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createBufferSource: () => node('buffer', { buffer: null, loop: false, playbackRate: param(1) }),
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(-24), ratio: param(12) }),
  };
  return ctx;
}
export type FakeAudioContext = ReturnType<typeof fakeAudioContext>;
```

- [ ] **Step 2: Patches — failing test** `tests/audio/sfx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SFX_NAMES } from '../../src/audio/sink';
import { makeNoiseBuffer, SFX_PATCHES } from '../../src/audio/sfx';
import { fakeAudioContext } from './fake-context';

describe('SFX patches (spec E.4)', () => {
  it('there is one patch per sound name', () => {
    expect(Object.keys(SFX_PATCHES).sort()).toEqual([...SFX_NAMES].sort());
  });

  it.each(SFX_NAMES)('%s builds a short graph that starts at t, stops, and reaches the output', (name) => {
    const ctx = fakeAudioContext(5);
    const out = ctx.createGain();
    const noise = makeNoiseBuffer(ctx as unknown as BaseAudioContext);
    const duration = SFX_PATCHES[name]({ ctx: ctx as unknown as BaseAudioContext, out: out as unknown as AudioNode, t: 5, gain: 1, noise });
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThanOrEqual(name.startsWith('crowd') || name === 'earthquake' ? 3 : 1.6);
    const sources = ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'buffer');
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) {
      expect(s.started).toBeGreaterThanOrEqual(5);
      expect(s.stopped).not.toBeNull();
      expect(s.stopped as number).toBeLessThanOrEqual(5 + duration + 0.05);
    }
    // Every source feeds, possibly through filters and gains, into `out`.
    const reaches = (n: { connections: unknown[] }, seen = new Set<unknown>()): boolean =>
      n.connections.some((c) => c === out || (!seen.has(c) && (seen.add(c), reaches(c as { connections: unknown[] }, seen))));
    for (const s of sources) expect(reaches(s)).toBe(true);
  });

  it('bounce is louder with a larger gain', () => {
    const peak = (gain: number): number => {
      const ctx = fakeAudioContext();
      const out = ctx.createGain();
      SFX_PATCHES.bounce({ ctx: ctx as unknown as BaseAudioContext, out: out as unknown as AudioNode, t: 0, gain, noise: makeNoiseBuffer(ctx as unknown as BaseAudioContext) });
      const env = ctx.nodes.filter((n) => n.kind === 'gain' && n !== out).flatMap((n) => (n.gain as { events: [string, number, number][] }).events);
      return Math.max(...env.map((e) => e[1]));
    };
    expect(peak(1)).toBeGreaterThan(peak(0.2));
  });
});
```

- [ ] **Step 3: Implement `src/audio/sink.ts`** (types above; `SFX_NAMES` lists all 19 names in the declared order; `NullAudioSink` has four empty methods) **and `src/audio/sfx.ts`:**

```ts
import type { SfxName } from './sink';

export interface Voice {
  ctx: BaseAudioContext;
  out: AudioNode;
  t: number;
  gain: number;
  noise: AudioBuffer;
}
/** Builds one sound into `v.out` starting at `v.t`; returns its length in seconds. */
export type Patch = (v: Voice) => number;

/** One second of white noise, shared by every noise patch. */
export function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Presentation only (spec §3 bans Math.random in the sim, not here).
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

const FLOOR = 0.0001;

/** Attack/decay envelope on a fresh gain node feeding `out`. */
function envelope(v: Voice, start: number, dur: number, peak: number, attack = 0.005): GainNode {
  const g = v.ctx.createGain();
  const t0 = v.t + start;
  g.gain.setValueAtTime(FLOOR, t0);
  g.gain.linearRampToValueAtTime(Math.max(FLOOR, peak * v.gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
  g.connect(v.out);
  return g;
}

export interface ToneSpec {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  start?: number;
  dur: number;
  peak: number;
  attack?: number;
}

export function tone(v: Voice, s: ToneSpec): void {
  const start = s.start ?? 0;
  const osc = v.ctx.createOscillator();
  osc.type = s.type;
  osc.frequency.setValueAtTime(s.freq, v.t + start);
  if (s.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.freqEnd), v.t + start + s.dur);
  osc.connect(envelope(v, start, s.dur, s.peak, s.attack));
  osc.start(v.t + start);
  osc.stop(v.t + start + s.dur + 0.02);
}

export interface NoiseSpec {
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  start?: number;
  dur: number;
  peak: number;
  attack?: number;
}

export function noiseBurst(v: Voice, s: NoiseSpec): void {
  const start = s.start ?? 0;
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  const f = v.ctx.createBiquadFilter();
  f.type = s.filter;
  f.frequency.setValueAtTime(s.freq, v.t + start);
  if (s.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, s.freqEnd), v.t + start + s.dur);
  f.Q.setValueAtTime(s.q ?? 1, v.t + start);
  src.connect(f);
  f.connect(envelope(v, start, s.dur, s.peak, s.attack));
  src.start(v.t + start);
  src.stop(v.t + start + s.dur + 0.02);
}

/** Spec E.4 sound list. Durations are the patch's last envelope end. */
export const SFX_PATCHES: Record<SfxName, Patch> = {
  bounce: (v) => {
    tone(v, { type: 'sine', freq: 140, freqEnd: 55, dur: 0.18, peak: 0.9 });
    noiseBurst(v, { filter: 'lowpass', freq: 900, dur: 0.05, peak: 0.25 });
    return 0.2;
  },
  swish: (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 2500, freqEnd: 6000, q: 0.8, dur: 0.35, peak: 0.5, attack: 0.06 });
    return 0.37;
  },
  rim: (v) => {
    tone(v, { type: 'square', freq: 520, dur: 0.35, peak: 0.18 });
    tone(v, { type: 'sine', freq: 1310, dur: 0.5, peak: 0.25 });
    tone(v, { type: 'sine', freq: 2290, dur: 0.25, peak: 0.12 });
    return 0.52;
  },
  board: (v) => {
    tone(v, { type: 'triangle', freq: 180, freqEnd: 90, dur: 0.15, peak: 0.6 });
    noiseBurst(v, { filter: 'lowpass', freq: 1500, dur: 0.08, peak: 0.35 });
    return 0.17;
  },
  squeak: (v) => {
    tone(v, { type: 'sawtooth', freq: 1900, freqEnd: 2600, dur: 0.09, peak: 0.08, attack: 0.01 });
    return 0.11;
  },
  pass: (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 800, freqEnd: 2200, q: 1.5, dur: 0.18, peak: 0.35, attack: 0.03 });
    return 0.2;
  },
  steal: (v) => {
    noiseBurst(v, { filter: 'highpass', freq: 3000, dur: 0.06, peak: 0.5 });
    tone(v, { type: 'square', freq: 660, freqEnd: 990, dur: 0.12, peak: 0.15 });
    return 0.14;
  },
  block: (v) => {
    tone(v, { type: 'sine', freq: 110, freqEnd: 45, dur: 0.3, peak: 1 });
    noiseBurst(v, { filter: 'lowpass', freq: 2000, freqEnd: 300, dur: 0.25, peak: 0.6 });
    return 0.32;
  },
  shove: (v) => {
    tone(v, { type: 'sine', freq: 90, freqEnd: 40, dur: 0.25, peak: 0.9 });
    noiseBurst(v, { filter: 'lowpass', freq: 600, dur: 0.15, peak: 0.4 });
    return 0.27;
  },
  dunk: (v) => {
    noiseBurst(v, { filter: 'lowpass', freq: 3000, freqEnd: 200, dur: 0.4, peak: 0.9 });
    tone(v, { type: 'sine', freq: 70, freqEnd: 30, dur: 0.6, peak: 1, attack: 0.01 });
    tone(v, { type: 'square', freq: 420, dur: 0.3, peak: 0.12 });
    return 0.62;
  },
  crowd: (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 900, q: 0.6, dur: 1.6, peak: 0.35, attack: 0.25 });
    return 1.62;
  },
  crowdBig: (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 1000, q: 0.5, dur: 2.6, peak: 0.55, attack: 0.2 });
    noiseBurst(v, { filter: 'bandpass', freq: 2400, q: 1.2, start: 0.1, dur: 2.2, peak: 0.2, attack: 0.3 });
    return 2.62;
  },
  buzzer: (v) => {
    tone(v, { type: 'sawtooth', freq: 220, dur: 0.9, peak: 0.25, attack: 0.01 });
    tone(v, { type: 'square', freq: 223, dur: 0.9, peak: 0.15, attack: 0.01 });
    return 0.92;
  },
  rocketDunk: (v) => {
    noiseBurst(v, { filter: 'bandpass', freq: 300, freqEnd: 4000, q: 2, dur: 0.9, peak: 0.6, attack: 0.3 });
    tone(v, { type: 'sawtooth', freq: 110, freqEnd: 880, dur: 0.9, peak: 0.15, attack: 0.2 });
    return 0.92;
  },
  hotHand: (v) => {
    noiseBurst(v, { filter: 'highpass', freq: 5000, dur: 0.8, peak: 0.3, attack: 0.05 });
    tone(v, { type: 'triangle', freq: 660, start: 0, dur: 0.15, peak: 0.3 });
    tone(v, { type: 'triangle', freq: 880, start: 0.12, dur: 0.15, peak: 0.3 });
    tone(v, { type: 'triangle', freq: 1320, start: 0.24, dur: 0.3, peak: 0.3 });
    return 0.82;
  },
  blur: (v) => {
    tone(v, { type: 'sawtooth', freq: 300, freqEnd: 2400, dur: 0.25, peak: 0.2 });
    noiseBurst(v, { filter: 'bandpass', freq: 1500, freqEnd: 6000, q: 3, dur: 0.3, peak: 0.3 });
    return 0.32;
  },
  earthquake: (v) => {
    tone(v, { type: 'sine', freq: 45, freqEnd: 28, dur: 1.4, peak: 1, attack: 0.02 });
    noiseBurst(v, { filter: 'lowpass', freq: 250, dur: 1.2, peak: 0.8, attack: 0.02 });
    noiseBurst(v, { filter: 'bandpass', freq: 1200, q: 0.7, start: 0.05, dur: 0.6, peak: 0.25 });
    return 1.42;
  },
  menuMove: (v) => {
    tone(v, { type: 'square', freq: 880, dur: 0.05, peak: 0.08 });
    return 0.07;
  },
  menuConfirm: (v) => {
    tone(v, { type: 'square', freq: 660, dur: 0.08, peak: 0.1 });
    tone(v, { type: 'square', freq: 990, start: 0.07, dur: 0.12, peak: 0.1 });
    return 0.21;
  },
};
```

Run — PASS (fix any patch whose duration bound or stop time the test flags). **Commit** `feat(audio): synthesized SFX patches`.

- [ ] **Step 4: Engine — failing test** `tests/audio/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AudioEngine, MAX_VOICES } from '../../src/audio/engine';
import { fakeAudioContext } from './fake-context';

const make = () => {
  const ctx = fakeAudioContext();
  return { ctx, engine: new AudioEngine(ctx as unknown as AudioContext) };
};

describe('AudioEngine (spec E.4)', () => {
  it('builds master, sfx and music buses into the destination', () => {
    const { ctx, engine } = make();
    expect(engine.musicBus).toBeDefined();
    expect(ctx.nodes.some((n) => n.connections.includes(ctx.destination))).toBe(true);
  });

  it('caps simultaneous voices at 12, stopping the oldest', () => {
    const { ctx, engine } = make();
    for (let i = 0; i < MAX_VOICES + 3; i++) engine.playSfx('crowd');
    const voiceGains = ctx.nodes.filter((n) => n.kind === 'gain' && n.voice === true);
    expect(voiceGains.length).toBe(MAX_VOICES + 3);
    expect(voiceGains.filter((n) => n.disconnected).length).toBe(3);
    expect(voiceGains.slice(0, 3).every((n) => n.disconnected)).toBe(true);
  });

  it('plays nothing while sound is off; resume() resumes a suspended context', () => {
    const { ctx, engine } = make();
    engine.setEnabled(false, true);
    const before = ctx.nodes.length;
    engine.playSfx('dunk');
    expect(ctx.nodes.length).toBe(before);
    engine.resume();
    expect(ctx.state).toBe('running');
  });

  it('duck lowers the music bus and brings it back', () => {
    const { engine } = make();
    engine.duck(1);
    const events = (engine.musicBus.gain as unknown as { events: [string, number, number][] }).events;
    expect(events.some(([, v]) => v < 0.45)).toBe(true);
    expect(events.at(-1)?.[1]).toBeCloseTo(0.45);
  });
});
```

Implement `src/audio/engine.ts`:

```ts
import { makeNoiseBuffer, SFX_PATCHES } from './sfx';
import type { AudioSink, SfxName, TrackId } from './sink';

export const MAX_VOICES = 12;
/** Fixed mix (spec E.2: volumes are constants until the audio overhaul). */
export const MIX = { master: 0.9, sfx: 0.8, music: 0.45 } as const;

/** Web Audio implementation of the AudioSink seam (spec E.4, plan decisions 18–20). */
export class AudioEngine implements AudioSink {
  readonly musicBus: GainNode;
  private readonly master: GainNode;
  private readonly sfxBus: GainNode;
  private readonly noise: AudioBuffer;
  private readonly voices: { node: GainNode; end: number }[] = [];
  private sound = true;
  private music = true;

  constructor(readonly context: AudioContext) {
    this.master = context.createGain();
    this.master.gain.value = MIX.master;
    this.master.connect(context.destination);
    this.sfxBus = context.createGain();
    this.sfxBus.gain.value = MIX.sfx;
    this.sfxBus.connect(this.master);
    this.musicBus = context.createGain();
    this.musicBus.gain.value = MIX.music;
    this.musicBus.connect(this.master);
    this.noise = makeNoiseBuffer(context);
  }

  /** Null where Web Audio is unavailable; call inside a user gesture (iOS). */
  static create(): AudioEngine | null {
    const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    try {
      const engine = new AudioEngine(new Ctor());
      engine.resume();
      return engine;
    } catch {
      return null;
    }
  }

  resume(): void {
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  playSfx(name: SfxName, gain = 1): void {
    if (!this.sound) return;
    const t = this.context.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) if ((this.voices[i]?.end ?? 0) <= t) this.voices.splice(i, 1);
    const node = this.context.createGain();
    (node as unknown as { voice: boolean }).voice = true; // marks voice nodes for tests and debugging
    node.connect(this.sfxBus);
    const duration = SFX_PATCHES[name]({ ctx: this.context, out: node, t, gain, noise: this.noise });
    this.voices.push({ node, end: t + duration });
    while (this.voices.length > MAX_VOICES) this.voices.shift()?.node.disconnect();
  }

  /** Task 6 plays tracks through the MusicPlayer; until then music is silent. */
  setMusic(_track: TrackId | null): void {}

  duck(seconds: number): void {
    const g = this.musicBus.gain;
    const t = this.context.currentTime;
    const level = this.music ? MIX.music : 0;
    g.cancelScheduledValues(t);
    g.setValueAtTime(level * 0.35, t);
    g.linearRampToValueAtTime(level, t + seconds);
  }

  setEnabled(sound: boolean, music: boolean): void {
    this.sound = sound;
    this.music = music;
    this.master.gain.setValueAtTime(sound || music ? MIX.master : 0, this.context.currentTime);
    this.sfxBus.gain.setValueAtTime(sound ? MIX.sfx : 0, this.context.currentTime);
    this.musicBus.gain.setValueAtTime(music ? MIX.music : 0, this.context.currentTime);
  }

  dispose(): void {
    for (const v of this.voices) v.node.disconnect();
    this.voices.length = 0;
    void this.context.close().catch(() => undefined);
  }
}
```

Note the test marks voice nodes via the `voice` property: the fake's nodes accept arbitrary properties. Run — PASS. **Commit** `feat(audio): AudioEngine with buses, voice cap, ducking`.

- [ ] **Step 5: Director — failing test** `tests/audio/director.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AudioDirector, sfxFor } from '../../src/audio/director';
import type { AudioSink, SfxName, TrackId } from '../../src/audio/sink';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import type { MatchState } from '../../src/sim/types';

class Recorder implements AudioSink {
  sfx: [SfxName, number][] = [];
  ducks: number[] = [];
  playSfx(name: SfxName, gain = 1): void { this.sfx.push([name, gain]); }
  setMusic(_t: TrackId | null): void {}
  duck(s: number): void { this.ducks.push(s); }
  setEnabled(): void {}
}

describe('sfxFor (spec E.4 event map)', () => {
  it('maps every sounding event', () => {
    expect(sfxFor({ type: 'bounce', speed: 8 })).toEqual([{ name: 'bounce', gain: 1 }]);
    expect(sfxFor({ type: 'bounce', speed: 0.4 })).toEqual([{ name: 'bounce', gain: 0.15 }]);
    expect(sfxFor({ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }).map((s) => s.name)).toEqual(['swish', 'crowd']);
    expect(sfxFor({ type: 'basket', playerId: 'home1', team: 0, points: 3, shotType: 'jumpshot' }).map((s) => s.name)).toEqual(['swish', 'crowdBig']);
    expect(sfxFor({ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }).map((s) => s.name)).toEqual(['dunk', 'crowdBig']);
    expect(sfxFor({ type: 'rimHit' })[0]?.name).toBe('rim');
    expect(sfxFor({ type: 'boardHit' })[0]?.name).toBe('board');
    expect(sfxFor({ type: 'pass', from: 'a', to: 'b', lob: false })[0]?.name).toBe('pass');
    expect(sfxFor({ type: 'steal', by: 'a', from: 'b' })[0]?.name).toBe('steal');
    expect(sfxFor({ type: 'intercept', playerId: 'a' })[0]?.name).toBe('steal');
    expect(sfxFor({ type: 'block', by: 'a', shooter: 'b' })[0]?.name).toBe('block');
    expect(sfxFor({ type: 'shove', by: 'a', target: 'b' })[0]?.name).toBe('shove');
    expect(sfxFor({ type: 'knockdown', by: 'a', target: 'b' })[0]?.name).toBe('shove');
    expect(sfxFor({ type: 'shotClockViolation', team: 0 })[0]?.name).toBe('buzzer');
    expect(sfxFor({ type: 'phaseChange', from: 'live', to: 'finished' })[0]?.name).toBe('buzzer');
    expect(sfxFor({ type: 'phaseChange', from: 'scored', to: 'inbound' })).toEqual([]);
    for (const [id, name] of [['rocketDunk', 'rocketDunk'], ['hotHand', 'hotHand'], ['blur', 'blur'], ['earthquake', 'earthquake']] as const) {
      expect(sfxFor({ type: 'abilityActivated', playerId: 'a', abilityId: id })[0]?.name).toBe(name);
    }
    expect(sfxFor({ type: 'catch', playerId: 'a' })).toEqual([]);
  });
});

describe('AudioDirector', () => {
  it('plays through the current sink and ducks music for dunks and abilities', () => {
    const rec = new Recorder();
    const director = new AudioDirector(() => rec);
    director.handleEvents([
      { type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' },
      { type: 'abilityActivated', playerId: 'home1', abilityId: 'blur' },
    ]);
    expect(rec.sfx.map(([n]) => n)).toEqual(['dunk', 'crowdBig', 'blur']);
    expect(rec.ducks).toEqual([0.8, 1]);
  });

  it('squeaks on a sharp turn at speed, at most every 0.25 s per player (plan decision 21)', () => {
    const rec = new Recorder();
    const director = new AudioDirector(() => rec);
    const court = getCourt('gym');
    const base = createMatch(
      { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: ['shotClock'], courtId: 'gym', mode: 'match' },
      court,
      [{ id: 'home1', team: 0, characterId: 'rook', character: getCharacter('rook') }],
    );
    const withVel = (x: number, z: number, y = 0): MatchState => {
      const s = structuredClone(base);
      const p = s.teams[0].players[0];
      if (p) { p.vel = { x, y: 0, z }; p.onGround = y === 0; }
      return s;
    };
    director.update(withVel(5, 0), withVel(0, 5), 1); // 90° turn at 5 m/s → squeak
    director.update(withVel(0, 5), withVel(-5, 0), 1.1); // too soon
    director.update(withVel(-5, 0), withVel(0, -5), 1.3); // ok again
    director.update(withVel(1, 0), withVel(0, 1), 2); // too slow
    director.update(withVel(5, 0, 1), withVel(0, 5, 1), 3); // airborne
    expect(rec.sfx.filter(([n]) => n === 'squeak').length).toBe(2);
  });
});
```

(If `createMatch`'s roster needs both teams, add an `away1` entry; check `createMatch` and the existing tests' rosters.)

Implement `src/audio/director.ts`:

```ts
import type { MatchState, SimEvent } from '../sim/types';
import type { AudioSink, SfxName } from './sink';

export const ABILITY_STINGERS: Readonly<Record<string, SfxName>> = {
  rocketDunk: 'rocketDunk',
  hotHand: 'hotHand',
  blur: 'blur',
  earthquake: 'earthquake',
};

const SQUEAK_SPEED = 3;
const SQUEAK_COS = Math.cos((70 * Math.PI) / 180);
const SQUEAK_GAP_S = 0.25;

/** Spec E.4: which sounds an event makes. Pure; the director adds ducking and squeaks. */
export function sfxFor(event: SimEvent): { name: SfxName; gain: number }[] {
  switch (event.type) {
    case 'bounce':
      return [{ name: 'bounce', gain: Math.min(1, Math.max(0.15, event.speed / 8)) }];
    case 'basket': {
      const big = event.shotType === 'dunk' || event.points === 3;
      return [{ name: event.shotType === 'dunk' ? 'dunk' : 'swish', gain: 1 }, { name: big ? 'crowdBig' : 'crowd', gain: 1 }];
    }
    case 'rimHit':
      return [{ name: 'rim', gain: 1 }];
    case 'boardHit':
      return [{ name: 'board', gain: 1 }];
    case 'pass':
      return [{ name: 'pass', gain: 1 }];
    case 'steal':
    case 'intercept':
      return [{ name: 'steal', gain: 1 }];
    case 'block':
      return [{ name: 'block', gain: 1 }];
    case 'shove':
    case 'knockdown':
      return [{ name: 'shove', gain: 1 }];
    case 'shotClockViolation':
      return [{ name: 'buzzer', gain: 1 }];
    case 'phaseChange':
      return event.to === 'finished' ? [{ name: 'buzzer', gain: 1 }] : [];
    case 'abilityActivated': {
      const name = ABILITY_STINGERS[event.abilityId];
      return name ? [{ name, gain: 1 }] : [];
    }
    default:
      return [];
  }
}

/** Maps sim events and state to sounds (spec E.4). Reads only; never writes state. */
export class AudioDirector {
  private readonly lastSqueak = new Map<string, number>();

  constructor(private readonly sink: () => AudioSink) {}

  handleEvents(events: readonly SimEvent[]): void {
    const sink = this.sink();
    for (const event of events) {
      for (const { name, gain } of sfxFor(event)) sink.playSfx(name, gain);
      if (event.type === 'basket' && event.shotType === 'dunk') sink.duck(0.8);
      if (event.type === 'abilityActivated') sink.duck(1);
    }
  }

  /** Shoe squeaks from consecutive states (plan decision 21). */
  update(prev: MatchState, next: MatchState, nowSeconds: number): void {
    for (let team = 0; team < 2; team++) {
      const before = prev.teams[team as 0 | 1].players;
      for (const p of next.teams[team as 0 | 1].players) {
        const q = before.find((b) => b.id === p.id);
        if (!q || !p.onGround) continue;
        const a = Math.hypot(q.vel.x, q.vel.z);
        const b = Math.hypot(p.vel.x, p.vel.z);
        if (a < SQUEAK_SPEED || b < SQUEAK_SPEED) continue;
        const cos = (q.vel.x * p.vel.x + q.vel.z * p.vel.z) / (a * b);
        if (cos > SQUEAK_COS) continue;
        if (nowSeconds - (this.lastSqueak.get(p.id) ?? -Infinity) < SQUEAK_GAP_S) continue;
        this.lastSqueak.set(p.id, nowSeconds);
        this.sink().playSfx('squeak', 0.6);
      }
    }
  }
}
```

`PlayerState.onGround` is the sim's own notion (set in `src/sim/player-movement.ts`). Run — PASS. **Commit** `feat(audio): AudioDirector event and squeak mapping`.

- [ ] **Step 6: Wire the audio into the app.**
  - `AppShell` holds `sink: AudioSink = new NullAudioSink()` and `engine: AudioEngine | null`. On the first `pointerdown`/`keydown` on `window` (and the first gamepad command from `MenuInput`), call `AudioEngine.create()`; if non-null, `engine.setEnabled(settings.sound, settings.music)` and `sink = engine`; remove the listeners. Every later gesture calls `engine.resume()` (iOS suspends on backgrounding) — keep one cheap `pointerdown` listener for that.
  - `updateSettings` also calls `sink.setEnabled(settings.sound, settings.music)`.
  - Menu sounds: in `menuInput.onCommand`, before passing to the screen, play `menuMove` for directions and `menuConfirm` for `confirm` while the screen is not `match` (or the match is paused). Pointer clicks on `.menu-button`/`.setup-card` play `menuConfirm` (one delegated `click` listener on the root).
  - `MatchScreen` gets `sink: () => AudioSink` in its deps, creates `new AudioDirector(deps.sink)`, calls `director.handleEvents(events)` after every step and `director.update(prev, next, performance.now() / 1000)` once per **tick** (inside the tick callback, using the runner's previous/current).
  - Extend `tests/app/shell.test.ts`: with `AudioEngine.create` mocked (`vi.spyOn(AudioEngine, 'create').mockReturnValue(fakeEngine)`), the first `keydown` creates the engine once; toggling sound calls `setEnabled(false, true)`.
  - `npm run check` — PASS; `git diff origin/main --stat -- src/sim src/content` empty. **Commit** `feat(app): sound effects in menus and matches`.

- [ ] **Step 7: Browser check (controller):** sounds play after the first click, mute toggles work (Title and Pause), no `AudioContext was not allowed to start` warnings after the first gesture, no console errors. Listen for clipping on a dunk + crowd + stinger burst. PR `Phase 6 Task 5: audio engine and SFX`.

---
## Task 6: Music (sequencer, court loops, menu loop, jingles, ducking)

**Files:**
- Create: `src/audio/sequencer.ts`, `src/audio/tracks.ts`
- Modify: `src/audio/engine.ts` (`setMusic` via `MusicPlayer`), `src/app.ts` (track per screen), `src/app/match-screen.ts` (pause stops music, finish plays the jingle)
- Test: `tests/audio/sequencer.test.ts`, `tests/audio/tracks.test.ts`, `tests/audio/engine.test.ts` (extend), `tests/app/shell.test.ts` (extend)

**Interfaces:**
- Consumes: `AudioEngine`, `TrackId`, `tone`, `noiseBurst`, `Voice` (Task 5).
- Produces:
  - `src/audio/tracks.ts`: `type Instrument = 'kick' | 'snare' | 'hat' | 'bass' | 'lead'`; `interface Track { bpm: number; bars: number; loop: boolean; root: number /* MIDI */; scale: readonly number[] /* semitone offsets */; steps: Partial<Record<Instrument, readonly (number | null)[]>> }` — drum lanes use `1`/`null`; bass/lead lanes hold scale degrees (0-based, may exceed the scale length to go up an octave) or `null`; every lane has `bars × 16` entries; `TRACKS: Record<TrackId, Track>`; `degreeToMidi(track, degree): number`; `midiToHz(m): number`.
  - `src/audio/sequencer.ts`: `stepSeconds(bpm): number` (a 16th note); `stepsToSchedule(nextStepTime: number, now: number, lookahead: number, stepDur: number): number` (how many steps fall in `[nextStepTime, now + lookahead)`); `class MusicPlayer { constructor(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, timers?: Timers); play(track: Track | null): void; tick(): void; stop(): void; readonly playing: Track | null }` where `interface Timers { setInterval(fn: () => void, ms: number): number; clearInterval(id: number): void }`.

- [ ] **Step 1: Failing tests** `tests/audio/sequencer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MusicPlayer, stepSeconds, stepsToSchedule } from '../../src/audio/sequencer';
import { TRACKS } from '../../src/audio/tracks';
import { fakeAudioContext } from './fake-context';

describe('sequencer timing (plan decision 23)', () => {
  it('a 16th note at 120 bpm is 0.125 s', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
  });
  it('schedules every step that starts before now + lookahead', () => {
    expect(stepsToSchedule(1.0, 1.0, 0.1, 0.125)).toBe(1);
    expect(stepsToSchedule(1.0, 0.85, 0.1, 0.125)).toBe(0);
    expect(stepsToSchedule(1.0, 1.2, 0.1, 0.125)).toBe(3); // 1.0, 1.125, 1.25 < 1.3
    expect(stepsToSchedule(2.0, 1.0, 0.1, 0.125)).toBe(0);
  });
});

describe('MusicPlayer', () => {
  const timers = () => {
    const fns: (() => void)[] = [];
    return { fns, setInterval: (fn: () => void) => (fns.push(fn), fns.length), clearInterval: (id: number) => void (fns[id - 1] = () => undefined) };
  };

  it('schedules notes ahead as time advances and loops a looping track', () => {
    const ctx = fakeAudioContext(0);
    const t = timers();
    const out = ctx.createGain();
    const player = new MusicPlayer(ctx as unknown as BaseAudioContext, out as unknown as AudioNode, ctx.createBuffer(1, 10, 48_000) as unknown as AudioBuffer, t);
    player.play(TRACKS.gym);
    const loopSeconds = TRACKS.gym.bars * 16 * stepSeconds(TRACKS.gym.bpm);
    for (let time = 0; time < loopSeconds * 2; time += 0.025) {
      ctx.currentTime = time;
      t.fns.forEach((fn) => fn());
    }
    const starts = ctx.nodes.filter((n) => n.started !== null).map((n) => n.started as number);
    expect(Math.max(...starts)).toBeGreaterThan(loopSeconds); // kept going past one loop
    expect(starts.every((s) => s >= 0)).toBe(true);
  });

  it('a one-shot jingle stops after its last bar; stop() and play(null) silence it', () => {
    const ctx = fakeAudioContext(0);
    const t = timers();
    const player = new MusicPlayer(ctx as unknown as BaseAudioContext, ctx.createGain() as unknown as AudioNode, ctx.createBuffer(1, 10, 48_000) as unknown as AudioBuffer, t);
    player.play(TRACKS.win);
    const len = TRACKS.win.bars * 16 * stepSeconds(TRACKS.win.bpm);
    for (let time = 0; time < len * 3; time += 0.025) {
      ctx.currentTime = time;
      t.fns.forEach((fn) => fn());
    }
    const starts = ctx.nodes.filter((n) => n.started !== null).map((n) => n.started as number);
    expect(Math.max(...starts)).toBeLessThan(len + 0.01);
    expect(player.playing).toBeNull();
    player.play(TRACKS.menu);
    player.play(null);
    expect(player.playing).toBeNull();
  });

  it('play() of the same looping track keeps playing without a restart', () => {
    const ctx = fakeAudioContext(0);
    const player = new MusicPlayer(ctx as unknown as BaseAudioContext, ctx.createGain() as unknown as AudioNode, ctx.createBuffer(1, 10, 48_000) as unknown as AudioBuffer, timers());
    player.play(TRACKS.menu);
    const first = player.playing;
    player.play(TRACKS.menu);
    expect(player.playing).toBe(first);
  });
});
```

`tests/audio/tracks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { degreeToMidi, midiToHz, TRACKS } from '../../src/audio/tracks';

describe('tracks (plan decision 22)', () => {
  it('has every TrackId with the decided tempos and lane lengths of bars × 16', () => {
    expect(Object.keys(TRACKS).sort()).toEqual(['frozen', 'gym', 'lose', 'menu', 'rooftop', 'volcano', 'win']);
    expect([TRACKS.gym.bpm, TRACKS.rooftop.bpm, TRACKS.volcano.bpm, TRACKS.frozen.bpm, TRACKS.menu.bpm]).toEqual([112, 132, 100, 120, 96]);
    for (const [id, track] of Object.entries(TRACKS)) {
      expect(track.loop, id).toBe(id !== 'win' && id !== 'lose');
      expect(track.bars, id).toBe(track.loop ? 4 : 2);
      for (const lane of Object.values(track.steps)) expect(lane?.length, id).toBe(track.bars * 16);
    }
  });
  it('maps scale degrees to MIDI and Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    const t = { ...TRACKS.gym, root: 57, scale: [0, 3, 5, 7, 10] };
    expect(degreeToMidi(t, 0)).toBe(57);
    expect(degreeToMidi(t, 2)).toBe(62);
    expect(degreeToMidi(t, 5)).toBe(69); // wraps an octave up
  });
});
```

- [ ] **Step 2: Implement `src/audio/tracks.ts`.** Helpers make the patterns readable — a lane is written as a 16-character string per bar (`x` = hit, `.` = rest; for melodic lanes digits `0-9` = scale degree, `.` = rest) and parsed:

```ts
import type { TrackId } from './sink';

export type Instrument = 'kick' | 'snare' | 'hat' | 'bass' | 'lead';

export interface Track {
  bpm: number;
  bars: number;
  loop: boolean;
  /** MIDI note of scale degree 0. */
  root: number;
  scale: readonly number[];
  steps: Partial<Record<Instrument, readonly (number | null)[]>>;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function degreeToMidi(track: Pick<Track, 'root' | 'scale'>, degree: number): number {
  const n = track.scale.length;
  const octave = Math.floor(degree / n);
  return track.root + 12 * octave + (track.scale[((degree % n) + n) % n] ?? 0);
}

/** `'x...x...'` → hits; `'0.2.4...'` → degrees. One string per bar of 16 steps. */
function lane(...bars: string[]): (number | null)[] {
  return bars.flatMap((bar) => {
    if (bar.length !== 16) throw new Error(`bar must have 16 steps: ${bar}`);
    return [...bar].map((ch) => (ch === '.' ? null : ch === 'x' ? 1 : Number.parseInt(ch, 36)));
  });
}
const repeat = (bar: string, times: number): string[] => Array.from({ length: times }, () => bar);

const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export const TRACKS: Record<TrackId, Track> = {
  gym: {
    bpm: 112, bars: 4, loop: true, root: 45 /* A2 */, scale: MINOR_PENT,
    steps: {
      kick: lane(...repeat('x.....x...x.....', 4)),
      snare: lane(...repeat('....x.......x...', 4)),
      hat: lane(...repeat('x.x.x.x.x.x.x.xx', 4)),
      bass: lane('0..0..3.0..0.4.3', '0..0..3.0..0.2.1', '0..0..3.0..0.4.3', '2..2..4.2..1.0..'),
      lead: lane('a...c.d...c.a...', '........a.c.d.f.', 'a...c.d...c.a...', 'f.d.c.a.........'),
    },
  },
  rooftop: {
    bpm: 132, bars: 4, loop: true, root: 40 /* E2 */, scale: MINOR,
    steps: {
      kick: lane(...repeat('x...x...x...x...', 4)),
      snare: lane(...repeat('....x.......x..x', 4)),
      hat: lane(...repeat('.x.x.x.x.x.x.x.x', 4)),
      bass: lane('0000000000000000', '5555555555555555', '3333333333333333', '4444444444442222'),
      lead: lane('7...7.9.a...9.7.', '7...7.9.a...c...', 'a...9...7...5...', '4...5...7.......'),
    },
  },
  volcano: {
    bpm: 100, bars: 4, loop: true, root: 38 /* D2 */, scale: MINOR,
    steps: {
      kick: lane(...repeat('x..x..x.x.......', 4)),
      snare: lane(...repeat('........x.......', 4)),
      hat: lane(...repeat('x...x...x...x...', 4)),
      bass: lane('0..0..0.1..0....', '0..0..0.5..4....', '0..0..0.1..0....', '3..3..2.1..0....'),
      lead: lane('7.......8...7...', '................', '7.......8...a...', '9...8...7.......'),
    },
  },
  frozen: {
    bpm: 120, bars: 4, loop: true, root: 48 /* C3 */, scale: MAJOR,
    steps: {
      kick: lane(...repeat('x.......x.......', 4)),
      snare: lane(...repeat('....x.......x...', 4)),
      hat: lane(...repeat('..x...x...x...x.', 4)),
      bass: lane('0...0...4...4...', '5...5...3...3...', '0...0...4...4...', '5...5...6...4...'),
      lead: lane('7.9.b.e.b.9.7...', '8.a.c.f.c.a.8...', '7.9.b.e.b.9.7...', '9.b.e.g.e.b.9...'),
    },
  },
  menu: {
    bpm: 96, bars: 4, loop: true, root: 41 /* F2 */, scale: MAJOR,
    steps: {
      kick: lane(...repeat('x.......x.......', 4)),
      hat: lane(...repeat('..x...x...x...x.', 4)),
      bass: lane('0.......4.......', '5.......3.......', '0.......4.......', '1.......4.......'),
      lead: lane('7...9...b...9...', 'c...b...9...7...', '7...9...b...e...', 'b.......9.......'),
    },
  },
  win: {
    bpm: 140, bars: 2, loop: false, root: 48, scale: MAJOR,
    steps: {
      kick: lane('x...x...x...x...', 'x...............'),
      snare: lane('............xxxx', 'x...............'),
      lead: lane('7.7.9.b.e...b.e.', 'g...............'),
      bass: lane('0...0...4...4...', '0...............'),
    },
  },
  lose: {
    bpm: 90, bars: 2, loop: false, root: 45, scale: MINOR,
    steps: {
      kick: lane('x.......x.......', 'x...............'),
      lead: lane('7...6...5...4...', '2...............'),
      bass: lane('0.......5.......', '3...............'),
    },
  },
};
```

(Prettier will expand the object literals; degrees beyond 9 use base-36 letters, `a` = 10.)

- [ ] **Step 3: Implement `src/audio/sequencer.ts`:**

```ts
import { noiseBurst, tone, type Voice } from './sfx';
import { degreeToMidi, midiToHz, type Instrument, type Track } from './tracks';

export interface Timers {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;
/** First note starts a little after play() so it is never scheduled in the past. */
const START_DELAY_S = 0.05;

export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

export function stepsToSchedule(nextStepTime: number, now: number, lookahead: number, stepDur: number): number {
  const horizon = now + lookahead;
  if (nextStepTime >= horizon) return 0;
  return Math.floor((horizon - nextStepTime - 1e-9) / stepDur) + 1;
}

/** Look-ahead step sequencer (plan decision 23): a 25 ms timer schedules the next 100 ms of notes. */
export class MusicPlayer {
  private track: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
    private readonly timers: Timers = { setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (id) => window.clearInterval(id) },
  ) {}

  get playing(): Track | null {
    return this.track;
  }

  play(track: Track | null): void {
    if (track !== null && track === this.track && track.loop) return;
    this.stop();
    if (!track) return;
    this.track = track;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + START_DELAY_S;
    this.timer = this.timers.setInterval(() => this.tick(), TICK_MS);
  }

  tick(): void {
    const track = this.track;
    if (!track) return;
    const dur = stepSeconds(track.bpm);
    const total = track.bars * 16;
    const n = stepsToSchedule(this.nextTime, this.ctx.currentTime, LOOKAHEAD_S, dur);
    for (let i = 0; i < n; i++) {
      if (this.step >= total) {
        if (!track.loop) {
          this.stop();
          return;
        }
        this.step = 0;
      }
      this.playStep(track, this.step, this.nextTime, dur);
      this.step += 1;
      this.nextTime += dur;
    }
  }

  stop(): void {
    if (this.timer !== null) this.timers.clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }

  private playStep(track: Track, step: number, t: number, dur: number): void {
    const v: Voice = { ctx: this.ctx, out: this.out, t, gain: 1, noise: this.noise };
    const hit = (i: Instrument): number | null => track.steps[i]?.[step] ?? null;
    if (hit('kick') !== null) tone(v, { type: 'sine', freq: 150, freqEnd: 45, dur: 0.22, peak: 0.9 });
    if (hit('snare') !== null) noiseBurst(v, { filter: 'bandpass', freq: 1800, q: 0.8, dur: 0.14, peak: 0.45 });
    if (hit('hat') !== null) noiseBurst(v, { filter: 'highpass', freq: 7000, dur: 0.04, peak: 0.18 });
    const bass = hit('bass');
    if (bass !== null) tone(v, { type: 'sawtooth', freq: midiToHz(degreeToMidi(track, bass)), dur: dur * 1.8, peak: 0.28, attack: 0.01 });
    const lead = hit('lead');
    if (lead !== null) tone(v, { type: 'square', freq: midiToHz(degreeToMidi(track, lead) + 12), dur: dur * 1.6, peak: 0.12, attack: 0.01 });
  }
}
```

Run both test files — PASS. **Commit** `feat(audio): step sequencer and per-court tracks`.

- [ ] **Step 4: Engine plays tracks — failing test** (append to `tests/audio/engine.test.ts`): `setMusic('gym')` starts the player (`engine.musicPlaying === 'gym'`); `setMusic('gym')` again keeps it; `setMusic(null)` stops; with music disabled `setMusic('menu')` records the wish but plays nothing, and `setEnabled(true, true)` afterwards starts the remembered track. Implement: `AudioEngine` owns `new MusicPlayer(context, musicBus, noise)`, a `wanted: TrackId | null`, `get musicPlaying(): TrackId | null`; `setMusic(id)` sets `wanted` and plays `TRACKS[id]` only when `music` is on; `setEnabled` starts/stops accordingly; `dispose` stops the player. Run — PASS. **Commit** `feat(audio): engine plays music tracks`.

- [ ] **Step 5: Tracks per screen.** Shell: entering `title`, `setup` → `sink.setMusic('menu')`; `match` → `setMusic(options.courtId as TrackId)` (court ids equal track ids; fall back to `'gym'` for an unknown id); `results` → `setMusic(won ? 'win' : 'lose')` (from `resultHeadline(result) !== 'YOU LOSE'`). When the engine is created late (first gesture), immediately `setMusic` the current screen's track. `MatchScreen.pause()` → `sink().setMusic(null)`; `resume()` → the court track again. Extend `tests/app/shell.test.ts` with a recording sink: Title → `menu`, START → `gym`, finished with a win → `win`. `npm run check` — PASS. **Commit** `feat(app): music per screen and court`.

- [ ] **Step 6: Browser check (controller):** each court has its own loop, the menu loop plays on Title/Setup, the jingle plays on Results and does not loop, pause silences the music, ducking audible on a dunk. No timing drift after two minutes with the tab in front; music stops when the tab is hidden (the auto-pause). PR `Phase 6 Task 6: music`.

---

## Task 7: Effects (bursts, camera shake, ball trail, ability visuals)

**Files:**
- Create: `src/render/effects-map.ts`, `src/render/burst-pool.ts`, `src/render/ball-trail.ts`, `src/render/ability-fx.ts`
- Modify: `src/render/camera.ts` (shake), `src/render/court-view.ts` (return rim handles), `src/render/effects-view.ts` (use the pool; keep `spawnFlash`), `src/app/match-screen.ts` (wire)
- Test: `tests/render/effects-map.test.ts`, `tests/render/burst-pool.test.ts`, `tests/render/ball-trail.test.ts`, `tests/render/ability-fx.test.ts`, `tests/render/camera.test.ts` (extend), `tests/render/court-view.test.ts` (extend)

**Interfaces:**
- Consumes: `SimEvent`, `MatchState`, `PlayerState`, hoop geometry (as `court-view.ts` uses it), `Settings.reduceMotion`.
- Produces:
  - `src/render/effects-map.ts`: `type EffectCommand = { kind: 'burst'; at: 'rim'; hoop: 0 | 1; color: number; size: 'small' | 'big' } | { kind: 'rimShake'; hoop: 0 | 1 } | { kind: 'shake'; strength: number } | { kind: 'shockwave'; playerId: PlayerId } | { kind: 'flash'; playerId: PlayerId; color: number }`; `SHAKE = { dunk: 0.6, earthquake: 1, block: 0.3, knockdown: 0.3 }`; `effectsFor(event: SimEvent, state: MatchState, court: CourtDef, teamColors: readonly [number, number]): EffectCommand[]`.
  - `src/render/burst-pool.ts`: `PARTICLE_CAPACITY = 300`; `PARTICLE_LIFE_S = 0.9`; `class BurstPool { readonly mesh: InstancedMesh; spawn(pos: Vec3, color: number, count: number, speed: number, rand?: () => number): void; update(dt: number): void; readonly alive: number }`.
  - `src/render/ball-trail.ts`: `TRAIL_POINTS = 24`; `class BallTrail { readonly line: Line; update(ball: BallState, glow: boolean, dt: number): void; readonly visible: boolean }`.
  - `src/render/ability-fx.ts`: `class AbilityFxView { readonly group: Group; update(player: PlayerState, pos: Vec3, dt: number): void }` (one per player); `class ShockwavePool { readonly group: Group; spawn(pos: Vec3): void; update(dt: number): void }`; `EARTHQUAKE_RADIUS = 4`.
  - `src/render/camera.ts`: `shakeOffset(time: number, strength: number): Vec3`; `BroadcastCamera.shake(strength: number): void`; `BroadcastCamera.reduceMotion: boolean`.
  - `src/render/court-view.ts`: `buildCourtView(court)` returns the same `Group` with `userData.rims: [Object3D, Object3D]` (index = hoop index), so existing callers keep working.

- [ ] **Step 1: Effects map — failing test** `tests/render/effects-map.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { effectsFor, SHAKE } from '../../src/render/effects-map';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';

const COLORS = [0x2f80ed, 0xeb5757] as const;
const court = getCourt('gym');
const state = createMatch(
  { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: ['shotClock'], courtId: 'gym', mode: 'match' },
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
    expect(effectsFor({ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'layup' }, ballAt(12), court, COLORS)).toEqual([
      { kind: 'burst', at: 'rim', hoop: 1, color: COLORS[0], size: 'small' },
    ]);
  });
  it('threes are big; dunks are big plus rim shake and a medium camera shake', () => {
    expect(effectsFor({ type: 'basket', playerId: 'away1', team: 1, points: 3, shotType: 'jumpshot' }, ballAt(-12), court, COLORS)).toEqual([
      { kind: 'burst', at: 'rim', hoop: 0, color: COLORS[1], size: 'big' },
    ]);
    expect(effectsFor({ type: 'basket', playerId: 'home1', team: 0, points: 2, shotType: 'dunk' }, ballAt(12), court, COLORS)).toEqual([
      { kind: 'burst', at: 'rim', hoop: 1, color: COLORS[0], size: 'big' },
      { kind: 'rimShake', hoop: 1 },
      { kind: 'shake', strength: SHAKE.dunk },
    ]);
  });
  it('blocks and knockdowns shake lightly; Earthquake shakes hard and sends a shockwave', () => {
    expect(effectsFor({ type: 'block', by: 'away1', shooter: 'home1' }, state, court, COLORS)).toEqual([{ kind: 'shake', strength: SHAKE.block }]);
    expect(effectsFor({ type: 'knockdown', by: 'away1', target: 'home1' }, state, court, COLORS)).toEqual([{ kind: 'shake', strength: SHAKE.knockdown }]);
    expect(effectsFor({ type: 'abilityActivated', playerId: 'home1', abilityId: 'earthquake' }, state, court, COLORS)).toEqual([
      { kind: 'flash', playerId: 'home1', color: COLORS[0] },
      { kind: 'shockwave', playerId: 'home1' },
      { kind: 'shake', strength: SHAKE.earthquake },
    ]);
    expect(effectsFor({ type: 'abilityActivated', playerId: 'away1', abilityId: 'blur' }, state, court, COLORS)).toEqual([
      { kind: 'flash', playerId: 'away1', color: COLORS[1] },
    ]);
    expect(effectsFor({ type: 'rimHit' }, state, court, COLORS)).toEqual([]);
  });
});
```

Implement `src/render/effects-map.ts`: the basket's hoop is `nearestHoopIndex(court, state.ball.pos)` from `src/sim/hoop.ts` (render may import sim values). On the basket tick the ball is at the rim, so this is right in match and shootaround alike (`lastShot` is already cleared after a basket). Return commands in the order the test shows. Run — PASS. **Commit** `feat(render): pure event → effect map`.

- [ ] **Step 2: Burst pool — failing test** `tests/render/burst-pool.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BurstPool, PARTICLE_CAPACITY, PARTICLE_LIFE_S } from '../../src/render/burst-pool';

describe('BurstPool (plan decision 24)', () => {
  it('spawns up to capacity, recycling the oldest, and particles die after their life', () => {
    const pool = new BurstPool();
    expect(pool.mesh.count).toBe(0);
    pool.spawn({ x: 0, y: 3, z: 0 }, 0xff0000, 60, 4, () => 0.5);
    expect(pool.alive).toBe(60);
    for (let i = 0; i < 10; i++) pool.spawn({ x: 0, y: 3, z: 0 }, 0xff0000, 60, 4, () => 0.5);
    expect(pool.alive).toBe(PARTICLE_CAPACITY);
    pool.update(PARTICLE_LIFE_S + 0.01);
    expect(pool.alive).toBe(0);
    expect(pool.mesh.count).toBe(0);
  });

  it('particles fall under gravity', () => {
    const pool = new BurstPool();
    pool.spawn({ x: 0, y: 3, z: 0 }, 0xffffff, 1, 0, () => 0.5);
    pool.update(0.5);
    expect(pool.positionOf(0).y).toBeLessThan(3);
  });
});
```

Implement with an `InstancedMesh(new BoxGeometry(0.06, 0.06, 0.06), new MeshBasicMaterial({ vertexColors: false }), PARTICLE_CAPACITY)`, per-instance colour via `setColorAt`, a ring buffer of particle structs `{ pos, vel, age, life }`; `spawn` gives each particle a random direction on the upper hemisphere × `speed × (0.5 + rand())`; `update` integrates (gravity 9.8), shrinks scale with age, compacts live particles to the front and sets `mesh.count = alive`, `instanceMatrix.needsUpdate = true`. Expose `positionOf(i)` for tests. Size: small burst 24 particles speed 3, big 60 particles speed 5. Run — PASS. **Commit** `feat(render): pooled particle bursts`.

- [ ] **Step 3: Camera shake — failing test** (append to `tests/render/camera.test.ts`):

```ts
import { PerspectiveCamera } from 'three';
import { BroadcastCamera, computeCameraPose, shakeOffset } from '../../src/render/camera';

describe('camera shake (plan decision 25)', () => {
  it('shakeOffset is zero at zero strength and bounded by 0.25 m × strength', () => {
    expect(shakeOffset(1.23, 0)).toEqual({ x: 0, y: 0, z: 0 });
    for (let t = 0; t < 2; t += 0.01) {
      const o = shakeOffset(t, 1);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.25 + 1e-9);
    }
  });

  it('shake decays and reduce motion disables it', () => {
    const cam = new PerspectiveCamera();
    const bc = new BroadcastCamera(cam);
    const target = { x: 0, y: 0, z: 0 };
    bc.update(target, 0.016);
    const rest = cam.position.clone();
    bc.shake(1);
    bc.update(target, 0.016);
    expect(cam.position.distanceTo(rest)).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) bc.update(target, 0.016);
    expect(cam.position.distanceTo(rest)).toBeLessThan(0.01);
    bc.reduceMotion = true;
    bc.shake(1);
    bc.update(target, 0.016);
    expect(cam.position.distanceTo(rest)).toBeLessThan(0.01);
  });
});
```

Implement: `shakeOffset(t, s) = { x: s × 0.25 × (0.6 sin(37t) + 0.4 sin(53t + 1)), y: s × 0.25 × (0.6 sin(41t + 2) + 0.4 sin(61t)), z: 0 }` (bounded by construction). `BroadcastCamera` keeps `shakeStrength` and `time`; `shake(s)` → `if (!reduceMotion) shakeStrength = Math.max(shakeStrength, s)`; `update` advances `time`, decays `shakeStrength *= Math.exp(-8 * dt)` (snap to 0 below 0.001) and adds the offset to the camera position **after** the smoothing (the smoothed position itself is never offset, so shake leaves no drift). Run — PASS. **Commit** `feat(render): camera shake`.

- [ ] **Step 4: Rim handles and rim shake.** `tests/render/court-view.test.ts`: `buildCourtView(getCourt('gym')).userData.rims` has two `Object3D`s positioned at the two hoops' rim centres (compare with the court's `hoops[i].rimCenter`). Implement by grouping each hoop's `rim` and `net` into a `Group` positioned at the rim centre (children offset accordingly) and storing it in `userData.rims[i]`. Rim shake lives in `EffectsView`: `shakeRim(group)` → for 0.5 s set `group.rotation.z = 0.08 × e^(−8t) × sin(40t)`, then 0. Run — PASS. **Commit** `feat(render): rim groups and rim shake`.

- [ ] **Step 5: Ball trail — failing test** `tests/render/ball-trail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BallTrail, TRAIL_POINTS } from '../../src/render/ball-trail';
import type { BallState } from '../../src/sim/types';

const ball = (mode: BallState['mode'], x: number): BallState =>
  ({ pos: { x, y: 3, z: 0 }, vel: { x: 1, y: 0, z: 0 }, radius: 0.12, mode, holder: null, flight: null, lastShot: null, freeTicks: 0, touchingRim: false, touchingBoard: false }) as BallState;

describe('BallTrail (plan decision 26)', () => {
  it('shows while in flight and fades out 0.3 s after', () => {
    const trail = new BallTrail();
    expect(trail.visible).toBe(false);
    for (let i = 0; i < 30; i++) trail.update(ball('flight', i * 0.1), false, 0.016);
    expect(trail.visible).toBe(true);
    expect(trail.line.geometry.drawRange.count).toBe(TRAIL_POINTS);
    trail.update(ball('held', 3), false, 0.2);
    expect(trail.visible).toBe(true);
    trail.update(ball('held', 3), false, 0.2);
    expect(trail.visible).toBe(false);
  });

  it('glows orange for Hot Hand / Rocket Dunk shots', () => {
    const trail = new BallTrail();
    trail.update(ball('flight', 0), true, 0.016);
    expect(trail.color).toBe(0xff8a00);
    trail.update(ball('flight', 0.1), false, 0.016);
    expect(trail.color).toBe(0xffffff);
  });
});
```

Implement with a `Line(BufferGeometry with a Float32Array(TRAIL_POINTS × 3) position attribute, LineBasicMaterial({ transparent: true }))`; on each flight update push the ball position (newest first, shift the array), set `drawRange.count = min(filled, TRAIL_POINTS)`; when not in flight, fade `material.opacity` from 1 to 0 over 0.3 s, then hide and reset `filled`. `color` getter returns the material colour hex. Glow is decided by the caller: `MatchScreen` sets `glow = true` from the `shotReleased` event when the shooter's `ability?.` is active and `abilityId` is `hotHand` or `rocketDunk` (read `findPlayer(state, e.playerId)` from the post-step state), and clears it when the ball leaves flight. Run — PASS. **Commit** `feat(render): ball trail`.

- [ ] **Step 6: Ability visuals — failing test** `tests/render/ability-fx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AbilityFxView, EARTHQUAKE_RADIUS, ShockwavePool } from '../../src/render/ability-fx';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import type { PlayerState } from '../../src/sim/types';

const base = createMatch(
  { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: ['shotClock'], courtId: 'gym', mode: 'match' },
  getCourt('gym'),
  [{ id: 'home1', team: 0, characterId: 'brick', character: getCharacter('brick') }, { id: 'away1', team: 1, characterId: 'ace', character: getCharacter('ace') }],
).teams[0].players[0] as PlayerState;
const with_ = (abilityId: string, ability: PlayerState['ability']): PlayerState => ({ ...base, abilityId, ability });
const visibleNames = (fx: AbilityFxView): string[] => fx.group.children.filter((c) => c.visible).map((c) => c.name).sort();

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
    for (let i = 0; i < 12; i++) fx.update(with_('blur', { ticksLeft: 100, uses: 0 }), { x: i * 0.2, y: 0, z: 0 }, 0.016);
    expect(visibleNames(fx)).toEqual(['blurGhost0', 'blurGhost1', 'blurGhost2']);
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
```

Implement `src/render/ability-fx.ts`: children named `rocketAura` (additive orange `ConeGeometry(0.5, 1.4, 16, 1, true)` over the head, flickering scale), `hotHands` (a group of two small emissive spheres at hand height), `hotRing0..2` (three 110° `RingGeometry` arcs at the feet), `blurGhost0..2` (capsules matching the player body, transparent, opacities 0.35/0.2/0.1, positioned at the position 3/6/9 updates ago from a 10-entry history). All are created once in the constructor (pooled) and toggled with `visible`. `ShockwavePool`: 4 pre-built `RingGeometry(0.9, 1, 48)` meshes lying flat, unit radius scaled to `EARTHQUAKE_RADIUS × age / 0.5`, opacity `1 − age / 0.5`. Run — PASS. **Commit** `feat(render): ability visuals and Earthquake shockwave`.

- [ ] **Step 7: Wire into `MatchScreen`.** Replace the ad-hoc flash loop with `for (const c of events.flatMap((e) => effectsFor(e, runner.current, court, TEAM_COLORS)))` applied by a small `applyEffect(c)` switch: `burst` → `burstPool.spawn(rimCenter(hoop) , color, size === 'big' ? 60 : 24, size === 'big' ? 5 : 3)`; `rimShake` → `effects.shakeRim(courtGroup.userData.rims[hoop])`; `shake` → `broadcastCamera.shake(strength)`; `shockwave` → `shockwaves.spawn(player.pos)`; `flash` → `effects.spawnFlash(player pos + 1 m, color)`. One `AbilityFxView` per player, updated in the render callback with the interpolated position. `broadcastCamera.reduceMotion = settings.reduceMotion`, updated on settings change. The ball trail updates every frame with the interpolated ball. All new objects are added to the scene, so `disposeObject3D` frees them (Task 1). Performance: `?debug` fps stays ≥ 55 on the desktop in a dunk-heavy stretch (controller checks; tablet in the playtest). `npm run check` — PASS. **Commit** `feat(app): effects in the match`.

- [ ] **Step 8: Browser check (controller):** bursts on baskets (big on dunks/threes), rim wobble on dunks, shake on dunk/block/knockdown/Earthquake, none with Reduce motion, trail on shots and passes, orange during Hot Hand / Rocket Dunk (`?character=ace` then score to charge, or temporarily raise charge via `?debug` if available), ghosts for Blur, shockwave for Earthquake. Screenshots in the PR. PR `Phase 6 Task 7: effects`.

---
## Task 8: Hardening — smoke test, carried-over minors, chunk split, docs

**Files:**
- Create: `scripts/smoke.mjs`
- Modify: `package.json` (`playwright` dev dependency, `smoke` script), `.github/workflows/ci.yml` (smoke step), `vite.config.ts` (Three.js chunk), `src/ui/hud.ts` and `src/render/weather-view.ts` (per-frame allocations), `tests/balance/ai.balance.ts` (report filename), `tests/sim/shot-sweep.test.ts`, `tests/sim/formation.test.ts`, `tests/app/ai-controller.test.ts`, `tests/sim/ai-helpers.test.ts` (or the file that already tests `scoreSpot`), `tests/sim/abilities.test.ts` or `ability-effects.test.ts` (alley-oop snapshot), `README.md`, `docs/superpowers/specs/2026-09-30-roarball-design.md` (§4.2 note, E.8)
- Test: as listed; plus `scripts/smoke.mjs` run locally and in CI

**Interfaces:**
- Consumes: everything above; the `data-action` attributes from Tasks 1–3 (`play`, `start`, `resume`, `rematch`), `.hud`, `.hud-pause`, `.screen-results`.
- Produces: `npm run smoke` (builds nothing itself: expects `dist/` from `npm run build`).

This task may touch `tests/sim/` (test-only additions) but still not `src/sim/` or `src/content/`. If a new sim test **fails**, stop and report it to the controller (a sim fix needs a ruling); do not change sim code.

- [ ] **Step 1: Smoke test.** `npm i -D playwright` and add `"smoke": "node scripts/smoke.mjs"`. `scripts/smoke.mjs`:

```js
// Spec §10.2 / E.7 smoke: headless Chromium plays through the menus on the built app.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
const errors = [];

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite preview did not start');
}

async function run() {
  await waitForServer();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  // Menus path: Title → Setup → START by keyboard → match → pause/resume → Results.
  await page.goto(BASE); // bare URL
  await page.waitForSelector('[data-action="play"]');
  await page.keyboard.press('Enter'); // PLAY has focus
  await page.waitForSelector('[data-action="start"]');
  await page.keyboard.press('Enter'); // START has focus
  await page.waitForSelector('.hud');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-action="resume"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-action="resume"]', { state: 'detached' });

  // Short match through a URL shortcut reaches Results.
  await page.goto(`${BASE}?duration=5&seed=3`);
  await page.waitForSelector('.screen-results', { timeout: 60_000 });
  const headline = await page.textContent('.results-headline');
  if (!/YOU WIN!|YOU LOSE|OVERTIME WIN!/.test(headline ?? '')) throw new Error(`bad headline: ${headline}`);
  await page.click('[data-action="rematch"]');
  await page.waitForSelector('.hud');

  await browser.close();
  if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);
  console.log('smoke: ok');
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => server.kill());
```

A 5 s match can go to sudden-death overtime on a tie; the 60 s timeout covers it (AI scores every ~10 s). If it proves flaky, use a seed whose 5 s game ends untied — find it once locally and comment why. Add the CI step after `npm run build` in `.github/workflows/ci.yml`:

```yaml
      - run: npx playwright install --with-deps chromium
      - run: npm run smoke
```

Run `npm run build && npm run smoke` locally — `smoke: ok`. **Commit** `test(smoke): headless Chromium plays through the menus`.

- [ ] **Step 2: Three.js in its own chunk.** Vite 8 bundles with Rolldown; use its chunking option (look up the current Vite 8 option with context7 — `build.rollupOptions.output.manualChunks` may be replaced by `build.rolldownOptions.output.advancedChunks`). Goal: `dist/assets/` has a separate `three-*.js` chunk and the app chunk shrinks accordingly; the build prints no chunk-size warning. Record before/after sizes in the PR. **Commit** `build: split Three.js into its own chunk`.

- [ ] **Step 3: Per-frame allocations.** In `Hud.update`/`updateAbility` and `WeatherView.update`, remove allocations made every frame while nothing changes: hoist scratch `Vector3`/`Color`/objects to fields, avoid `{...spread}`, closures and array methods inside the per-frame path, and keep the existing "write only on change" pattern for DOM. Add a test per class that calls `update` 100× with an unchanged state and asserts no DOM mutation (a `MutationObserver` on the HUD root records zero records after the first frame) — for the weather view assert the instanced matrices are reused (same `instanceMatrix.array` object). **Commit** `perf(ui,render): no per-frame allocations in HUD and weather`.

- [ ] **Step 4: Test-strength minors** (one commit each, test-only):
  1. `tests/balance/ai.balance.ts:175` — report file name `docs/balance/${date}.md` with a `-2`, `-3` suffix when the file exists, instead of the hard-coded `-phase-5`. **Commit** `test(balance): report filename not tied to a phase`.
  2. `tests/sim/shot-sweep.test.ts` — bucket 2 m holds only the 2.6 m shots (`MIN_DISTANCE = 2.6`, step 0.4); fold it into the 3 m bucket: `bucketOf = (r) => Math.max(3, Math.floor(r.distance + 1e-9))` and start the bucket loops at 3. **Commit** `test(sim): fold the thin 2 m sweep bucket into 3 m`.
  3. `tests/sim/formation.test.ts` "a match tip-off starts everyone in formation" — also assert each team is on its own half (team 0 at x < 0, team 1 at x > 0), so the test fails with the teams swapped. **Commit** `test(sim): tip-off formation test catches swapped teams`.
  4. `tests/app/ai-controller.test.ts` "a different seed differs eventually" — keep the match seed fixed and vary only the controller's seed, so the test proves the brain seed matters. **Commit** `test(app): brain seed test varies only the brain seed`.
  5. `scoreSpot` 4 m boundary (`src/sim/ai/spots.ts:72`, lane end 4 m short of the rim): a spot on the handler→rim line 0.1 m before the lane end is penalized; one 0.1 m past it (towards the rim) is not. Read `laneEnd` for the exact geometry. **Commit** `test(sim): scoreSpot lane boundary`.
  6. Alley-oop unblockable snapshot (Phase 5 deferred): an alley-oop dunk started by a player with Rocket Dunk active keeps `unblockable` when the ability expires before release (mirror the existing Rocket Dunk expiry test, starting from an alley-oop catch). **Commit** `test(sim): alley-oop dunk keeps the unblockable snapshot`.

- [ ] **Step 5: Docs.**
  - Spec §4.2: add one sentence under the pipeline: "Same-tick SPECIAL presses resolve in roster order (home first); this is deterministic and part of the pipeline (Phase 5 m-2)."
  - Spec **E.8 Refinements made during execution** — the controller fills this from the rulings at the end of the phase; the implementer adds a stub heading only if the controller asks.
  - `README.md`: how to play (menus, controls for keyboard / gamepad / touch), the URL shortcuts including `?duration=`, `npm run smoke`.
  - **Commit** `docs: README controls and URL shortcuts; §4.2 SPECIAL order`.

- [ ] **Step 6:** `npm run check && npm run build && npm run smoke` — all green; `git diff origin/main --stat -- src/sim src/content` empty. PR `Phase 6 Task 8: hardening`. CI must show the new smoke step green before merge.

---

## Self-review (plan author)

- **Spec coverage:** E.1 flow/screens → Tasks 1–3; URL shortcuts and `?duration` → Task 1; E.2 storage → Tasks 1–2; E.3 gamepad + rumble → Task 4; E.4 audio → Tasks 5–6; E.5 effects → Task 7; E.6 minors → Tasks 1 (disposal), 3 (final banner, restart leak via menus), 8 (rest); E.7 tests → every task + Task 8 smoke; sim invariant → Global Constraints + decision 30.
- **Names used across tasks:** `MenuCommand`, `MenuInput`, `MenuNav`, `Settings`, `StorageLike`, `readJson`/`writeJson`, `SetupChoice`, `RANDOM`, `toGameOptions`, `buildSetupCatalog`, `SetupCatalog`, `BoxScore`, `MatchResult`, `resultHeadline`, `AudioSink`, `NullAudioSink`, `SfxName`, `TrackId`, `AudioEngine`, `AudioDirector`, `MusicPlayer`, `TRACKS`, `GamepadBackend`, `PadSource`, `rumbleFor`, `playRumble`, `effectsFor`, `BurstPool`, `BallTrail`, `AbilityFxView`, `ShockwavePool`, `disposeObject3D`, `AppShell`, `MatchScreen` — each is defined in the task that produces it with the same signature later tasks consume.
- **Known judgement calls for reviewers:** Task 1's shell keeps temporary Setup/Results placeholders until Tasks 2–3 (each task still ships a playable build); the gamepad does not latch sub-tick presses (decision 16 comment); music uses `setInterval`, which browsers throttle in hidden tabs — harmless because the match auto-pauses and menus keep a short loop.
