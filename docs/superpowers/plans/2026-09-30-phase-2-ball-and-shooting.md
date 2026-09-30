# RoarBall Phase 2 — Ball and Shooting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The deployed skeleton becomes a shootaround: the player carries a ball, shoots (jump shot, layup, dunk) with outcome-based results, the ball flies, bounces off rim and backboard and can be picked up again, baskets score with a HUD, and the full match phase machine, shot clock and rules exist and are tested headless.

**Architecture:** Everything gameplay lives in `src/sim/` as pure, deterministic code: hand-written sphere collisions (floor, backboard box, rim ring, player capsules), a ballistic arc solver that makes scripted shot outcomes land where they should, a `shotQuality` function shared later with the AI, a rules list and a phase machine. Presentation adds a ball view, a net, raised arms and a HUD in the DOM; the app holds a controller map and follows the ball with the camera. Input backends latch presses so one-tick taps are never lost, and the simulation detects button edges from `prevButtons`.

**Tech Stack:** unchanged from Phase 1 (Vite 8, TypeScript 5.9 strict, Three.js 0.186, Vitest 5 + jsdom, ESLint 10 with the `src/sim` lockdown).

**Spec:** `docs/superpowers/specs/2026-09-30-roarball-design.md` — §4.1–4.4, §4.7–4.10, §8 (button edges), §9 (camera follows the ball, HUD), §10.2 and **Appendix A (Phase 2 decisions)**. Passing, defence, AI, characters, abilities and court modifiers are later phases.

## Global Constraints

Everything from the Phase 1 plan still applies (60 Hz, `src/sim` purity enforced by ESLint + `tsconfig.sim.json` + `tests/lint/boundaries.test.ts`, determinism, court coordinates, camera on +Z, touch targets ≥ 56 px, strict TS, attribution trailers). In addition, copied from the spec:

- `BallState.radius` = **0.12 m**; ball modes `'held' | 'flight' | 'free'` (A.2).
- Loose-ball pickup below **1.6 m** (shoulder height), any player except the last shooter during a **0.5 s** (30-tick) post-release cooldown (A.3).
- Shot type at the press: **dunk** within **2 m** while moving towards the hoop, **layup** within **2.5 m**, else **jump shot**; the shooter is animation-locked and the ball leaves at a fixed tick (A.4).
- `shotQuality` uses distance, `stats.shooting` and movement speed; a press is a shot, no timing mechanic (A.4).
- Points: **3** at or beyond **6.75 m** from the rim centre at release, else **2**; dunks always score (A.4).
- Target hoop: the team's attacking hoop; in shootaround the nearer hoop (A.4).
- Arc solver: flight time derived from distance; the arc passes within **1 mm** of the target in tests (A.4).
- Defaults: `durationMs` **180 000**, `shotClockMs` **14 000**, scored pause **1.5 s** (90 ticks), sudden-death overtime on a tie; shot clock resets on possession change and on a rim hit (A.5).
- `PlayerState.prevButtons` for edge detection in the simulation; backends latch presses between samples (A.6).
- The app holds a `controllers` map; the camera follows the ball (A.6).
- Shootaround (`settings.mode`): no clock, either hoop scores, ball handed back to the human after a basket or shot-clock reset (A.1).
- The tick pipeline order of spec §4.2 is the definition; turbo drain/regen moves to step 9 (timers).

---

## Execution process

Identical to Phase 1 (`docs/superpowers/plans/2026-09-30-phase-1-skeleton.md`, "Execution process"), including the rulings recorded there: implementers on Sonnet 5.5, reviewers on Opus 5.5, one issue and one PR per task on branch `task/<N>-<slug>`, reviews posted as PR comments whose first line is `VERDICT: APPROVE` or `VERDICT: REQUEST CHANGES` (GitHub rejects approve/request-changes on the owner's own PR), merge after approval, final whole-phase Opus review, then a Fable reassessment on the epic. Milestone: **"Phase 2 – Ball and shooting"**; labels `task`, `phase-2`, `epic`.

Every task ends with `npm run format && npm run check` fully green. The build's ">500 kB chunk" warning from three.js is pre-existing and not a task failure.

---

## File structure

```
src/sim/types.ts             MODIFY  actions, buttons, shot types, ball modes, events, settings.mode, phases fields
src/sim/constants.ts         MODIFY  BALL_RADIUS
src/sim/stats.ts             MODIFY  shooting, jumpSpeed
src/sim/math.ts              MODIFY  Vec3 helpers (add/sub/scale/dot/length/distanceXZ)
src/sim/buttons.ts           NEW     buttonsOf, justPressed
src/sim/player-movement.ts   MODIFY  vertical physics, jump, action lock, turbo split (stepTurbo)
src/sim/match.ts             MODIFY  new state fields, tipoff phase, validation of ruleIds
src/sim/hoop.ts              NEW     rim/backboard geometry from CourtDef, attacking/nearest hoop
src/sim/collision.ts         NEW     sphere vs floor / box / ring / capsule, reflect
src/sim/ball.ts              NEW     hold position, held/free stepping, pickup, giveBall
src/sim/arc.ts               NEW     solveArcVelocity, arcPoint, flightTimeFor
src/sim/shooting.ts          NEW     shot types, shotQuality, miss targets, start/release/flight, basket detection
src/sim/rules.ts             NEW     Rule interface, shotClock rule, applyRules
src/sim/phases.ts            NEW     setPhase, tipoff, scored → inbound, inbound positions
src/sim/tick.ts              MODIFY  full pipeline
src/sim/index.ts             MODIFY  barrel
src/input/keyboard.ts        MODIFY  press latching
src/input/touch.ts           MODIFY  press latching
src/render/court-view.ts     MODIFY  hoops from sim/hoop geometry, net
src/render/player-view.ts    MODIFY  arms raised during jump/shots
src/render/ball-view.ts      NEW     ball mesh, dribble bob, spin
src/render/effects-view.ts   NEW     basket flash
src/ui/hud.ts, hud.css       NEW     score, clock, shot clock, banners
src/ui/debug-overlay.ts      MODIFY  phase, ball mode, shot clock
src/app.ts                   MODIFY  controllers map, ball view, HUD, effects, camera on ball, shootaround settings

tests/sim/buttons.test.ts, hoop.test.ts, collision.test.ts, ball.test.ts, arc.test.ts,
tests/sim/shooting.test.ts, rules.test.ts, phases.test.ts, determinism.test.ts   NEW
tests/sim/player-movement.test.ts, tick.test.ts, match.test.ts                   MODIFY
tests/input/keyboard.test.ts, touch.test.ts                                       MODIFY
tests/render/ball-view.test.ts, tests/ui/hud.test.ts                              NEW
tests/app/match-runner.test.ts                                                    MODIFY (settings.mode)
```

---

### Task 1: Phase 2 types, button edges, jumping, turbo in the timers step

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/constants.ts`, `src/sim/stats.ts`, `src/sim/match.ts`, `src/sim/player-movement.ts`, `src/sim/tick.ts`, `src/sim/index.ts`
- Create: `src/sim/buttons.ts`
- Modify (add `mode: 'match'` to every `MatchSettings` literal): `tests/sim/match.test.ts`, `tests/sim/player-movement.test.ts`, `tests/sim/tick.test.ts`, `tests/app/match-runner.test.ts`, `src/app.ts`
- Test: `tests/sim/buttons.test.ts`, `tests/sim/player-movement.test.ts`, `tests/sim/tick.test.ts`

**Interfaces:**
- Consumes: Phase 1 sim.
- Produces (used by every later task): the types below; `buttonsOf(intent): Buttons`; `justPressed(prev: Buttons, intent: PlayerIntent, button: keyof Buttons): boolean`; `isActionLocked(player): boolean`; `startJump(player, speed): void`; `stepPlayer(player, intent, court, dt): void` (now also vertical physics; no longer touches turbo); `stepTurbo(player): void`; `BALL_RADIUS = 0.12`; `DEFAULT_STATS.shooting = 0.75`, `DEFAULT_STATS.jumpSpeed = 4.5`.

- [ ] **Step 1: Replace `src/sim/types.ts`**

```ts
import type { Vec2, Vec3 } from './math';
import type { RngState } from './rng';

export type TeamIndex = 0 | 1;
export type PlayerId = string;
export type HoopIndex = 0 | 1;

export type PlayerAction = 'idle' | 'run' | 'jump' | 'shoot' | 'layup' | 'dunk';
export type ShotType = 'jumpshot' | 'layup' | 'dunk';
/** Actions during which input is ignored (spec §4.4: the shooter is animation-locked). */
export const SHOT_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>(['shoot', 'layup', 'dunk']);
export const ACTION_FOR_SHOT: Readonly<Record<ShotType, PlayerAction>> = {
  jumpshot: 'shoot',
  layup: 'layup',
  dunk: 'dunk',
};

/** The four buttons, reported as held. The simulation detects presses from prevButtons (spec §8). */
export interface Buttons {
  /** Context-sensitive: shoot / layup / dunk with the ball, jump (phase 2) or block / steal / shove without. */
  action: boolean;
  pass: boolean;
  special: boolean;
  turbo: boolean;
}

export const NO_BUTTONS: Readonly<Buttons> = Object.freeze({
  action: false,
  pass: false,
  special: false,
  turbo: false,
});

/**
 * One controlled player's input for one tick. Produced by input backends, AI and (later) the
 * network. `move` is a unit-or-zero vector in court space: x → court X, y → court Z.
 */
export interface PlayerIntent extends Buttons {
  move: Vec2;
}

export const NO_INTENT: Readonly<PlayerIntent> = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  action: false,
  pass: false,
  special: false,
  turbo: false,
});

/** Character stats × court modifier × ability, resolved to simulation units (metres, seconds). */
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
}

export interface ShotInProgress {
  type: ShotType;
  hoop: HoopIndex;
}

export interface PlayerState {
  id: PlayerId;
  team: TeamIndex;
  characterId: string;
  pos: Vec3;
  /** Yaw in radians; facing direction is (sin(facing), 0, cos(facing)). */
  facing: number;
  vel: Vec3;
  onGround: boolean;
  action: PlayerAction;
  /** Ticks spent in the current action. */
  actionTicks: number;
  /** Turbo stamina, 0..1. */
  turbo: number;
  /** Set by movement each tick: turbo was held while moving. */
  turboRequested: boolean;
  /** Set by movement each tick: turbo speed is being applied. */
  turboActive: boolean;
  /** Last tick's buttons, for edge detection. */
  prevButtons: Buttons;
  /** The shot being performed while action-locked. */
  shot: ShotInProgress | null;
  /** Ticks left during which this player cannot pick up their own shot. */
  shotCooldownTicks: number;
  stats: ResolvedStats;
}

export interface TeamState {
  players: PlayerState[];
}

export type MatchPhase = 'tipoff' | 'live' | 'scored' | 'inbound' | 'paused' | 'finished';

export type BallMode = 'held' | 'flight' | 'free';
export type MissType = 'frontRim' | 'backRim' | 'sideRim' | 'board';

/** A scripted ballistic path (spec A.4): the ball follows it exactly until totalTicks elapse. */
export interface ShotFlight {
  from: Vec3;
  velocity: Vec3;
  totalTicks: number;
  elapsedTicks: number;
}

export interface LastShot {
  shooter: PlayerId;
  team: TeamIndex;
  shotType: ShotType;
  points: 2 | 3;
  made: boolean;
}

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  radius: number;
  mode: BallMode;
  holder: PlayerId | null;
  flight: ShotFlight | null;
  lastShot: LastShot | null;
}

export type MatchMode = 'match' | 'shootaround';

export interface MatchSettings {
  durationMs: number;
  shotClockMs: number;
  seed: number;
  ruleIds: string[];
  courtId: string;
  mode: MatchMode;
}

export interface MatchState {
  tick: number;
  clockMs: number;
  shotClockMs: number;
  score: [number, number];
  phase: MatchPhase;
  /** Ticks spent in the current phase. */
  phaseTicks: number;
  possession: TeamIndex | null;
  /** Team that receives the ball at the next inbound. */
  pendingInbound: TeamIndex | null;
  /** Sudden death: the next basket ends the match. */
  overtime: boolean;
  ball: BallState;
  teams: [TeamState, TeamState];
  rng: RngState;
  settings: MatchSettings;
}

export type SimEvent =
  | { type: 'phaseChange'; from: MatchPhase; to: MatchPhase }
  | {
      type: 'shotReleased';
      playerId: PlayerId;
      shotType: ShotType;
      quality: number;
      made: boolean;
      points: 2 | 3;
    }
  | { type: 'basket'; playerId: PlayerId; team: TeamIndex; points: 2 | 3; shotType: ShotType }
  | { type: 'rimHit' }
  | { type: 'boardHit' }
  | { type: 'bounce'; speed: number }
  | { type: 'pickup'; playerId: PlayerId }
  | { type: 'possessionChange'; team: TeamIndex }
  | { type: 'shotClockViolation'; team: TeamIndex };

export interface HoopDef {
  /** Rim centre on the floor plane (y ignored). */
  pos: Vec3;
  rimHeight: number;
}

export interface CourtDef {
  id: string;
  name: string;
  description: string;
  playArea: { length: number; width: number };
  hoops: [HoopDef, HoopDef];
  physics: { gravity: number; friction: number; restitution: number; airDrag: number };
  lighting: {
    skyColor: number;
    sunDirection: Vec3;
    sunColor: number;
    ambient: number;
  };
}
```

- [ ] **Step 2: Constants and stats**

Append to `src/sim/constants.ts`:

```ts
/** Ball radius in metres (spec A.2). */
export const BALL_RADIUS = 0.12;
```

Replace the object in `src/sim/stats.ts`:

```ts
export const DEFAULT_STATS: Readonly<ResolvedStats> = Object.freeze({
  runSpeed: 6,
  turboSpeed: 8,
  acceleration: 30,
  deceleration: 40,
  turboDrainPerTick: 1 / 180,
  turboRegenPerTick: 1 / 360,
  shooting: 0.75,
  jumpSpeed: 4.5,
});
```

- [ ] **Step 3: Write the failing buttons test**

`tests/sim/buttons.test.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run tests/sim/buttons.test.ts` — expected FAIL (module not found).

- [ ] **Step 5: Implement `src/sim/buttons.ts`**

```ts
import type { Buttons, PlayerIntent } from './types';

export function buttonsOf(intent: PlayerIntent): Buttons {
  return {
    action: intent.action,
    pass: intent.pass,
    special: intent.special,
    turbo: intent.turbo,
  };
}

/** True on the tick a button goes from released to held (spec §8: edges are detected in the sim). */
export function justPressed(prev: Buttons, intent: PlayerIntent, button: keyof Buttons): boolean {
  return intent[button] && !prev[button];
}
```

Run: `npx vitest run tests/sim/buttons.test.ts` — expected PASS (2 tests).

- [ ] **Step 6: Update `src/sim/match.ts` for the new fields**

Replace `createMatch`'s returned object and `createPlayer`:

```ts
export function createMatch(
  settings: MatchSettings,
  court: CourtDef,
  roster: readonly RosterEntry[],
): MatchState {
  const teams: MatchState['teams'] = [{ players: [] }, { players: [] }];
  for (const entry of roster) {
    const team = teams[entry.team];
    team.players.push(createPlayer(entry, team.players.length, court));
  }
  return {
    tick: 0,
    clockMs: settings.durationMs,
    shotClockMs: settings.shotClockMs,
    score: [0, 0],
    // Task 4 switches this to 'tipoff'.
    phase: 'live',
    phaseTicks: 0,
    possession: null,
    pendingInbound: null,
    overtime: false,
    ball: {
      pos: { x: 0, y: BALL_RADIUS, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      radius: BALL_RADIUS,
      mode: 'free',
      holder: null,
      flight: null,
      lastShot: null,
    },
    teams,
    rng: createRng(settings.seed),
    settings: { ...settings, ruleIds: [...settings.ruleIds] },
  };
}

const TEAMMATE_SPACING = 3; // metres across the width

function createPlayer(entry: RosterEntry, indexInTeam: number, court: CourtDef): PlayerState {
  const side = entry.team === 0 ? -1 : 1;
  return {
    id: entry.id,
    team: entry.team,
    characterId: entry.characterId,
    pos: { x: (side * court.playArea.length) / 4, y: 0, z: (indexInTeam - 0.5) * TEAMMATE_SPACING },
    // Face the far hoop: +X for team 0, -X for team 1 (facing = atan2(dir.x, dir.z)).
    facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    vel: { x: 0, y: 0, z: 0 },
    onGround: true,
    action: 'idle',
    actionTicks: 0,
    turbo: 1,
    turboRequested: false,
    turboActive: false,
    prevButtons: { ...NO_BUTTONS },
    shot: null,
    shotCooldownTicks: 0,
    stats: { ...DEFAULT_STATS },
  };
}
```

Add the imports: `import { BALL_RADIUS } from './constants';` and `NO_BUTTONS` from `./types` (value import).

- [ ] **Step 7: Update the existing settings literals**

Add `mode: 'match',` to every `MatchSettings` object literal in `tests/sim/match.test.ts`, `tests/sim/player-movement.test.ts`, `tests/sim/tick.test.ts`, `tests/app/match-runner.test.ts` and `src/app.ts`. Run `npx tsc -p tsconfig.json` — it must be clean before continuing.

- [ ] **Step 8: Extend the player-movement tests**

In `tests/sim/player-movement.test.ts`, change the imports and `run` helper so turbo is stepped the way `tick` will:

```ts
import { isActionLocked, startJump, stepPlayer, stepTurbo } from '../../src/sim/player-movement';
```

```ts
function run(player: PlayerState, i: PlayerIntent, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    stepPlayer(player, i, court, TICK_DT);
    stepTurbo(player);
  }
}
```

Append a new describe block:

```ts
describe('jumping and action lock', () => {
  it('rises, reports jump, and lands after 2v/g seconds', () => {
    const p = makePlayer();
    startJump(p, 4.5);
    run(p, NO_INTENT, 1);
    expect(p.onGround).toBe(false);
    expect(p.action).toBe('jump');
    expect(p.pos.y).toBeGreaterThan(0);
    run(p, NO_INTENT, 27);
    expect(p.pos.y).toBeGreaterThan(0.9); // apex ≈ v²/2g = 1.03 m
    run(p, NO_INTENT, 40);
    expect(p.onGround).toBe(true);
    expect(p.pos.y).toBe(0);
    expect(p.action).toBe('idle');
  });

  it('has no air control: horizontal velocity is kept while airborne', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    const vx = p.vel.x;
    startJump(p, 4.5);
    run(p, intent({ move: { x: -1, y: 0 } }), 10);
    expect(p.vel.x).toBeCloseTo(vx);
    expect(p.onGround).toBe(false);
  });

  it('ignores movement input while action-locked', () => {
    const p = makePlayer();
    p.action = 'shoot';
    p.shot = { type: 'jumpshot', hoop: 1 };
    expect(isActionLocked(p)).toBe(true);
    run(p, intent({ move: { x: 1, y: 0 } }), 30);
    expect(p.vel.x).toBe(0);
    expect(p.action).toBe('shoot');
    expect(p.actionTicks).toBe(30);
  });

  it('does not use turbo while airborne', () => {
    const p = makePlayer();
    startJump(p, 4.5);
    run(p, intent({ move: { x: 1, y: 0 }, turbo: true }), 10);
    expect(p.turboActive).toBe(false);
    expect(p.turbo).toBe(1);
  });
});
```

Run: `npx vitest run tests/sim/player-movement.test.ts` — expected FAIL (`stepTurbo`, `startJump`, `isActionLocked` missing).

- [ ] **Step 9: Replace `src/sim/player-movement.ts`**

```ts
import { clamp, moveTowards, v2Length, v2Normalize } from './math';
import { SHOT_ACTIONS } from './types';
import type { CourtDef, PlayerAction, PlayerIntent, PlayerState } from './types';

/** Stick magnitudes below this count as no input. */
const MOVE_DEADZONE = 0.1;
/** Below this speed (m/s) the player is idle. */
const IDLE_SPEED = 0.05;

/** Shots lock the player out of input until the animation ends (spec §4.4). */
export function isActionLocked(player: PlayerState): boolean {
  return SHOT_ACTIONS.has(player.action);
}

/** Leaves the ground with the given vertical speed; gravity applies from the next step. */
export function startJump(player: PlayerState, speed: number): void {
  player.vel.y = speed;
  player.onGround = false;
}

/**
 * Advances one player by `dt` seconds according to `intent` (spec §4.2 step 4). Kinematic on the
 * ground (velocity moves towards the intended velocity), ballistic in the air (no air control),
 * clamped to the play area. Records turbo demand for stepTurbo (step 9). Mutates `player`.
 */
export function stepPlayer(
  player: PlayerState,
  intent: PlayerIntent,
  court: CourtDef,
  dt: number,
): void {
  const { stats } = player;
  const locked = isActionLocked(player);
  const moving = !locked && v2Length(intent.move) > MOVE_DEADZONE;
  const dir = moving ? v2Normalize(intent.move) : { x: 0, y: 0 };

  player.turboRequested = intent.turbo && moving;
  player.turboActive = player.turboRequested && player.turbo > 0 && player.onGround;
  const maxSpeed = player.turboActive ? stats.turboSpeed : stats.runSpeed;

  if (player.onGround) {
    const rate = (moving ? stats.acceleration : stats.deceleration) * dt;
    player.vel.x = moveTowards(player.vel.x, dir.x * maxSpeed, rate);
    player.vel.z = moveTowards(player.vel.z, dir.y * maxSpeed, rate);
  } else {
    player.vel.y -= court.physics.gravity * dt;
  }

  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;
  player.pos.z += player.vel.z * dt;

  if (!player.onGround && player.pos.y <= 0) {
    player.pos.y = 0;
    player.vel.y = 0;
    player.onGround = true;
  }

  const halfLength = court.playArea.length / 2;
  const halfWidth = court.playArea.width / 2;
  const clampedX = clamp(player.pos.x, -halfLength, halfLength);
  if (clampedX !== player.pos.x) {
    player.pos.x = clampedX;
    player.vel.x = 0;
  }
  const clampedZ = clamp(player.pos.z, -halfWidth, halfWidth);
  if (clampedZ !== player.pos.z) {
    player.pos.z = clampedZ;
    player.vel.z = 0;
  }

  if (moving) player.facing = Math.atan2(dir.x, dir.y);

  let action: PlayerAction;
  if (locked) action = player.action;
  else if (!player.onGround) action = 'jump';
  else action = Math.hypot(player.vel.x, player.vel.z) > IDLE_SPEED ? 'run' : 'idle';

  if (action === player.action) {
    player.actionTicks += 1;
  } else {
    player.action = action;
    player.actionTicks = 0;
  }
}

/**
 * Spec §4.2 step 9 / §4.7: turbo drains while active and regenerates unless the player is
 * holding turbo while moving on an empty bar.
 */
export function stepTurbo(player: PlayerState): void {
  const { stats } = player;
  if (player.turboActive) {
    player.turbo = Math.max(0, player.turbo - stats.turboDrainPerTick);
  } else if (!player.turboRequested) {
    player.turbo = Math.min(1, player.turbo + stats.turboRegenPerTick);
  }
}
```

Run: `npx vitest run tests/sim/player-movement.test.ts` — expected PASS (13 tests).

- [ ] **Step 10: Extend the tick tests**

Append to `tests/sim/tick.test.ts` (inside the existing `describe('tick')` or a new one):

```ts
describe('tick: buttons and jumping', () => {
  const press: PlayerIntent = { ...NO_INTENT, action: true };

  it('records last tick buttons in prevButtons', () => {
    const { state } = tick(fresh(), new Map([['p', press]]), court);
    expect(findPlayer(state, 'p')?.prevButtons.action).toBe(true);
    const { state: s2 } = tick(state, new Map(), court);
    expect(findPlayer(s2, 'p')?.prevButtons.action).toBe(false);
  });

  it('jumps once per press without the ball, even when the button is held', () => {
    let state = fresh();
    const jumps: number[] = [];
    for (let i = 0; i < 120; i++) {
      const before = findPlayer(state, 'p')?.onGround;
      state = tick(state, new Map([['p', press]]), court).state;
      if (before && !findPlayer(state, 'p')?.onGround) jumps.push(i);
    }
    expect(jumps).toEqual([0]);
    expect(findPlayer(state, 'p')?.onGround).toBe(true);
  });

  it('drains turbo through the timers step', () => {
    let state = fresh();
    for (let i = 0; i < 60; i++) {
      state = tick(state, new Map([['p', { ...moveRight, turbo: true }]]), court).state;
    }
    expect(findPlayer(state, 'p')?.turbo).toBeCloseTo(1 - 60 / 180, 5);
  });
});
```

Run: `npx vitest run tests/sim/tick.test.ts` — expected FAIL (prevButtons never set, jump never happens).

- [ ] **Step 11: Replace `src/sim/tick.ts`**

```ts
import { buttonsOf, justPressed } from './buttons';
import { TICK_DT, TICK_MS } from './constants';
import { allPlayers } from './match';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from './player-movement';
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
 *   5. move ball           (task 2/3)
 *   6. collisions, pickup  (task 2)
 *   7. rules               (task 4)
 *   8. scoring / phases    (task 3/4)
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
  for (const player of players) resolveAction(next, player, intentFor(player));

  // 4. move players
  for (const player of players) stepPlayer(player, intentFor(player), court, TICK_DT);

  // 9. timers
  if (next.phase === 'live') {
    next.clockMs = Math.max(0, next.clockMs - TICK_MS);
    if (next.clockMs === 0) {
      events.push({ type: 'phaseChange', from: 'live', to: 'finished' });
      next.phase = 'finished';
      next.phaseTicks = 0;
    }
  }
  for (const player of players) {
    stepTurbo(player);
    if (player.shotCooldownTicks > 0) player.shotCooldownTicks -= 1;
    player.prevButtons = buttonsOf(intentFor(player));
  }

  return { state: next, events };
}

function resolveAction(state: MatchState, player: PlayerState, intent: PlayerIntent): void {
  if (isActionLocked(player)) return;
  const hasBall = state.ball.holder === player.id;
  if (!hasBall && player.onGround && justPressed(player.prevButtons, intent, 'action')) {
    startJump(player, player.stats.jumpSpeed);
  }
}
```

Add `export * from './buttons';` to `src/sim/index.ts`.

- [ ] **Step 12: Run everything**

Run: `npx vitest run tests/sim` — expected PASS. Then `npm run format && npm run check` — green (tsc, `tsconfig.sim.json`, boundaries test included).

- [ ] **Step 13: Commit**

```bash
git add src/sim src/app.ts tests
git commit -m "feat(sim): phase 2 types, button edges, jumping, turbo in the timers step

Refs #<issue>"
```

**Acceptance criteria:** all Phase 1 tests still pass with `mode` added; `justPressed` is edge-triggered; a held button jumps once; airborne players have no air control; turbo drains only through `stepTurbo`; `PlayerState`/`BallState`/`MatchState` carry every field later tasks need.

---

### Task 2: Hoop geometry, collisions, free ball, pickup

**Files:**
- Create: `src/sim/hoop.ts`, `src/sim/collision.ts`, `src/sim/ball.ts`
- Modify: `src/sim/math.ts` (Vec3 helpers), `src/sim/tick.ts` (steps 5–6), `src/sim/index.ts`
- Test: `tests/sim/math.test.ts` (extend), `tests/sim/hoop.test.ts`, `tests/sim/collision.test.ts`, `tests/sim/ball.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `BALL_RADIUS`, `allPlayers`, `findPlayer`.
- Produces:
  - math: `v3Add`, `v3Sub`, `v3Scale`, `v3Dot`, `v3Length`, `v3DistanceXZ`
  - hoop: `RIM_RADIUS = 0.225`, `RIM_TUBE = 0.03`, `BOARD_HALF = {x:0.025,y:0.525,z:0.9}`, `BOARD_OFFSET = 0.375`, `BOARD_CENTER_ABOVE_RIM = 0.3`, `interface HoopGeometry { index; side: 1|-1; rimCenter: Vec3; boardCenter: Vec3; boardHalf: Vec3 }`, `hoopGeometry(court, index): HoopGeometry`, `attackingHoopIndex(court, team): HoopIndex`, `nearestHoopIndex(court, pos): HoopIndex`
  - collision: `interface Contact { normal: Vec3; depth: number }`, `sphereVsFloor(center, radius)`, `sphereVsBox(center, radius, boxCenter, boxHalf)`, `sphereVsRing(center, radius, ringCenter, ringRadius, tube)`, `sphereVsCapsule(center, radius, a, b, capsuleRadius): boolean`, `reflect(vel, normal, restitution, tangentialKeep?)`
  - ball: `holdPosition(holder): Vec3`, `stepHeldBall(ball, holder)`, `stepFreeBall(ball, court, events)`, `stepBall(state, court, events)`, `tryPickup(state, events)`, `giveBall(state, player, events)`

- [ ] **Step 1: Vec3 helpers (test first)**

Append to `tests/sim/math.test.ts`:

```ts
import { v3Add, v3DistanceXZ, v3Dot, v3Length, v3Scale, v3Sub } from '../../src/sim/math';

describe('vec3', () => {
  it('adds, subtracts, scales, dots and measures', () => {
    expect(v3Add({ x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 2, y: 3, z: 4 });
    expect(v3Sub({ x: 1, y: 2, z: 3 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 0, y: 1, z: 2 });
    expect(v3Scale({ x: 1, y: 2, z: 3 }, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(v3Dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32);
    expect(v3Length({ x: 2, y: 3, z: 6 })).toBe(7);
    expect(v3DistanceXZ({ x: 0, y: 5, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5);
  });
});
```

(Merge the import with the existing one.) Append to `src/sim/math.ts`:

```ts
export function v3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function v3Scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function v3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function v3Length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

/** Distance on the court plane, ignoring height. */
export function v3DistanceXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
```

Run: `npx vitest run tests/sim/math.test.ts` — PASS.

- [ ] **Step 2: Write the failing hoop test**

`tests/sim/hoop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import {
  attackingHoopIndex,
  BOARD_OFFSET,
  hoopGeometry,
  nearestHoopIndex,
} from '../../src/sim/hoop';

const court = getCourt('gym');

describe('hoop geometry', () => {
  it('puts the rim at rim height over the hoop position and the board behind it', () => {
    const right = hoopGeometry(court, 1);
    expect(right.side).toBe(1);
    expect(right.rimCenter).toEqual({ x: 12.425, y: 3.05, z: 0 });
    expect(right.boardCenter.x).toBeCloseTo(12.425 + BOARD_OFFSET);
    expect(right.boardCenter.y).toBeCloseTo(3.35);
    const left = hoopGeometry(court, 0);
    expect(left.side).toBe(-1);
    expect(left.boardCenter.x).toBeCloseTo(-12.425 - BOARD_OFFSET);
  });

  it('team 0 attacks the +X hoop and team 1 the -X hoop', () => {
    expect(court.hoops[attackingHoopIndex(court, 0)].pos.x).toBeGreaterThan(0);
    expect(court.hoops[attackingHoopIndex(court, 1)].pos.x).toBeLessThan(0);
  });

  it('finds the nearest hoop', () => {
    expect(nearestHoopIndex(court, { x: -5, y: 0, z: 0 })).toBe(0);
    expect(nearestHoopIndex(court, { x: 5, y: 0, z: 0 })).toBe(1);
  });
});
```

- [ ] **Step 3: Implement `src/sim/hoop.ts`**

```ts
import { v3DistanceXZ, type Vec3 } from './math';
import type { CourtDef, HoopIndex, TeamIndex } from './types';

export const RIM_RADIUS = 0.225;
/** Gameplay tube radius, a little fatter than the visual one so rim bounces are forgiving. */
export const RIM_TUBE = 0.03;
/** Backboard half extents: 0.05 thick, 1.05 tall, 1.8 wide. */
export const BOARD_HALF: Readonly<Vec3> = Object.freeze({ x: 0.025, y: 0.525, z: 0.9 });
/** Board face sits this far behind the rim centre (rim radius + 0.15 m). */
export const BOARD_OFFSET = RIM_RADIUS + 0.15;
export const BOARD_CENTER_ABOVE_RIM = 0.3;

export interface HoopGeometry {
  index: HoopIndex;
  /** +1 for the hoop on +X, -1 for the hoop on -X; the board is on the `side` side of the rim. */
  side: 1 | -1;
  rimCenter: Vec3;
  boardCenter: Vec3;
  boardHalf: Vec3;
}

/** Derives collision and rendering geometry from a CourtDef so both always agree (spec §7.1). */
export function hoopGeometry(court: CourtDef, index: HoopIndex): HoopGeometry {
  const hoop = court.hoops[index];
  const side: 1 | -1 = hoop.pos.x < 0 ? -1 : 1;
  return {
    index,
    side,
    rimCenter: { x: hoop.pos.x, y: hoop.rimHeight, z: hoop.pos.z },
    boardCenter: {
      x: hoop.pos.x + side * BOARD_OFFSET,
      y: hoop.rimHeight + BOARD_CENTER_ABOVE_RIM,
      z: hoop.pos.z,
    },
    boardHalf: { ...BOARD_HALF },
  };
}

/** Team 0 spawns on -X and attacks the +X hoop; team 1 the opposite. */
export function attackingHoopIndex(court: CourtDef, team: TeamIndex): HoopIndex {
  const wantedSide = team === 0 ? 1 : -1;
  return court.hoops[0].pos.x * wantedSide > 0 ? 0 : 1;
}

export function nearestHoopIndex(court: CourtDef, pos: Vec3): HoopIndex {
  const d0 = v3DistanceXZ(pos, court.hoops[0].pos);
  const d1 = v3DistanceXZ(pos, court.hoops[1].pos);
  return d0 <= d1 ? 0 : 1;
}
```

Run: `npx vitest run tests/sim/hoop.test.ts` — PASS (3 tests).

- [ ] **Step 4: Write the failing collision tests**

`tests/sim/collision.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  reflect,
  sphereVsBox,
  sphereVsCapsule,
  sphereVsFloor,
  sphereVsRing,
} from '../../src/sim/collision';

describe('collision primitives', () => {
  it('floor: contact only when the sphere dips below y = 0', () => {
    expect(sphereVsFloor({ x: 0, y: 0.5, z: 0 }, 0.12)).toBeNull();
    const c = sphereVsFloor({ x: 0, y: 0.05, z: 0 }, 0.12);
    expect(c?.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(c?.depth).toBeCloseTo(0.07);
  });

  it('box: contact from the outside pushes along the closest face', () => {
    const c = sphereVsBox({ x: 1.1, y: 0, z: 0 }, 0.2, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(c?.normal.x).toBeCloseTo(1);
    expect(c?.depth).toBeCloseTo(0.1);
    expect(sphereVsBox({ x: 1.5, y: 0, z: 0 }, 0.2, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })).toBeNull();
  });

  it('box: a centre inside the box is pushed out along the least-penetrated axis', () => {
    const c = sphereVsBox({ x: 0.9, y: 0, z: 0 }, 0.2, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(c?.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(c?.depth).toBeCloseTo(0.3);
  });

  it('ring: contact near the tube, none through the middle or far away', () => {
    const ringCenter = { x: 0, y: 3.05, z: 0 };
    expect(sphereVsRing({ x: 0, y: 3.05, z: 0 }, 0.12, ringCenter, 0.225, 0.03)).toBeNull();
    expect(sphereVsRing({ x: 1, y: 3.05, z: 0 }, 0.12, ringCenter, 0.225, 0.03)).toBeNull();
    const onTop = sphereVsRing({ x: 0.225, y: 3.05 + 0.1, z: 0 }, 0.12, ringCenter, 0.225, 0.03);
    expect(onTop?.normal.y).toBeCloseTo(1);
    expect(onTop?.depth).toBeCloseTo(0.05);
    const outside = sphereVsRing({ x: 0.3, y: 3.05, z: 0 }, 0.12, ringCenter, 0.225, 0.03);
    expect(outside?.normal.x).toBeCloseTo(1);
  });

  it('capsule: overlap test against a vertical segment', () => {
    const a = { x: 0, y: 0.35, z: 0 };
    const b = { x: 0, y: 1.55, z: 0 };
    expect(sphereVsCapsule({ x: 0.5, y: 1, z: 0 }, 0.12, a, b, 0.6)).toBe(true);
    expect(sphereVsCapsule({ x: 0.9, y: 1, z: 0 }, 0.12, a, b, 0.6)).toBe(false);
    expect(sphereVsCapsule({ x: 0, y: 2.5, z: 0 }, 0.12, a, b, 0.6)).toBe(false);
  });

  it('reflect: bounces the normal component with restitution and damps the tangent', () => {
    const v = reflect({ x: 2, y: -4, z: 0 }, { x: 0, y: 1, z: 0 }, 0.75);
    expect(v.y).toBeCloseTo(3);
    expect(v.x).toBeCloseTo(1.7);
    expect(reflect({ x: 2, y: 4, z: 0 }, { x: 0, y: 1, z: 0 }, 0.75)).toEqual({ x: 2, y: 4, z: 0 });
  });
});
```

- [ ] **Step 5: Implement `src/sim/collision.ts`**

```ts
import { clamp, v3Add, v3Dot, v3Length, v3Scale, v3Sub, type Vec3 } from './math';

export interface Contact {
  /** Unit vector pointing out of the obstacle, towards the sphere centre. */
  normal: Vec3;
  /** How far the sphere must move along `normal` to stop overlapping. */
  depth: number;
}

const EPSILON = 1e-9;

export function sphereVsFloor(center: Vec3, radius: number): Contact | null {
  const depth = radius - center.y;
  return depth > 0 ? { normal: { x: 0, y: 1, z: 0 }, depth } : null;
}

/** Axis-aligned box given by centre and half extents. */
export function sphereVsBox(
  center: Vec3,
  radius: number,
  boxCenter: Vec3,
  boxHalf: Vec3,
): Contact | null {
  const closest: Vec3 = {
    x: clamp(center.x, boxCenter.x - boxHalf.x, boxCenter.x + boxHalf.x),
    y: clamp(center.y, boxCenter.y - boxHalf.y, boxCenter.y + boxHalf.y),
    z: clamp(center.z, boxCenter.z - boxHalf.z, boxCenter.z + boxHalf.z),
  };
  const delta = v3Sub(center, closest);
  const dist = v3Length(delta);
  if (dist >= radius) return null;
  if (dist > EPSILON) return { normal: v3Scale(delta, 1 / dist), depth: radius - dist };

  // Centre inside the box: leave through the nearest face.
  const local = v3Sub(center, boxCenter);
  const penX = boxHalf.x - Math.abs(local.x);
  const penY = boxHalf.y - Math.abs(local.y);
  const penZ = boxHalf.z - Math.abs(local.z);
  const sign = (v: number): number => (v < 0 ? -1 : 1);
  if (penX <= penY && penX <= penZ) return { normal: { x: sign(local.x), y: 0, z: 0 }, depth: penX + radius };
  if (penY <= penZ) return { normal: { x: 0, y: sign(local.y), z: 0 }, depth: penY + radius };
  return { normal: { x: 0, y: 0, z: sign(local.z) }, depth: penZ + radius };
}

/** Horizontal ring (torus) of radius `ringRadius` and tube radius `tube` centred at `ringCenter`. */
export function sphereVsRing(
  center: Vec3,
  radius: number,
  ringCenter: Vec3,
  ringRadius: number,
  tube: number,
): Contact | null {
  const dx = center.x - ringCenter.x;
  const dz = center.z - ringCenter.z;
  const h = Math.hypot(dx, dz);
  const closest: Vec3 =
    h > EPSILON
      ? { x: ringCenter.x + (dx / h) * ringRadius, y: ringCenter.y, z: ringCenter.z + (dz / h) * ringRadius }
      : { x: ringCenter.x + ringRadius, y: ringCenter.y, z: ringCenter.z };
  const delta = v3Sub(center, closest);
  const dist = v3Length(delta);
  const reach = radius + tube;
  if (dist >= reach) return null;
  const normal = dist > EPSILON ? v3Scale(delta, 1 / dist) : { x: 0, y: 1, z: 0 };
  return { normal, depth: reach - dist };
}

/** True when the sphere overlaps the capsule with axis segment a→b. */
export function sphereVsCapsule(
  center: Vec3,
  radius: number,
  a: Vec3,
  b: Vec3,
  capsuleRadius: number,
): boolean {
  const ab = v3Sub(b, a);
  const lengthSq = v3Dot(ab, ab);
  const t = lengthSq > EPSILON ? clamp(v3Dot(v3Sub(center, a), ab) / lengthSq, 0, 1) : 0;
  const closest = v3Add(a, v3Scale(ab, t));
  return v3Length(v3Sub(center, closest)) < radius + capsuleRadius;
}

/**
 * Velocity after hitting a surface: the normal component is reversed and scaled by
 * `restitution`; the tangential component keeps `tangentialKeep` of its speed (surface friction).
 * A velocity already leaving the surface is returned unchanged.
 */
export function reflect(vel: Vec3, normal: Vec3, restitution: number, tangentialKeep = 0.85): Vec3 {
  const vn = v3Dot(vel, normal);
  if (vn >= 0) return { ...vel };
  const normalPart = v3Scale(normal, vn);
  const tangent = v3Sub(vel, normalPart);
  return v3Add(v3Scale(tangent, tangentialKeep), v3Scale(normal, -vn * restitution));
}
```

Run: `npx vitest run tests/sim/collision.test.ts` — PASS (6 tests).

- [ ] **Step 6: Write the failing ball tests**

`tests/sim/ball.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall, holdPosition, stepFreeBall, tryPickup } from '../../src/sim/ball';
import { BALL_RADIUS } from '../../src/sim/constants';
import { hoopGeometry, RIM_RADIUS } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { BallState, MatchSettings, SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};

function freeBall(pos: { x: number; y: number; z: number }, vel = { x: 0, y: 0, z: 0 }): BallState {
  return { pos, vel, radius: BALL_RADIUS, mode: 'free', holder: null, flight: null, lastShot: null };
}

function drop(ball: BallState, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) stepFreeBall(ball, court, events);
  return events;
}

describe('free ball', () => {
  it('falls, bounces with the court restitution and reports the impact', () => {
    const ball = freeBall({ x: 0, y: 2, z: 0 });
    const events = drop(ball, 60);
    const bounce = events.find((e) => e.type === 'bounce');
    expect(bounce && bounce.type === 'bounce' ? bounce.speed : 0).toBeGreaterThan(5);
    expect(ball.pos.y).toBeGreaterThan(BALL_RADIUS);
  });

  it('comes to rest on the floor', () => {
    const ball = freeBall({ x: 0, y: 2, z: 0 }, { x: 3, y: 0, z: 0 });
    drop(ball, 600);
    expect(ball.pos.y).toBeCloseTo(BALL_RADIUS, 3);
    expect(Math.hypot(ball.vel.x, ball.vel.z)).toBeLessThan(0.01);
    expect(ball.pos.x).toBeGreaterThan(0.5); // it rolled before stopping
  });

  it('bounces off the rim and reports it', () => {
    const rim = hoopGeometry(court, 1).rimCenter;
    const ball = freeBall({ x: rim.x + RIM_RADIUS, y: rim.y + 0.6, z: rim.z });
    // Hits the rim at about tick 17 and is still rising at tick 25 (apex near tick 29).
    const events = drop(ball, 25);
    expect(events.some((e) => e.type === 'rimHit')).toBe(true);
    expect(ball.vel.y).toBeGreaterThan(0);
  });

  it('bounces back off the backboard', () => {
    const hoop = hoopGeometry(court, 1);
    const ball = freeBall(
      { x: hoop.boardCenter.x - 0.5, y: hoop.boardCenter.y, z: hoop.boardCenter.z },
      { x: 6, y: 0, z: 0 },
    );
    const events = drop(ball, 20);
    expect(events.some((e) => e.type === 'boardHit')).toBe(true);
    expect(ball.vel.x).toBeLessThan(0);
  });

  it('stays inside the play area', () => {
    const ball = freeBall({ x: 13, y: BALL_RADIUS, z: 0 }, { x: 20, y: 0, z: 0 });
    drop(ball, 30);
    expect(ball.pos.x).toBeLessThanOrEqual(court.playArea.length / 2 - BALL_RADIUS);
  });
});

describe('holding and pickup', () => {
  it('places the held ball in front of the holder at hand height', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    p.facing = Math.PI / 2; // facing +X
    const h = holdPosition(p);
    expect(h.x).toBeGreaterThan(p.pos.x);
    expect(h.y).toBeCloseTo(0.95);
  });

  it('a nearby free ball is picked up and possession changes', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.ball.pos = { x: p.pos.x + 0.3, y: BALL_RADIUS, z: p.pos.z };
    const { state: after, events } = tick(state, new Map(), court);
    expect(after.ball.mode).toBe('held');
    expect(after.ball.holder).toBe('p');
    expect(after.possession).toBe(0);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['pickup', 'possessionChange']));
  });

  it('the last shooter cannot pick up their own shot during the cooldown', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.ball.pos = { x: p.pos.x + 0.3, y: BALL_RADIUS, z: p.pos.z };
    state.ball.lastShot = { shooter: 'p', team: 0, shotType: 'jumpshot', points: 2, made: false };
    p.shotCooldownTicks = 5;
    const events: SimEvent[] = [];
    tryPickup(state, events);
    expect(state.ball.mode).toBe('free');
    p.shotCooldownTicks = 0;
    tryPickup(state, events);
    expect(state.ball.mode).toBe('held');
  });

  it('a ball above shoulder height is not picked up', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.ball.pos = { x: p.pos.x, y: 2.5, z: p.pos.z };
    tryPickup(state, []);
    expect(state.ball.mode).toBe('free');
  });

  it('giveBall hands the ball over and follows the holder while held', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    giveBall(state, p, []);
    let s = state;
    for (let i = 0; i < 30; i++) s = tick(s, new Map([['p', { move: { x: 1, y: 0 }, action: false, pass: false, special: false, turbo: false }]]), court).state;
    const holder = findPlayer(s, 'p');
    expect(s.ball.mode).toBe('held');
    expect(s.ball.pos.x).toBeCloseTo(holder ? holdPosition(holder).x : NaN);
  });
});
```

- [ ] **Step 7: Implement `src/sim/ball.ts`**

```ts
import { reflect, sphereVsBox, sphereVsCapsule, sphereVsFloor, sphereVsRing } from './collision';
import { TICK_DT } from './constants';
import { hoopGeometry, RIM_RADIUS, RIM_TUBE } from './hoop';
import { clamp, moveTowards, type Vec3 } from './math';
import { allPlayers, findPlayer } from './match';
import type { BallState, CourtDef, MatchState, PlayerState, SimEvent } from './types';

const HAND_FORWARD = 0.35;
const HAND_HEIGHT = 0.95;
/** Below this vertical speed a floor bounce ends and the ball rolls. */
const REST_SPEED = 0.6;
/** Floor impacts above this speed emit a bounce event (audio later). */
const BOUNCE_EVENT_SPEED = 1;
/** Rolling deceleration, m/s² at friction 1. */
const ROLLING_DECEL = 3;
/** Spec A.3: pickups only below shoulder height. */
const PICKUP_MAX_HEIGHT = 1.6;
/** Reach of a player for a loose ball (capsule radius used for pickup). */
const PICKUP_RADIUS = 0.6;
const PLAYER_CAPSULE_BOTTOM = 0.35;
const PLAYER_CAPSULE_TOP = 1.55;

/** Where a held ball sits: in front of the holder at hand height (dribbling is presentation only). */
export function holdPosition(holder: PlayerState): Vec3 {
  return {
    x: holder.pos.x + Math.sin(holder.facing) * HAND_FORWARD,
    y: holder.pos.y + HAND_HEIGHT,
    z: holder.pos.z + Math.cos(holder.facing) * HAND_FORWARD,
  };
}

export function stepHeldBall(ball: BallState, holder: PlayerState): void {
  ball.pos = holdPosition(holder);
  ball.vel = { ...holder.vel };
}

/** Gravity, drag, floor/rim/backboard bounces and the invisible boundary (spec A.2). */
export function stepFreeBall(ball: BallState, court: CourtDef, events: SimEvent[]): void {
  const { gravity, restitution, friction, airDrag } = court.physics;
  ball.vel.y -= gravity * TICK_DT;
  const dragKeep = Math.max(0, 1 - airDrag * TICK_DT);
  ball.vel.x *= dragKeep;
  ball.vel.y *= dragKeep;
  ball.vel.z *= dragKeep;

  ball.pos.x += ball.vel.x * TICK_DT;
  ball.pos.y += ball.vel.y * TICK_DT;
  ball.pos.z += ball.vel.z * TICK_DT;

  const floor = sphereVsFloor(ball.pos, ball.radius);
  if (floor) {
    ball.pos.y += floor.depth;
    const impact = -ball.vel.y;
    if (impact > BOUNCE_EVENT_SPEED) events.push({ type: 'bounce', speed: impact });
    ball.vel = reflect(ball.vel, floor.normal, restitution);
    if (ball.vel.y < REST_SPEED) ball.vel.y = 0;
    const speed = Math.hypot(ball.vel.x, ball.vel.z);
    if (speed > 0) {
      const slowed = moveTowards(speed, 0, ROLLING_DECEL * friction * TICK_DT);
      ball.vel.x *= slowed / speed;
      ball.vel.z *= slowed / speed;
    }
  }

  for (const index of [0, 1] as const) {
    const hoop = hoopGeometry(court, index);
    const board = sphereVsBox(ball.pos, ball.radius, hoop.boardCenter, hoop.boardHalf);
    if (board) {
      pushOut(ball, board.normal, board.depth);
      ball.vel = reflect(ball.vel, board.normal, restitution);
      events.push({ type: 'boardHit' });
    }
    const rim = sphereVsRing(ball.pos, ball.radius, hoop.rimCenter, RIM_RADIUS, RIM_TUBE);
    if (rim) {
      pushOut(ball, rim.normal, rim.depth);
      ball.vel = reflect(ball.vel, rim.normal, restitution * 0.9);
      events.push({ type: 'rimHit' });
    }
  }

  const maxX = court.playArea.length / 2 - ball.radius;
  const maxZ = court.playArea.width / 2 - ball.radius;
  const cx = clamp(ball.pos.x, -maxX, maxX);
  if (cx !== ball.pos.x) {
    ball.pos.x = cx;
    ball.vel.x = 0;
  }
  const cz = clamp(ball.pos.z, -maxZ, maxZ);
  if (cz !== ball.pos.z) {
    ball.pos.z = cz;
    ball.vel.z = 0;
  }
}

function pushOut(ball: BallState, normal: Vec3, depth: number): void {
  ball.pos.x += normal.x * depth;
  ball.pos.y += normal.y * depth;
  ball.pos.z += normal.z * depth;
}

/** Spec §4.2 step 5 for held and free balls; flights are stepped by shooting.ts (task 3). */
export function stepBall(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const { ball } = state;
  if (ball.mode === 'held') {
    const holder = ball.holder === null ? undefined : findPlayer(state, ball.holder);
    if (holder) {
      stepHeldBall(ball, holder);
    } else {
      ball.mode = 'free';
      ball.holder = null;
    }
    return;
  }
  if (ball.mode === 'free') stepFreeBall(ball, court, events);
}

/** Spec A.3: any player touching a low free ball takes it, except the shooter during the cooldown. */
export function tryPickup(state: MatchState, events: SimEvent[]): void {
  const { ball } = state;
  if (ball.mode !== 'free' || ball.pos.y > PICKUP_MAX_HEIGHT) return;
  for (const player of allPlayers(state)) {
    if (player.shotCooldownTicks > 0 && ball.lastShot?.shooter === player.id) continue;
    const bottom = { x: player.pos.x, y: player.pos.y + PLAYER_CAPSULE_BOTTOM, z: player.pos.z };
    const top = { x: player.pos.x, y: player.pos.y + PLAYER_CAPSULE_TOP, z: player.pos.z };
    if (sphereVsCapsule(ball.pos, ball.radius, bottom, top, PICKUP_RADIUS)) {
      giveBall(state, player, events);
      return;
    }
  }
}

export function giveBall(state: MatchState, player: PlayerState, events: SimEvent[]): void {
  const { ball } = state;
  ball.mode = 'held';
  ball.holder = player.id;
  ball.flight = null;
  ball.vel = { x: 0, y: 0, z: 0 };
  ball.pos = holdPosition(player);
  events.push({ type: 'pickup', playerId: player.id });
  if (state.possession !== player.team) {
    state.possession = player.team;
    events.push({ type: 'possessionChange', team: player.team });
  }
}
```

- [ ] **Step 8: Wire steps 5–6 into `tick.ts`**

In `src/sim/tick.ts`, import `stepBall, tryPickup` from `./ball` and insert after the "4. move players" loop:

```ts
  // 5. move ball (held follows the holder; free balls fly and bounce)
  stepBall(next, court, events);

  // 6. collisions with players: loose-ball pickup
  tryPickup(next, events);
```

Add `export * from './hoop'; export * from './collision'; export * from './ball';` to `src/sim/index.ts`.

- [ ] **Step 9: Run and check**

Run: `npx vitest run tests/sim/ball.test.ts` — PASS (10 tests). Then `npm run format && npm run check` — green.

- [ ] **Step 10: Commit**

```bash
git add src/sim tests/sim
git commit -m "feat(sim): hoop geometry, sphere collisions, free-ball physics and loose-ball pickup

Refs #<issue>"
```

**Acceptance criteria:** collision primitives correct on the listed cases; a dropped ball bounces with the court's restitution and comes to rest; rim and backboard hits emit events and reverse the ball; pickup obeys height and the shooter cooldown; the held ball follows the hand.

---

### Task 3: Shooting — shot types, quality, arc, flight, basket detection

**Files:**
- Create: `src/sim/arc.ts`, `src/sim/shooting.ts`
- Modify: `src/sim/tick.ts`, `src/sim/index.ts`
- Test: `tests/sim/arc.test.ts`, `tests/sim/shooting.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - arc: `solveArcVelocity(from, to, flightTime, gravity): Vec3`, `arcPoint(from, velocity, gravity, t): Vec3`, `flightTimeFor(distance): number`
  - shooting: `SHOT_TIMING: Record<ShotType, { totalTicks; releaseTick; jumpSpeed }>`, `DUNK_RANGE = 2`, `LAYUP_RANGE = 2.5`, `THREE_POINT_DISTANCE = 6.75`, `SHOOTER_PICKUP_COOLDOWN_TICKS = 30`, `chooseShotType(player, hoop): ShotType`, `distanceFactor(d): number`, `shotQuality(shooter, shotType, hoop): number`, `pointsFor(distance): 2|3`, `pickMissType(rng): MissType`, `missTarget(hoop, shooterPos, missType, ballRadius): Vec3`, `targetHoopIndex(state, player, court): HoopIndex`, `startShot(state, player, court): void`, `releaseShot(state, player, court, events): void`, `stepShotAction(state, player, court, events): void`, `stepFlight(ball, court): void`, `detectBasket(state, court, prevBallPos): { team; points; shooter; shotType } | null`

- [ ] **Step 1: Write the failing arc test**

`tests/sim/arc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { arcPoint, flightTimeFor, solveArcVelocity } from '../../src/sim/arc';

describe('arc solver', () => {
  it('passes through the target at the flight time, within 1 mm', () => {
    const from = { x: -2, y: 2.1, z: 1 };
    const to = { x: 4.3, y: 3.1, z: -0.5 };
    const v = solveArcVelocity(from, to, 1.3, 9.81);
    const p = arcPoint(from, v, 9.81, 1.3);
    expect(Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z)).toBeLessThan(0.001);
  });

  it('rises above both endpoints on the way', () => {
    const from = { x: 0, y: 2, z: 0 };
    const to = { x: 5, y: 3.05, z: 0 };
    const v = solveArcVelocity(from, to, 1.2, 9.81);
    expect(arcPoint(from, v, 9.81, 0.6).y).toBeGreaterThan(3.05);
  });

  it('derives a bounded flight time from distance', () => {
    expect(flightTimeFor(0)).toBeCloseTo(0.9);
    expect(flightTimeFor(5)).toBeCloseTo(1.3);
    expect(flightTimeFor(50)).toBeCloseTo(2.0);
  });
});
```

- [ ] **Step 2: Implement `src/sim/arc.ts`**

```ts
import { clamp, type Vec3 } from './math';

/** Initial velocity that carries a point from `from` to `to` in `flightTime` seconds under gravity. */
export function solveArcVelocity(from: Vec3, to: Vec3, flightTime: number, gravity: number): Vec3 {
  const t = flightTime;
  return {
    x: (to.x - from.x) / t,
    y: (to.y - from.y) / t + 0.5 * gravity * t,
    z: (to.z - from.z) / t,
  };
}

/** Position on the ballistic path after `t` seconds. */
export function arcPoint(from: Vec3, velocity: Vec3, gravity: number, t: number): Vec3 {
  return {
    x: from.x + velocity.x * t,
    y: from.y + velocity.y * t - 0.5 * gravity * t * t,
    z: from.z + velocity.z * t,
  };
}

/** Spec A.4: longer shots arc higher and take longer. Seconds, from horizontal distance in metres. */
export function flightTimeFor(distance: number): number {
  return clamp(0.9 + 0.08 * distance, 0.9, 2.0);
}
```

Run: `npx vitest run tests/sim/arc.test.ts` — PASS (3 tests).

- [ ] **Step 3: Write the failing shooting tests**

`tests/sim/shooting.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { createRng } from '../../src/sim/rng';
import {
  chooseShotType,
  distanceFactor,
  pickMissType,
  pointsFor,
  shotQuality,
} from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchSettings, type MatchState, type PlayerIntent, type SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1);
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
  mode: 'match',
};
const press: PlayerIntent = { ...NO_INTENT, action: true };

/** A match with player 'p' holding the ball `distance` metres in front of hoop 1, standing still. */
function ready(distance: number, seed = 1): MatchState {
  const state = createMatch({ ...settings, seed }, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
  const p = findPlayer(state, 'p');
  if (!p) throw new Error('no player');
  p.pos = { x: hoop.rimCenter.x - distance, y: 0, z: 0 };
  p.facing = Math.PI / 2;
  giveBall(state, p, []);
  return state;
}

function runUntil(
  state: MatchState,
  intent: PlayerIntent,
  stop: (events: SimEvent[], s: MatchState) => boolean,
  maxTicks = 300,
): { state: MatchState; events: SimEvent[] } {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const r = tick(s, new Map([['p', intent]]), court);
    s = r.state;
    all.push(...r.events);
    if (stop(r.events, s)) break;
  }
  return { state: s, events: all };
}

describe('shot selection and quality', () => {
  it('chooses dunk, layup or jump shot by range and motion', () => {
    const s = ready(1.5);
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    expect(chooseShotType(p, hoop)).toBe('layup');
    p.vel = { x: 4, y: 0, z: 0 };
    expect(chooseShotType(p, hoop)).toBe('dunk');
    p.pos.x = hoop.rimCenter.x - 5;
    expect(chooseShotType(p, hoop)).toBe('jumpshot');
  });

  it('distance factor is 1 up close and falls off monotonically', () => {
    expect(distanceFactor(1)).toBe(1);
    let last = 1;
    for (let d = 1.5; d <= 12; d += 0.5) {
      const f = distanceFactor(d);
      expect(f).toBeLessThanOrEqual(last);
      last = f;
    }
    expect(distanceFactor(6.75)).toBeGreaterThan(0.45);
  });

  it('quality: dunks are certain, layups high, jump shots drop with distance and speed', () => {
    const s = ready(4);
    const p = findPlayer(s, 'p');
    if (!p) throw new Error('no player');
    expect(shotQuality(p, 'dunk', hoop)).toBe(1);
    expect(shotQuality(p, 'layup', hoop)).toBeGreaterThan(0.8);
    const standing = shotQuality(p, 'jumpshot', hoop);
    p.vel = { x: 6, y: 0, z: 0 };
    expect(shotQuality(p, 'jumpshot', hoop)).toBeLessThan(standing);
    p.vel = { x: 0, y: 0, z: 0 };
    p.pos.x = hoop.rimCenter.x - 8;
    expect(shotQuality(p, 'jumpshot', hoop)).toBeLessThan(standing);
    expect(standing).toBeGreaterThan(0.4);
    expect(standing).toBeLessThan(0.8);
  });

  it('scores 3 from the arc and 2 inside', () => {
    expect(pointsFor(6.74)).toBe(2);
    expect(pointsFor(6.75)).toBe(3);
  });

  it('picks every miss type over many rolls', () => {
    const rng = createRng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickMissType(rng));
    expect([...seen].sort()).toEqual(['backRim', 'board', 'frontRim', 'sideRim']);
  });
});

describe('shooting through the tick', () => {
  it('a press with the ball starts a locked shot and releases the ball at the release tick', () => {
    const start = ready(4);
    const r1 = tick(start, new Map([['p', press]]), court);
    const p1 = findPlayer(r1.state, 'p');
    expect(p1?.action).toBe('shoot');
    expect(p1?.onGround).toBe(false);
    expect(r1.state.ball.mode).toBe('held');
    const { state, events } = runUntil(r1.state, press, (ev) => ev.some((e) => e.type === 'shotReleased'));
    const released = events.find((e) => e.type === 'shotReleased');
    expect(released).toBeDefined();
    expect(state.ball.mode).toBe('flight');
    expect(state.ball.holder).toBeNull();
    expect(findPlayer(state, 'p')?.shotCooldownTicks).toBe(30);
  });

  it('holding the button does not shoot again after landing', () => {
    const { state, events } = runUntil(ready(4), press, () => false, 200);
    expect(events.filter((e) => e.type === 'shotReleased')).toHaveLength(1);
    expect(findPlayer(state, 'p')?.onGround).toBe(true);
  });

  it('a made shot scores the right points and emits a basket', () => {
    // Find a seed whose first roll makes the shot, then check the basket.
    for (let seed = 1; seed < 50; seed++) {
      const { state, events } = runUntil(ready(4, seed), press, (ev) => ev.some((e) => e.type === 'basket'), 400);
      const released = events.find((e) => e.type === 'shotReleased');
      if (released?.type === 'shotReleased' && released.made) {
        const basket = events.find((e) => e.type === 'basket');
        expect(basket).toMatchObject({ type: 'basket', team: 0, points: 2, playerId: 'p' });
        expect(state.score).toEqual([2, 0]);
        return;
      }
    }
    throw new Error('no seed made the shot');
  });

  it('a missed shot never emits a basket by itself and leaves the ball free', () => {
    for (let seed = 1; seed < 50; seed++) {
      const { state, events } = runUntil(ready(4, seed), press, () => false, 240);
      const released = events.find((e) => e.type === 'shotReleased');
      if (released?.type === 'shotReleased' && !released.made) {
        expect(events.some((e) => e.type === 'rimHit' || e.type === 'boardHit')).toBe(true);
        expect(state.ball.mode).toBe('free');
        expect(state.score).toEqual([0, 0]);
        return;
      }
    }
    throw new Error('no seed missed the shot');
  });

  it('a three from 7 m is worth 3', () => {
    for (let seed = 1; seed < 80; seed++) {
      const { state, events } = runUntil(ready(7, seed), press, (ev) => ev.some((e) => e.type === 'basket'), 400);
      if (events.some((e) => e.type === 'basket')) {
        expect(state.score).toEqual([3, 0]);
        return;
      }
    }
    throw new Error('no seed made the three');
  });

  it('a dunk always scores', () => {
    const start = ready(1.2);
    const p = findPlayer(start, 'p');
    if (!p) throw new Error('no player');
    p.vel = { x: 5, y: 0, z: 0 };
    const { events } = runUntil(start, press, (ev) => ev.some((e) => e.type === 'basket'), 200);
    const released = events.find((e) => e.type === 'shotReleased');
    expect(released).toMatchObject({ shotType: 'dunk', made: true });
    expect(events.some((e) => e.type === 'basket')).toBe(true);
  });

  it('make rate over 300 seeded shots matches the reported quality', () => {
    let made = 0;
    let qualitySum = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const { events } = runUntil(ready(4, seed), press, (ev) => ev.some((e) => e.type === 'shotReleased'), 60);
      const released = events.find((e) => e.type === 'shotReleased');
      if (released?.type !== 'shotReleased') throw new Error('no release');
      qualitySum += released.quality;
      if (released.made) made += 1;
    }
    expect(Math.abs(made / n - qualitySum / n)).toBeLessThan(0.08);
  });
});
```

- [ ] **Step 4: Implement `src/sim/shooting.ts`**

```ts
import { arcPoint, flightTimeFor, solveArcVelocity } from './arc';
import { TICK_DT, TICK_RATE } from './constants';
import { attackingHoopIndex, hoopGeometry, nearestHoopIndex, RIM_RADIUS, RIM_TUBE, type HoopGeometry } from './hoop';
import { clamp, lerp, v3DistanceXZ, type Vec3 } from './math';
import { startJump } from './player-movement';
import { nextFloat, type RngState } from './rng';
import { ACTION_FOR_SHOT } from './types';
import type {
  BallState,
  CourtDef,
  HoopIndex,
  MatchState,
  MissType,
  PlayerId,
  PlayerState,
  ShotType,
  SimEvent,
  TeamIndex,
} from './types';

export interface ShotTiming {
  totalTicks: number;
  releaseTick: number;
  jumpSpeed: number;
}

/** Animation lengths and the tick at which the ball leaves the hand (spec A.4). */
export const SHOT_TIMING: Readonly<Record<ShotType, ShotTiming>> = {
  jumpshot: { totalTicks: 48, releaseTick: 27, jumpSpeed: 4.5 },
  layup: { totalTicks: 36, releaseTick: 15, jumpSpeed: 2.5 },
  dunk: { totalTicks: 42, releaseTick: 24, jumpSpeed: 4.0 },
};

export const DUNK_RANGE = 2.0;
export const LAYUP_RANGE = 2.5;
export const THREE_POINT_DISTANCE = 6.75;
export const SHOOTER_PICKUP_COOLDOWN_TICKS = 30;
/** Release point relative to the shooter's feet: arms raised. */
const RELEASE_HEIGHT = 2.1;
const RELEASE_FORWARD = 0.3;
/** A made shot targets a point just above the rim plane so the basket check sees it cross. */
const MADE_TARGET_ABOVE_RIM = 0.05;
/** Dunks: the ball is slammed from above the rim straight down through it. */
const DUNK_FLIGHT_TIME = 0.1;
const DUNK_FROM_ABOVE_RIM = 0.4;
const DUNK_TARGET_BELOW_RIM = 0.1;

export interface BasketInfo {
  team: TeamIndex;
  points: 2 | 3;
  shooter: PlayerId;
  shotType: ShotType;
}

function movingTowards(player: PlayerState, target: Vec3): boolean {
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (speed < 1) return false;
  const dx = target.x - player.pos.x;
  const dz = target.z - player.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  return (player.vel.x * dx + player.vel.z * dz) / (speed * len) > 0.3;
}

export function chooseShotType(player: PlayerState, hoop: HoopGeometry): ShotType {
  const d = v3DistanceXZ(player.pos, hoop.rimCenter);
  if (d <= DUNK_RANGE && movingTowards(player, hoop.rimCenter)) return 'dunk';
  if (d <= LAYUP_RANGE) return 'layup';
  return 'jumpshot';
}

/** 1 up close, 0.5 at 7 m, 0.25 at 10 m, then a slow tail. */
export function distanceFactor(distance: number): number {
  if (distance <= 1.5) return 1;
  if (distance <= 7) return lerp(1, 0.5, (distance - 1.5) / 5.5);
  if (distance <= 10) return lerp(0.5, 0.25, (distance - 7) / 3);
  return Math.max(0.1, 0.25 - (distance - 10) * 0.05);
}

/**
 * Probability that a shot goes in (spec §4.4, A.4). Shared with the AI in phase 4. Defender
 * terms are added in phase 3.
 */
export function shotQuality(shooter: PlayerState, shotType: ShotType, hoop: HoopGeometry): number {
  if (shotType === 'dunk') return 1;
  const { shooting } = shooter.stats;
  if (shotType === 'layup') return clamp(0.7 + 0.25 * shooting, 0, 0.95);
  const distance = v3DistanceXZ(shooter.pos, hoop.rimCenter);
  const speed = Math.hypot(shooter.vel.x, shooter.vel.z);
  const motion = 1 - 0.4 * Math.min(speed / 8, 1);
  return clamp(shooting * distanceFactor(distance) * motion, 0.02, 0.97);
}

export function pointsFor(distance: number): 2 | 3 {
  return distance >= THREE_POINT_DISTANCE ? 3 : 2;
}

export function pickMissType(rng: RngState): MissType {
  const r = nextFloat(rng);
  if (r < 0.4) return 'frontRim';
  if (r < 0.7) return 'backRim';
  if (r < 0.85) return 'sideRim';
  return 'board';
}

/**
 * Where a missed shot's ball centre arrives. Rim misses aim at the outer side of the tube so the
 * bounce goes back out; the board miss hits the backboard face above the rim.
 */
export function missTarget(hoop: HoopGeometry, shooterPos: Vec3, missType: MissType, ballRadius: number): Vec3 {
  const rim = hoop.rimCenter;
  const dx = rim.x - shooterPos.x;
  const dz = rim.z - shooterPos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const outer = RIM_RADIUS + RIM_TUBE + ballRadius * 0.5;
  const y = rim.y + ballRadius * 0.6;
  switch (missType) {
    case 'frontRim':
      return { x: rim.x - ux * outer, y, z: rim.z - uz * outer };
    case 'backRim':
      // Inner side of the far tube, hit from the front.
      return { x: rim.x + ux * (RIM_RADIUS - RIM_TUBE - ballRadius * 0.5), y, z: rim.z + uz * (RIM_RADIUS - RIM_TUBE - ballRadius * 0.5) };
    case 'sideRim':
      return { x: rim.x - uz * outer, y, z: rim.z + ux * outer };
    case 'board':
      return {
        x: hoop.boardCenter.x - hoop.side * (hoop.boardHalf.x + ballRadius),
        y: rim.y + 0.35,
        z: rim.z,
      };
  }
}

/** Spec A.4: the team's attacking hoop, or the nearer one in shootaround. */
export function targetHoopIndex(state: MatchState, player: PlayerState, court: CourtDef): HoopIndex {
  return state.settings.mode === 'shootaround'
    ? nearestHoopIndex(court, player.pos)
    : attackingHoopIndex(court, player.team);
}

function releasePoint(player: PlayerState): Vec3 {
  return {
    x: player.pos.x + Math.sin(player.facing) * RELEASE_FORWARD,
    y: player.pos.y + RELEASE_HEIGHT,
    z: player.pos.z + Math.cos(player.facing) * RELEASE_FORWARD,
  };
}

/** Locks the player into a shot animation and starts its jump; the ball stays in hand until release. */
export function startShot(state: MatchState, player: PlayerState, court: CourtDef): void {
  const hoopIndex = targetHoopIndex(state, player, court);
  const hoop = hoopGeometry(court, hoopIndex);
  const type = chooseShotType(player, hoop);
  player.shot = { type, hoop: hoopIndex };
  player.action = ACTION_FOR_SHOT[type];
  player.actionTicks = 0;
  player.facing = Math.atan2(hoop.rimCenter.x - player.pos.x, hoop.rimCenter.z - player.pos.z);
  startJump(player, SHOT_TIMING[type].jumpSpeed);
}

/** Decides the outcome and launches the ball on an arc that realises it (spec §4.4). */
export function releaseShot(state: MatchState, player: PlayerState, court: CourtDef, events: SimEvent[]): void {
  const shot = player.shot;
  if (!shot) return;
  const hoop = hoopGeometry(court, shot.hoop);
  const { ball } = state;
  const quality = shotQuality(player, shot.type, hoop);
  const made = nextFloat(state.rng) < quality;
  const distance = v3DistanceXZ(player.pos, hoop.rimCenter);
  const points = pointsFor(distance);
  const rim = hoop.rimCenter;
  const isDunk = shot.type === 'dunk';
  // A dunker's hand is over the rim at release; the ball goes straight down through the ring.
  const from = isDunk ? { x: rim.x, y: rim.y + DUNK_FROM_ABOVE_RIM, z: rim.z } : releasePoint(player);
  let target: Vec3;
  if (isDunk) target = { x: rim.x, y: rim.y - DUNK_TARGET_BELOW_RIM, z: rim.z };
  else if (made) target = { x: rim.x, y: rim.y + MADE_TARGET_ABOVE_RIM, z: rim.z };
  else target = missTarget(hoop, player.pos, pickMissType(state.rng), ball.radius);
  const flightTime = isDunk ? DUNK_FLIGHT_TIME : flightTimeFor(distance);
  const totalTicks = Math.max(1, Math.round(flightTime * TICK_RATE));
  const velocity = solveArcVelocity(from, target, totalTicks * TICK_DT, court.physics.gravity);

  ball.mode = 'flight';
  ball.holder = null;
  ball.pos = { ...from };
  ball.vel = velocity;
  ball.flight = { from, velocity, totalTicks, elapsedTicks: 0 };
  ball.lastShot = { shooter: player.id, team: player.team, shotType: shot.type, points, made };
  player.shotCooldownTicks = SHOOTER_PICKUP_COOLDOWN_TICKS;
  events.push({ type: 'shotReleased', playerId: player.id, shotType: shot.type, quality, made, points });
}

/** Per-tick bookkeeping of a locked shot: release at the release tick, unlock after landing. */
export function stepShotAction(state: MatchState, player: PlayerState, court: CourtDef, events: SimEvent[]): void {
  const shot = player.shot;
  if (!shot) {
    player.action = 'idle';
    player.actionTicks = 0;
    return;
  }
  const timing = SHOT_TIMING[shot.type];
  if (player.actionTicks === timing.releaseTick && state.ball.holder === player.id) {
    releaseShot(state, player, court, events);
  }
  if (player.actionTicks >= timing.totalTicks && player.onGround) {
    player.shot = null;
    player.action = 'idle';
    player.actionTicks = 0;
  }
}

/** Moves a ball in flight along its scripted arc; hands it to free physics at the end. */
export function stepFlight(ball: BallState, court: CourtDef): void {
  const flight = ball.flight;
  if (!flight) {
    ball.mode = 'free';
    return;
  }
  flight.elapsedTicks += 1;
  const t = flight.elapsedTicks * TICK_DT;
  const g = court.physics.gravity;
  ball.pos = arcPoint(flight.from, flight.velocity, g, t);
  ball.vel = { x: flight.velocity.x, y: flight.velocity.y - g * t, z: flight.velocity.z };
  if (flight.elapsedTicks >= flight.totalTicks) {
    ball.mode = 'free';
    ball.flight = null;
  }
}

/**
 * A basket is the ball centre crossing the rim plane downwards inside the ring. Made shots are
 * scripted to do exactly that; a lucky bounce after a miss counts too.
 */
export function detectBasket(state: MatchState, court: CourtDef, prevBallPos: Vec3): BasketInfo | null {
  const { ball } = state;
  if (ball.mode === 'held' || ball.vel.y >= 0 || !ball.lastShot) return null;
  for (const index of [0, 1] as const) {
    const rim = hoopGeometry(court, index).rimCenter;
    const crossed = prevBallPos.y > rim.y && ball.pos.y <= rim.y;
    if (!crossed) continue;
    if (v3DistanceXZ(ball.pos, rim) < RIM_RADIUS - RIM_TUBE - ball.radius * 0.5) {
      const { team, points, shooter, shotType } = ball.lastShot;
      return { team, points, shooter, shotType };
    }
  }
  return null;
}
```

- [ ] **Step 5: Update `src/sim/tick.ts`**

Replace the resolve/ball sections and add scoring:

```ts
import { detectBasket, startShot, stepFlight, stepShotAction } from './shooting';
```

```ts
  // 3. resolve intents → actions
  for (const player of players) resolveAction(next, player, intentFor(player), court, events);

  // 4. move players
  for (const player of players) stepPlayer(player, intentFor(player), court, TICK_DT);

  // 5. move ball (held follows the holder; flights follow their arc; free balls fly and bounce)
  const prevBallPos = { ...next.ball.pos };
  if (next.ball.mode === 'flight') stepFlight(next.ball, court);
  else stepBall(next, court, events);

  // 6. collisions with players: loose-ball pickup
  tryPickup(next, events);

  // 8. scoring (phase transitions arrive in task 4)
  const basket = detectBasket(next, court, prevBallPos);
  if (basket) {
    next.score[basket.team] += basket.points;
    next.ball.lastShot = null;
    events.push({ type: 'basket', playerId: basket.shooter, team: basket.team, points: basket.points, shotType: basket.shotType });
  }
```

and

```ts
function resolveAction(
  state: MatchState,
  player: PlayerState,
  intent: PlayerIntent,
  court: CourtDef,
  events: SimEvent[],
): void {
  if (isActionLocked(player)) {
    stepShotAction(state, player, court, events);
    return;
  }
  const hasBall = state.ball.holder === player.id;
  if (!player.onGround || !justPressed(player.prevButtons, intent, 'action')) return;
  if (hasBall && state.phase === 'live') startShot(state, player, court);
  else if (!hasBall) startJump(player, player.stats.jumpSpeed);
}
```

Note the `lastShot = null` after a basket: it stops a second crossing from counting again and ends the shooter's pickup exemption. Add `export * from './arc'; export * from './shooting';` to the barrel.

- [ ] **Step 6: Run and check**

Run: `npx vitest run tests/sim` — PASS (the make-rate test takes a few seconds). Then `npm run format && npm run check` — green.

- [ ] **Step 7: Commit**

```bash
git add src/sim tests/sim
git commit -m "feat(sim): outcome-based shooting with arc solver, flight, miss targets and basket detection

Refs #<issue>"
```

**Acceptance criteria:** the arc solver is exact; shot types and points follow A.4; a press starts a locked shot and one release; made shots score and emit `basket`; misses hit rim or board and leave a free ball; dunks always score; the empirical make rate tracks the reported quality.

---

### Task 4: Match phases, possession, rules, shot clock, shootaround, golden determinism

**Files:**
- Create: `src/sim/phases.ts`, `src/sim/rules.ts`
- Modify: `src/sim/match.ts` (phase `tipoff`, ruleIds validation), `src/sim/tick.ts`, `src/sim/index.ts`
- Modify tests: `tests/sim/match.test.ts` (starts in `tipoff`), `tests/sim/tick.test.ts`
- Test: `tests/sim/rules.test.ts`, `tests/sim/phases.test.ts`, `tests/sim/determinism.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - rules: `interface Violation { ruleId: string; team: TeamIndex }`, `interface Rule { id: string; check(state: MatchState): Violation | null }`, `shotClockRule`, `RULES: Record<string, Rule>`, `applyRules(state): Violation[]`
  - phases: `SCORED_PAUSE_TICKS = 90`, `setPhase(state, to, events)`, `receivingTeam(state, scoringTeam): TeamIndex`, `inboundPosition(court, team): Vec3`, `shootaroundPosition(court, hoop: HoopIndex): Vec3`, `inbound(state, court, events)`, `handleTipoff(state, court, events)`, `stepPhases(state, court, events, basket: BasketInfo | null)`, `stepClocks(state, events, rimHitThisTick: boolean)`

- [ ] **Step 1: Write the failing rules test**

`tests/sim/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { createMatch, findPlayer } from '../../src/sim/match';
import { applyRules, RULES, shotClockRule } from '../../src/sim/rules';
import type { MatchSettings } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};

describe('rules', () => {
  it('shot clock: violation only when live, held and expired', () => {
    const state = createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.phase = 'live';
    giveBall(state, p, []);
    expect(shotClockRule.check(state)).toBeNull();
    state.shotClockMs = 0;
    expect(shotClockRule.check(state)).toEqual({ ruleId: 'shotClock', team: 0 });
    state.ball.mode = 'flight';
    expect(shotClockRule.check(state)).toBeNull();
  });

  it('applyRules runs only the enabled rules', () => {
    const state = createMatch({ ...settings, ruleIds: [] }, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
    const p = findPlayer(state, 'p');
    if (!p) throw new Error('no player');
    state.phase = 'live';
    giveBall(state, p, []);
    state.shotClockMs = 0;
    expect(applyRules(state)).toEqual([]);
    state.settings.ruleIds = ['shotClock'];
    expect(applyRules(state)).toHaveLength(1);
    expect(Object.keys(RULES)).toEqual(['shotClock']);
  });

  it('createMatch rejects unknown rule ids', () => {
    expect(() => createMatch({ ...settings, ruleIds: ['travelling'] }, court, [])).toThrow(/unknown rule/i);
  });
});
```

- [ ] **Step 2: Implement `src/sim/rules.ts`**

```ts
import type { MatchState, TeamIndex } from './types';

export interface Violation {
  ruleId: string;
  team: TeamIndex;
}

/** Spec §4.8: rules are independent checks that a difficulty level enables or disables. */
export interface Rule {
  id: string;
  check(state: MatchState): Violation | null;
}

/** The holder's team must shoot before the shot clock expires; a ball in the air gets its chance. */
export const shotClockRule: Rule = {
  id: 'shotClock',
  check(state) {
    if (state.phase !== 'live' || state.possession === null) return null;
    if (state.ball.mode !== 'held' || state.shotClockMs > 0) return null;
    return { ruleId: 'shotClock', team: state.possession };
  },
};

export const RULES: Readonly<Record<string, Rule>> = Object.freeze({ shotClock: shotClockRule });

export function applyRules(state: MatchState): Violation[] {
  const violations: Violation[] = [];
  for (const id of state.settings.ruleIds) {
    const violation = RULES[id]?.check(state) ?? null;
    if (violation) violations.push(violation);
  }
  return violations;
}
```

In `src/sim/match.ts`, at the top of `createMatch`:

```ts
  for (const id of settings.ruleIds) {
    if (!(id in RULES)) throw new Error(`Unknown rule: ${id}`);
  }
```

with `import { RULES } from './rules';`, and change `phase: 'live'` to `phase: 'tipoff'` (drop the "Task 4 switches" comment). In `tests/sim/match.test.ts` change `expect(state.phase).toBe('live')` to `'tipoff'`.

Run: `npx vitest run tests/sim/rules.test.ts tests/sim/match.test.ts` — PASS.

- [ ] **Step 3: Write the failing phases test**

`tests/sim/phases.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { TICK_MS } from '../../src/sim/constants';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { SCORED_PAUSE_TICKS } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchSettings, type MatchState, type PlayerIntent, type SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const base: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 2,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const press: PlayerIntent = { ...NO_INTENT, action: true };
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'placeholder' },
  { id: 'away1', team: 1 as const, characterId: 'placeholder' },
];

function run(state: MatchState, ticks: number, intents = new Map<string, PlayerIntent>()): { state: MatchState; events: SimEvent[] } {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = tick(s, intents, court);
    s = r.state;
    all.push(...r.events);
  }
  return { state: s, events: all };
}

describe('phases', () => {
  it('tip-off gives the ball to a seeded random team and goes live', () => {
    const { state, events } = run(createMatch(base, court, roster), 1);
    expect(state.phase).toBe('live');
    expect(state.ball.mode).toBe('held');
    expect(state.possession).not.toBeNull();
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'live')).toBe(true);
  });

  it('shootaround tip-off always gives the ball to team 0', () => {
    for (let seed = 1; seed < 6; seed++) {
      const { state } = run(createMatch({ ...base, mode: 'shootaround', seed }, court, roster), 1);
      expect(state.possession).toBe(0);
    }
  });

  it('a basket pauses, then inbounds to the other team at their baseline', () => {
    let s = run(createMatch(base, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    // Force possession to home 1.5 m from hoop 1 and dunk.
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    const { state, events } = run(s, 200, new Map([['home1', press]]));
    expect(events.some((e) => e.type === 'basket')).toBe(true);
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'scored')).toBe(true);
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'inbound')).toBe(true);
    expect(state.phase).toBe('live');
    expect(state.possession).toBe(1);
    expect(state.ball.holder).toBe('away1');
    expect(findPlayer(state, 'away1')?.pos.x).toBeCloseTo(court.playArea.length / 2 - 1.5);
    expect(state.shotClockMs).toBeGreaterThan(10_000); // reset at the inbound, then ran for a while
    expect(state.score[0]).toBe(2);
  });

  it('the scored pause lasts SCORED_PAUSE_TICKS', () => {
    let s = run(createMatch(base, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    let scoredAt = -1;
    let inboundAt = -1;
    for (let i = 0; i < 300 && inboundAt < 0; i++) {
      const r = tick(s, new Map([['home1', press]]), court);
      s = r.state;
      for (const e of r.events) {
        if (e.type === 'phaseChange' && e.to === 'scored') scoredAt = i;
        if (e.type === 'phaseChange' && e.to === 'inbound') inboundAt = i;
      }
    }
    expect(inboundAt - scoredAt).toBe(SCORED_PAUSE_TICKS);
  });

  it('in shootaround the scorer gets the ball back near the hoop they scored on', () => {
    let s = run(createMatch({ ...base, mode: 'shootaround' }, court, roster), 1).state;
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    const { state } = run(s, 200, new Map([['home1', press]]));
    expect(state.ball.holder).toBe('home1');
    expect(findPlayer(state, 'home1')?.pos.x).toBeCloseTo(hoopGeometry(court, 1).rimCenter.x - 6);
  });

  it('shot-clock violation hands the ball to the other team', () => {
    let s = run(createMatch({ ...base, shotClockMs: 500 }, court, roster), 1).state;
    const holder = s.ball.holder;
    const { state, events } = run(s, 40);
    expect(events.some((e) => e.type === 'shotClockViolation')).toBe(true);
    expect(state.ball.holder).not.toBe(holder);
    expect(state.phase).toBe('live');
  });

  it('the shot clock resets on a rim hit', () => {
    let s = run(createMatch(base, court, roster), 1).state;
    s.shotClockMs = 300;
    s.ball = { ...s.ball, mode: 'free', holder: null, flight: null, pos: { x: hoopGeometry(court, 1).rimCenter.x + 0.225, y: 3.6, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    const { state, events } = run(s, 30);
    expect(events.some((e) => e.type === 'rimHit')).toBe(true);
    expect(state.shotClockMs).toBeGreaterThan(300);
  });

  it('the clock only runs in match mode and finishes when it hits zero', () => {
    const shoot = run(createMatch({ ...base, mode: 'shootaround' }, court, roster), 60).state;
    expect(shoot.clockMs).toBe(base.durationMs);
    const { state, events } = run(createMatch({ ...base, durationMs: 500 }, court, roster), 60);
    expect(state.phase).toBe('finished');
    expect(events.some((e) => e.type === 'phaseChange' && e.to === 'finished')).toBe(true);
  });

  it('a tie at zero goes to sudden death and the next basket ends the match', () => {
    let s = run(createMatch({ ...base, durationMs: TICK_MS * 5 }, court, roster), 8).state;
    expect(s.phase).toBe('live');
    expect(s.overtime).toBe(true);
    const home = findPlayer(s, 'home1');
    if (!home) throw new Error('no player');
    home.pos = { x: hoopGeometry(court, 1).rimCenter.x - 1.2, y: 0, z: 0 };
    home.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, home, []);
    const { state } = run(s, 120, new Map([['home1', press]]));
    expect(state.phase).toBe('finished');
    expect(state.score[0]).toBe(2);
  });
});
```

- [ ] **Step 4: Implement `src/sim/phases.ts`**

```ts
import { giveBall } from './ball';
import { TICK_MS } from './constants';
import { hoopGeometry } from './hoop';
import type { Vec3 } from './math';
import { nextInt } from './rng';
import type { BasketInfo } from './shooting';
import type { CourtDef, HoopIndex, MatchPhase, MatchState, PlayerState, SimEvent, TeamIndex } from './types';

/** Spec A.5: 1.5 s celebration before the inbound. */
export const SCORED_PAUSE_TICKS = 90;
const INBOUND_FROM_BASELINE = 1.5;
const SHOOTAROUND_FROM_RIM = 6;

export function setPhase(state: MatchState, to: MatchPhase, events: SimEvent[]): void {
  if (state.phase === to) return;
  events.push({ type: 'phaseChange', from: state.phase, to });
  state.phase = to;
  state.phaseTicks = 0;
}

/** Match: the scored-on team. Shootaround: the scorer keeps practising. */
export function receivingTeam(state: MatchState, scoringTeam: TeamIndex): TeamIndex {
  if (state.settings.mode === 'shootaround') return scoringTeam;
  return scoringTeam === 0 ? 1 : 0;
}

export function otherTeam(team: TeamIndex): TeamIndex {
  return team === 0 ? 1 : 0;
}

/** Own baseline, centred (team 0 lives on -X). */
export function inboundPosition(court: CourtDef, team: TeamIndex): Vec3 {
  const side = team === 0 ? -1 : 1;
  return { x: side * (court.playArea.length / 2 - INBOUND_FROM_BASELINE), y: 0, z: 0 };
}

/** Top of the key of the given hoop, for shootaround resets. */
export function shootaroundPosition(court: CourtDef, hoop: HoopIndex): Vec3 {
  const g = hoopGeometry(court, hoop);
  return { x: g.rimCenter.x - g.side * SHOOTAROUND_FROM_RIM, y: 0, z: g.rimCenter.z };
}

function firstPlayer(state: MatchState, team: TeamIndex): PlayerState | undefined {
  return state.teams[team].players[0] ?? state.teams[otherTeam(team)].players[0];
}

function resetForInbound(player: PlayerState, pos: Vec3): void {
  player.pos = { ...pos };
  player.vel = { x: 0, y: 0, z: 0 };
  player.onGround = true;
  player.action = 'idle';
  player.actionTicks = 0;
  player.shot = null;
  // Face centre court along X.
  player.facing = pos.x < 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** Places the receiver and hands them the ball; the phase becomes live with a fresh shot clock. */
export function inbound(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const team = state.pendingInbound ?? 0;
  state.pendingInbound = null;
  const receiver = firstPlayer(state, team);
  if (receiver) {
    // Shootaround: back to the top of the key of the hoop the ball is under (the one just scored on).
    const pos =
      state.settings.mode === 'shootaround'
        ? shootaroundPosition(court, hoopNearest(court, state.ball.pos))
        : inboundPosition(court, receiver.team);
    resetForInbound(receiver, pos);
    giveBall(state, receiver, events);
  } else {
    state.ball.mode = 'free';
    state.ball.holder = null;
    state.ball.pos = { x: 0, y: state.ball.radius, z: 0 };
    state.ball.vel = { x: 0, y: 0, z: 0 };
  }
  state.shotClockMs = state.settings.shotClockMs;
  setPhase(state, 'live', events);
}

function hoopNearest(court: CourtDef, pos: Vec3): HoopIndex {
  const d0 = Math.hypot(pos.x - court.hoops[0].pos.x, pos.z - court.hoops[0].pos.z);
  const d1 = Math.hypot(pos.x - court.hoops[1].pos.x, pos.z - court.hoops[1].pos.z);
  return d0 <= d1 ? 0 : 1;
}

/** Spec A.5: a seeded random team gets the ball (team 0 in shootaround); live immediately. */
export function handleTipoff(state: MatchState, court: CourtDef, events: SimEvent[]): void {
  const team: TeamIndex = state.settings.mode === 'shootaround' ? 0 : (nextInt(state.rng, 2) as TeamIndex);
  const receiver = firstPlayer(state, team);
  if (receiver) giveBall(state, receiver, events);
  state.shotClockMs = state.settings.shotClockMs;
  setPhase(state, 'live', events);
}

/** Spec §4.2 step 8: scoring and phase transitions. */
export function stepPhases(state: MatchState, court: CourtDef, events: SimEvent[], basket: BasketInfo | null): void {
  switch (state.phase) {
    case 'tipoff':
      handleTipoff(state, court, events);
      return;
    case 'live':
      if (basket) {
        state.score[basket.team] += basket.points;
        events.push({ type: 'basket', playerId: basket.shooter, team: basket.team, points: basket.points, shotType: basket.shotType });
        if (state.overtime) {
          setPhase(state, 'finished', events);
          return;
        }
        state.pendingInbound = receivingTeam(state, basket.team);
        setPhase(state, 'scored', events);
      }
      return;
    case 'scored':
      if (state.phaseTicks >= SCORED_PAUSE_TICKS) setPhase(state, 'inbound', events);
      return;
    case 'inbound':
      inbound(state, court, events);
      return;
    default:
      return;
  }
}

/** Spec §4.2 step 9: match clock (match mode only) and shot clock. */
export function stepClocks(state: MatchState, events: SimEvent[], rimHitThisTick: boolean): void {
  if (state.phase !== 'live') return;
  if (rimHitThisTick) state.shotClockMs = state.settings.shotClockMs;
  else state.shotClockMs = Math.max(0, state.shotClockMs - TICK_MS);

  if (state.settings.mode !== 'match' || state.overtime) return;
  state.clockMs = Math.max(0, state.clockMs - TICK_MS);
  if (state.clockMs === 0) {
    if (state.score[0] === state.score[1]) state.overtime = true;
    else setPhase(state, 'finished', events);
  }
}
```

- [ ] **Step 5: Final `src/sim/tick.ts` for this phase**

```ts
import { stepBall, tryPickup } from './ball';
import { buttonsOf, justPressed } from './buttons';
import { TICK_DT } from './constants';
import { allPlayers } from './match';
import { receivingTeam, setPhase, stepClocks, stepPhases } from './phases';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from './player-movement';
import { applyRules } from './rules';
import { detectBasket, startShot, stepFlight, stepShotAction } from './shooting';
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
 *   5. move ball
 *   6. collisions, pickup
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

  // 6. collisions with players: loose-ball pickup
  tryPickup(next, events);

  // 7. rules
  for (const violation of applyRules(next)) {
    if (violation.ruleId === 'shotClock') {
      events.push({ type: 'shotClockViolation', team: violation.team });
      next.pendingInbound =
        next.settings.mode === 'shootaround' ? violation.team : receivingTeam(next, violation.team);
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
    stepShotAction(state, player, court, events);
    return;
  }
  const hasBall = state.ball.holder === player.id;
  if (!player.onGround || !justPressed(player.prevButtons, intent, 'action')) return;
  if (hasBall && state.phase === 'live') startShot(state, player, court);
  else if (!hasBall) startJump(player, player.stats.jumpSpeed);
}
```

The Task 3 scoring block is replaced by `stepPhases`. Update the Task 3 test `'a made shot scores…'` if needed: the score is now applied inside `stepPhases` in the same tick, so its assertions hold unchanged.

Update tests that assumed a match starts `live`:
- `tests/sim/tick.test.ts`: the first test's `createMatch` now starts in `tipoff`, which becomes `live` on the first tick; `expect(state.clockMs).toBeCloseTo(1000 - TICK_MS)` still holds because `stepClocks` runs after the phase change in the same tick. The "finishes when the clock runs out" test now needs unequal scores to finish (a tie goes to overtime): set `state.score = [2, 0]` on the fresh state before looping.
- `tests/sim/shooting.test.ts` `ready()`: after `giveBall(state, p, [])`, complete the tip-off before the press: `return tick(state, new Map(), court).state;` (a press during `tipoff` is ignored and the held button would never produce an edge).
- `tests/sim/ball.test.ts` "a nearby free ball is picked up": set `state.phase = 'live';` right after `createMatch`, so the pickup happens by proximity rather than by the tip-off hand-out. Add `export * from './rules'; export * from './phases';` to the barrel.

- [ ] **Step 6: Golden determinism test**

`tests/sim/determinism.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState, PlayerIntent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 60_000,
  shotClockMs: 14_000,
  seed: 7,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'placeholder' },
  { id: 'away1', team: 1 as const, characterId: 'placeholder' },
];

/** Scripted, varied inputs: circles at different rates, turbo bursts, a press every 90 ticks. */
function scriptedIntent(i: number, offset: number): PlayerIntent {
  const angle = (i + offset) / 40;
  return {
    move: { x: Math.cos(angle), y: Math.sin(angle * 0.7) },
    action: (i + offset) % 90 === 0,
    pass: false,
    special: false,
    turbo: Math.floor((i + offset) / 100) % 2 === 0,
  };
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function play(): MatchState {
  let state = createMatch(settings, court, roster);
  for (let i = 0; i < 1500; i++) {
    state = tick(
      state,
      new Map([
        ['home1', scriptedIntent(i, 0)],
        ['away1', scriptedIntent(i, 37)],
      ]),
      court,
    ).state;
  }
  return state;
}

describe('determinism (golden)', () => {
  it('two runs with the same seed and inputs end in the identical state', () => {
    const a = play();
    const b = play();
    expect(a).toEqual(b);
    expect(a.score[0] + a.score[1]).toBeGreaterThan(0); // the script actually shoots
  });

  it('matches the pinned hash — update it only for an intentional simulation change', () => {
    expect(fnv1a(JSON.stringify(play()))).toMatchInlineSnapshot();
  });
});
```

Run `npx vitest run tests/sim/determinism.test.ts -u` once to let Vitest write the inline snapshot value into the file, then run it again without `-u` and confirm it passes. If the first assertion's "actually shoots" check fails, the scripted press never coincides with holding the ball; change `% 90` to `% 45` for both players and regenerate the snapshot.

- [ ] **Step 7: Run and check**

Run: `npx vitest run tests/sim` — PASS. Then `npm run format && npm run check` — green.

- [ ] **Step 8: Commit**

```bash
git add src/sim tests/sim
git commit -m "feat(sim): match phases, possession, shot clock rule, shootaround flow and golden determinism test

Refs #<issue>"
```

**Acceptance criteria:** tip-off → live; basket → scored (90 ticks) → inbound at the baseline → live with a fresh shot clock; shootaround hands the ball back near the hoop; shot-clock violation changes possession; rim hit resets the shot clock; the clock runs only in match mode; sudden death works; unknown rule ids are rejected; the golden hash is pinned.

---

### Task 5: Press latching, ball view, net, raised arms, effects

**Files:**
- Modify: `src/input/keyboard.ts`, `src/input/touch.ts`, `src/render/court-view.ts`, `src/render/player-view.ts`
- Create: `src/render/ball-view.ts`, `src/render/effects-view.ts`
- Test: `tests/input/keyboard.test.ts`, `tests/input/touch.test.ts` (extend), `tests/render/ball-view.test.ts`

**Interfaces:**
- Consumes: `hoopGeometry`, `RIM_RADIUS`, `BALL_RADIUS`, `BallState`, `PlayerState`, `Vec3`, `lerpVec3`.
- Produces: `KeyboardBackend`/`TouchBackend` latch presses; `class BallView { readonly group: Group; update(prev: BallState, next: BallState, alpha: number, dtSeconds: number, dribbling: boolean, tick: number): void }`; `dribbleHeight(handY: number, t: number): number` (pure); `class EffectsView { readonly group: Group; spawnFlash(pos: Vec3, color?: number): void; update(dtSeconds: number): void }`; `PlayerView.update` now raises the arms during `jump`/`shoot`/`layup`/`dunk`.

- [ ] **Step 1: Latching tests**

Append to `tests/input/keyboard.test.ts`:

```ts
  it('latches a press that starts and ends between two samples', () => {
    backend = new KeyboardBackend(window);
    press('Space');
    release('Space');
    expect(backend.sample().action).toBe(true);
    expect(backend.sample().action).toBe(false);
  });
```

Append inside `describe('TouchBackend buttons')` in `tests/input/touch.test.ts`:

```ts
  it('latches a tap that starts and ends between two samples', () => {
    fire(button('action'), 'pointerdown', { pointerId: 7, clientX: 900, clientY: 550 });
    fire(window, 'pointerup', { pointerId: 7, clientX: 900, clientY: 550 });
    expect(backend.sample().action).toBe(true);
    expect(backend.sample().action).toBe(false);
  });
```

Run both files — expected FAIL on the new tests.

- [ ] **Step 2: Implement latching**

`src/input/keyboard.ts`: add `private readonly latched = new Set<string>();`; in `onKeyDown` after `this.down.add(e.code)` add `this.latched.add(e.code);`; change `any` to `codes.some((c) => this.down.has(c) || this.latched.has(c))`; at the end of `sample()` build the intent into a `const intent = {...}`, then `this.latched.clear(); return intent;`; clear `latched` in `dispose()` and `onBlur`.

`src/input/touch.ts`: add `private readonly latched = new Set<ButtonName>();`; in `onPointerDown`'s button branch add `this.latched.add(name);`; change `pressed(name)` to `(this.buttons.get(name)?.pointers.size ?? 0) > 0 || this.latched.has(name)`; in `sample()` build the intent, then `this.latched.clear(); return intent;`; clear it in `hide()` and `dispose()`.

Run: `npx vitest run tests/input` — PASS.

- [ ] **Step 3: Ball view (test first)**

`tests/render/ball-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dribbleHeight } from '../../src/render/ball-view';
import { BALL_RADIUS } from '../../src/sim/constants';

describe('dribbleHeight', () => {
  it('bounces between the floor and the hand', () => {
    const hand = 0.95;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 60; t++) {
      const y = dribbleHeight(hand, t);
      min = Math.min(min, y);
      max = Math.max(max, y);
      expect(y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9);
      expect(y).toBeLessThanOrEqual(hand + 1e-9);
    }
    expect(min).toBeLessThan(0.3);
    expect(max).toBeGreaterThan(0.8);
  });
});
```

`src/render/ball-view.ts`:

```ts
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three';
import { BALL_RADIUS } from '../sim/constants';
import type { BallState } from '../sim/types';
import { lerpVec3 } from './interpolate';

/** Height of a dribbled ball at animation time `t` (ticks): from the hand down to the floor and back. */
export function dribbleHeight(handY: number, t: number): number {
  const phase = Math.abs(Math.sin(t * 0.3));
  return BALL_RADIUS + (handY - BALL_RADIUS) * phase;
}

/** Orange sphere with two seams; spins with its velocity and bobs while the holder runs. */
export class BallView {
  readonly group = new Group();
  private spinX = 0;
  private spinZ = 0;

  constructor() {
    const ball = new Mesh(new SphereGeometry(BALL_RADIUS, 24, 16), new MeshStandardMaterial({ color: 0xe8772e }));
    ball.castShadow = true;
    const seamMaterial = new MeshBasicMaterial({ color: 0x3a2113 });
    const seamA = new Mesh(new TorusGeometry(BALL_RADIUS * 1.002, 0.004, 4, 32), seamMaterial);
    const seamB = new Mesh(new TorusGeometry(BALL_RADIUS * 1.002, 0.004, 4, 32), seamMaterial);
    seamB.rotation.y = Math.PI / 2;
    this.group.add(ball, seamA, seamB);
  }

  update(prev: BallState, next: BallState, alpha: number, dtSeconds: number, dribbling: boolean, tick: number): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    const y = next.mode === 'held' && dribbling ? dribbleHeight(p.y, tick + alpha) : p.y;
    this.group.position.set(p.x, y, p.z);
    // Roll with the horizontal velocity: angular speed = v / r.
    this.spinX += (next.vel.z / BALL_RADIUS) * dtSeconds;
    this.spinZ -= (next.vel.x / BALL_RADIUS) * dtSeconds;
    this.group.rotation.set(this.spinX, 0, this.spinZ);
  }
}
```

Run: `npx vitest run tests/render` — PASS.

- [ ] **Step 4: Court view uses the sim's hoop geometry and gets a net**

In `src/render/court-view.ts` replace `buildHoop` and its call so the rim and board come from `hoopGeometry`:

```ts
import { BOARD_HALF, hoopGeometry, RIM_RADIUS } from '../sim/hoop';
```

```ts
  for (const index of [0, 1] as const) group.add(buildHoop(hoopGeometry(court, index)));
```

```ts
function buildHoop(hoop: HoopGeometry): Group {
  const group = new Group();
  const { rimCenter, boardCenter, side } = hoop;

  const rim = new Mesh(new TorusGeometry(RIM_RADIUS, 0.02, 8, 24), new MeshStandardMaterial({ color: 0xff5a1f }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(rimCenter.x, rimCenter.y, rimCenter.z);

  const net = new Mesh(
    new ConeGeometry(RIM_RADIUS, 0.45, 12, 1, true),
    new MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6 }),
  );
  net.rotation.x = Math.PI; // wide end up, under the rim
  net.position.set(rimCenter.x, rimCenter.y - 0.225, rimCenter.z);

  const board = new Mesh(
    new BoxGeometry(BOARD_HALF.x * 2, BOARD_HALF.y * 2, BOARD_HALF.z * 2),
    new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
  );
  board.position.set(boardCenter.x, boardCenter.y, boardCenter.z);

  const poleX = boardCenter.x + side * 1.2;
  const poleHeight = rimCenter.y + 0.6;
  const pole = new Mesh(new BoxGeometry(0.15, poleHeight, 0.15), new MeshStandardMaterial({ color: 0x444444 }));
  pole.position.set(poleX, poleHeight / 2, rimCenter.z);

  const arm = new Mesh(new BoxGeometry(1.2, 0.1, 0.1), new MeshStandardMaterial({ color: 0x444444 }));
  arm.position.set((boardCenter.x + poleX) / 2, rimCenter.y + 0.6, rimCenter.z);

  for (const m of [rim, board, pole, arm]) m.castShadow = true;
  group.add(rim, net, board, pole, arm);
  return group;
}
```

Import `ConeGeometry` and `type HoopGeometry`; remove the now-unused local `RIM_RADIUS` constant and `HoopDef` import.

- [ ] **Step 5: Raised arms on the player view**

In `src/render/player-view.ts` add an arms group and animate it:

```ts
const RAISED_ACTIONS = new Set<PlayerState['action']>(['jump', 'shoot', 'layup', 'dunk']);
```

In the constructor, after the nose:

```ts
    this.arms = new Group();
    this.arms.position.y = 1.45;
    for (const side of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(0.12, 0.6, 0.12), new MeshStandardMaterial({ color }));
      arm.position.set(side * 0.42, -0.3, 0);
      arm.castShadow = true;
      this.arms.add(arm);
    }
    this.group.add(this.arms);
```

with a field `private readonly arms: Group;` and in `update`:

```ts
    const target = RAISED_ACTIONS.has(next.action) ? Math.PI : 0;
    this.arms.rotation.x += (target - this.arms.rotation.x) * 0.25;
```

- [ ] **Step 6: Effects view**

`src/render/effects-view.ts`:

```ts
import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { Vec3 } from '../sim/math';

const FLASH_SECONDS = 0.4;

interface Flash {
  mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  age: number;
}

/** Short-lived presentation effects driven by simulation events (spec §9). */
export class EffectsView {
  readonly group = new Group();
  private readonly flashes: Flash[] = [];

  spawnFlash(pos: Vec3, color = 0xffe066): void {
    const mesh = new Mesh(new SphereGeometry(0.3, 12, 8), new MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    mesh.position.set(pos.x, pos.y, pos.z);
    this.group.add(mesh);
    this.flashes.push({ mesh, age: 0 });
  }

  update(dtSeconds: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      if (!flash) continue;
      flash.age += dtSeconds;
      const k = flash.age / FLASH_SECONDS;
      flash.mesh.scale.setScalar(1 + k * 4);
      flash.mesh.material.opacity = Math.max(0, 1 - k);
      if (flash.age >= FLASH_SECONDS) {
        this.group.remove(flash.mesh);
        flash.mesh.geometry.dispose();
        flash.mesh.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
  }
}
```

- [ ] **Step 7: Check and commit**

Run: `npm run format && npm run check` — green.

```bash
git add src/input src/render tests/input tests/render
git commit -m "feat(input,render): press latching, ball view, net, raised arms and basket flash

Refs #<issue>"
```

**Acceptance criteria:** a tap between two samples is reported once; the ball view bobs while dribbling and spins with velocity; the hoop visuals are built from the same geometry the physics uses; arms raise during jumps and shots; flashes expire and free their resources.

---

### Task 6: HUD, controller map, camera on the ball, shootaround wiring, browser verification

**Files:**
- Create: `src/ui/hud.ts`, `src/ui/hud.css`
- Modify: `src/app.ts`, `src/ui/debug-overlay.ts`
- Test: `tests/ui/hud.test.ts` (jsdom)

**Interfaces:**
- Consumes: everything above.
- Produces: `formatClock(ms): string`, `bannerFor(event: SimEvent): string | null`, `class Hud { constructor(parent: HTMLElement); update(state: MatchState): void; handleEvents(events: SimEvent[]): void; tick(dtSeconds: number): void; dispose(): void }`; `DebugData` gains `phase: string; ballMode: string; shotClockMs: number`.

- [ ] **Step 1: HUD test (jsdom)**

`tests/ui/hud.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { createMatch } from '../../src/sim/match';
import { bannerFor, formatClock, Hud } from '../../src/ui/hud';
import type { MatchSettings } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};

describe('formatClock', () => {
  it('formats mm:ss rounding up and hides infinite clocks', () => {
    expect(formatClock(180_000)).toBe('3:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(4_300)).toBe('0:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('--:--');
  });
});

describe('bannerFor', () => {
  it('maps events to banners', () => {
    expect(bannerFor({ type: 'basket', playerId: 'p', team: 0, points: 3, shotType: 'jumpshot' })).toBe('3 POINTS!');
    expect(bannerFor({ type: 'basket', playerId: 'p', team: 0, points: 2, shotType: 'dunk' })).toBe('DUNK!');
    expect(bannerFor({ type: 'basket', playerId: 'p', team: 0, points: 2, shotType: 'layup' })).toBe('2 POINTS!');
    expect(bannerFor({ type: 'shotClockViolation', team: 1 })).toBe('SHOT CLOCK!');
    expect(bannerFor({ type: 'phaseChange', from: 'live', to: 'finished' })).toBe('FINAL');
    expect(bannerFor({ type: 'rimHit' })).toBeNull();
  });
});

describe('Hud', () => {
  let parent: HTMLDivElement;
  let hud: Hud;
  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new Hud(parent);
  });
  afterEach(() => {
    hud.dispose();
    parent.remove();
  });

  const text = (selector: string): string => parent.querySelector(selector)?.textContent ?? '';

  it('renders score, clock and shot clock', () => {
    const state = createMatch(settings, court, []);
    state.score = [7, 12];
    state.shotClockMs = 9_400;
    hud.update(state);
    expect(text('.hud-home')).toBe('7');
    expect(text('.hud-away')).toBe('12');
    expect(text('.hud-clock')).toBe('3:00');
    expect(text('.hud-shotclock')).toBe('10');
  });

  it('hides the match clock in shootaround', () => {
    hud.update(createMatch({ ...settings, mode: 'shootaround' }, court, []));
    expect(parent.querySelector<HTMLElement>('.hud-clock')?.hidden).toBe(true);
  });

  it('shows banners one after another and hides them again', () => {
    hud.handleEvents([
      { type: 'basket', playerId: 'p', team: 0, points: 2, shotType: 'layup' },
      { type: 'shotClockViolation', team: 0 },
    ]);
    hud.tick(0);
    expect(text('.hud-banner')).toBe('2 POINTS!');
    hud.tick(1.3);
    expect(text('.hud-banner')).toBe('SHOT CLOCK!');
    hud.tick(1.3);
    expect(parent.querySelector<HTMLElement>('.hud-banner')?.hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `src/ui/hud.ts` and `src/ui/hud.css`**

`src/ui/hud.ts`:

```ts
import type { MatchState, SimEvent } from '../sim/types';
import './hud.css';

const BANNER_SECONDS = 1.2;

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--';
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function bannerFor(event: SimEvent): string | null {
  switch (event.type) {
    case 'basket':
      if (event.shotType === 'dunk') return 'DUNK!';
      return event.points === 3 ? '3 POINTS!' : '2 POINTS!';
    case 'shotClockViolation':
      return 'SHOT CLOCK!';
    case 'phaseChange':
      return event.to === 'finished' ? 'FINAL' : null;
    default:
      return null;
  }
}

/** Score, clocks and event banners in the DOM (spec §9 "UI screens"). Never reads input. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly home: HTMLSpanElement;
  private readonly away: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly shotClock: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly queue: string[] = [];
  private bannerLeft = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML =
      '<div class="hud-score"><span class="hud-team hud-home">0</span>' +
      '<span class="hud-clock">0:00</span><span class="hud-team hud-away">0</span></div>' +
      '<div class="hud-shotclock">0</div><div class="hud-banner" hidden></div>';
    parent.appendChild(this.root);
    this.home = this.query('.hud-home');
    this.away = this.query('.hud-away');
    this.clock = this.query('.hud-clock');
    this.shotClock = this.query('.hud-shotclock');
    this.banner = this.query('.hud-banner');
  }

  private query<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`HUD element missing: ${selector}`);
    return el;
  }

  update(state: MatchState): void {
    this.home.textContent = String(state.score[0]);
    this.away.textContent = String(state.score[1]);
    this.clock.hidden = state.settings.mode === 'shootaround';
    this.clock.textContent = state.overtime ? 'OT' : formatClock(state.clockMs);
    this.shotClock.textContent = String(Math.ceil(state.shotClockMs / 1000));
    this.shotClock.classList.toggle('is-low', state.shotClockMs <= 5000);
  }

  handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      const text = bannerFor(event);
      if (text) this.queue.push(text);
    }
  }

  tick(dtSeconds: number): void {
    this.bannerLeft -= dtSeconds;
    if (this.bannerLeft <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.banner.textContent = next;
        this.banner.hidden = false;
        this.bannerLeft = BANNER_SECONDS;
      } else {
        this.banner.hidden = true;
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
```

`src/ui/hud.css`:

```css
.hud {
  position: absolute;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  font-family: system-ui, sans-serif;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.hud-score {
  position: absolute;
  top: max(8px, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.45);
  font-size: clamp(20px, 4vmin, 32px);
  font-weight: 700;
}

.hud-team {
  min-width: 1.6em;
  text-align: center;
}

.hud-home {
  color: #7fb2ff;
}

.hud-away {
  color: #ff8c8c;
}

.hud-clock {
  font-variant-numeric: tabular-nums;
}

.hud-clock[hidden] {
  display: none;
}

.hud-shotclock {
  position: absolute;
  top: calc(max(8px, env(safe-area-inset-top)) + 3.4em);
  left: 50%;
  transform: translateX(-50%);
  font-size: clamp(14px, 2.6vmin, 20px);
  opacity: 0.85;
}

.hud-shotclock.is-low {
  color: #ffd166;
}

.hud-banner {
  position: absolute;
  top: 32%;
  left: 50%;
  transform: translateX(-50%);
  font-size: clamp(28px, 8vmin, 72px);
  font-weight: 900;
  letter-spacing: 0.04em;
  animation: hud-pop 0.25s ease-out;
}

.hud-banner[hidden] {
  display: none;
}

@keyframes hud-pop {
  from {
    transform: translateX(-50%) scale(0.6);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}
```

Run: `npx vitest run tests/ui` — PASS (6 tests).

- [ ] **Step 3: Debug overlay fields**

In `src/ui/debug-overlay.ts` add to `DebugData`: `phase: string; ballMode: string; shotClockMs: number;` and two lines to the text: `` `phase  ${data.phase}  ball ${data.ballMode}` `` and `` `shot   ${(data.shotClockMs / 1000).toFixed(1)} s` ``.

- [ ] **Step 4: Rewrite `src/app.ts`**

```ts
import { GameLoop } from './app/game-loop';
import { MatchRunner } from './app/match-runner';
import { getCourt } from './content/courts';
import { InputManager } from './input/input-manager';
import { KeyboardBackend } from './input/keyboard';
import { TouchBackend } from './input/touch';
import { BallView } from './render/ball-view';
import { BroadcastCamera } from './render/camera';
import { buildCourtView } from './render/court-view';
import { EffectsView } from './render/effects-view';
import { lerpVec3 } from './render/interpolate';
import { PlayerView } from './render/player-view';
import { GameScene } from './render/scene';
import { createMatch, findPlayer } from './sim/match';
import type { PlayerId, PlayerIntent } from './sim/types';
import { DebugOverlay } from './ui/debug-overlay';
import { Hud } from './ui/hud';

export interface GameOptions {
  debug: boolean;
}

const HUMAN_ID: PlayerId = 'home1';
const TEAM_COLORS = [0x2f80ed, 0xeb5757] as const;

/** Phase 2 entry point: shootaround with one human on the gym court (spec A.1). */
export function startGame(root: HTMLElement, options: GameOptions): { stop(): void } {
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);

  const court = getCourt('gym');
  const scene = new GameScene(canvas);
  scene.setBackground(court.lighting.skyColor);
  scene.scene.add(buildCourtView(court));

  const runner = new MatchRunner(
    court,
    createMatch(
      {
        durationMs: 180_000,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: ['shotClock'],
        courtId: court.id,
        mode: 'shootaround',
      },
      court,
      [{ id: HUMAN_ID, team: 0, characterId: 'placeholder' }],
    ),
  );

  const playerViews = new Map<PlayerId, PlayerView>();
  for (const team of runner.current.teams) {
    for (const player of team.players) {
      const view = new PlayerView(TEAM_COLORS[player.team]);
      scene.scene.add(view.group);
      playerViews.set(player.id, view);
    }
  }
  const ballView = new BallView();
  scene.scene.add(ballView.group);
  const effects = new EffectsView();
  scene.scene.add(effects.group);

  const touch = new TouchBackend(root);
  const input = new InputManager([new KeyboardBackend(window), touch]);
  input.onActiveKindChange = (kind) => (kind === 'touch' ? touch.show() : touch.hide());
  const onFirstTouch = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') touch.show();
  };
  root.addEventListener('pointerdown', onFirstTouch);

  const broadcastCamera = new BroadcastCamera(scene.camera);
  input.cameraYaw = broadcastCamera.yaw;

  const hud = new Hud(root);

  const resize = (): void => {
    scene.resize(root.clientWidth, root.clientHeight, window.devicePixelRatio);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(root);

  const overlay = options.debug ? new DebugOverlay(root) : null;
  let lastTickNumber = runner.current.tick;
  let frameCount = 0;
  let statsWindowStart = performance.now();
  let fps = 0;
  let ticksPerSecond = 0;

  // One controller per player; AI controllers join in phase 4 (spec A.6).
  const controllers = new Map<PlayerId, () => PlayerIntent>([[HUMAN_ID, () => input.sample()]]);
  const intents = new Map<PlayerId, PlayerIntent>();

  const loop = new GameLoop(
    () => {
      for (const [id, controller] of controllers) intents.set(id, controller());
      const events = runner.step(intents);
      hud.handleEvents(events);
      for (const event of events) {
        if (event.type === 'basket') effects.spawnFlash(runner.current.ball.pos);
      }
    },
    (alpha, frameMs) => {
      const dt = frameMs / 1000;
      const prev = runner.previous;
      const next = runner.current;
      for (const [id, view] of playerViews) {
        const a = findPlayer(prev, id);
        const b = findPlayer(next, id);
        if (a && b) view.update(a, b, alpha);
      }
      const holder = next.ball.holder === null ? undefined : findPlayer(next, next.ball.holder);
      ballView.update(prev.ball, next.ball, alpha, dt, holder?.action === 'run', next.tick);
      broadcastCamera.update(lerpVec3(prev.ball.pos, next.ball.pos, alpha), dt);
      effects.update(dt);
      hud.update(next);
      hud.tick(dt);
      scene.render();

      frameCount += 1;
      const now = performance.now();
      if (now - statsWindowStart >= 1000) {
        fps = (frameCount * 1000) / (now - statsWindowStart);
        ticksPerSecond = ((next.tick - lastTickNumber) * 1000) / (now - statsWindowStart);
        lastTickNumber = next.tick;
        frameCount = 0;
        statsWindowStart = now;
      }
      const human = findPlayer(next, HUMAN_ID);
      if (overlay && human) {
        overlay.update({
          fps,
          ticksPerSecond,
          tick: next.tick,
          pos: human.pos,
          speed: Math.hypot(human.vel.x, human.vel.z),
          turbo: human.turbo,
          inputKind: input.activeKind ?? '-',
          phase: next.phase,
          ballMode: next.ball.mode,
          shotClockMs: next.shotClockMs,
        });
      }
    },
  );
  loop.start();

  return {
    stop(): void {
      loop.stop();
      observer.disconnect();
      root.removeEventListener('pointerdown', onFirstTouch);
      input.dispose();
      hud.dispose();
      overlay?.dispose();
      scene.dispose();
      canvas.remove();
    },
  };
}
```

- [ ] **Step 5: Check, then verify in the browser**

Run: `npm run format && npm run check` — green.
Run `npm run dev` and open `http://localhost:5173/?debug`. Verify with Chrome DevTools at 1366×768 and at 1024×768 with touch emulation, saving screenshots under `.superpowers/sdd/2026-09-30-phase-2-ball-and-shooting/task-6-shots/`:

1. The match starts in shootaround: the player holds the ball (it bobs while running), HUD shows `0 — 0`, no match clock, shot clock counting down from 14.
2. Press Space far from the hoop: the player jumps with arms up, the ball arcs towards the nearer hoop; a make shows the flash and a "2 POINTS!" (or "3 POINTS!" from beyond 6.75 m) banner and the player is reset near the hoop with the ball; a miss bounces off the rim or board and can be picked up by running into it.
3. Run at the hoop and press Space within 2 m: a dunk, "DUNK!" banner.
4. Let the shot clock expire while holding: "SHOT CLOCK!" and the ball is handed back.
5. Overlay shows `phase live`, `ball held/flight/free` changing, and the shot clock.
6. Touch: joystick + GO button shoots; buttons are still ≥ 56 px; HUD is above the touch overlay and never blocks touches.
7. Console clean except the known favicon 404.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/ui tests/ui
git commit -m "feat(app,ui): HUD, controller map, camera on the ball and shootaround wiring

Refs #<issue>"
```

**Acceptance criteria:** the checklist above passes; `formatClock`/`bannerFor`/`Hud` tests pass; the HUD never intercepts pointer events; the camera follows the ball.

---

## Phase 2 acceptance checklist (final reassessment)

- [ ] `npm run check` green on `main`; CI and Pages deploy green; the live URL plays a shootaround.
- [ ] Spec A.1: shootaround flow (no clock, either hoop, ball handed back) — verified live.
- [ ] Spec A.2–A.3: ball modes, collisions and pickup with the shooter cooldown — tests + live rebounds.
- [ ] Spec A.4: shot types by range/motion, positional quality, 2/3 points at 6.75 m, dunks always score, arc within 1 mm — tests.
- [ ] Spec A.5: defaults 180 s / 14 s / 90 ticks; sudden death; shot clock resets on possession change and rim hit — tests.
- [ ] Spec A.6: `prevButtons` edges in sim, latching in backends, controller map, camera follows the ball.
- [ ] Spec §4.2: pipeline order in `tick.ts` matches the comment; turbo in step 9.
- [ ] Spec §4.10: golden determinism hash pinned; no wall clock or Math.random in `src/sim` (boundary test still green).
- [ ] Spec §9: HUD in the DOM above the touch overlay, pointer-events none, safe-area top.
- [ ] Each task has a closed issue and a merged PR with an Opus review; rulings listed on the epic.

## Deferred (recorded)

- Passing, alley-oops, block/steal/shove (phase 3). Player switching: not planned.
- Real dribble animation, net physics, sounds (phases 6–7).
- Lucky-bounce baskets after a miss count for the last shooter's team; revisit if it feels wrong.
- The rim/backboard visual tube (0.02) is thinner than the gameplay tube (0.03); harmless.
- Favicon and three.js chunk split (from Phase 1) remain open.
