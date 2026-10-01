# RoarBall Phase 3 — Passing, Defence, Characters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The shootaround gains a teammate and a defender (scripted dummies), four selectable characters with real stat differences, passing with alley-oops and interceptions, and the three defensive moves (block, steal, shove) with a defender term in shot quality — all deterministic, tested headless, and playable on the tablet.

**Architecture:** Everything gameplay stays in `src/sim/`: a stat table resolves `CharacterDef`s to simulation units; `passing.ts` reuses the flight system with a `pass` kind and a receiver; `defence.ts` adds the context-sensitive action, block deflection at release, seeded steals and power-scaled shoves; `bodies.ts` adds player separation and ball-vs-player deflection. The app's `controllers` map becomes `(state) => PlayerIntent`, and two dummy controllers (`src/app/dummies.ts`) stand in for Phase 4's AI. Presentation adds poses and banners.

**Tech Stack:** unchanged (Vite 8, TypeScript 5.9 strict, Three.js 0.186, Vitest 5 + jsdom, ESLint 10 with the `src/sim` lockdown).

**Spec:** `docs/superpowers/specs/2026-09-30-roarball-design.md` — §4.5, §4.6, §5.1–5.2, §5.5 and **Appendix B (Phase 3 decisions)**. Abilities (§5.3), AI (§6), court modifiers (§7) and menus (§9) are later phases.

## Global Constraints

Everything from the Phase 1 and Phase 2 plans still applies (60 Hz, `src/sim` purity enforced by ESLint + `tsconfig.sim.json` + `tests/lint/boundaries.test.ts`, seeded RNG only with a documented draw order, court coordinates, camera on +Z, touch ≥ 56 px, strict TS, attribution trailers, `npm run format && npm run check` green per commit). In addition, from the spec:

- Launch cast: **Brick** (dunker), **Ace** (sniper), **Dash** (speedster), **Rook** (all-rounder); stats 1–10; `?character=<id>` selects, default `rook` (B.2).
- Pass flight time **0.35 s + 0.05 s/m**, low arc; catch within **0.9 m**; interception by any **opponent** capsule overlap; alley-oop lob when the teammate is airborne within **3 m** of the attacking hoop; `callingForPass` lasts **1 s** (B.3).
- Context-sensitive action without the ball: **block** if the nearest opponent holds the ball and is mid-shot or within 3 m of the hoop; else **steal** if the handler is within reach; else **shove** the nearest opponent within reach in front; else jump (B.4).
- Block: released shot within **1.2 m** (+ defense bonus) while the blocker is rising with hand (feet + **2.3 m**) at or above the release height; dunks only by a block that started before the dunk (B.4).
- Defender term: `clamp(0.45 + 0.25·d, 0.45, 1)`, ×0.6 if that opponent is airborne within 1.5 m; the no-defender sweep contract is unchanged (B.4).
- Steal: 18-tick reach, 45-tick cooldown, hit at tick 6, chance `clamp(0.2 + 0.05·defense − 0.03·holderPower, 0.1, 0.7)`, halved if the holder moves away (B.4).
- Shove: 20-tick lunge, 60-tick cooldown, hit at tick 5, reach 1.2 m in front; stun `30 + 6·power` (×1.5 with turbo) − `3·victimPower`, min 20; ball pops loose; `getup` 20 ticks (B.4).
- Buzzer-beaters count: at zero with a shot in flight, wait for it (B.5).
- Shootaround: possession always returns to team 0 (the human) after violations/timeouts; the defender dummy may rebound and hold the ball so it can be stolen from (B.1).
- The tick pipeline order of spec §4.2 stays the definition; step 6 now holds player separation, ball deflection and pickup.

---

## Execution process

As Phases 1–2: Sonnet 5.5 implements on `task/<N>-<slug>`, Opus 5.5 reviews on the PR (comment review, first line `VERDICT: …`), merge after approval, final whole-phase Opus review, hardening wave if needed, Fable reassessment on the epic. Milestone **"Phase 3 – Passing, defence, characters"**, labels `task`, `phase-3`, `epic`. Physics/feel tuning tasks may be dispatched on Opus at the controller's discretion.

Golden hashes in `tests/sim/determinism.test.ts` change whenever the state shape or RNG draws change: each task that does so re-pins them (`-u` once, verify without) and reports old → new.

---

## File structure

```
src/sim/types.ts              MODIFY  CharacterDef/CharacterStats, ResolvedStats fields, actions, PlayerState fields, flight kind/receiver, events, buzzerPending
src/sim/stats.ts              MODIFY  resolveStats table, DEFAULT_STATS unchanged
src/sim/match.ts              MODIFY  RosterEntry.character?, new fields init
src/sim/actions.ts            NEW     LOCKED_ACTIONS, timings, stepLockedAction dispatcher, stun/getup/block landing
src/sim/bodies.ts             NEW     separatePlayers, deflectBallOffPlayers
src/sim/collision.ts          MODIFY  sphereVsCapsuleContact
src/sim/passing.ts            NEW     teammateOf, startPass, releasePass, stepPassAction, stepPassFlight, callForPass
src/sim/defence.ts            NEW     nearestOpponent, chooseDefensiveAction, start/step block/steal/shove, resolveSteal, resolveShove, tryBlockShot, defenderFactor
src/sim/shooting.ts           MODIFY  shotQuality(defenders), releaseShot → tryBlockShot first, flight kind fields
src/sim/phases.ts             MODIFY  buzzer-beater, receivingTeam in shootaround
src/sim/ball.ts               MODIFY  tryPickup skips stunned players
src/sim/player-movement.ts    MODIFY  isActionLocked uses LOCKED_ACTIONS
src/sim/tick.ts               MODIFY  pipeline (separation, deflection, pass flights, defence resolution)
src/sim/index.ts              MODIFY  barrel
src/content/characters/*.ts   NEW     brick, ace, dash, rook, index
src/app/dummies.ts            NEW     Controller type, teammateDummy, defenderDummy
src/app.ts                    MODIFY  character query, roster of three, controllers(state)
src/ui/hud.ts                 MODIFY  banners for block/steal/intercept/alley-oop
src/ui/debug-overlay.ts       MODIFY  character + action lines
src/render/player-view.ts     MODIFY  poses: arms forward/up (forward raise), stunned tilt

tests/sim/stats.test.ts, characters.test.ts, actions.test.ts, bodies.test.ts, passing.test.ts, defence.test.ts  NEW
tests/sim/phases.test.ts (buzzer, shootaround receiving), shooting.test.ts (block), ball.test.ts (stunned pickup)  MODIFY
tests/app/dummies.test.ts, tests/ui/hud.test.ts (banners)                                                           NEW/MODIFY
```

---

### Task 1: Characters and the stat table

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/stats.ts`, `src/sim/match.ts`, `src/app.ts`, `src/ui/debug-overlay.ts`
- Create: `src/content/characters/brick.ts`, `ace.ts`, `dash.ts`, `rook.ts`, `index.ts`
- Test: `tests/sim/stats.test.ts`, `tests/sim/characters.test.ts`, `tests/sim/match.test.ts` (extend)

**Interfaces:**
- Produces: `CharacterStats`, `CharacterDef` (types); `resolveStats(def): ResolvedStats`; `ResolvedStats` gains `defense`, `power`, `dunkRangeBonus`, `stealReach`, `blockReach`, `stealChance`, `stunTicksDealt`, `stunResistTicks`; `RosterEntry.character?: CharacterDef`; `characters`, `getCharacter(id)`, `DEFAULT_CHARACTER_ID`.

- [ ] **Step 1: Types**

In `src/sim/types.ts` add after `PlayerIntent`/`NO_INTENT`:

```ts
/** Spec §5.1: seven stats, each 1..10. */
export interface CharacterStats {
  speed: number;
  jump: number;
  shooting: number;
  dunking: number;
  defense: number;
  power: number;
  stamina: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  description: string;
  stats: CharacterStats;
  /** Signature ability, implemented in phase 5. */
  abilityId: string;
  appearance: { primaryColor: number; secondaryColor: number };
}
```

Extend `ResolvedStats`:

```ts
export interface ResolvedStats {
  runSpeed: number;
  turboSpeed: number;
  acceleration: number;
  deceleration: number;
  turboDrainPerTick: number;
  turboRegenPerTick: number;
  /** 0..1, multiplies jump-shot quality. */
  shooting: number;
  /** Vertical speed of a plain jump, m/s. */
  jumpSpeed: number;
  /** Raw 1..10 stats that defensive formulas read directly. */
  defense: number;
  power: number;
  /** Extra dunk range in metres (dunking stat). */
  dunkRangeBonus: number;
  /** Reach of a steal attempt and of a block, metres. */
  stealReach: number;
  blockReach: number;
  /** Base chance of a steal before the holder's power is subtracted. */
  stealChance: number;
  /** Stun ticks a shove deals, and ticks of stun this player shrugs off. */
  stunTicksDealt: number;
  stunResistTicks: number;
}
```

- [ ] **Step 2: Failing stats test**

`tests/sim/stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_STATS, resolveStats } from '../../src/sim/stats';
import type { CharacterDef, CharacterStats } from '../../src/sim/types';

function def(stats: Partial<CharacterStats>): CharacterDef {
  return {
    id: 't',
    name: 'T',
    description: '',
    stats: { speed: 5, jump: 5, shooting: 5, dunking: 5, defense: 5, power: 5, stamina: 5, ...stats },
    abilityId: 'none',
    appearance: { primaryColor: 0, secondaryColor: 0 },
  };
}

describe('resolveStats', () => {
  it('all-fives resolves close to the placeholder defaults', () => {
    const s = resolveStats(def({}));
    expect(s.runSpeed).toBeCloseTo(DEFAULT_STATS.runSpeed, 1);
    expect(s.turboSpeed).toBeCloseTo(DEFAULT_STATS.turboSpeed, 1);
    expect(s.jumpSpeed).toBeCloseTo(DEFAULT_STATS.jumpSpeed, 0);
    expect(Math.abs(s.shooting - DEFAULT_STATS.shooting)).toBeLessThan(0.15);
  });

  it('each stat moves its own numbers monotonically', () => {
    const lo = resolveStats(def({ speed: 1, jump: 1, shooting: 1, dunking: 1, defense: 1, power: 1, stamina: 1 }));
    const hi = resolveStats(def({ speed: 10, jump: 10, shooting: 10, dunking: 10, defense: 10, power: 10, stamina: 10 }));
    expect(hi.runSpeed).toBeGreaterThan(lo.runSpeed);
    expect(hi.turboSpeed).toBeGreaterThan(lo.turboSpeed);
    expect(hi.jumpSpeed).toBeGreaterThan(lo.jumpSpeed);
    expect(hi.shooting).toBeGreaterThan(lo.shooting);
    expect(hi.dunkRangeBonus).toBeGreaterThan(lo.dunkRangeBonus);
    expect(hi.stealReach).toBeGreaterThan(lo.stealReach);
    expect(hi.blockReach).toBeGreaterThan(lo.blockReach);
    expect(hi.stealChance).toBeGreaterThan(lo.stealChance);
    expect(hi.stunTicksDealt).toBeGreaterThan(lo.stunTicksDealt);
    expect(hi.stunResistTicks).toBeGreaterThan(lo.stunResistTicks);
    expect(hi.turboDrainPerTick).toBeLessThan(lo.turboDrainPerTick); // more stamina drains slower
    expect(hi.shooting).toBeLessThanOrEqual(0.9);
    expect(lo.shooting).toBeGreaterThanOrEqual(0.45);
  });
});
```

- [ ] **Step 3: Implement `src/sim/stats.ts`**

```ts
import type { CharacterDef, ResolvedStats } from './types';

/**
 * Stats for the placeholder player and for tests. Speeds in m/s, accelerations in m/s².
 * Turbo drains fully in 3 s and refills in 6 s. Kept fixed so existing tests and the
 * golden runs do not move when the character table is tuned.
 */
export const DEFAULT_STATS: Readonly<ResolvedStats> = Object.freeze({
  runSpeed: 6,
  turboSpeed: 8,
  acceleration: 30,
  deceleration: 40,
  turboDrainPerTick: 1 / 180,
  turboRegenPerTick: 1 / 360,
  shooting: 0.75,
  jumpSpeed: 4.5,
  defense: 5,
  power: 5,
  dunkRangeBonus: 0.2,
  stealReach: 1.02,
  blockReach: 1.32,
  stealChance: 0.45,
  stunTicksDealt: 60,
  stunResistTicks: 15,
});

/**
 * The one tuning table (spec §5.1): 1..10 stats → simulation units. Rebalancing the cast means
 * editing these lines, not the characters.
 */
export function resolveStats(def: CharacterDef): ResolvedStats {
  const s = def.stats;
  const runSpeed = 5.2 + 0.2 * (s.speed - 1);
  return {
    runSpeed,
    turboSpeed: runSpeed + 2,
    acceleration: 30,
    deceleration: 40,
    turboDrainPerTick: 1 / (120 + 12 * s.stamina),
    turboRegenPerTick: 1 / 360,
    shooting: 0.45 + 0.04 * s.shooting,
    jumpSpeed: 3.9 + 0.1 * s.jump,
    defense: s.defense,
    power: s.power,
    dunkRangeBonus: 0.05 * (s.dunking - 1),
    stealReach: 0.9 + 0.03 * (s.defense - 1),
    blockReach: 1.2 + 0.03 * (s.defense - 1),
    stealChance: 0.2 + 0.05 * s.defense,
    stunTicksDealt: 30 + 6 * s.power,
    stunResistTicks: 3 * s.power,
  };
}
```

Run `npx vitest run tests/sim/stats.test.ts` — PASS (2 tests).

- [ ] **Step 4: Content**

`src/content/characters/brick.ts`:

```ts
import type { CharacterDef } from '../../sim/types';

/** The dunker: slow and a poor shooter, but unstoppable at the rim and brutal in a shove. */
export const brick: CharacterDef = {
  id: 'brick',
  name: 'Brick',
  description: 'Slow, strong, lives above the rim.',
  stats: { speed: 4, jump: 6, shooting: 3, dunking: 10, defense: 5, power: 9, stamina: 6 },
  abilityId: 'rocketDunk',
  appearance: { primaryColor: 0xd35400, secondaryColor: 0x2c3e50 },
};
```

`ace.ts`: id `ace`, name `Ace`, description `'Deadly from range, soft everywhere else.'`, stats `{ speed: 5, jump: 5, shooting: 10, dunking: 3, defense: 4, power: 3, stamina: 6 }`, abilityId `hotHand`, colours `0x8e44ad` / `0xf1c40f`.
`dash.ts`: id `dash`, name `Dash`, description `'Fastest on the court; steals for fun.'`, stats `{ speed: 10, jump: 7, shooting: 5, dunking: 4, defense: 8, power: 3, stamina: 8 }`, abilityId `blur`, colours `0x27ae60` / `0xecf0f1`.
`rook.ts`: id `rook`, name `Rook`, description `'Solid at everything, spectacular at nothing.'`, stats all `6`, abilityId `earthquake`, colours `0x2980b9` / `0xe67e22`.

`src/content/characters/index.ts`:

```ts
import type { CharacterDef } from '../../sim/types';
import { ace } from './ace';
import { brick } from './brick';
import { dash } from './dash';
import { rook } from './rook';

export const characters: readonly CharacterDef[] = [brick, ace, dash, rook];
export const DEFAULT_CHARACTER_ID = 'rook';

export function getCharacter(id: string): CharacterDef {
  const character = characters.find((c) => c.id === id);
  if (!character) throw new Error(`Unknown character: ${id}`);
  return character;
}
```

`tests/sim/characters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { characters, DEFAULT_CHARACTER_ID, getCharacter } from '../../src/content/characters';

describe('character registry', () => {
  it('has the four launch characters with unique ids and valid stats', () => {
    expect(characters.map((c) => c.id).sort()).toEqual(['ace', 'brick', 'dash', 'rook']);
    for (const c of characters) {
      for (const [key, value] of Object.entries(c.stats)) {
        expect(Number.isInteger(value), `${c.id}.${key}`).toBe(true);
        expect(value, `${c.id}.${key}`).toBeGreaterThanOrEqual(1);
        expect(value, `${c.id}.${key}`).toBeLessThanOrEqual(10);
      }
      expect(c.abilityId.length).toBeGreaterThan(0);
    }
  });

  it('resolves the default and rejects unknown ids', () => {
    expect(getCharacter(DEFAULT_CHARACTER_ID).name).toBe('Rook');
    expect(() => getCharacter('nope')).toThrow(/unknown character/i);
  });
});
```

Run — PASS (2 tests).

- [ ] **Step 5: Roster accepts characters**

In `src/sim/match.ts`:

```ts
export interface RosterEntry {
  id: PlayerId;
  team: TeamIndex;
  characterId: string;
  /** Resolved through the stat table when present; placeholders use DEFAULT_STATS. */
  character?: CharacterDef;
}
```

and in `createPlayer`: `stats: entry.character ? resolveStats(entry.character) : { ...DEFAULT_STATS },` (import `resolveStats`, `CharacterDef` type). Append to `tests/sim/match.test.ts`:

```ts
  it('resolves a character through the stat table', () => {
    const state = createMatch(settings, getCourt('gym'), [
      { id: 'd', team: 0, characterId: 'dash', character: getCharacter('dash') },
    ]);
    expect(findPlayer(state, 'd')?.stats.runSpeed).toBeCloseTo(7.0);
    expect(findPlayer(state, 'd')?.stats.defense).toBe(8);
  });
```

(import `getCharacter` from `../../src/content/characters`.)

- [ ] **Step 6: `?character=` and the overlay**

In `src/app.ts`: read `const characterId = new URLSearchParams(window.location.search).get('character') ?? DEFAULT_CHARACTER_ID;` and `const character = characters.some((c) => c.id === characterId) ? getCharacter(characterId) : getCharacter(DEFAULT_CHARACTER_ID);` (unknown ids fall back silently). Roster entry: `{ id: HUMAN_ID, team: 0, characterId: character.id, character }`. Pass `character.name` into the overlay: add `character: string` to `DebugData` and a line `` `char   ${data.character}` `` in `src/ui/debug-overlay.ts`; set it in the `overlay.update` call. Move the `?debug` parsing in `src/main.ts` unchanged.

- [ ] **Step 7: Check and commit**

`npm run format && npm run check` green (golden hashes unchanged: the human still uses placeholder stats in tests). Commit: `feat(sim,content): character definitions, the stat table and ?character= selection` with `Refs #<issue>`.

**Acceptance:** stat table monotonic; four valid characters; `createMatch` resolves a character; `?character=dash` runs faster live (debug overlay shows `char Dash`).

---

### Task 2: Bodies, deflection, action plumbing, buzzer-beater

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/match.ts`, `src/sim/player-movement.ts`, `src/sim/collision.ts`, `src/sim/ball.ts`, `src/sim/phases.ts`, `src/sim/tick.ts`, `src/sim/index.ts`
- Create: `src/sim/actions.ts`, `src/sim/bodies.ts`
- Test: `tests/sim/actions.test.ts`, `tests/sim/bodies.test.ts`, `tests/sim/phases.test.ts` (buzzer), `tests/sim/ball.test.ts` (stunned pickup), `tests/sim/determinism.test.ts` (re-pin)

**Interfaces:**
- Produces: `PlayerAction` += `'pass' | 'block' | 'steal' | 'shove' | 'stunned' | 'getup'`; `LOCKED_ACTIONS`; `PlayerState.cooldowns: { block; steal; shove }`, `stunTicks`, `callingForPassTicks`, `targetId: PlayerId | null`; `MatchState.buzzerPending`; `ShotFlight` += `kind: 'shot' | 'pass'`, `receiver: PlayerId | null`, `lob: boolean`, `team: TeamIndex`; `ACTION_TIMING`; `applyStun(player, ticks)`; `stepLockedAction(state, player, court, events)` (dispatcher, extended in Tasks 3–4); `separatePlayers(players, court)`; `deflectBallOffPlayers(state)`; `sphereVsCapsuleContact(...)`; `finishOrOvertime(state, events)`.

- [ ] **Step 1: Types**

```ts
export type PlayerAction =
  | 'idle' | 'run' | 'jump'
  | 'shoot' | 'layup' | 'dunk'
  | 'pass' | 'block' | 'steal' | 'shove' | 'stunned' | 'getup';

/** Actions during which input is ignored (shots, passes, defensive moves, being knocked down). */
export const LOCKED_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>([
  'shoot', 'layup', 'dunk', 'pass', 'block', 'steal', 'shove', 'stunned', 'getup',
]);
```

`PlayerState` additions:

```ts
  /** Ticks left before each defensive move can be used again. */
  cooldowns: { block: number; steal: number; shove: number };
  /** Length of the current stun, set by a shove. */
  stunTicks: number;
  /** Set by PASS without the ball; controllers read it (spec B.3). */
  callingForPassTicks: number;
  /** The player a pass, steal or shove is aimed at. */
  targetId: PlayerId | null;
```

`ShotFlight` → keep the name, add:

```ts
export interface ShotFlight {
  kind: 'shot' | 'pass';
  from: Vec3;
  velocity: Vec3;
  totalTicks: number;
  elapsedTicks: number;
  /** Passes: who it is for, whether it is an alley-oop lob, and the passing team. */
  receiver: PlayerId | null;
  lob: boolean;
  team: TeamIndex;
}
```

`MatchState` += `buzzerPending: boolean;` (B.5). `SimEvent` += `| { type: 'pass'; from: PlayerId; to: PlayerId; lob: boolean } | { type: 'catch'; playerId: PlayerId } | { type: 'intercept'; playerId: PlayerId } | { type: 'alleyOop'; playerId: PlayerId } | { type: 'block'; by: PlayerId; shooter: PlayerId } | { type: 'steal'; by: PlayerId; from: PlayerId } | { type: 'stealFailed'; by: PlayerId } | { type: 'shove'; by: PlayerId; target: PlayerId }`.

`createMatch`/`createPlayer`: initialise `cooldowns: { block: 0, steal: 0, shove: 0 }`, `stunTicks: 0`, `callingForPassTicks: 0`, `targetId: null`, `buzzerPending: false`. In `src/sim/shooting.ts` `launchShot`, the flight literal becomes `{ kind: 'shot', from, velocity, totalTicks: flightTicks, elapsedTicks: 0, receiver: null, lob: false, team: player.team }`.

`src/sim/player-movement.ts`: `isActionLocked` uses `LOCKED_ACTIONS` instead of `SHOT_ACTIONS`.

- [ ] **Step 2: Failing actions test**

`tests/sim/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { ACTION_TIMING, applyStun, stepLockedAction } from '../../src/sim/actions';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchSettings, type MatchState, type PlayerIntent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = { durationMs: 60_000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: 'gym', mode: 'match' };

function fresh(): MatchState {
  const s = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
  s.phase = 'live';
  return s;
}

describe('stun and getup', () => {
  it('a stunned player ignores input, then gets up, then is free', () => {
    let s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    applyStun(p, 30);
    expect(p.action).toBe('stunned');
    const run: PlayerIntent = { ...NO_INTENT, move: { x: 1, y: 0 } };
    // actionTicks reaches 30 at the end of tick 30; the transition is seen at tick 31's resolve step.
    for (let i = 0; i < 31; i++) s = tick(s, new Map([['p', run]]), court).state;
    expect(findPlayer(s, 'p')?.action).toBe('getup');
    expect(Math.hypot(findPlayer(s, 'p')?.vel.x ?? 1, findPlayer(s, 'p')?.vel.z ?? 1)).toBe(0);
    for (let i = 0; i < ACTION_TIMING.getup.totalTicks; i++) s = tick(s, new Map(), court).state;
    expect(findPlayer(s, 'p')?.action).toBe('idle');
    s = tick(s, new Map([['p', run]]), court).state;
    expect(findPlayer(s, 'p')?.vel.x).toBeGreaterThan(0);
  });

  it('a stun cancels a shot in progress', () => {
    const s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    p.action = 'shoot';
    p.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    applyStun(p, 20);
    expect(p.shot).toBeNull();
    expect(p.action).toBe('stunned');
  });
});

describe('cooldowns', () => {
  it('count down through the timers step', () => {
    let s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    p.cooldowns.steal = 3;
    p.callingForPassTicks = 2;
    s = tick(s, new Map(), court).state;
    expect(findPlayer(s, 'p')?.cooldowns.steal).toBe(2);
    expect(findPlayer(s, 'p')?.callingForPassTicks).toBe(1);
    s = tick(s, new Map(), court).state;
    s = tick(s, new Map(), court).state;
    expect(findPlayer(s, 'p')?.cooldowns.steal).toBe(0);
    expect(findPlayer(s, 'p')?.callingForPassTicks).toBe(0);
  });
});

describe('block landing', () => {
  it('a block ends when the blocker lands', () => {
    const s = fresh();
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    p.action = 'block';
    p.actionTicks = 0;
    p.vel.y = 4.5;
    p.onGround = false;
    let state = s;
    for (let i = 0; i < 70; i++) state = tick(state, new Map(), court).state;
    expect(findPlayer(state, 'p')?.onGround).toBe(true);
    expect(findPlayer(state, 'p')?.action).toBe('idle');
    expect(stepLockedAction).toBeTypeOf('function');
  });
});
```

- [ ] **Step 3: Implement `src/sim/actions.ts`**

```ts
import { stepShotAction } from './shooting';
import { SHOT_ACTIONS } from './types';
import type { CourtDef, MatchState, PlayerState, SimEvent } from './types';

/** Durations and hit ticks of the non-shot actions (spec B.3, B.4). */
export const ACTION_TIMING = {
  pass: { totalTicks: 12, releaseTick: 4 },
  steal: { totalTicks: 18, hitTick: 6, cooldown: 45 },
  shove: { totalTicks: 20, hitTick: 5, cooldown: 60 },
  block: { cooldown: 30, minTicks: 8 },
  getup: { totalTicks: 20 },
} as const;

export const STUN_MIN_TICKS = 20;

/** Knocks a player down: input ignored, any shot cancelled, horizontal motion decays. */
export function applyStun(player: PlayerState, ticks: number): void {
  player.action = 'stunned';
  player.actionTicks = 0;
  player.stunTicks = Math.max(STUN_MIN_TICKS, Math.round(ticks));
  player.shot = null;
  player.targetId = null;
}

/** Puts a player into a locked action from its first tick. */
export function beginAction(player: PlayerState, action: PlayerState['action']): void {
  player.action = action;
  player.actionTicks = 0;
}

export function endAction(player: PlayerState): void {
  player.action = 'idle';
  player.actionTicks = 0;
  player.targetId = null;
}

/**
 * Per-tick bookkeeping of locked actions (step 3 of the pipeline). Shots live in shooting.ts;
 * passes and defensive moves plug in here (tasks 3 and 4).
 */
export function stepLockedAction(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
): void {
  if (SHOT_ACTIONS.has(player.action)) {
    stepShotAction(state, player, court, events);
    return;
  }
  switch (player.action) {
    case 'stunned':
      if (player.actionTicks >= player.stunTicks) beginAction(player, 'getup');
      return;
    case 'getup':
      if (player.actionTicks >= ACTION_TIMING.getup.totalTicks) endAction(player);
      return;
    case 'block':
      if (player.onGround && player.actionTicks >= ACTION_TIMING.block.minTicks) endAction(player);
      return;
    default:
      // 'pass', 'steal', 'shove' are stepped by passing.ts / defence.ts (tasks 3–4).
      return;
  }
}
```

(`stepShotAction` moves out of `tick.ts`'s import list into this dispatcher; `tick.ts` calls `stepLockedAction`.)

- [ ] **Step 4: Failing bodies test**

`tests/sim/bodies.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { deflectBallOffPlayers, separatePlayers } from '../../src/sim/bodies';
import { createMatch, findPlayer } from '../../src/sim/match';
import type { MatchSettings } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = { durationMs: 60_000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: 'gym', mode: 'match' };

describe('separatePlayers', () => {
  it('pushes overlapping players apart symmetrically', () => {
    const s = createMatch(settings, court, [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 1, characterId: 'placeholder' },
    ]);
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: 0, y: 0, z: 0 };
    b.pos = { x: 0.3, y: 0, z: 0 };
    separatePlayers([a, b], court);
    expect(b.pos.x - a.pos.x).toBeCloseTo(0.7);
    expect(a.pos.x).toBeCloseTo(-0.2);
    expect(b.pos.x).toBeCloseTo(0.5);
  });

  it('does nothing when a player is well above the other', () => {
    const s = createMatch(settings, court, [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 1, characterId: 'placeholder' },
    ]);
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: 0, y: 0, z: 0 };
    b.pos = { x: 0.3, y: 1.8, z: 0 };
    separatePlayers([a, b], court);
    expect(b.pos.x).toBeCloseTo(0.3);
  });
});

describe('deflectBallOffPlayers', () => {
  it('bounces a high free ball off a player instead of passing through', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.pos = { x: 0, y: 0, z: 0 };
    s.ball = { ...s.ball, mode: 'free', holder: null, flight: null, pos: { x: -0.4, y: 1.9, z: 0 }, vel: { x: 6, y: 0, z: 0 } };
    deflectBallOffPlayers(s);
    expect(s.ball.vel.x).toBeLessThan(0);
  });

  it('leaves low balls to the pickup logic', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no player');
    a.pos = { x: 0, y: 0, z: 0 };
    s.ball = { ...s.ball, mode: 'free', holder: null, flight: null, pos: { x: -0.4, y: 1.0, z: 0 }, vel: { x: 6, y: 0, z: 0 } };
    deflectBallOffPlayers(s);
    expect(s.ball.vel.x).toBe(6);
  });
});
```

- [ ] **Step 5: Implement `sphereVsCapsuleContact` and `src/sim/bodies.ts`**

In `src/sim/collision.ts` add (and make `sphereVsCapsule` call it):

```ts
/** Contact of a sphere with a capsule (segment a→b, radius), or null. */
export function sphereVsCapsuleContact(
  center: Vec3,
  radius: number,
  a: Vec3,
  b: Vec3,
  capsuleRadius: number,
): Contact | null {
  const ab = v3Sub(b, a);
  const lengthSq = v3Dot(ab, ab);
  const t = lengthSq > EPSILON ? clamp(v3Dot(v3Sub(center, a), ab) / lengthSq, 0, 1) : 0;
  const closest = v3Add(a, v3Scale(ab, t));
  const delta = v3Sub(center, closest);
  const dist = v3Length(delta);
  const reach = radius + capsuleRadius;
  if (dist >= reach) return null;
  const normal = dist > EPSILON ? v3Scale(delta, 1 / dist) : { x: 1, y: 0, z: 0 };
  return { normal, depth: reach - dist };
}

export function sphereVsCapsule(center: Vec3, radius: number, a: Vec3, b: Vec3, capsuleRadius: number): boolean {
  return sphereVsCapsuleContact(center, radius, a, b, capsuleRadius) !== null;
}
```

`src/sim/bodies.ts`:

```ts
import { reflect, sphereVsCapsuleContact } from './collision';
import { clamp } from './math';
import { allPlayers } from './match';
import type { CourtDef, MatchState, PlayerState } from './types';

/** Body capsule shared by separation and deflection (pickup uses a wider reach, see ball.ts). */
export const PLAYER_BODY_RADIUS = 0.35;
export const PLAYER_BODY_BOTTOM = 0.35;
export const PLAYER_BODY_TOP = 1.55;
/** Free balls at or below this height are handled by pickup, not deflection (spec A.3). */
const DEFLECT_MIN_HEIGHT = 1.6;
const DEFLECT_RESTITUTION = 0.5;

/** Spec §4.2 step 6: overlapping players push each other apart on the court plane. */
export function separatePlayers(players: readonly PlayerState[], court: CourtDef): void {
  const minDistance = PLAYER_BODY_RADIUS * 2;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (!a || !b) continue;
      if (Math.abs(a.pos.y - b.pos.y) > PLAYER_BODY_TOP - PLAYER_BODY_BOTTOM) continue;
      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      let d = Math.hypot(dx, dz);
      if (d >= minDistance) continue;
      if (d < 1e-6) {
        dx = 1;
        dz = 0;
        d = 1;
      }
      const push = (minDistance - d) / 2;
      const ux = dx / d;
      const uz = dz / d;
      a.pos.x -= ux * push;
      a.pos.z -= uz * push;
      b.pos.x += ux * push;
      b.pos.z += uz * push;
    }
  }
  const halfLength = court.playArea.length / 2;
  const halfWidth = court.playArea.width / 2;
  for (const p of players) {
    p.pos.x = clamp(p.pos.x, -halfLength, halfLength);
    p.pos.z = clamp(p.pos.z, -halfWidth, halfWidth);
  }
}

/** Spec A.2: a free ball above pickup height bounces off bodies (needed for blocks and rebounds). */
export function deflectBallOffPlayers(state: MatchState): void {
  const { ball } = state;
  if (ball.mode !== 'free' || ball.pos.y <= DEFLECT_MIN_HEIGHT) return;
  for (const player of allPlayers(state)) {
    const bottom = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_BOTTOM, z: player.pos.z };
    const top = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_TOP, z: player.pos.z };
    const contact = sphereVsCapsuleContact(ball.pos, ball.radius, bottom, top, PLAYER_BODY_RADIUS);
    if (!contact) continue;
    ball.pos.x += contact.normal.x * contact.depth;
    ball.pos.y += contact.normal.y * contact.depth;
    ball.pos.z += contact.normal.z * contact.depth;
    ball.vel = reflect(ball.vel, contact.normal, DEFLECT_RESTITUTION);
    return;
  }
}
```

Run `npx vitest run tests/sim/bodies.test.ts tests/sim/collision.test.ts` — PASS.

- [ ] **Step 6: Buzzer-beater and tests**

`src/sim/phases.ts`: add

```ts
/** Ends regulation: a tie goes to sudden death, otherwise the match is over. */
export function finishOrOvertime(state: MatchState, events: SimEvent[]): void {
  state.buzzerPending = false;
  if (state.score[0] === state.score[1]) state.overtime = true;
  else setPhase(state, 'finished', events);
}

function shotInFlight(state: MatchState): boolean {
  return state.ball.mode === 'flight' && state.ball.flight?.kind === 'shot' && state.ball.lastShot !== null;
}
```

Replace the end of `stepClocks`:

```ts
  if (state.settings.mode !== 'match' || state.overtime) return;
  if (state.buzzerPending) {
    // Spec B.5: the buzzer waits for a shot already in the air.
    if (!shotInFlight(state)) finishOrOvertime(state, events);
    return;
  }
  state.clockMs = Math.max(0, state.clockMs - TICK_MS);
  if (state.clockMs === 0) {
    if (shotInFlight(state)) state.buzzerPending = true;
    else finishOrOvertime(state, events);
  }
```

and in `stepPhases`' `live` basket branch: `if (state.overtime || state.buzzerPending) { finishOrOvertime(state, events); if (state.phase === 'finished') return; }` — i.e. a buzzer-beater that ties sends the match to overtime and play continues from an inbound: after that call, if the phase is still `live` fall through to the normal `pendingInbound`/`scored` handling. (Overtime baskets: `finishOrOvertime` sees unequal scores → finished.) Also `receivingTeam`: in shootaround return `0` (B.1) — update its doc comment and the existing shootaround tests if any assert otherwise.

`tests/sim/ball.test.ts` tryPickup: stunned players never pick up — in `src/sim/ball.ts` `tryPickup` add `if (player.action === 'stunned' || player.action === 'getup') continue;` and a test that a free ball at a stunned player's feet stays free.

Append to `tests/sim/phases.test.ts`:

```ts
  it('a buzzer-beater counts: the clock waits for a shot in flight', () => {
    let s = run(createMatch({ ...base, durationMs: TICK_MS * 40 }, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 4, y: 0, z: 0 };
    home.facing = Math.PI / 2;
    giveBall(s, home, []);
    s.score = [0, 2];
    // Press now: the release lands around tick 27, the clock expires at tick 40 with the ball in the air.
    const { state, events } = run(s, 160, new Map([['home1', press]]));
    const released = events.find((e) => e.type === 'shotReleased');
    expect(released).toBeDefined();
    // The clock hits zero at tick 40 with the ball in the air (released at ~27, lands at ~100):
    // nothing may finish before the flight resolves.
    const releasedAt = events.findIndex((e) => e.type === 'shotReleased');
    const finishedAt = events.findIndex((e) => e.type === 'phaseChange' && e.to === 'finished');
    if (released?.type === 'shotReleased' && released.made) {
      expect(state.score[0]).toBe(2);
      expect(state.overtime).toBe(true); // 2–2: the buzzer-beater forces overtime
      expect(finishedAt).toBe(-1);
      expect(state.phase).not.toBe('finished');
    } else {
      expect(finishedAt).toBeGreaterThan(releasedAt + 40);
      expect(state.phase).toBe('finished');
      expect(state.score).toEqual([0, 2]);
    }
  });
```

(The test asserts both branches so it is seed-independent; `run` must not stop early.)

- [ ] **Step 7: Tick pipeline**

Replace `src/sim/tick.ts` with:

```ts
import { stepLockedAction } from './actions';
import { stepBall, tryPickup } from './ball';
import { deflectBallOffPlayers, separatePlayers } from './bodies';
import { buttonsOf, justPressed } from './buttons';
import { TICK_DT } from './constants';
import { allPlayers } from './match';
import { receivingTeam, setPhase, stepClocks, stepPhases } from './phases';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from './player-movement';
import { applyRules } from './rules';
import { detectBasket, startShot, stepFlight } from './shooting';
import { NO_INTENT } from './types';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, PlayerState, SimEvent } from './types';

export interface TickResult {
  state: MatchState;
  events: SimEvent[];
}

/**
 * Advances the match by one fixed step (spec §4.2). Pure: returns a new state and never
 * mutates `state`. Pipeline order is part of the game's definition — keep it stable:
 *   1. court modifier      (phase 5)
 *   2. abilities           (phase 5)
 *   3. resolve intents → actions
 *   4. move players
 *   5. move ball (held / flight / free, incl. floor, rim and board)
 *   6. bodies: player separation, ball deflection, pickup
 *   7. rules
 *   8. scoring / phases
 *   9. timers
 *  10. events
 */
export function tick(
  state: MatchState,
  intents: ReadonlyMap<PlayerId, PlayerIntent>,
  court: CourtDef,
): TickResult {
  if (state.phase === 'paused' || state.phase === 'finished') {
    return { state, events: [] };
  }

  const next = structuredClone(state);
  const events: SimEvent[] = [];
  next.tick += 1;
  next.phaseTicks += 1;
  const players = allPlayers(next);
  const intentFor = (player: PlayerState): PlayerIntent => intents.get(player.id) ?? NO_INTENT;

  // 3. resolve intents → actions
  for (const player of players) resolveAction(next, player, intentFor(player), court, events);

  // 4. move players
  for (const player of players) stepPlayer(player, intentFor(player), court, TICK_DT);

  // 5. move ball
  const prevBallPos = { ...next.ball.pos };
  if (next.ball.mode === 'flight') stepFlight(next.ball, court);
  else stepBall(next, court, events);

  // 6. bodies
  separatePlayers(players, court);
  deflectBallOffPlayers(next);
  tryPickup(next, events);

  // 7. rules
  for (const violation of applyRules(next)) {
    if (violation.ruleId === 'shotClock') {
      events.push({ type: 'shotClockViolation', team: violation.team });
      next.pendingInbound = receivingTeam(next, violation.team);
      setPhase(next, 'inbound', events);
    }
  }

  // 8. scoring / phases
  const basket = detectBasket(next, court, prevBallPos);
  if (basket) next.ball.lastShot = null;
  stepPhases(next, court, events, basket);

  // 9. timers
  stepClocks(next, events, events.some((e) => e.type === 'rimHit'));
  for (const player of players) {
    stepTurbo(player);
    if (player.shotCooldownTicks > 0) player.shotCooldownTicks -= 1;
    if (player.cooldowns.block > 0) player.cooldowns.block -= 1;
    if (player.cooldowns.steal > 0) player.cooldowns.steal -= 1;
    if (player.cooldowns.shove > 0) player.cooldowns.shove -= 1;
    if (player.callingForPassTicks > 0) player.callingForPassTicks -= 1;
    player.prevButtons = buttonsOf(intentFor(player));
  }

  return { state: next, events };
}

function resolveAction(
  state: MatchState,
  player: PlayerState,
  intent: PlayerIntent,
  court: CourtDef,
  events: SimEvent[],
): void {
  if (isActionLocked(player)) {
    stepLockedAction(state, player, court, events);
    return;
  }
  const hasBall = state.ball.holder === player.id;
  if (!player.onGround || !justPressed(player.prevButtons, intent, 'action')) return;
  if (hasBall && state.phase === 'live') startShot(state, player, court);
  else if (!hasBall) startJump(player, player.stats.jumpSpeed);
}
```

(The `receivingTeam` change makes the old shootaround ternary unnecessary.) Add `export * from './actions'; export * from './bodies';` to the barrel.

- [ ] **Step 8: Check, re-pin, commit**

`npx vitest run tests/sim` — the determinism hashes change (new state fields): re-pin with `-u` once, verify without, report old → new. `npm run format && npm run check` green. Commit: `feat(sim): locked-action plumbing, player separation, ball deflection and buzzer-beaters` with `Refs #<issue>`.

**Acceptance:** stun → getup → idle with input ignored; cooldowns and calling-for-pass tick down; overlapping players separate; high balls bounce off bodies; a buzzer-beater is resolved after the clock hits zero; stunned players cannot pick up.

---

### Task 3: Passing, alley-oops, interceptions

**Files:**
- Create: `src/sim/passing.ts`
- Modify: `src/sim/actions.ts` (pass case), `src/sim/tick.ts` (PASS button, pass flights), `src/sim/index.ts`
- Test: `tests/sim/passing.test.ts`, `tests/sim/determinism.test.ts` (re-pin)

**Interfaces:**
- Produces: `PASS_TIMING`, `PASS_CATCH_RADIUS = 0.9`, `ALLEY_OOP_RANGE = 3`, `CALL_FOR_PASS_TICKS = 60`; `teammateOf(state, player): PlayerState | undefined`; `startPass(state, player): boolean`; `releasePass(state, player, court, events): void`; `stepPassAction(state, player, court, events)`; `stepPassFlight(state, court, events)` (moves the ball, intercepts, catches, converts lobs); `callForPass(player)`.

- [ ] **Step 1: Failing passing tests**

`tests/sim/passing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { startJump } from '../../src/sim/player-movement';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchSettings, type MatchState, type PlayerIntent, type SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = { durationMs: 60_000, shotClockMs: 14_000, seed: 2, ruleIds: [], courtId: 'gym', mode: 'match' };
const passPress: PlayerIntent = { ...NO_INTENT, pass: true };
const hoop = hoopGeometry(court, 1);

/** Live match: 'a' holds the ball at the origin, teammate 'b' and opponent 'x' where the test puts them. */
function setup(): MatchState {
  const s = createMatch(settings, court, [
    { id: 'a', team: 0, characterId: 'placeholder' },
    { id: 'b', team: 0, characterId: 'placeholder' },
    { id: 'x', team: 1, characterId: 'placeholder' },
  ]);
  s.phase = 'live';
  const a = findPlayer(s, 'a');
  const b = findPlayer(s, 'b');
  const x = findPlayer(s, 'x');
  if (!a || !b || !x) throw new Error('no players');
  a.pos = { x: 0, y: 0, z: 0 };
  a.facing = Math.PI / 2;
  b.pos = { x: 5, y: 0, z: 0 };
  x.pos = { x: 0, y: 0, z: -6 };
  giveBall(s, a, []);
  return s;
}

function run(state: MatchState, ticks: number, intents: Map<string, PlayerIntent>, stop?: (ev: SimEvent[], s: MatchState) => boolean) {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = tick(s, intents, court);
    s = r.state;
    all.push(...r.events);
    if (stop?.(r.events, s)) break;
  }
  return { state: s, events: all };
}

describe('passing', () => {
  it('a pass reaches a standing teammate and is caught', () => {
    const { state, events } = run(setup(), 120, new Map([['a', passPress]]), (ev) => ev.some((e) => e.type === 'catch'));
    expect(events.some((e) => e.type === 'pass' && e.from === 'a' && e.to === 'b' && !e.lob)).toBe(true);
    expect(state.ball.holder).toBe('b');
    expect(state.possession).toBe(0);
    const passer = findPlayer(state, 'a');
    expect(passer?.action).not.toBe('pass');
  });

  it('leads a moving teammate', () => {
    const s = setup();
    const b = findPlayer(s, 'b');
    if (!b) throw new Error('no b');
    b.vel = { x: 0, y: 0, z: 6 }; // already at full run speed, so the lead is exact
    const intents = new Map<string, PlayerIntent>([
      ['a', passPress],
      ['b', { ...NO_INTENT, move: { x: 0, y: 1 } }],
    ]);
    const { state } = run(s, 120, intents, (ev) => ev.some((e) => e.type === 'catch'));
    expect(state.ball.holder).toBe('b');
  });

  it('is intercepted by an opponent standing on the line', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    x.pos = { x: 2.5, y: 0, z: 0 };
    const { state, events } = run(s, 120, new Map([['a', passPress]]), (ev) => ev.some((e) => e.type === 'intercept' || e.type === 'catch'));
    expect(events.some((e) => e.type === 'intercept' && e.playerId === 'x')).toBe(true);
    expect(state.ball.holder).toBe('x');
    expect(state.possession).toBe(1);
  });

  it('a pass with no teammate on court does nothing', () => {
    const s = createMatch(settings, court, [{ id: 'a', team: 0, characterId: 'placeholder' }]);
    s.phase = 'live';
    const a = findPlayer(s, 'a');
    if (!a) throw new Error('no a');
    giveBall(s, a, []);
    const { state, events } = run(s, 5, new Map([['a', passPress]]));
    expect(events.some((e) => e.type === 'pass')).toBe(false);
    expect(state.ball.holder).toBe('a');
  });

  it('PASS without the ball calls for it', () => {
    const s = setup();
    const { state } = run(s, 1, new Map([['b', passPress]]));
    expect(findPlayer(state, 'b')?.callingForPassTicks).toBe(59); // set to 60, decremented once
  });

  it('a lob to an airborne teammate at the rim becomes an alley-oop dunk', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const b = findPlayer(s, 'b');
    if (!a || !b) throw new Error('no players');
    a.pos = { x: hoop.rimCenter.x - 6, y: 0, z: 0 };
    b.pos = { x: hoop.rimCenter.x - 1.2, y: 0, z: 0 };
    s.ball.pos = { x: a.pos.x, y: 0.95, z: 0 };
    startJump(b, 4.5);
    const { state, events } = run(s, 150, new Map([['a', passPress]]), (ev) => ev.some((e) => e.type === 'basket'));
    expect(events.some((e) => e.type === 'pass' && e.lob)).toBe(true);
    expect(events.some((e) => e.type === 'alleyOop' && e.playerId === 'b')).toBe(true);
    expect(events.some((e) => e.type === 'basket' && e.shotType === 'dunk')).toBe(true);
    expect(state.score[0]).toBe(2);
  });
});
```

- [ ] **Step 2: Implement `src/sim/passing.ts`**

```ts
import { ACTION_TIMING, beginAction, endAction } from './actions';
import { solveArcVelocity } from './arc';
import { giveBall, holdPosition } from './ball';
import { PLAYER_BODY_BOTTOM, PLAYER_BODY_TOP } from './bodies';
import { sphereVsCapsule } from './collision';
import { TICK_DT, TICK_RATE } from './constants';
import { attackingHoopIndex, hoopGeometry } from './hoop';
import { v3DistanceXZ, type Vec3 } from './math';
import { allPlayers, findPlayer } from './match';
import { SHOT_TIMING, stepFlight, targetHoopIndex } from './shooting';
import type { CourtDef, MatchState, PlayerState, SimEvent } from './types';

export const PASS_TIMING = ACTION_TIMING.pass;
export const PASS_CATCH_RADIUS = 0.9;
/** Spec B.3: flight time 0.35 s + 0.05 s per metre. */
const PASS_BASE_TIME = 0.35;
const PASS_TIME_PER_METRE = 0.05;
/** Chest height the pass is aimed at, and how far above it still counts as catchable. */
const PASS_TARGET_HEIGHT = 1.2;
const CATCH_HEIGHT_TOLERANCE = 1.2;
export const ALLEY_OOP_RANGE = 3;
const LOB_TIME = 0.5;
const LOB_ABOVE_RIM = 0.55;
const LOB_TOWARDS_RECEIVER = 0.4;
export const CALL_FOR_PASS_TICKS = 60;
/** Reach used for interceptions: body plus arms. */
const INTERCEPT_RADIUS = 0.45;

/** The other player on this player's team (2v2: exactly one). */
export function teammateOf(state: MatchState, player: PlayerState): PlayerState | undefined {
  return state.teams[player.team].players.find((p) => p.id !== player.id);
}

export function callForPass(player: PlayerState): void {
  player.callingForPassTicks = CALL_FOR_PASS_TICKS;
}

/** Starts the pass animation towards the teammate; false when there is nobody to pass to. */
export function startPass(state: MatchState, player: PlayerState): boolean {
  const receiver = teammateOf(state, player);
  if (!receiver) return false;
  beginAction(player, 'pass');
  player.targetId = receiver.id;
  player.facing = Math.atan2(receiver.pos.x - player.pos.x, receiver.pos.z - player.pos.z);
  return true;
}

function isNearAttackingHoop(state: MatchState, player: PlayerState, court: CourtDef): boolean {
  const hoop = hoopGeometry(court, targetHoopIndex(state, player, court));
  return v3DistanceXZ(player.pos, hoop.rimCenter) <= ALLEY_OOP_RANGE;
}

/** Launches the ball at the receiver: a fast low arc, or a lob above the rim for an alley-oop (B.3). */
export function releasePass(state: MatchState, player: PlayerState, court: CourtDef, events: SimEvent[]): void {
  const receiver = player.targetId === null ? undefined : findPlayer(state, player.targetId);
  const { ball } = state;
  if (!receiver || ball.holder !== player.id) return;
  const from = holdPosition(player);
  const lob = !receiver.onGround && isNearAttackingHoop(state, receiver, court);
  let target: Vec3;
  let flightTime: number;
  if (lob) {
    const rim = hoopGeometry(court, targetHoopIndex(state, receiver, court)).rimCenter;
    const dx = receiver.pos.x - rim.x;
    const dz = receiver.pos.z - rim.z;
    const len = Math.hypot(dx, dz) || 1;
    target = {
      x: rim.x + (dx / len) * LOB_TOWARDS_RECEIVER,
      y: rim.y + LOB_ABOVE_RIM,
      z: rim.z + (dz / len) * LOB_TOWARDS_RECEIVER,
    };
    flightTime = LOB_TIME;
  } else {
    const distance = v3DistanceXZ(player.pos, receiver.pos);
    flightTime = PASS_BASE_TIME + PASS_TIME_PER_METRE * distance;
    // Lead a moving receiver by where they will be at arrival.
    target = {
      x: receiver.pos.x + receiver.vel.x * flightTime,
      y: receiver.pos.y + PASS_TARGET_HEIGHT,
      z: receiver.pos.z + receiver.vel.z * flightTime,
    };
  }
  const totalTicks = Math.max(1, Math.round(flightTime * TICK_RATE));
  const velocity = solveArcVelocity(from, target, totalTicks * TICK_DT, court.physics.gravity);
  ball.mode = 'flight';
  ball.holder = null;
  ball.pos = { ...from };
  ball.vel = velocity;
  ball.flight = { kind: 'pass', from, velocity, totalTicks, elapsedTicks: 0, receiver: receiver.id, lob, team: player.team };
  ball.lastShot = null;
  events.push({ type: 'pass', from: player.id, to: receiver.id, lob });
}

/** Per-tick bookkeeping of the pass animation: release at the release tick, unlock at the end. */
export function stepPassAction(state: MatchState, player: PlayerState, court: CourtDef, events: SimEvent[]): void {
  if (player.actionTicks === PASS_TIMING.releaseTick) releasePass(state, player, court, events);
  if (player.actionTicks >= PASS_TIMING.totalTicks) endAction(player);
}

function overlapsBall(state: MatchState, player: PlayerState, radius: number): boolean {
  const bottom = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_BOTTOM, z: player.pos.z };
  const top = { x: player.pos.x, y: player.pos.y + PLAYER_BODY_TOP, z: player.pos.z };
  return sphereVsCapsule(state.ball.pos, state.ball.radius, bottom, top, radius);
}

function canHold(player: PlayerState): boolean {
  return player.action !== 'stunned' && player.action !== 'getup';
}

/**
 * Moves a pass along its arc, hands it to an intercepting opponent, and at arrival to the
 * receiver if they are within reach; an airborne receiver near the rim turns a lob into a dunk.
 */
export function stepPassFlight(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const { ball } = state;
  const flight = ball.flight;
  if (!flight) {
    ball.mode = 'free';
    return;
  }
  stepFlight(ball, court);
  for (const opponent of allPlayers(state)) {
    if (opponent.team === flight.team || !canHold(opponent)) continue;
    if (overlapsBall(state, opponent, INTERCEPT_RADIUS)) {
      giveBall(state, opponent, events);
      events.push({ type: 'intercept', playerId: opponent.id });
      return;
    }
  }
  if (ball.mode !== 'free') return; // still flying
  const receiver = flight.receiver === null ? undefined : findPlayer(state, flight.receiver);
  if (!receiver || !canHold(receiver)) return;
  const nearHoop = isNearAttackingHoop(state, receiver, court);
  if (flight.lob && !receiver.onGround && nearHoop) {
    giveBall(state, receiver, events);
    events.push({ type: 'catch', playerId: receiver.id });
    // Catch above the rim: slam it on the next tick.
    receiver.shot = { type: 'dunk', hoop: targetHoopIndex(state, receiver, court), approachSpeed: 0 };
    receiver.action = 'dunk';
    receiver.actionTicks = SHOT_TIMING.dunk.releaseTick - 1;
    events.push({ type: 'alleyOop', playerId: receiver.id });
    return;
  }
  const withinReach = v3DistanceXZ(receiver.pos, ball.pos) <= PASS_CATCH_RADIUS;
  const withinHeight = Math.abs(ball.pos.y - (receiver.pos.y + PASS_TARGET_HEIGHT)) <= CATCH_HEIGHT_TOLERANCE;
  if (withinReach && withinHeight) {
    giveBall(state, receiver, events);
    events.push({ type: 'catch', playerId: receiver.id });
  }
}
```

Note the circular import `passing.ts` ↔ `actions.ts` (actions dispatches to `stepPassAction`): avoid it by having `actions.ts` import `stepPassAction` lazily is not possible in ESM without cycles — instead keep the dispatcher's `pass` case in **tick.ts**: `resolveAction` checks `player.action === 'pass'` before calling `stepLockedAction`. Do the same for steal/shove in Task 4. (`actions.ts` must not import `passing.ts`/`defence.ts`.)

- [ ] **Step 3: Tick wiring**

In `src/sim/tick.ts`:

```ts
import { callForPass, startPass, stepPassAction, stepPassFlight } from './passing';
```

Step 5 becomes:

```ts
  if (next.ball.mode === 'flight' && next.ball.flight?.kind === 'pass') stepPassFlight(next, court, events);
  else if (next.ball.mode === 'flight') stepFlight(next.ball, court);
  else stepBall(next, court, events);
```

`resolveAction`:

```ts
  if (isActionLocked(player)) {
    if (player.action === 'pass') stepPassAction(state, player, court, events);
    else stepLockedAction(state, player, court, events);
    return;
  }
  const hasBall = state.ball.holder === player.id;
  const live = state.phase === 'live';
  if (justPressed(player.prevButtons, intent, 'pass')) {
    if (hasBall && live && player.onGround) {
      if (startPass(state, player)) return;
    } else if (!hasBall) {
      callForPass(player);
    }
  }
  if (!player.onGround || !justPressed(player.prevButtons, intent, 'action')) return;
  if (hasBall && live) startShot(state, player, court);
  else if (!hasBall) startJump(player, player.stats.jumpSpeed);
```

Add `export * from './passing';` to the barrel.

- [ ] **Step 4: Check, re-pin, commit**

`npx vitest run tests/sim/passing.test.ts` — PASS (6 tests). If the alley-oop test fails because the receiver has landed before the lob arrives (airtime ≈ 55 ticks, pass release at tick 4 + 30-tick lob = tick 34 — it should still be airborne), report the tick numbers rather than changing thresholds. Re-pin the golden hashes if they change; `npm run format && npm run check` green. Commit: `feat(sim): passing with leads, interceptions, calls for the ball and alley-oop dunks` with `Refs #<issue>`.

**Acceptance:** standing and moving teammates are hit; an opponent on the line intercepts; no teammate → no pass; PASS without the ball sets the call flag; a lob to an airborne teammate at the rim becomes a dunk that scores.

---

### Task 4: Defence — block, steal, shove, defender term

**Files:**
- Create: `src/sim/defence.ts`
- Modify: `src/sim/shooting.ts` (`shotQuality` defenders param, `releaseShot` → `tryBlockShot`), `src/sim/tick.ts` (context-sensitive action, steal/shove stepping), `src/sim/index.ts`
- Test: `tests/sim/defence.test.ts`, `tests/sim/shooting.test.ts` (defender term), `tests/sim/determinism.test.ts` (re-pin)

**Interfaces:**
- Produces: `nearestOpponent(state, player): PlayerState | undefined`; `chooseDefensiveAction(state, player, court): 'block' | 'steal' | 'shove' | 'jump'`; `startBlock(player)`, `startSteal(player, target)`, `startShove(player, target)`; `stepDefenceAction(state, player, court, events)`; `resolveSteal(state, stealer, events)`; `resolveShove(state, shover, events)`; `tryBlockShot(state, shooter, court, events): boolean`; `defenderFactor(shooter, defenders): number`; `shotQuality(shooter, shotType, hoop, defenders = [])`.

- [ ] **Step 1: Failing defence tests**

`tests/sim/defence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { chooseDefensiveAction } from '../../src/sim/defence';
import { defenderFactor } from '../../src/sim/shooting';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchSettings, type MatchState, type PlayerIntent, type SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1);
const press: PlayerIntent = { ...NO_INTENT, action: true };

function setup(seed = 1): MatchState {
  const s = createMatch(
    { durationMs: 60_000, shotClockMs: 14_000, seed, ruleIds: [], courtId: 'gym', mode: 'match' },
    court,
    [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'x', team: 1, characterId: 'placeholder' },
    ],
  );
  s.phase = 'live';
  const a = findPlayer(s, 'a');
  const x = findPlayer(s, 'x');
  if (!a || !x) throw new Error('no players');
  a.pos = { x: hoop.rimCenter.x - 5, y: 0, z: 0 };
  a.facing = Math.PI / 2;
  x.pos = { x: hoop.rimCenter.x - 4.2, y: 0, z: 0 };
  x.facing = -Math.PI / 2;
  giveBall(s, a, []);
  return s;
}

function run(state: MatchState, ticks: number, intents: Map<string, PlayerIntent>, stop?: (ev: SimEvent[], s: MatchState) => boolean) {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = tick(s, intents, court);
    s = r.state;
    all.push(...r.events);
    if (stop?.(r.events, s)) break;
  }
  return { state: s, events: all };
}

describe('chooseDefensiveAction', () => {
  it('blocks a shooter, steals from a close handler, shoves otherwise, jumps when far', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    expect(chooseDefensiveAction(s, x, court)).toBe('steal');
    a.action = 'shoot';
    a.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    expect(chooseDefensiveAction(s, x, court)).toBe('block');
    a.action = 'idle';
    a.shot = null;
    a.pos.x = hoop.rimCenter.x - 2;
    x.pos.x = hoop.rimCenter.x - 3;
    expect(chooseDefensiveAction(s, x, court)).toBe('block'); // handler near the hoop
    s.ball.holder = null;
    s.ball.mode = 'free';
    x.facing = Math.PI / 2; // face +X, towards the opponent
    expect(chooseDefensiveAction(s, x, court)).toBe('shove'); // opponent in reach and in front
    x.pos.x = hoop.rimCenter.x - 9;
    expect(chooseDefensiveAction(s, x, court)).toBe('jump');
  });

  it('never chooses a defensive move while a teammate holds the ball', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    s.ball.holder = 'x';
    const y = { ...x, id: 'y' };
    s.teams[1].players.push(y);
    expect(chooseDefensiveAction(s, y, court)).toBe('jump');
  });
});

describe('defender term', () => {
  it('reduces quality with a close defender, more when airborne, never below the floor', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    expect(defenderFactor(a, [])).toBe(1);
    x.pos = { x: a.pos.x + 3, y: 0, z: 0 };
    expect(defenderFactor(a, [x])).toBeCloseTo(1);
    x.pos = { x: a.pos.x + 1, y: 0, z: 0 };
    expect(defenderFactor(a, [x])).toBeCloseTo(0.7);
    x.onGround = false;
    expect(defenderFactor(a, [x])).toBeCloseTo(0.42);
    x.pos = { x: a.pos.x + 0.1, y: 0, z: 0 };
    x.onGround = true;
    expect(defenderFactor(a, [x])).toBeCloseTo(0.475);
  });
});

describe('block', () => {
  it('a rising blocker in reach deflects the shot: no flight, ball loose, no basket', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    x.pos.x = hoop.rimCenter.x - 4.4; // 0.6 m from the shooter
    // Shooter presses at tick 0 (release at tick 27). The defender jumps at tick 10: at the release
    // they are 17 ticks up (0.88 m, hand at 3.18 m ≥ the 3.13 m release point) and still rising.
    let state = s;
    const all: SimEvent[] = [];
    for (let i = 0; i < 120; i++) {
      const intents = new Map<string, PlayerIntent>([['a', press]]);
      if (i === 10) intents.set('x', press);
      const r = tick(state, intents, court);
      state = r.state;
      all.push(...r.events);
    }
    expect(all.some((e) => e.type === 'block' && e.by === 'x' && e.shooter === 'a')).toBe(true);
    expect(all.some((e) => e.type === 'shotReleased')).toBe(false);
    expect(all.some((e) => e.type === 'basket')).toBe(false);
    expect(state.score).toEqual([0, 0]);
  });

  it('a blocker out of reach does nothing', () => {
    const s = setup();
    const x = findPlayer(s, 'x');
    if (!x) throw new Error('no x');
    x.pos.x = hoop.rimCenter.x - 3; // 2 m from the shooter, beyond block reach
    let state = s;
    const all: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const intents = new Map<string, PlayerIntent>([['a', press]]);
      if (i === 10) intents.set('x', press);
      const r = tick(state, intents, court);
      state = r.state;
      all.push(...r.events);
    }
    expect(all.some((e) => e.type === 'block')).toBe(false);
    expect(all.some((e) => e.type === 'shotReleased')).toBe(true);
  });

  it('a dunk is only blocked by a block that started first', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    a.pos.x = hoop.rimCenter.x - 1.5;
    a.vel = { x: 4, y: 0, z: 0 };
    x.pos.x = hoop.rimCenter.x - 0.9;
    // Block pressed at tick 0, dunk pressed at tick 1: the block started first.
    let state = s;
    const all: SimEvent[] = [];
    for (let i = 0; i < 90; i++) {
      const intents = new Map<string, PlayerIntent>();
      if (i === 0) intents.set('x', press);
      if (i >= 1) intents.set('a', press);
      const r = tick(state, intents, court);
      state = r.state;
      all.push(...r.events);
    }
    expect(all.some((e) => e.type === 'block')).toBe(true);
  });
});

describe('steal', () => {
  it('succeeds at about the resolved chance over many seeds and costs a cooldown either way', () => {
    let wins = 0;
    const n = 120;
    for (let seed = 1; seed <= n; seed++) {
      const s = setup(seed);
      const { state, events } = run(s, 30, new Map([['x', press]]), (ev) => ev.some((e) => e.type === 'steal' || e.type === 'stealFailed'));
      if (events.some((e) => e.type === 'steal')) {
        wins += 1;
        expect(state.ball.holder).toBe('x');
        expect(state.possession).toBe(1);
      }
      expect(findPlayer(state, 'x')?.cooldowns.steal).toBeGreaterThan(0);
    }
    // chance = clamp(0.45 - 0.03*5, 0.1, 0.7) = 0.30 with default stats
    expect(Math.abs(wins / n - 0.3)).toBeLessThan(0.1);
  });

  it('is half as likely against a handler running away', () => {
    let wins = 0;
    const n = 120;
    for (let seed = 1; seed <= n; seed++) {
      const s = setup(seed);
      const a = findPlayer(s, 'a');
      if (!a) throw new Error('no a');
      a.vel = { x: -5, y: 0, z: 0 };
      const intents = new Map<string, PlayerIntent>([
        ['x', press],
        ['a', { ...NO_INTENT, move: { x: -1, y: 0 } }],
      ]);
      const { events } = run(s, 30, intents, (ev) => ev.some((e) => e.type === 'steal' || e.type === 'stealFailed'));
      if (events.some((e) => e.type === 'steal')) wins += 1;
    }
    expect(wins / n).toBeLessThan(0.25);
  });
});

describe('shove', () => {
  it('knocks the handler down, pops the ball loose and respects power', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    // Steal is preferred when the handler is in reach: put x just outside steal reach (1.02 m)
    // but inside shove reach (1.2 m), facing the handler.
    x.pos.x = a.pos.x + 1.1;
    x.facing = -Math.PI / 2;
    const { state, events } = run(s, 40, new Map([['x', press]]), (ev) => ev.some((e) => e.type === 'shove'));
    expect(events.some((e) => e.type === 'shove' && e.by === 'x' && e.target === 'a')).toBe(true);
    const victim = findPlayer(state, 'a');
    expect(victim?.action).toBe('stunned');
    expect(victim?.stunTicks).toBe(45); // 60 dealt − 15 resisted with default stats
    expect(state.ball.holder).toBeNull();
    expect(state.ball.mode).toBe('free');
    expect(findPlayer(state, 'x')?.cooldowns.shove).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `src/sim/defence.ts`**

```ts
import { ACTION_TIMING, applyStun, beginAction, endAction } from './actions';
import { giveBall, holdPosition } from './ball';
import { hoopGeometry } from './hoop';
import { clamp, v3DistanceXZ, type Vec3 } from './math';
import { allPlayers, findPlayer } from './match';
import { startJump } from './player-movement';
import { nextFloat } from './rng';
import { targetHoopIndex } from './shooting';
import { SHOT_ACTIONS } from './types';
import type { CourtDef, MatchState, PlayerState, SimEvent } from './types';

/** Spec B.4 reach and geometry. */
const BLOCK_NEAR_HOOP = 3;
const SHOVE_REACH = 1.2;
/** cos of the half-angle in front of the shover that counts as "in front". */
const SHOVE_FACING_COS = 0.3;
const SHOVE_TURBO_MULTIPLIER = 1.5;
const AWAY_SPEED = 1;
/** Loose-ball pop after a shove. */
const POP_SPEED = 2;

export type DefensiveChoice = 'block' | 'steal' | 'shove' | 'jump';

export function nearestOpponent(state: MatchState, player: PlayerState): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestD = Infinity;
  for (const other of allPlayers(state)) {
    if (other.team === player.team) continue;
    const d = v3DistanceXZ(player.pos, other.pos);
    if (d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function inFront(player: PlayerState, target: Vec3): boolean {
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  return (Math.sin(player.facing) * dx + Math.cos(player.facing) * dz) / len > SHOVE_FACING_COS;
}

/** Spec B.4: what the action button means for a player without the ball. */
export function chooseDefensiveAction(state: MatchState, player: PlayerState, court: CourtDef): DefensiveChoice {
  const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
  if (holder && holder.team === player.team) return 'jump';
  const opponent = nearestOpponent(state, player);
  if (!opponent) return 'jump';
  if (holder && holder.id === opponent.id) {
    const hoop = hoopGeometry(court, targetHoopIndex(state, holder, court));
    const shooting = SHOT_ACTIONS.has(holder.action);
    if (shooting || v3DistanceXZ(holder.pos, hoop.rimCenter) <= BLOCK_NEAR_HOOP) return 'block';
    if (v3DistanceXZ(player.pos, holder.pos) <= player.stats.stealReach) return 'steal';
  }
  if (v3DistanceXZ(player.pos, opponent.pos) <= SHOVE_REACH && inFront(player, opponent.pos)) return 'shove';
  return 'jump';
}

export function startBlock(player: PlayerState): void {
  beginAction(player, 'block');
  player.cooldowns.block = ACTION_TIMING.block.cooldown;
  startJump(player, player.stats.jumpSpeed);
}

export function startSteal(player: PlayerState, target: PlayerState): void {
  beginAction(player, 'steal');
  player.targetId = target.id;
  player.cooldowns.steal = ACTION_TIMING.steal.cooldown;
  player.facing = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
}

export function startShove(player: PlayerState, target: PlayerState): void {
  beginAction(player, 'shove');
  player.targetId = target.id;
  player.cooldowns.shove = ACTION_TIMING.shove.cooldown;
  player.facing = Math.atan2(target.pos.x - player.pos.x, target.pos.z - player.pos.z);
}

/** Per-tick bookkeeping for steals and shoves (blocks end in actions.ts when the blocker lands). */
export function stepDefenceAction(state: MatchState, player: PlayerState, events: SimEvent[]): void {
  if (player.action === 'steal') {
    if (player.actionTicks === ACTION_TIMING.steal.hitTick) resolveSteal(state, player, events);
    if (player.actionTicks >= ACTION_TIMING.steal.totalTicks) endAction(player);
  } else if (player.action === 'shove') {
    if (player.actionTicks === ACTION_TIMING.shove.hitTick) resolveShove(state, player, events);
    if (player.actionTicks >= ACTION_TIMING.shove.totalTicks) endAction(player);
  }
}

function movingAway(holder: PlayerState, from: PlayerState): boolean {
  const speed = Math.hypot(holder.vel.x, holder.vel.z);
  if (speed < AWAY_SPEED) return false;
  const dx = holder.pos.x - from.pos.x;
  const dz = holder.pos.z - from.pos.z;
  return holder.vel.x * dx + holder.vel.z * dz > 0;
}

/** Spec B.4 steal roll. RNG draw order: exactly one draw per attempt that reaches the holder. */
export function resolveSteal(state: MatchState, stealer: PlayerState, events: SimEvent[]): void {
  const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
  if (!holder || holder.team === stealer.team || !holder.onGround) {
    events.push({ type: 'stealFailed', by: stealer.id });
    return;
  }
  if (v3DistanceXZ(stealer.pos, holder.pos) > stealer.stats.stealReach) {
    events.push({ type: 'stealFailed', by: stealer.id });
    return;
  }
  let chance = clamp(stealer.stats.stealChance - 0.03 * holder.stats.power, 0.1, 0.7);
  if (movingAway(holder, stealer)) chance *= 0.5;
  if (nextFloat(state.rng) < chance) {
    giveBall(state, stealer, events);
    events.push({ type: 'steal', by: stealer.id, from: holder.id });
  } else {
    events.push({ type: 'stealFailed', by: stealer.id });
  }
}

/** Spec B.4 shove: the nearest opponent in reach and in front is knocked down; the ball pops loose. */
export function resolveShove(state: MatchState, shover: PlayerState, events: SimEvent[]): void {
  const target = shover.targetId === null ? undefined : findPlayer(state, shover.targetId);
  if (!target || target.team === shover.team) return;
  if (v3DistanceXZ(shover.pos, target.pos) > SHOVE_REACH || !inFront(shover, target.pos)) return;
  const dealt = shover.stats.stunTicksDealt * (shover.turboActive ? SHOVE_TURBO_MULTIPLIER : 1);
  const stun = dealt - target.stats.stunResistTicks;
  const dx = target.pos.x - shover.pos.x;
  const dz = target.pos.z - shover.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  applyStun(target, stun);
  target.vel.x = ux * POP_SPEED;
  target.vel.z = uz * POP_SPEED;
  if (state.ball.holder === target.id) {
    const { ball } = state;
    const hand = holdPosition(target);
    ball.mode = 'free';
    ball.holder = null;
    ball.flight = null;
    ball.lastShot = null;
    ball.freeTicks = 0;
    ball.pos = { x: hand.x, y: hand.y + 0.3, z: hand.z };
    ball.vel = { x: ux * POP_SPEED, y: POP_SPEED, z: uz * POP_SPEED };
  }
  events.push({ type: 'shove', by: shover.id, target: target.id });
}

```

`defence.ts` imports `shooting.ts` (`targetHoopIndex`), so the block check and the defender term — which `shooting.ts` needs — live in `shooting.ts` to avoid an import cycle. `defence.test.ts` imports `defenderFactor` from `../../src/sim/shooting`.

- [ ] **Step 3: Shooting changes**

In `src/sim/shooting.ts`:
- `shotQuality(shooter, shotType, hoop, defenders: readonly PlayerState[] = [])`: for `layup` and `jumpshot` multiply by `defenderFactor(shooter, defenders)` (dunks stay 1). The sweep and existing tests pass no defenders.
- `resolveShotOutcome` passes `allPlayers(state).filter((p) => p.team !== player.team)` as defenders.
- `releaseShot`: `if (tryBlockShot(state, player, court, events)) return;` before resolving the outcome.
- Add these (imports: `allPlayers` from `./match`, `holdPosition` from `./ball`; constants `BLOCK_HAND_HEIGHT = 2.3`, `SHOT_RELEASE_HEIGHT = 2.1` (reuse `RELEASE_HEIGHT`), `BLOCK_SWAT_SPEED = 3`):

```ts
/**
 * Spec B.4: a shot released within reach of a rising blocker whose hand is at or above the
 * release height is swatted loose. Dunks are blocked only by a block that started first.
 * Returns true when the shot was blocked (nothing is launched).
 */
export function tryBlockShot(state: MatchState, shooter: PlayerState, court: CourtDef, events: SimEvent[]): boolean {
  const shot = shooter.shot;
  if (!shot) return false;
  const releaseHeight = shooter.pos.y + SHOT_RELEASE_HEIGHT;
  for (const blocker of allPlayers(state)) {
    if (blocker.team === shooter.team || blocker.action !== 'block' || blocker.vel.y <= 0) continue;
    if (v3DistanceXZ(blocker.pos, shooter.pos) > blocker.stats.blockReach) continue;
    if (blocker.pos.y + BLOCK_HAND_HEIGHT < releaseHeight) continue;
    if (shot.type === 'dunk' && blocker.actionTicks <= shooter.actionTicks) continue;
    const { ball } = state;
    const hand = holdPosition(shooter);
    const dx = shooter.pos.x - blocker.pos.x;
    const dz = shooter.pos.z - blocker.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    ball.mode = 'free';
    ball.holder = null;
    ball.flight = null;
    ball.lastShot = null;
    ball.freeTicks = 0;
    ball.pos = { x: hand.x, y: releaseHeight, z: hand.z };
    ball.vel = { x: (dx / len) * BLOCK_SWAT_SPEED, y: -1.5, z: (dz / len) * BLOCK_SWAT_SPEED };
    shooter.shotCooldownTicks = 30;
    events.push({ type: 'block', by: blocker.id, shooter: shooter.id });
    return true;
  }
  return false;
}

/** Spec B.4 defender term of shotQuality: the nearest opponent's distance and whether they are up. */
export function defenderFactor(shooter: PlayerState, defenders: readonly PlayerState[]): number {
  let factor = 1;
  for (const d of defenders) {
    if (d.team === shooter.team) continue;
    const distance = v3DistanceXZ(shooter.pos, d.pos);
    let f = clamp(0.45 + 0.25 * distance, 0.45, 1);
    if (!d.onGround && distance <= 1.5) f *= 0.6;
    factor = Math.min(factor, f);
  }
  return factor;
}
```

Add to `tests/sim/shooting.test.ts`:

```ts
  it('a close airborne defender lowers the released quality', () => {
    const s = ready(4);
    const x = { ...findPlayer(s, 'p')!, id: 'x', team: 1 as const, onGround: false, pos: { x: hoop.rimCenter.x - 3.2, y: 0.5, z: 0 } };
    s.teams[1].players.push(x);
    const { events } = runUntil(s, press, (ev) => ev.some((e) => e.type === 'shotReleased'), 60);
    const released = events.find((e) => e.type === 'shotReleased');
    const open = shotQuality(findPlayer(ready(4), 'p')!, 'jumpshot', hoop);
    // 0.8 m away and airborne: clamp(0.45 + 0.25·0.8) = 0.65, ×0.6 = 0.39.
    expect(released?.type === 'shotReleased' ? released.quality : 1).toBeCloseTo(open * 0.39, 1);
  });
```

- [ ] **Step 4: Tick wiring**

In `src/sim/tick.ts` import `chooseDefensiveAction, startBlock, startShove, startSteal, stepDefenceAction, nearestOpponent` from `./defence` and replace the tail of `resolveAction`:

```ts
  if (isActionLocked(player)) {
    if (player.action === 'pass') stepPassAction(state, player, court, events);
    else if (player.action === 'steal' || player.action === 'shove') stepDefenceAction(state, player, events);
    else stepLockedAction(state, player, court, events);
    return;
  }
  …
  if (!player.onGround || !justPressed(player.prevButtons, intent, 'action')) return;
  if (hasBall) {
    if (live) startShot(state, player, court);
    return;
  }
  switch (chooseDefensiveAction(state, player, court)) {
    case 'block':
      if (player.cooldowns.block === 0) startBlock(player);
      else startJump(player, player.stats.jumpSpeed);
      return;
    case 'steal': {
      const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
      if (holder && player.cooldowns.steal === 0) startSteal(player, holder);
      return;
    }
    case 'shove': {
      const target = nearestOpponent(state, player);
      if (target && player.cooldowns.shove === 0) startShove(player, target);
      return;
    }
    default:
      startJump(player, player.stats.jumpSpeed);
  }
```

(`findPlayer` import from `./match`.) Barrel: `export * from './defence';`.

- [ ] **Step 5: Check, re-pin, commit**

`npx vitest run tests/sim` — PASS (steal-rate tests run 240 short matches; keep them under ~5 s). Re-pin golden hashes (steals/blocks draw the RNG only when they happen; the scripted runs may or may not change — report). `npm run format && npm run check` green. Commit: `feat(sim): context-sensitive defence — blocks, seeded steals, shoves and the defender term` with `Refs #<issue>`.

**Acceptance:** the action button resolves per B.4; a rising blocker in reach swats the shot; dunks only by an earlier block; steal rate ≈ chance and halved when the handler runs away; shoves stun with power scaling and pop the ball; the no-defender sweep is unchanged.

---

### Task 5: Dummies, controller signature, presentation, browser verification

**Files:**
- Create: `src/app/dummies.ts`
- Modify: `src/app.ts`, `src/ui/hud.ts`, `src/ui/debug-overlay.ts`, `src/render/player-view.ts`
- Test: `tests/app/dummies.test.ts`, `tests/ui/hud.test.ts` (banners)

**Interfaces:**
- Produces: `type Controller = (state: MatchState) => PlayerIntent`; `teammateDummy(id, humanId, court): Controller`; `defenderDummy(id, humanId, court): Controller`; `bannerFor` handles `block`, `steal`, `intercept`, `alleyOop`, `shove`.

- [ ] **Step 1: Dummy test**

`tests/app/dummies.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defenderDummy, teammateDummy } from '../../src/app/dummies';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { startJump } from '../../src/sim/player-movement';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchState, type PlayerIntent } from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1);

function setup(): MatchState {
  const s = createMatch(
    { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: ['shotClock'], courtId: 'gym', mode: 'shootaround' },
    court,
    [
      { id: 'home1', team: 0, characterId: 'placeholder' },
      { id: 'home2', team: 0, characterId: 'placeholder' },
      { id: 'away1', team: 1, characterId: 'placeholder' },
    ],
  );
  s.phase = 'live';
  const h = findPlayer(s, 'home1');
  if (!h) throw new Error('no human');
  h.pos = { x: hoop.rimCenter.x - 6, y: 0, z: 0 };
  giveBall(s, h, []);
  return s;
}

function play(state: MatchState, ticks: number, human: (s: MatchState) => PlayerIntent) {
  const mate = teammateDummy('home2', 'home1', court);
  const def = defenderDummy('away1', 'home1', court);
  let s = state;
  const events = [];
  for (let i = 0; i < ticks; i++) {
    const intents = new Map<string, PlayerIntent>([
      ['home1', human(s)],
      ['home2', mate(s)],
      ['away1', def(s)],
    ]);
    const r = tick(s, intents, court);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('dummies', () => {
  it('walk to their spots near the hoop the human attacks', () => {
    const { state } = play(setup(), 240, () => NO_INTENT);
    const mate = findPlayer(state, 'home2');
    const def = findPlayer(state, 'away1');
    expect(mate && Math.abs(mate.pos.z) > 2).toBe(true); // on the wing
    expect(def && def.pos.x > hoop.rimCenter.x - 4 && def.pos.x < hoop.rimCenter.x).toBe(true); // in the key
  });

  it('the teammate passes back a second after catching', () => {
    const { events } = play(setup(), 240, (s) => (s.tick === 1 ? { ...NO_INTENT, pass: true } : NO_INTENT));
    const passes = events.filter((e) => e.type === 'pass');
    expect(passes.some((e) => e.type === 'pass' && e.from === 'home1' && e.to === 'home2')).toBe(true);
    expect(passes.some((e) => e.type === 'pass' && e.from === 'home2' && e.to === 'home1')).toBe(true);
  });

  it('the teammate passes at once when the human calls for the ball', () => {
    const s = setup();
    const mate = findPlayer(s, 'home2');
    if (!mate) throw new Error('no mate');
    giveBall(s, mate, []);
    const { events } = play(s, 30, (st) => (st.tick === 1 ? { ...NO_INTENT, pass: true } : NO_INTENT));
    const idx = events.findIndex((e) => e.type === 'pass' && e.from === 'home2');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(20);
  });

  it('the teammate lobs when the human is airborne near the rim', () => {
    const s = setup();
    const mate = findPlayer(s, 'home2');
    const h = findPlayer(s, 'home1');
    if (!mate || !h) throw new Error('no players');
    mate.pos = { x: hoop.rimCenter.x - 5, y: 0, z: 4 };
    giveBall(s, mate, []);
    h.pos = { x: hoop.rimCenter.x - 1.2, y: 0, z: 0 };
    startJump(h, 4.5);
    const { events } = play(s, 120, () => NO_INTENT);
    expect(events.some((e) => e.type === 'pass' && e.lob)).toBe(true);
  });

  it('the defender raises for a block when the handler comes close', () => {
    const s = setup();
    const h = findPlayer(s, 'home1');
    const d = findPlayer(s, 'away1');
    if (!h || !d) throw new Error('no players');
    d.pos = { x: hoop.rimCenter.x - 2.5, y: 0, z: 0 };
    h.pos = { x: hoop.rimCenter.x - 4, y: 0, z: 0 };
    const { state } = play(s, 20, () => NO_INTENT);
    expect(['block', 'jump']).toContain(findPlayer(state, 'away1')?.action);
  });
});
```

- [ ] **Step 2: Implement `src/app/dummies.ts`**

```ts
import { hoopGeometry, nearestHoopIndex } from '../sim/hoop';
import { findPlayer } from '../sim/match';
import { ALLEY_OOP_RANGE } from '../sim/passing';
import { v3DistanceXZ, type Vec3 } from '../sim/math';
import { NO_INTENT, type CourtDef, type MatchState, type PlayerId, type PlayerIntent, type PlayerState } from '../sim/types';

/** One intent per tick from the match state. Humans wrap InputManager; AI arrives in phase 4. */
export type Controller = (state: MatchState) => PlayerIntent;

const ARRIVE_RADIUS = 0.5;
const WING_BACK = 5;
const WING_SIDE = 4;
const KEY_BACK = 2.5;
const TEAMMATE_HOLD_TICKS = 60;
const DEFENDER_BLOCK_RANGE = 2.5;
const DEFENDER_BLOCK_EVERY_TICKS = 120;

function stepTowards(player: PlayerState, spot: Vec3): PlayerIntent['move'] {
  const dx = spot.x - player.pos.x;
  const dz = spot.z - player.pos.z;
  const d = Math.hypot(dx, dz);
  if (d <= ARRIVE_RADIUS) return { x: 0, y: 0 };
  return { x: dx / d, y: dz / d };
}

/** The hoop the human is working on: the nearer one in shootaround. */
function humanHoop(state: MatchState, human: PlayerState, court: CourtDef) {
  return hoopGeometry(court, nearestHoopIndex(court, human.pos));
}

/** Spec B.1 teammate: wing spot, pass back after a second, at once when called, lob when the human is up at the rim. */
export function teammateDummy(id: PlayerId, humanId: PlayerId, court: CourtDef): Controller {
  let heldTicks = 0;
  let passedLastTick = false;
  return (state) => {
    const me = findPlayer(state, id);
    const human = findPlayer(state, humanId);
    if (!me || !human) return NO_INTENT;
    const hoop = humanHoop(state, human, court);
    const spot = { x: hoop.rimCenter.x - hoop.side * WING_BACK, y: 0, z: hoop.rimCenter.z + WING_SIDE };
    const holding = state.ball.holder === id;
    heldTicks = holding ? heldTicks + 1 : 0;
    const humanUpAtRim = !human.onGround && v3DistanceXZ(human.pos, hoop.rimCenter) <= ALLEY_OOP_RANGE;
    const wantsPass = holding && !passedLastTick && (heldTicks >= TEAMMATE_HOLD_TICKS || human.callingForPassTicks > 0 || humanUpAtRim);
    passedLastTick = wantsPass;
    return { ...NO_INTENT, move: holding ? { x: 0, y: 0 } : stepTowards(me, spot), pass: wantsPass };
  };
}

/** Spec B.1 defender: stands in the key, raises for a block when the handler comes close. */
export function defenderDummy(id: PlayerId, humanId: PlayerId, court: CourtDef): Controller {
  let lastBlockTick = -Infinity;
  return (state) => {
    const me = findPlayer(state, id);
    const human = findPlayer(state, humanId);
    if (!me || !human) return NO_INTENT;
    const hoop = humanHoop(state, human, court);
    const spot = { x: hoop.rimCenter.x - hoop.side * KEY_BACK, y: 0, z: hoop.rimCenter.z };
    const handlerClose = state.ball.holder === humanId && v3DistanceXZ(human.pos, me.pos) <= DEFENDER_BLOCK_RANGE;
    const block = handlerClose && me.onGround && state.tick - lastBlockTick >= DEFENDER_BLOCK_EVERY_TICKS;
    if (block) lastBlockTick = state.tick;
    return { ...NO_INTENT, move: stepTowards(me, spot), action: block };
  };
}
```

Note: `stepTowards` returns court-space intents (the sim expects court space; only human input goes through `stickToCourt`). A dummy holding the ball stands still so the human can steal it; the defender's `action` is a one-tick press (the sim edge-detects) — a block whose `chooseDefensiveAction` resolves to `steal` or `shove` is fine: the dummy is then stealing/shoving, which is also what a defender does.

- [ ] **Step 3: App wiring**

`src/app.ts`:
- `import { defenderDummy, teammateDummy, type Controller } from './app/dummies';`
- Roster: `[{ id: HUMAN_ID, team: 0, characterId: character.id, character }, { id: 'home2', team: 0, characterId: 'rook', character: getCharacter('rook') }, { id: 'away1', team: 1, characterId: 'brick', character: getCharacter('brick') }]`.
- `const controllers = new Map<PlayerId, Controller>([[HUMAN_ID, () => input.sample()], ['home2', teammateDummy('home2', HUMAN_ID, court)], ['away1', defenderDummy('away1', HUMAN_ID, court)]]);` and in the tick: `intents.set(id, controller(runner.current))`.
- Flash on `block`/`steal` too (ball position) — optional; keep basket only.
- Overlay: add `action: string` to `DebugData` (`` `action ${data.action}` ``), set from `human.action`.

`src/ui/hud.ts` `bannerFor` additions: `block` → `'BLOCKED!'`, `steal` → `'STEAL!'`, `intercept` → `'INTERCEPTED!'`, `alleyOop` → `'ALLEY-OOP!'`, `shove` → `null` (too frequent), `catch`/`pass`/`stealFailed` → `null`. Tests in `tests/ui/hud.test.ts`:

```ts
    expect(bannerFor({ type: 'block', by: 'x', shooter: 'a' })).toBe('BLOCKED!');
    expect(bannerFor({ type: 'steal', by: 'x', from: 'a' })).toBe('STEAL!');
    expect(bannerFor({ type: 'intercept', playerId: 'x' })).toBe('INTERCEPTED!');
    expect(bannerFor({ type: 'alleyOop', playerId: 'b' })).toBe('ALLEY-OOP!');
    expect(bannerFor({ type: 'shove', by: 'x', target: 'a' })).toBeNull();
```

`src/render/player-view.ts` poses: replace the arm logic with a target angle per action — raise **forward** (negative rotation, fixing the Phase 2 note): `jump`/`block`/`shoot`/`layup`/`dunk` → `-Math.PI`; `pass`/`steal`/`shove` → `-Math.PI / 2`; else `0`; keep the 0.25 lerp. Stunned/getup: tilt the body mesh — keep a `private tilt = 0` and lerp it towards `1` for `stunned`, `0.5` for `getup`, `0` otherwise; apply `body.rotation.x = -tilt * (Math.PI / 2)` and `body.position.y = 0.85 - tilt * 0.5` (the capsule lies down); the head and arms follow by sitting in the same group — acceptable for placeholders.

- [ ] **Step 4: Check, browser verification, commit**

`npm run format && npm run check` green. Then `npm run dev`, Chrome DevTools at 1366×768 and 1024×768 (touch), screenshots under `.superpowers/sdd/2026-10-01-phase-3-passing-defence-characters/task-5-shots/`:

1. Three players on court: you (blue), the teammate (blue) walking to the wing, the defender (red) in the key.
2. PASS with the ball: the ball flies to the teammate, who passes it back after a second. PASS without the ball: it comes back at once.
3. Run under the hoop and press GO/Space without the ball while the teammate holds it: you jump; if timed near the rim the teammate lobs and you dunk ("ALLEY-OOP!").
4. Shoot near the defender: sometimes "BLOCKED!" and the ball pops loose. Miss a shot and let the defender rebound; press GO next to it: "STEAL!" or a shove (it falls over, ball loose).
5. `?character=dash` runs visibly faster than `?character=brick`; the overlay shows the name.
6. Console clean except the favicon 404; 60 ticks/s.

Commit: `feat(app,ui,render): training dummies, controller signature, poses and banners` with `Refs #<issue>`.

**Acceptance:** the checklist passes; dummy tests pass; the HUD shows the new banners; arms raise forward.

---

## Phase 3 acceptance checklist (final reassessment)

- [ ] `npm run check` green on `main`; CI + Pages green; the live URL shows the three-player shootaround.
- [ ] B.2 characters: four valid defs, table monotonic, `?character=` works.
- [ ] B.3 passing: catch, lead, interception, call-for-pass, alley-oop — tests + live.
- [ ] B.4 defence: context-sensitive action, block deflection, dunk rule, defender term (sweep unchanged), steal odds, shove/stun/getup — tests + live.
- [ ] B.5 buzzer-beater — test.
- [ ] B.1 dummies; shootaround possession returns to the human after violations/timeouts.
- [ ] §4.10 determinism: golden hashes pinned after each state change; RNG draw order documented (shot: make → miss type → jitter; steal: one draw).
- [ ] Each task has a closed issue and a merged PR with an Opus review; rulings listed on the epic.

## Deferred (recorded)

- AI brains (phase 4) replace the dummies through the same `Controller` type.
- Abilities and the `abilityId`s (phase 5); character colours on the models (phase 7).
- Phase 2 leftovers: thin 2 m sweep bucket; match inbound spot under the rim; HUD per-frame DOM writes; favicon; chunk split; `sourcemap: 'hidden'`.
