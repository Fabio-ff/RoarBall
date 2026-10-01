# RoarBall Phase 4 — AI and Match Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening the page starts a real 2v2 match — the human and an AI teammate against two AI opponents, with a clock, inbounds, a final banner and a restart — driven by a deterministic, testable AI brain, plus the balance harness the spec calls for.

**Architecture:** The brain lives in `src/sim/ai/` and is a pure function `decide(state, memory, profile, court) → PlayerIntent` over an explicit, serialisable `AiMemory` that carries its own seeded RNG (the simulation's `state.rng` is never touched, so replay from seed + intents still holds). It plans every 6 ticks (one goal per player) and steers every tick, reusing the simulation's own judgement (`shotQuality`, `chooseShotType`, `passLaneOpen`, `chooseDefensiveAction`) through two new pure helpers, `evaluateShot` and `resolveDefensivePress`. The app wraps the brain as a `Controller` (same signature as the Phase 3 dummies), reads mode/roster/profile/seed from the URL, places everyone at an inbound formation in match mode, shows a sticky final banner and rebuilds the match on a button press. Vitest holds unit tests per branch, a 2v2 AI golden, a no-soft-lock seed sweep, and an on-demand balance report.

**Tech Stack:** unchanged (Vite 8, TypeScript 5.9 strict, Three.js 0.186, Vitest 5 + jsdom, ESLint 10 with the `src/sim` lockdown). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-roarball-design.md` — §6 (AI), §4.3 (phases), §9 (camera/HUD), §10.2 (testing) and **Appendix C (Phase 4 decisions)**. Abilities and court modifiers (phase 5), menus/gamepad/audio (phase 6) are later.

## Global Constraints

Everything from the Phase 1–3 plans still applies (60 Hz, `src/sim` purity enforced by ESLint + `tsconfig.sim.json` + `tests/lint/boundaries.test.ts`, seeded RNG only with a documented draw order, court coordinates with team 0 on −X attacking +X, camera on +Z, touch ≥ 56 px, strict TS, attribution trailers, `npm run format && npm run check` green per commit). In addition, from Appendix C:

- Match by default: `?mode=match|shootaround` (default `match`), `?character=` (default `rook`), `?teammate=` (default `ace`), `?opponents=<id>,<id>` (default `brick,dash`), `?ai=easy|fair|hard` (default `fair`), `?seed=<n>` (default: current time in a match, `1` in shootaround). Shootaround keeps the Phase 3 dummies unchanged (C.1).
- Brain: `decide(state, memory, profile, court) → PlayerIntent`; memory is a plain object with its own RNG seeded from `hash(settings.seed, playerId)`; `state.rng` is never read or advanced; re-plan every **6 ticks** with a per-player offset; button presses are one tick `true` then a forced `false`; memory resets on the `phaseChange` to `inbound` or `tipoff` (C.2).
- Profiles (C.3): `reactionTicks` 24/15/8, `shootThreshold` 0.65/0.55/0.45, `passBias` 0.15/0.10/0.00, `perceptionNoise` 0.15/0.08/0.03, `stealRate` 0.2/0.4/0.6, `shoveRate` 0.1/0.3/0.5, `turboThreshold` 0.6/0.4/0.2 (easy/fair/hard). The teammate brain uses `passBias − 0.15` towards the human.
- Branch order with the ball (C.5): shot-clock panic (< 3 s: shoot if perceived quality > 0.15, else pass if lane open, else shoot) → alley-oop → honour `callingForPassTicks` → shoot (perceived ≥ threshold; dunk/layup at once when no opponent airborne within 1.5 m) → pass (teammate ≥ mine + passBias, lane open) → drive (lane closed when an opponent is within 1.2 m of me→rim and nearer the rim; side-step 2 m perpendicular, away from the blocker) → reset after 3 closed decisions with shot clock > 6 s.
- Off ball (C.5): spots corners/wings/top/under-basket scored by nearest-opponent distance − lane penalty (2.5 m of handler→rim) − handler penalty (3 m); hysteresis 1.5; alley-oop invite at under-basket with handler within 6 m and no opponent within 1.5 m, at most once per 90 ticks; chase a loose ball when closest on my team or within 3 m.
- Defence (C.5): deterministic `assignMarks` (sorted ids, minimum total distance over permutations ≤ 3, greedy beyond), recomputed on possession change only; mark position on mark→our hoop at `clamp(0.4·d, 0.8, 2.5)` (0.8 when the mark holds the ball); press only when `resolveDefensivePress` returns the intended move; block after `reactionTicks`; steal/shove by profile rate; never press on `jump` or `null`.
- Match flow (C.6): inbound formation places all players in match mode (receiver at own baseline with the ball, teammate at own-half wing, defenders at the top of the key of the hoop they defend); tip-off the same; sticky final banner `FINAL h–a · YOU WIN!/YOU LOSE`, `OVERTIME!` on sudden death; ACTION/PASS/SPECIAL press while finished rebuilds the match with `seed + 1`.
- Tests (C.7): unit per helper/branch; 2v2 AI golden (fair, real cast, full match, pinned hash); no-soft-lock sweep over 20 seeds; replay determinism from AI-produced intents; `npm run balance` on demand with a report in `docs/balance/`.
- Cheap leftovers folded in: favicon, `sourcemap: 'hidden'`, HUD DOM writes only on change.

---

## Execution process

As Phases 1–3: Sonnet 5.5 implements on `task/<N>-<slug>`, Opus 5.5 reviews on the PR (comment review, first line `VERDICT: …`), merge after approval, final whole-phase Opus review, hardening wave if needed, Fable reassessment on the epic. Milestone **"Phase 4 – AI and match mode"**, labels `task`, `phase-4`, `epic`. Feel-tuning (profile constants after the tablet playtest) may be dispatched on Opus at the controller's discretion.

Golden hashes in `tests/sim/determinism.test.ts` change whenever the state shape, the RNG draws or the inbound placement change: Task 4 (formation) re-pins them (`-u` once, verify without) and reports old → new. The AI golden added in Task 5 follows the same rule.

Each task's implementer runs `npm run format && npm run check` before every commit and `npm test -- <file>` while iterating.

---

## File structure

```
src/sim/math.ts                 MODIFY  distanceToSegmentXZ
src/sim/shooting.ts             MODIFY  evaluateShot (C.4)
src/sim/defence.ts              MODIFY  resolveDefensivePress (C.4)
src/sim/ai/profile.ts           NEW     AiProfile, AI_PROFILES, isAiProfileId
src/sim/ai/memory.ts            NEW     AiGoal, AiMemory, hashSeed, createAiMemory, resetAiMemory
src/sim/ai/spots.ts             NEW     named spots, scoreSpot, pickOpenSpot, farthestSpot
src/sim/ai/steering.ts          NEW     steerTowards, wantsTurbo
src/sim/ai/offense.ts           NEW     planWithBall, laneBlocker, sideStepPoint, perceive
src/sim/ai/offball.ts           NEW     planOffBall, planLooseBall, planBallInFlight, wantsAlleyOopInvite
src/sim/ai/defense.ts           NEW     assignMarks, markPosition, planDefence, decidePress
src/sim/ai/brain.ts             NEW     DECISION_INTERVAL_TICKS, decide
src/sim/ai/index.ts             NEW     barrel
src/sim/index.ts                MODIFY  export * from './ai'
src/sim/phases.ts               MODIFY  formation placement at inbound and tip-off (match mode)
src/app/controller.ts           NEW     Controller type (moved from dummies.ts)
src/app/dummies.ts              MODIFY  import Controller from ./controller
src/app/ai-controller.ts        NEW     createAiController
src/app/url-options.ts          NEW     readGameOptions (pure URL parsing)
src/app.ts                      MODIFY  mode/roster/profile/seed, restart on finish, overlay AI lines
src/ui/hud.ts                   MODIFY  sticky final banner, OVERTIME!, writes only on change
src/ui/hud.css                  MODIFY  .hud-banner.is-final
src/ui/debug-overlay.ts         MODIFY  ai lines
public/favicon.svg              NEW     orange ball
index.html                      MODIFY  favicon link
vite.config.ts                  MODIFY  sourcemap: 'hidden'
vitest.balance.config.ts        NEW     include tests/balance/**/*.balance.ts
package.json                    MODIFY  "balance" script
README.md                       MODIFY  URL parameters, balance script
tests/sim/ai-helpers.test.ts    NEW     evaluateShot, resolveDefensivePress, distanceToSegmentXZ
tests/sim/ai-foundation.test.ts NEW     profile, memory, spots, steering
tests/sim/ai-offense.test.ts    NEW     planWithBall, offball, loose ball
tests/sim/ai-defense.test.ts    NEW     assignMarks, markPosition, decidePress, decide (brain)
tests/sim/formation.test.ts     NEW     formation tests
tests/sim/determinism.test.ts   MODIFY  re-pinned hashes
tests/sim/ai-match.ts           NEW     shared AI-vs-AI match runner (helper, not a test)
tests/sim/ai-golden.test.ts     NEW     2v2 AI golden + replay from recorded intents
tests/sim/ai-sweep.test.ts      NEW     no-soft-lock seed sweep
tests/app/url-options.test.ts   NEW     URL parsing
tests/app/ai-controller.test.ts NEW     wrapper + overlay data
tests/ui/hud.test.ts            MODIFY  final banner, overtime, write-on-change
tests/balance/ai.balance.ts     NEW     balance report (npm run balance)
docs/balance/<date>.md          NEW     first report (committed by Task 5)
```

Shared test helper used by several new test files (copy it into each file that needs it; tests do not share modules in this repo):

```ts
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch, findPlayer } from '../../src/sim/match';
import type { MatchSettings, MatchState, PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const matchSettings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

/** A live 2v2 match state with everyone standing still at the given spots. */
function live(seed = 1): MatchState {
  const s = createMatch({ ...matchSettings, seed }, court, roster);
  s.phase = 'live';
  s.possession = 0;
  return s;
}

function player(state: MatchState, id: string): PlayerState {
  const p = findPlayer(state, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(state: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(state, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}
```

Court facts used in tests: gym `playArea` 28 × 15; hoop 0 rim at `x = −12.425`, hoop 1 rim at `x = +12.425`, rim height 3.05; team 0 attacks hoop 1 (`attackingHoopIndex(court, 0) === 1`), team 1 attacks hoop 0.

---

### Task 1: Shared helpers and the AI foundation (profile, memory, spots, steering)

**Files:**
- Modify: `src/sim/math.ts` (append)
- Modify: `src/sim/shooting.ts` (append after `defenderFactor`)
- Modify: `src/sim/defence.ts` (append)
- Create: `src/sim/ai/profile.ts`, `src/sim/ai/memory.ts`, `src/sim/ai/spots.ts`, `src/sim/ai/steering.ts`, `src/sim/ai/index.ts`
- Modify: `src/sim/index.ts`
- Test: `tests/sim/ai-helpers.test.ts`, `tests/sim/ai-foundation.test.ts`

**Interfaces:**
- Consumes: `shotQuality`, `chooseShotType`, `targetHoopIndex` (shooting.ts); `chooseDefensiveAction`, `DefensiveChoice` (defence.ts); `isActionLocked` (player-movement.ts); `createRng`, `RngState` (rng.ts); `HoopGeometry` (hoop.ts).
- Produces (used by Tasks 2–5):
  - `distanceToSegmentXZ(p: Vec3, a: Vec3, b: Vec3): number`
  - `evaluateShot(state, player, court): ShotEvaluation` with `{ type: ShotType; hoop: HoopIndex; distance: number; quality: number }`
  - `resolveDefensivePress(state, player, court): DefensiveChoice | null`
  - `AiProfileId`, `AiProfile`, `AI_PROFILES`, `isAiProfileId(s): s is AiProfileId`
  - `AiGoal`, `AiMemory`, `hashSeed(seed, playerId)`, `createAiMemory(playerId, seed, offset, favourTeammate)`, `resetAiMemory(memory, tick)`
  - `SpotName`, `SPOT_NAMES`, `namedSpot(hoop, name)`, `scoreSpot(spot, handlerPos, rim, opponents)`, `pickOpenSpot(hoop, handlerPos, opponents, current)`, `farthestSpot(hoop, opponents)`, `SPOT_LANE_PENALTY_RADIUS = 2.5`, `SPOT_HANDLER_PENALTY_RADIUS = 3`, `SPOT_HYSTERESIS = 1.5`
  - `steerTowards(from, to, arriveRadius?): Vec2`, `wantsTurbo(player, distance, profile): boolean`, `TURBO_RECOVER_DISTANCE = 4`

- [ ] **Step 1: Write the failing helper tests**

`tests/sim/ai-helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { giveBall } from '../../src/sim/ball';
import { resolveDefensivePress } from '../../src/sim/defence';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { distanceToSegmentXZ } from '../../src/sim/math';
import { evaluateShot, resolveShotOutcome, startShot } from '../../src/sim/shooting';
import type { MatchSettings, MatchState, PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const matchSettings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function live(seed = 1): MatchState {
  const s = createMatch({ ...matchSettings, seed }, court, roster);
  s.phase = 'live';
  s.possession = 0;
  return s;
}

function player(state: MatchState, id: string): PlayerState {
  const p = findPlayer(state, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(state: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(state, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

const rim = hoopGeometry(court, 1).rimCenter;

describe('distanceToSegmentXZ', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 10, y: 0, z: 0 };
  it('measures to the interior of the segment', () => {
    expect(distanceToSegmentXZ({ x: 5, y: 0, z: 3 }, a, b)).toBeCloseTo(3);
  });
  it('measures to the nearest endpoint beyond the ends', () => {
    expect(distanceToSegmentXZ({ x: -4, y: 0, z: 3 }, a, b)).toBeCloseTo(5);
    expect(distanceToSegmentXZ({ x: 13, y: 0, z: 4 }, a, b)).toBeCloseTo(5);
  });
  it('ignores y and handles a degenerate segment', () => {
    expect(distanceToSegmentXZ({ x: 3, y: 9, z: 4 }, a, a)).toBeCloseTo(5);
  });
});

describe('evaluateShot', () => {
  it('reports the type and quality the real shot would have, for several spots', () => {
    const spots: [number, number][] = [
      [rim.x - 1.2, 0], // layup range, standing
      [rim.x - 4, 2],
      [rim.x - 7.5, -1],
      [rim.x - 10, 4],
    ];
    for (const [x, z] of spots) {
      const s = live();
      const me = place(s, 'home1', x, z);
      place(s, 'away1', x + 1, z + 0.5);
      place(s, 'away2', rim.x - 2, 1);
      giveBall(s, me, []);
      const evaluation = evaluateShot(s, me, court);
      const check = structuredClone(s);
      const shooter = player(check, 'home1');
      startShot(check, shooter, court);
      const outcome = resolveShotOutcome(check, shooter, court);
      expect(evaluation.type).toBe(shooter.shot?.type);
      expect(evaluation.hoop).toBe(1);
      expect(evaluation.quality).toBeCloseTo(outcome.quality, 6);
      expect(evaluation.distance).toBeCloseTo(Math.hypot(x - rim.x, z), 6);
    }
  });

  it('matches the dunk the real shot picks when driving at the rim', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 1.5, 0);
    me.vel = { x: 5, y: 0, z: 0 };
    giveBall(s, me, []);
    expect(evaluateShot(s, me, court).type).toBe('dunk');
    expect(evaluateShot(s, me, court).quality).toBe(1);
  });

  it('does not mutate the player or the RNG', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 5, 0);
    giveBall(s, me, []);
    const before = JSON.stringify(s);
    evaluateShot(s, me, court);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('evaluates a teammate who does not hold the ball', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 8, 0);
    const mate = place(s, 'home2', rim.x - 2.2, 0);
    giveBall(s, me, []);
    const theirs = evaluateShot(s, mate, court);
    expect(theirs.type).toBe('layup');
    expect(theirs.quality).toBeGreaterThan(evaluateShot(s, me, court).quality);
  });
});

describe('resolveDefensivePress', () => {
  function pressSetup(): { s: MatchState; me: PlayerState; holder: PlayerState } {
    const s = live();
    const holder = place(s, 'home1', rim.x - 5, 0);
    giveBall(s, holder, []);
    const me = place(s, 'away1', rim.x - 5.6, 0); // within steal reach, in front
    me.facing = Math.atan2(holder.pos.x - me.pos.x, holder.pos.z - me.pos.z);
    place(s, 'home2', rim.x - 9, 6);
    place(s, 'away2', rim.x - 9, -6);
    return { s, me, holder };
  }

  it('returns steal when a grounded holder is in reach', () => {
    const { s, me } = pressSetup();
    expect(resolveDefensivePress(s, me, court)).toBe('steal');
  });

  it('returns null while the steal is on cooldown (the sim would do nothing)', () => {
    const { s, me } = pressSetup();
    me.cooldowns.steal = 10;
    expect(resolveDefensivePress(s, me, court)).toBeNull();
  });

  it('returns block when the holder is mid-shot, and jump when the block is on cooldown', () => {
    const { s, me, holder } = pressSetup();
    startShot(s, holder, court);
    expect(resolveDefensivePress(s, me, court)).toBe('block');
    me.cooldowns.block = 5;
    expect(resolveDefensivePress(s, me, court)).toBe('jump');
  });

  it('returns null when I am airborne, action-locked, holding the ball or the phase is not live', () => {
    const { s, me, holder } = pressSetup();
    me.onGround = false;
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    me.onGround = true;
    me.action = 'steal';
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    me.action = 'idle';
    s.phase = 'inbound';
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    s.phase = 'live';
    expect(resolveDefensivePress(s, holder, court)).toBeNull();
  });

  it('returns shove when the nearest opponent is in front and in reach without the ball', () => {
    const s = live();
    const target = place(s, 'home2', 0, 0);
    const me = place(s, 'away1', -1, 0);
    me.facing = Math.PI / 2; // facing +X
    place(s, 'home1', -10, 5);
    giveBall(s, player(s, 'home1'), []);
    place(s, 'away2', 8, 0);
    expect(resolveDefensivePress(s, me, court)).toBe('shove');
    me.cooldowns.shove = 3;
    expect(resolveDefensivePress(s, me, court)).toBeNull();
    me.cooldowns.shove = 0;
    target.shoveImmunityTicks = 5;
    expect(resolveDefensivePress(s, me, court)).toBe('jump');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- tests/sim/ai-helpers.test.ts`
Expected: FAIL — `distanceToSegmentXZ`, `evaluateShot`, `resolveDefensivePress` are not exported.

- [ ] **Step 3: Implement the three helpers**

Append to `src/sim/math.ts`:

```ts
/** Distance in the XZ plane from `p` to the segment `a`→`b` (y is ignored). */
export function distanceToSegmentXZ(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  let t = 0;
  if (len2 > 1e-12) t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1);
  const cx = a.x + abx * t;
  const cz = a.z + abz * t;
  return Math.hypot(p.x - cx, p.z - cz);
}
```

Append to `src/sim/shooting.ts` (after `defenderFactor`):

```ts
export interface ShotEvaluation {
  type: ShotType;
  hoop: HoopIndex;
  /** XZ distance from the player to the rim centre, metres. */
  distance: number;
  /** The shotQuality a shot released now would have against the current opponents. */
  quality: number;
}

/**
 * Spec C.4: the type `startShot` would pick and the quality `resolveShotOutcome` would roll
 * against, for a shot by `player` right now — without touching the player, the ball or the RNG.
 * Works for a hypothetical shooter (a teammate without the ball) too.
 */
export function evaluateShot(state: MatchState, player: PlayerState, court: CourtDef): ShotEvaluation {
  const hoopIndex = targetHoopIndex(state, player, court);
  const hoop = hoopGeometry(court, hoopIndex);
  const type = chooseShotType(player, hoop);
  const defenders = allPlayers(state).filter((p) => p.team !== player.team);
  return {
    type,
    hoop: hoopIndex,
    distance: v3DistanceXZ(player.pos, hoop.rimCenter),
    quality: shotQuality(player, type, hoop, defenders),
  };
}
```

(`HoopIndex` must be in the type import list of `shooting.ts`; add it if missing.)

Append to `src/sim/defence.ts` (add `import { isActionLocked, startJump } from './player-movement';` — `startJump` is already imported there, extend that line):

```ts
/**
 * Spec C.4: what pressing the action button without the ball would do right now, following
 * tick.ts exactly — or null when nothing would happen (not live, airborne, action-locked,
 * holding the ball, or the chosen move is on cooldown). A block on cooldown is a plain jump,
 * as in the tick. The AI presses only when this returns the move it intends.
 */
export function resolveDefensivePress(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
): DefensiveChoice | null {
  if (state.phase !== 'live' || !player.onGround || isActionLocked(player)) return null;
  if (state.ball.holder === player.id) return null;
  const choice = chooseDefensiveAction(state, player, court);
  switch (choice) {
    case 'block':
      return player.cooldowns.block === 0 ? 'block' : 'jump';
    case 'steal':
      return player.cooldowns.steal === 0 ? 'steal' : null;
    case 'shove':
      return player.cooldowns.shove === 0 ? 'shove' : null;
    default:
      return 'jump';
  }
}
```

- [ ] **Step 4: Run the helper tests**

Run: `npm test -- tests/sim/ai-helpers.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Write the failing foundation tests**

`tests/sim/ai-foundation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { AI_PROFILES, isAiProfileId } from '../../src/sim/ai/profile';
import { createAiMemory, hashSeed, resetAiMemory } from '../../src/sim/ai/memory';
import {
  SPOT_NAMES,
  farthestSpot,
  namedSpot,
  pickOpenSpot,
  scoreSpot,
} from '../../src/sim/ai/spots';
import { steerTowards, wantsTurbo } from '../../src/sim/ai/steering';
import { hoopGeometry } from '../../src/sim/hoop';
import { nextFloat } from '../../src/sim/rng';
import { DEFAULT_STATS } from '../../src/sim/stats';
import type { PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1); // +X hoop, side = 1
const rim = hoop.rimCenter;

describe('profiles', () => {
  it('ship easy, fair and hard with the Appendix C numbers', () => {
    expect(AI_PROFILES.fair).toMatchObject({
      reactionTicks: 15,
      shootThreshold: 0.55,
      passBias: 0.1,
      perceptionNoise: 0.08,
      stealRate: 0.4,
      shoveRate: 0.3,
      turboThreshold: 0.4,
    });
    expect(AI_PROFILES.easy.reactionTicks).toBe(24);
    expect(AI_PROFILES.hard.reactionTicks).toBe(8);
    expect(AI_PROFILES.easy.shootThreshold).toBeGreaterThan(AI_PROFILES.hard.shootThreshold);
    expect(AI_PROFILES.easy.stealRate).toBeLessThan(AI_PROFILES.hard.stealRate);
  });
  it('validates ids', () => {
    expect(isAiProfileId('fair')).toBe(true);
    expect(isAiProfileId('brutal')).toBe(false);
  });
});

describe('memory', () => {
  it('seeds a distinct RNG per player from the match seed, deterministically', () => {
    expect(hashSeed(1, 'home2')).toBe(hashSeed(1, 'home2'));
    expect(hashSeed(1, 'home2')).not.toBe(hashSeed(1, 'away1'));
    expect(hashSeed(1, 'home2')).not.toBe(hashSeed(2, 'home2'));
    const a = createAiMemory('home2', 1, 1, true);
    const b = createAiMemory('home2', 1, 1, true);
    expect(nextFloat(a.rng)).toBe(nextFloat(b.rng));
  });

  it('starts planning at its offset and resets goals but keeps the RNG stream', () => {
    const m = createAiMemory('away1', 5, 2, false);
    expect(m.nextDecisionTick).toBe(2);
    expect(m.goal).toEqual({ kind: 'idle' });
    expect(m.favourTeammate).toBe(false);
    nextFloat(m.rng);
    const rngAfterDraw = m.rng.seed;
    m.goal = { kind: 'chase' };
    m.markId = 'home1';
    m.laneClosedCount = 2;
    m.pressedLastTick = true;
    resetAiMemory(m, 600);
    expect(m.goal).toEqual({ kind: 'idle' });
    expect(m.markId).toBeNull();
    expect(m.laneClosedCount).toBe(0);
    expect(m.pressedLastTick).toBe(false);
    expect(m.nextDecisionTick).toBe(602);
    expect(m.rng.seed).toBe(rngAfterDraw);
  });

  it('is plain data', () => {
    const m = createAiMemory('home2', 1, 0, true);
    expect(structuredClone(m)).toEqual(m);
  });
});

describe('spots', () => {
  it('names six spots around the hoop, all on the attacking half and inside the court', () => {
    expect(SPOT_NAMES).toHaveLength(6);
    for (const name of SPOT_NAMES) {
      const s = namedSpot(hoop, name);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(court.playArea.length / 2);
      expect(Math.abs(s.z)).toBeLessThan(court.playArea.width / 2);
    }
    expect(namedSpot(hoop, 'leftCorner').z).toBeLessThan(0);
    expect(namedSpot(hoop, 'rightCorner').z).toBeGreaterThan(0);
    expect(namedSpot(hoop, 'top').z).toBe(0);
    expect(Math.hypot(namedSpot(hoop, 'underBasket').x - rim.x, namedSpot(hoop, 'underBasket').z)).toBeLessThan(1.5);
    // Mirrored on the other hoop.
    const other = hoopGeometry(court, 0);
    expect(namedSpot(other, 'top').x).toBeCloseTo(-namedSpot(hoop, 'top').x);
  });

  it('scores openness minus the lane and handler penalties', () => {
    const handler = { x: rim.x - 7, y: 0, z: 0 };
    const wing = namedSpot(hoop, 'rightWing');
    const open = scoreSpot(wing, handler, rim, []);
    const guarded = scoreSpot(wing, handler, rim, [{ x: wing.x, y: 0, z: wing.z + 0.5 }]);
    expect(open).toBeGreaterThan(guarded);
    // A spot on the handler→rim line is penalised.
    const onLane = { x: rim.x - 3.5, y: 0, z: 0 };
    expect(scoreSpot(onLane, handler, rim, [])).toBeLessThan(scoreSpot(wing, handler, rim, []));
    // A spot next to the handler is penalised.
    const nextToHandler = { x: handler.x + 1, y: 0, z: 1 };
    expect(scoreSpot(nextToHandler, handler, rim, [])).toBeLessThan(open);
  });

  it('picks the open side and keeps the current spot unless another wins by the hysteresis', () => {
    const handler = { x: rim.x - 7, y: 0, z: 0 };
    const leftWing = namedSpot(hoop, 'leftWing');
    const rightWing = namedSpot(hoop, 'rightWing');
    // Opponents on the right side: the pick is on the left.
    const opponents = [
      { x: rightWing.x, y: 0, z: rightWing.z },
      { x: namedSpot(hoop, 'rightCorner').x, y: 0, z: namedSpot(hoop, 'rightCorner').z },
    ];
    const pick = pickOpenSpot(hoop, handler, opponents, null);
    expect(pick.z).toBeLessThan(0);
    // Holding the right wing with a marginally better left wing: stay.
    const slightly = [{ x: rightWing.x + 0.3, y: 0, z: rightWing.z + 1 }];
    const stay = pickOpenSpot(hoop, handler, slightly, { name: 'rightWing', spot: rightWing });
    expect(stay.name).toBe('rightWing');
    // Clearly better elsewhere: move.
    const move = pickOpenSpot(hoop, handler, opponents, { name: 'rightWing', spot: rightWing });
    expect(move.name).not.toBe('rightWing');
    void leftWing;
  });

  it('farthestSpot ignores the handler and maximises distance from the defenders', () => {
    const defenders = [
      { x: rim.x - 2, y: 0, z: 0 },
      { x: rim.x - 5, y: 0, z: 4 },
    ];
    const pick = farthestSpot(hoop, defenders);
    expect(pick.z).toBeLessThan(0);
  });
});

describe('steering', () => {
  const fake = (turbo: number): PlayerState =>
    ({ turbo, stats: { ...DEFAULT_STATS } }) as unknown as PlayerState;

  it('returns a unit step towards the target and zero inside the arrive radius', () => {
    const step = steerTowards({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 });
    expect(step.x).toBeCloseTo(0.6);
    expect(step.y).toBeCloseTo(0.8);
    expect(steerTowards({ x: 0, y: 0, z: 0 }, { x: 0.2, y: 0, z: 0.1 })).toEqual({ x: 0, y: 0 });
  });

  it('asks for turbo only far away and with enough bar for the profile', () => {
    expect(wantsTurbo(fake(0.9), 6, AI_PROFILES.fair)).toBe(true);
    expect(wantsTurbo(fake(0.3), 6, AI_PROFILES.fair)).toBe(false);
    expect(wantsTurbo(fake(0.9), 2, AI_PROFILES.fair)).toBe(false);
    expect(wantsTurbo(fake(0.3), 6, AI_PROFILES.hard)).toBe(true);
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `npm test -- tests/sim/ai-foundation.test.ts`
Expected: FAIL — modules under `src/sim/ai/` do not exist.

- [ ] **Step 7: Implement the foundation modules**

`src/sim/ai/profile.ts`:

```ts
/** Spec C.3: one profile type, three presets picked with `?ai=`. */
export type AiProfileId = 'easy' | 'fair' | 'hard';

export interface AiProfile {
  id: AiProfileId;
  /** Ticks a mark's shot or drive must be visible before the AI reacts. */
  reactionTicks: number;
  /** Minimum perceived shot quality to shoot (the shot-clock panic overrides it). */
  shootThreshold: number;
  /** How much better the teammate's shot must be before passing. */
  passBias: number;
  /** ± seeded jitter added to the perceived shot quality. */
  perceptionNoise: number;
  /** Chance per decision tick to press when a steal is on. */
  stealRate: number;
  /** Chance per decision tick to shove a driving mark. */
  shoveRate: number;
  /** Minimum turbo bar before using turbo. */
  turboThreshold: number;
}

export const AI_PROFILES: Readonly<Record<AiProfileId, Readonly<AiProfile>>> = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    reactionTicks: 24,
    shootThreshold: 0.65,
    passBias: 0.15,
    perceptionNoise: 0.15,
    stealRate: 0.2,
    shoveRate: 0.1,
    turboThreshold: 0.6,
  }),
  fair: Object.freeze({
    id: 'fair',
    reactionTicks: 15,
    shootThreshold: 0.55,
    passBias: 0.1,
    perceptionNoise: 0.08,
    stealRate: 0.4,
    shoveRate: 0.3,
    turboThreshold: 0.4,
  }),
  hard: Object.freeze({
    id: 'hard',
    reactionTicks: 8,
    shootThreshold: 0.45,
    passBias: 0,
    perceptionNoise: 0.03,
    stealRate: 0.6,
    shoveRate: 0.5,
    turboThreshold: 0.2,
  }),
});

export const DEFAULT_AI_PROFILE_ID: AiProfileId = 'fair';

export function isAiProfileId(value: string): value is AiProfileId {
  return value === 'easy' || value === 'fair' || value === 'hard';
}
```

`src/sim/ai/memory.ts`:

```ts
import type { Vec3 } from '../math';
import { createRng, type RngState } from '../rng';
import type { MatchPhase, PlayerId, TeamIndex } from '../types';
import type { SpotName } from './spots';

/** What a brain is currently trying to do; re-planned every DECISION_INTERVAL_TICKS. */
export type AiGoal =
  | { kind: 'idle' }
  | { kind: 'moveTo'; spot: Vec3; name: SpotName | null }
  | { kind: 'drive'; sideStep: Vec3 | null }
  | { kind: 'shoot' }
  | { kind: 'pass' }
  | { kind: 'chase' }
  | { kind: 'mark'; markId: PlayerId };

/**
 * Spec C.2: all of a brain's state, as plain serialisable data. No closures. Reset on the
 * phase change to inbound/tipoff; the RNG stream is kept so a match stays reproducible.
 */
export interface AiMemory {
  playerId: PlayerId;
  /** Private RNG: the brain never touches state.rng (spec §4.10). */
  rng: RngState;
  /** Decision cadence offset so the brains do not all plan on the same tick. */
  offset: number;
  nextDecisionTick: number;
  goal: AiGoal;
  /** Defence: the opponent I am marking, and the possession the marks were assigned for. */
  markId: PlayerId | null;
  marksForPossession: TeamIndex | null;
  /** Offense: consecutive decisions with the driving lane closed (C.5 step 7). */
  laneClosedCount: number;
  /** Off ball: tick of the last alley-oop invite jump. */
  lastInviteTick: number;
  /** One-tick presses: true when the button was emitted last tick (forced false next). */
  pressedLastTick: boolean;
  passedLastTick: boolean;
  lastPhase: MatchPhase;
  /** The teammate brain favours passing to the human (passBias − 0.15, spec C.3). */
  favourTeammate: boolean;
}

/** FNV-1a over `${seed}:${playerId}` so each player gets its own stream from the match seed. */
export function hashSeed(seed: number, playerId: PlayerId): number {
  const text = `${seed >>> 0}:${playerId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function createAiMemory(
  playerId: PlayerId,
  seed: number,
  offset: number,
  favourTeammate: boolean,
): AiMemory {
  return {
    playerId,
    rng: createRng(hashSeed(seed, playerId)),
    offset,
    nextDecisionTick: offset,
    goal: { kind: 'idle' },
    markId: null,
    marksForPossession: null,
    laneClosedCount: 0,
    lastInviteTick: -Infinity,
    pressedLastTick: false,
    passedLastTick: false,
    lastPhase: 'tipoff',
    favourTeammate,
  };
}

/** Forgets goals and marks (not the RNG); the next plan happens `offset` ticks after `tick`. */
export function resetAiMemory(memory: AiMemory, tick: number): void {
  memory.nextDecisionTick = tick + memory.offset;
  memory.goal = { kind: 'idle' };
  memory.markId = null;
  memory.marksForPossession = null;
  memory.laneClosedCount = 0;
  memory.lastInviteTick = -Infinity;
  memory.pressedLastTick = false;
  memory.passedLastTick = false;
}
```

`src/sim/ai/spots.ts`:

```ts
import type { HoopGeometry } from '../hoop';
import { distanceToSegmentXZ, v3DistanceXZ, type Vec3 } from '../math';

/** Spec §6 / C.5 named spots around the attacking hoop. */
export type SpotName =
  | 'leftCorner'
  | 'rightCorner'
  | 'leftWing'
  | 'rightWing'
  | 'top'
  | 'underBasket';

export const SPOT_NAMES: readonly SpotName[] = [
  'leftCorner',
  'rightCorner',
  'leftWing',
  'rightWing',
  'top',
  'underBasket',
];

export interface NamedSpot {
  name: SpotName;
  spot: Vec3;
}

/** Offsets from the rim: `back` towards centre court (−side·X), `side` across the width (Z). */
const SPOT_OFFSETS: Readonly<Record<SpotName, { back: number; side: number }>> = {
  leftCorner: { back: 1.0, side: -6.3 },
  rightCorner: { back: 1.0, side: 6.3 },
  leftWing: { back: 5.0, side: -4.5 },
  rightWing: { back: 5.0, side: 4.5 },
  top: { back: 6.5, side: 0 },
  underBasket: { back: 1.2, side: 0 },
};

/** Spec C.5 penalties: inside the handler→rim lane, and crowding the handler. */
export const SPOT_LANE_PENALTY_RADIUS = 2.5;
export const SPOT_HANDLER_PENALTY_RADIUS = 3;
const SPOT_PENALTY = 3;
/** Openness saturates: a defender 6 m away is as good as one 10 m away. */
const OPENNESS_CAP = 6;
export const SPOT_HYSTERESIS = 1.5;

export function namedSpot(hoop: HoopGeometry, name: SpotName): Vec3 {
  const o = SPOT_OFFSETS[name];
  return { x: hoop.rimCenter.x - hoop.side * o.back, y: 0, z: hoop.rimCenter.z + o.side };
}

function openness(spot: Vec3, opponents: readonly Vec3[]): number {
  let nearest = OPENNESS_CAP;
  for (const o of opponents) nearest = Math.min(nearest, v3DistanceXZ(spot, o));
  return nearest;
}

/** Openness − lane penalty − handler penalty (spec C.5). */
export function scoreSpot(
  spot: Vec3,
  handlerPos: Vec3,
  rim: Vec3,
  opponents: readonly Vec3[],
): number {
  let score = openness(spot, opponents);
  if (distanceToSegmentXZ(spot, handlerPos, rim) < SPOT_LANE_PENALTY_RADIUS) score -= SPOT_PENALTY;
  if (v3DistanceXZ(spot, handlerPos) < SPOT_HANDLER_PENALTY_RADIUS) score -= SPOT_PENALTY;
  return score;
}

/**
 * The best spot for an off-ball attacker; keeps `current` unless another spot beats it by
 * SPOT_HYSTERESIS. Ties resolve in SPOT_NAMES order, so the choice is deterministic.
 */
export function pickOpenSpot(
  hoop: HoopGeometry,
  handlerPos: Vec3,
  opponents: readonly Vec3[],
  current: NamedSpot | null,
): NamedSpot {
  let best: NamedSpot | null = null;
  let bestScore = -Infinity;
  for (const name of SPOT_NAMES) {
    const spot = namedSpot(hoop, name);
    const score = scoreSpot(spot, handlerPos, hoop.rimCenter, opponents);
    if (score > bestScore) {
      best = { name, spot };
      bestScore = score;
    }
  }
  if (current) {
    const currentScore = scoreSpot(current.spot, handlerPos, hoop.rimCenter, opponents);
    if (bestScore - currentScore < SPOT_HYSTERESIS) return current;
  }
  return best as NamedSpot;
}

/** For a reset with the ball (C.5 step 7): the named spot farthest from the defenders. */
export function farthestSpot(hoop: HoopGeometry, defenders: readonly Vec3[]): NamedSpot {
  let best: NamedSpot | null = null;
  let bestScore = -Infinity;
  for (const name of SPOT_NAMES) {
    if (name === 'underBasket') continue;
    const spot = namedSpot(hoop, name);
    const score = openness(spot, defenders);
    if (score > bestScore) {
      best = { name, spot };
      bestScore = score;
    }
  }
  return best as NamedSpot;
}
```

`src/sim/ai/steering.ts`:

```ts
import type { Vec2, Vec3 } from '../math';
import type { PlayerState } from '../types';
import type { AiProfile } from './profile';

export const ARRIVE_RADIUS = 0.4;
/** Spec C.5: turbo to recover or drive only from this far away. */
export const TURBO_RECOVER_DISTANCE = 4;

/** Unit court-space step (x → X, y → Z) from `from` towards `to`; zero inside the arrive radius. */
export function steerTowards(from: Vec3, to: Vec3, arriveRadius = ARRIVE_RADIUS): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d <= arriveRadius) return { x: 0, y: 0 };
  return { x: dx / d, y: dz / d };
}

/** Turbo when the way is long and the bar is above the profile's threshold. */
export function wantsTurbo(player: PlayerState, distance: number, profile: AiProfile): boolean {
  return distance > TURBO_RECOVER_DISTANCE && player.turbo >= profile.turboThreshold;
}
```

`src/sim/ai/index.ts` (Tasks 2–3 add their modules to it):

```ts
export * from './profile';
export * from './memory';
export * from './spots';
export * from './steering';
```

Add `export * from './ai';` at the end of `src/sim/index.ts`.

- [ ] **Step 8: Run the foundation tests and the whole check**

Run: `npm test -- tests/sim/ai-foundation.test.ts` → PASS.
Run: `npm run format && npm run check` → green (the boundary lint applies to `src/sim/ai/**`; `tsconfig.sim.json` already includes `src/sim`).

- [ ] **Step 9: Commit**

```bash
git add src/sim tests/sim/ai-helpers.test.ts tests/sim/ai-foundation.test.ts
git commit -m "feat(sim): AI foundation — evaluateShot, resolveDefensivePress, profiles, memory, spots, steering"
```

---

### Task 2: Offense and off-ball planning

**Files:**
- Create: `src/sim/ai/offense.ts`, `src/sim/ai/offball.ts`
- Modify: `src/sim/ai/index.ts`
- Test: `tests/sim/ai-offense.test.ts`

**Interfaces:**
- Consumes (Task 1): `evaluateShot`, `AiMemory`, `AiGoal`, `AiProfile`, `farthestSpot`, `pickOpenSpot`, `NamedSpot`; (existing) `passLaneOpen`, `teammateOf`, `ALLEY_OOP_RANGE` (passing.ts), `targetHoopIndex` (shooting.ts), `hoopGeometry`, `HoopGeometry` (hoop.ts), `allPlayers`, `findPlayer` (match.ts), `nextFloat` (rng.ts), `distanceToSegmentXZ`, `v3DistanceXZ`, `clamp` (math.ts).
- Produces (used by Task 3's brain and Task 5):
  - `opponentsOf(state, player): PlayerState[]`
  - `perceive(quality, memory, profile): number` — exactly one RNG draw
  - `laneBlocker(me, rim, opponents): PlayerState | null`, `sideStepPoint(me, rim, blocker): Vec3`
  - `planWithBall(state, me, memory, profile, court): AiGoal`
  - constants `PANIC_SHOT_CLOCK_MS = 3000`, `PANIC_MIN_QUALITY = 0.15`, `CONTESTED_AIRBORNE_RADIUS = 1.5`, `LANE_BLOCK_RADIUS = 1.2`, `SIDE_STEP_DISTANCE = 2`, `RESET_AFTER_CLOSED_DECISIONS = 3`, `RESET_MIN_SHOT_CLOCK_MS = 6000`, `TEAMMATE_PASS_BIAS = -0.15`
  - `planOffBall(state, me, memory, hoop, anchorPos): AiGoal`
  - `wantsAlleyOopInvite(state, me, handler, memory): boolean`
  - `shouldChase(state, me): boolean`
  - `planRebound(state, me, court): AiGoal`
  - constants `INVITE_HANDLER_RANGE = 6`, `INVITE_CLEAR_RADIUS = 1.5`, `INVITE_EVERY_TICKS = 90`, `INVITE_AT_SPOT_RADIUS = 0.8`, `CHASE_RADIUS = 3`, `REBOUND_RANGE = 5`, `REBOUND_FROM_RIM = 1.2`

- [ ] **Step 1: Write the failing tests**

`tests/sim/ai-offense.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createAiMemory } from '../../src/sim/ai/memory';
import {
  INVITE_EVERY_TICKS,
  planOffBall,
  planRebound,
  shouldChase,
  wantsAlleyOopInvite,
} from '../../src/sim/ai/offball';
import {
  laneBlocker,
  perceive,
  planWithBall,
  sideStepPoint,
} from '../../src/sim/ai/offense';
import { AI_PROFILES, type AiProfile } from '../../src/sim/ai/profile';
import { namedSpot } from '../../src/sim/ai/spots';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { startJump } from '../../src/sim/player-movement';
import { evaluateShot } from '../../src/sim/shooting';
import type { MatchSettings, MatchState, PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const matchSettings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function live(seed = 1): MatchState {
  const s = createMatch({ ...matchSettings, seed }, court, roster);
  s.phase = 'live';
  s.possession = 0;
  return s;
}

function player(state: MatchState, id: string): PlayerState {
  const p = findPlayer(state, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(state: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(state, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

const hoop = hoopGeometry(court, 1);
const rim = hoop.rimCenter;
/** Noise-free fair profile so plans are a pure function of the geometry. */
const exact: AiProfile = { ...AI_PROFILES.fair, perceptionNoise: 0 };

/** Holder at `distance` m from the rim along the lane; teammate and opponents parked far away. */
function holderAt(distance: number, holderId = 'home1'): { s: MatchState; me: PlayerState } {
  const s = live();
  const me = place(s, holderId, rim.x - distance, 0);
  place(s, holderId === 'home1' ? 'home2' : 'home1', rim.x - 9, 6);
  place(s, 'away1', -10, -6);
  place(s, 'away2', -10, 6);
  giveBall(s, me, []);
  return { s, me };
}

describe('perceive', () => {
  it('draws exactly once and stays within the noise band', () => {
    const m = createAiMemory('home1', 3, 0, false);
    const before = m.rng.seed;
    const q = perceive(0.5, m, AI_PROFILES.easy);
    expect(m.rng.seed).not.toBe(before);
    expect(Math.abs(q - 0.5)).toBeLessThanOrEqual(0.15 + 1e-9);
    expect(perceive(0.5, m, exact)).toBe(0.5);
  });
});

describe('planWithBall', () => {
  it('panics under 3 s: shoots a weak but possible shot', () => {
    const { s, me } = holderAt(9);
    s.shotClockMs = 2000;
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'shoot' });
  });

  it('panics under 3 s: passes a hopeless shot when the lane is open, else shoots anyway', () => {
    const { s, me } = holderAt(13);
    s.shotClockMs = 2000;
    place(s, 'away1', rim.x - 12.6, 0); // on top of the shooter: quality collapses
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'pass' });
    // An opponent a quarter of the way along the lane (1.8 m out, past the 1 m release shield,
    // where the pass is still low) closes it.
    const mate = player(s, 'home2');
    place(s, 'away2', me.pos.x + 0.25 * (mate.pos.x - me.pos.x), me.pos.z + 0.25 * (mate.pos.z - me.pos.z));
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'shoot' });
  });

  it('lobs to a teammate who is airborne at the rim', () => {
    const { s, me } = holderAt(7);
    const mate = place(s, 'home2', rim.x - 1.5, 1);
    startJump(mate, 4);
    mate.pos.y = 0.5;
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'pass' });
  });

  it('honours a call for the ball when the lane is open, not when it is closed', () => {
    const { s, me } = holderAt(9);
    const mate = player(s, 'home2');
    mate.callingForPassTicks = 30;
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'pass' });
    // An opponent a quarter of the way along the lane (1.5 m out, past the 1 m release shield,
    // where the pass is still low) closes it.
    place(s, 'away1', me.pos.x + 0.25 * (mate.pos.x - me.pos.x), me.pos.z + 0.25 * (mate.pos.z - me.pos.z));
    expect(planWithBall(s, me, m, exact, court).kind).not.toBe('pass');
  });

  it('takes a layup at once unless an opponent is airborne next to me', () => {
    const { s, me } = holderAt(2.2);
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, exact, court)).toEqual({ kind: 'shoot' });
    const d = place(s, 'away1', rim.x - 3, 0.5);
    startJump(d, 4);
    d.pos.y = 0.4;
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.99 }, court).kind).not.toBe(
      'shoot',
    );
  });

  it('shoots above the threshold and drives below it', () => {
    const { s, me } = holderAt(4, 'home2'); // Ace, open, mid-range
    const m = createAiMemory('home2', 1, 0, false);
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.3 }, court)).toEqual({
      kind: 'shoot',
    });
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.99, passBias: 9 }, court)).toEqual(
      { kind: 'drive', sideStep: null },
    );
  });

  it('passes when the teammate has the clearly better shot', () => {
    const { s, me } = holderAt(9);
    place(s, 'home2', rim.x - 2.2, 0.5); // open layup
    const m = createAiMemory('home1', 1, 0, false);
    expect(planWithBall(s, me, m, { ...exact, shootThreshold: 0.99 }, court)).toEqual({
      kind: 'pass',
    });
  });

  it('the teammate brain favours the human: passes on a marginally better shot', () => {
    const { s, me } = holderAt(5, 'home2');
    const mine = evaluateShot(s, me, court).quality;
    // Walk the human (a worse shooter than Ace) in from the arc until their jump shot is between
    // mine − 0.05 and mine + 0.10: the plain bias (0.10) refuses the pass, the teammate bias
    // (0.10 − 0.15 = −0.05) takes it. Stay beyond layup range so only the human's distance moves.
    let placed = false;
    for (let d = 6; d >= 2.6 && !placed; d -= 0.1) {
      const theirs = evaluateShot(s, place(s, 'home1', rim.x - d, 0.3), court).quality;
      placed = theirs > mine - 0.04 && theirs < mine + 0.09;
    }
    expect(placed).toBe(true);
    const noShoot = { ...exact, shootThreshold: 0.99 };
    const plain = createAiMemory('home2', 1, 0, false);
    const favouring = createAiMemory('home2', 1, 0, true);
    expect(planWithBall(s, me, plain, noShoot, court).kind).toBe('drive');
    expect(planWithBall(s, me, favouring, noShoot, court)).toEqual({ kind: 'pass' });
  });

  it('side-steps around a lane blocker, away from them, and resets after three closed decisions', () => {
    const { s, me } = holderAt(9);
    const blocker = place(s, 'away1', rim.x - 7, 0.6); // 2 m ahead, a little to +Z
    expect(laneBlocker(me, rim, [blocker])).toBe(blocker);
    const step = sideStepPoint(me, rim, blocker);
    expect(step.z).toBeLessThan(me.pos.z); // away from the blocker (−Z)
    expect(Math.abs(step.z - me.pos.z)).toBeCloseTo(2, 1);
    const m = createAiMemory('home1', 1, 0, false);
    const noShoot = { ...exact, shootThreshold: 0.99, passBias: 9 };
    s.shotClockMs = 10_000;
    const first = planWithBall(s, me, m, noShoot, court);
    expect(first.kind).toBe('drive');
    expect(first.kind === 'drive' && first.sideStep !== null).toBe(true);
    expect(planWithBall(s, me, m, noShoot, court).kind).toBe('drive');
    const third = planWithBall(s, me, m, noShoot, court);
    expect(third.kind).toBe('moveTo');
    expect(m.laneClosedCount).toBe(0);
    // Under 6 s there is no reset: keep driving.
    s.shotClockMs = 5000;
    m.laneClosedCount = 5;
    expect(planWithBall(s, me, m, noShoot, court).kind).toBe('drive');
  });

  it('no blocker when the opponent is behind me or off the lane', () => {
    const { s, me } = holderAt(6);
    const behind = place(s, 'away1', rim.x - 8, 0);
    const wide = place(s, 'away2', rim.x - 3, 2);
    expect(laneBlocker(me, rim, [behind, wide])).toBeNull();
  });
});

describe('off ball', () => {
  it('moves to an open spot off the drive lane', () => {
    const s = live();
    const handler = place(s, 'home1', rim.x - 7, 0);
    giveBall(s, handler, []);
    const me = place(s, 'home2', rim.x - 9, 6);
    place(s, 'away1', namedSpot(hoop, 'rightWing').x, namedSpot(hoop, 'rightWing').z);
    place(s, 'away2', namedSpot(hoop, 'rightCorner').x, namedSpot(hoop, 'rightCorner').z);
    const m = createAiMemory('home2', 1, 0, true);
    const goal = planOffBall(s, me, m, hoop, handler.pos);
    expect(goal.kind).toBe('moveTo');
    if (goal.kind === 'moveTo') {
      expect(goal.spot.z).toBeLessThan(0);
      expect(goal.name).not.toBeNull();
      // Re-planning keeps the spot (hysteresis).
      m.goal = goal;
      expect(planOffBall(s, me, m, hoop, handler.pos)).toEqual(goal);
    }
  });

  it('invites the alley-oop from under the basket, at most once per 90 ticks', () => {
    const s = live();
    const handler = place(s, 'home1', rim.x - 5, 0);
    giveBall(s, handler, []);
    const under = namedSpot(hoop, 'underBasket');
    const me = place(s, 'home2', under.x, under.z);
    place(s, 'away1', -10, 0);
    place(s, 'away2', -10, 3);
    const m = createAiMemory('home2', 1, 0, true);
    m.goal = { kind: 'moveTo', spot: under, name: 'underBasket' };
    s.tick = 500;
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(true);
    m.lastInviteTick = 500;
    s.tick = 500 + INVITE_EVERY_TICKS - 1;
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(false);
    s.tick = 500 + INVITE_EVERY_TICKS;
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(true);
    place(s, 'away1', under.x + 1, under.z); // a defender on me
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(false);
    place(s, 'away1', -10, 0);
    place(s, 'home1', rim.x - 8, 0); // handler too far
    expect(wantsAlleyOopInvite(s, me, player(s, 'home1'), m)).toBe(false);
    m.goal = { kind: 'moveTo', spot: namedSpot(hoop, 'top'), name: 'top' };
    expect(wantsAlleyOopInvite(s, me, handler, m)).toBe(false);
  });

  it('chases a loose ball when closest on my team or within 3 m', () => {
    const s = live();
    s.ball.mode = 'free';
    s.ball.holder = null;
    s.ball.pos = { x: 0, y: 0.12, z: 0 };
    const me = place(s, 'home1', 4, 0);
    place(s, 'home2', 6, 0);
    expect(shouldChase(s, me)).toBe(true);
    expect(shouldChase(s, player(s, 'home2'))).toBe(false);
    place(s, 'home2', 2.5, 0); // now home2 is closer, and within 3 m
    expect(shouldChase(s, me)).toBe(false);
    expect(shouldChase(s, player(s, 'home2'))).toBe(true);
    place(s, 'home1', 0, 2.9); // within 3 m: both chase
    expect(shouldChase(s, player(s, 'home1'))).toBe(true);
  });

  it('crashes the boards within 5 m of the rim during a shot, otherwise waits', () => {
    const s = live();
    s.ball.mode = 'flight';
    s.ball.holder = null;
    s.ball.flight = {
      kind: 'shot',
      from: { x: 0, y: 2, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      totalTicks: 40,
      elapsedTicks: 5,
      passer: null,
      receiver: null,
      lob: false,
      team: 0,
    };
    s.ball.lastShot = { shooter: 'home1', team: 0, hoop: 1, shotType: 'jumpshot', points: 2, made: false };
    const near = place(s, 'away1', rim.x - 3, 2);
    const goal = planRebound(s, near, court);
    expect(goal.kind).toBe('moveTo');
    if (goal.kind === 'moveTo') {
      expect(Math.hypot(goal.spot.x - rim.x, goal.spot.z - rim.z)).toBeCloseTo(1.2, 5);
      expect(goal.spot.z).toBeGreaterThan(0); // on my side of the rim
    }
    const far = place(s, 'home2', rim.x - 9, 0);
    expect(planRebound(s, far, court)).toEqual({ kind: 'idle' });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- tests/sim/ai-offense.test.ts`
Expected: FAIL — `src/sim/ai/offense` and `src/sim/ai/offball` do not exist.

- [ ] **Step 3: Implement offense.ts**

`src/sim/ai/offense.ts`:

```ts
import { hoopGeometry } from '../hoop';
import { clamp, distanceToSegmentXZ, v3DistanceXZ, type Vec3 } from '../math';
import { allPlayers } from '../match';
import { ALLEY_OOP_RANGE, passLaneOpen, teammateOf } from '../passing';
import { nextFloat } from '../rng';
import { evaluateShot } from '../shooting';
import type { CourtDef, MatchState, PlayerState } from '../types';
import type { AiGoal, AiMemory } from './memory';
import type { AiProfile } from './profile';
import { farthestSpot } from './spots';

/** Spec C.5 "has ball" numbers. */
export const PANIC_SHOT_CLOCK_MS = 3000;
export const PANIC_MIN_QUALITY = 0.15;
export const CONTESTED_AIRBORNE_RADIUS = 1.5;
export const LANE_BLOCK_RADIUS = 1.2;
export const SIDE_STEP_DISTANCE = 2;
/** The side-step also gains a metre towards the rim so the drive keeps progressing. */
const SIDE_STEP_FORWARD = 1;
export const RESET_AFTER_CLOSED_DECISIONS = 3;
export const RESET_MIN_SHOT_CLOCK_MS = 6000;
/** Spec C.3: the teammate brain's extra bias towards passing to the human. */
export const TEAMMATE_PASS_BIAS = -0.15;

export function opponentsOf(state: MatchState, player: PlayerState): PlayerState[] {
  return allPlayers(state).filter((p) => p.team !== player.team);
}

/**
 * The shot quality as the brain sees it: the true value plus seeded noise from the profile.
 * RNG draw order: exactly one draw per call, from the brain's private RNG (never state.rng).
 */
export function perceive(quality: number, memory: AiMemory, profile: AiProfile): number {
  const jitter = (nextFloat(memory.rng) * 2 - 1) * profile.perceptionNoise;
  return clamp(quality + jitter, 0, 1);
}

/** The opponent closing the drive: within LANE_BLOCK_RADIUS of me→rim and nearer the rim than I am. */
export function laneBlocker(
  me: PlayerState,
  rim: Vec3,
  opponents: readonly PlayerState[],
): PlayerState | null {
  const myDistance = v3DistanceXZ(me.pos, rim);
  let blocker: PlayerState | null = null;
  let best = Infinity;
  for (const o of opponents) {
    if (v3DistanceXZ(o.pos, rim) >= myDistance) continue;
    const d = distanceToSegmentXZ(o.pos, me.pos, rim);
    if (d <= LANE_BLOCK_RADIUS && d < best) {
      blocker = o;
      best = d;
    }
  }
  return blocker;
}

/** A point SIDE_STEP_DISTANCE perpendicular to me→rim on the side away from the blocker (C.5 step 6). */
export function sideStepPoint(me: PlayerState, rim: Vec3, blocker: PlayerState): Vec3 {
  const dx = rim.x - me.pos.x;
  const dz = rim.z - me.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  // Left-hand perpendicular (−uz, ux); the blocker's lateral offset picks the opposite side.
  const lateral = -uz * (blocker.pos.x - me.pos.x) + ux * (blocker.pos.z - me.pos.z);
  const sign = lateral > 0 ? -1 : 1;
  return {
    x: me.pos.x - uz * sign * SIDE_STEP_DISTANCE + ux * SIDE_STEP_FORWARD,
    y: 0,
    z: me.pos.z + ux * sign * SIDE_STEP_DISTANCE + uz * SIDE_STEP_FORWARD,
  };
}

const SHOOT: AiGoal = { kind: 'shoot' };
const PASS: AiGoal = { kind: 'pass' };

/**
 * Spec C.5 "has ball", evaluated at a decision tick. RNG: one `perceive` draw per call.
 * Mutates memory.laneClosedCount only.
 */
export function planWithBall(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
): AiGoal {
  const mine = evaluateShot(state, me, court);
  const hoop = hoopGeometry(court, mine.hoop);
  const opponents = opponentsOf(state, me);
  const mate = teammateOf(state, me);
  const laneOpen = mate !== undefined && passLaneOpen(state, me, mate, court);
  const perceived = perceive(mine.quality, memory, profile);

  // 1. Shot clock panic.
  if (state.shotClockMs < PANIC_SHOT_CLOCK_MS) {
    if (perceived > PANIC_MIN_QUALITY) return SHOOT;
    return laneOpen ? PASS : SHOOT;
  }
  if (mate && laneOpen) {
    // 2. Alley-oop: the sim turns this pass into a lob.
    if (!mate.onGround && v3DistanceXZ(mate.pos, hoop.rimCenter) <= ALLEY_OOP_RANGE) return PASS;
    // 3. Honour the call.
    if (mate.callingForPassTicks > 0) return PASS;
  }
  // 4. Shoot: a dunk or layup at once unless contested from the air; otherwise by threshold.
  if (mine.type !== 'jumpshot') {
    const contested = opponents.some(
      (o) => !o.onGround && v3DistanceXZ(o.pos, me.pos) <= CONTESTED_AIRBORNE_RADIUS,
    );
    if (!contested) return SHOOT;
  }
  if (perceived >= profile.shootThreshold) return SHOOT;
  // 5. Pass to a better shot.
  if (mate && laneOpen) {
    const bias = profile.passBias + (memory.favourTeammate ? TEAMMATE_PASS_BIAS : 0);
    if (evaluateShot(state, mate, court).quality >= mine.quality + bias) return PASS;
  }
  // 6–7. Drive, side-step around a blocker, or reset to an open spot.
  const blocker = laneBlocker(me, hoop.rimCenter, opponents);
  memory.laneClosedCount = blocker ? memory.laneClosedCount + 1 : 0;
  if (
    blocker &&
    memory.laneClosedCount >= RESET_AFTER_CLOSED_DECISIONS &&
    state.shotClockMs > RESET_MIN_SHOT_CLOCK_MS
  ) {
    memory.laneClosedCount = 0;
    const { name, spot } = farthestSpot(
      hoop,
      opponents.map((o) => o.pos),
    );
    return { kind: 'moveTo', spot, name };
  }
  return { kind: 'drive', sideStep: blocker ? sideStepPoint(me, hoop.rimCenter, blocker) : null };
}
```

- [ ] **Step 4: Implement offball.ts**

`src/sim/ai/offball.ts`:

```ts
import { hoopGeometry, type HoopGeometry } from '../hoop';
import { v3DistanceXZ, type Vec3 } from '../math';
import { targetHoopIndex } from '../shooting';
import type { CourtDef, MatchState, PlayerState } from '../types';
import type { AiGoal, AiMemory } from './memory';
import { opponentsOf } from './offense';
import { pickOpenSpot, type NamedSpot } from './spots';

/** Spec C.5 "teammate has ball" numbers. */
export const INVITE_HANDLER_RANGE = 6;
export const INVITE_CLEAR_RADIUS = 1.5;
export const INVITE_EVERY_TICKS = 90;
export const INVITE_AT_SPOT_RADIUS = 0.8;
export const CHASE_RADIUS = 3;
/** Shot in the air: players this close to the rim move in for the rebound. */
export const REBOUND_RANGE = 5;
export const REBOUND_FROM_RIM = 1.2;

/** Pick (or keep) an open named spot around `hoop`, scored against `anchorPos` (the handler or the ball). */
export function planOffBall(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  hoop: HoopGeometry,
  anchorPos: Vec3,
): AiGoal {
  const opponents = opponentsOf(state, me).map((o) => o.pos);
  const current: NamedSpot | null =
    memory.goal.kind === 'moveTo' && memory.goal.name !== null
      ? { name: memory.goal.name, spot: memory.goal.spot }
      : null;
  const pick = pickOpenSpot(hoop, anchorPos, opponents, current);
  return { kind: 'moveTo', spot: pick.spot, name: pick.name };
}

/** Spec C.5: jump under the basket to invite the alley-oop, at most once per INVITE_EVERY_TICKS. */
export function wantsAlleyOopInvite(
  state: MatchState,
  me: PlayerState,
  handler: PlayerState,
  memory: AiMemory,
): boolean {
  if (memory.goal.kind !== 'moveTo' || memory.goal.name !== 'underBasket') return false;
  if (!me.onGround || state.tick - memory.lastInviteTick < INVITE_EVERY_TICKS) return false;
  if (v3DistanceXZ(me.pos, memory.goal.spot) > INVITE_AT_SPOT_RADIUS) return false;
  if (v3DistanceXZ(handler.pos, me.pos) > INVITE_HANDLER_RANGE) return false;
  return !opponentsOf(state, me).some((o) => v3DistanceXZ(o.pos, me.pos) <= INVITE_CLEAR_RADIUS);
}

/** Loose ball: I chase when within CHASE_RADIUS or when I am the closest of my team (ties: lower id). */
export function shouldChase(state: MatchState, me: PlayerState): boolean {
  const d = v3DistanceXZ(me.pos, state.ball.pos);
  if (d <= CHASE_RADIUS) return true;
  for (const p of state.teams[me.team].players) {
    if (p.id === me.id) continue;
    const other = v3DistanceXZ(p.pos, state.ball.pos);
    if (other < d || (other === d && p.id < me.id)) return false;
  }
  return true;
}

/** Shot in the air: move to a rebound spot REBOUND_FROM_RIM from the rim on my side, if I am near. */
export function planRebound(state: MatchState, me: PlayerState, court: CourtDef): AiGoal {
  const hoopIndex = state.ball.lastShot?.hoop ?? targetHoopIndex(state, me, court);
  const rim = hoopGeometry(court, hoopIndex).rimCenter;
  const d = v3DistanceXZ(me.pos, rim);
  if (d > REBOUND_RANGE) return { kind: 'idle' };
  const ux = d > 1e-6 ? (me.pos.x - rim.x) / d : 1;
  const uz = d > 1e-6 ? (me.pos.z - rim.z) / d : 0;
  return {
    kind: 'moveTo',
    spot: { x: rim.x + ux * REBOUND_FROM_RIM, y: 0, z: rim.z + uz * REBOUND_FROM_RIM },
    name: null,
  };
}
```

Add to `src/sim/ai/index.ts`:

```ts
export * from './offense';
export * from './offball';
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- tests/sim/ai-offense.test.ts` → PASS. If the "favours the human" case does not flip, print both qualities (`evaluateShot(s, me, court).quality` and the teammate's) and move `home1` a little closer to the rim (keep it within 0.1 of the holder's quality, so the plain bias of 0.10 still refuses the pass).

- [ ] **Step 6: Full check and commit**

Run: `npm run format && npm run check` → green.

```bash
git add src/sim/ai tests/sim/ai-offense.test.ts
git commit -m "feat(sim/ai): offense and off-ball planning — panic, alley-oop, call, shoot, pass, drive, spots, invite, chase"
```

---

### Task 3: Defence, marks and the brain entry point

**Files:**
- Create: `src/sim/ai/defense.ts`, `src/sim/ai/brain.ts`
- Modify: `src/sim/ai/index.ts`
- Test: `tests/sim/ai-defense.test.ts`

**Interfaces:**
- Consumes (Tasks 1–2): `resolveDefensivePress`, `AiMemory`, `resetAiMemory`, `AiGoal`, `AiProfile`, `steerTowards`, `wantsTurbo`, `planWithBall`, `planOffBall`, `planRebound`, `shouldChase`, `wantsAlleyOopInvite`, `opponentsOf`; (existing) `nearestOpponent` (defence.ts), `targetHoopIndex`, `hoopGeometry`, `otherTeam` (phases.ts), `isActionLocked`, `findPlayer`, `SHOT_ACTIONS`, `NO_INTENT`.
- Produces (used by Tasks 4–5):
  - `assignMarks(state, team): Map<PlayerId, PlayerId>`
  - `markPosition(markPos, rim, markHasBall): Vec3`, `MARK_GAP_WITH_BALL = 0.8`, `MARK_GAP_MIN = 0.8`, `MARK_GAP_MAX = 2.5`, `MARK_GAP_FACTOR = 0.4`, `DRIVE_SPEED = 3`
  - `planDefence(state, me, memory): AiGoal`
  - `decidePress(state, me, memory, profile, court, isDecisionTick): boolean`
  - `DECISION_INTERVAL_TICKS = 6`, `decide(state, memory, profile, court): PlayerIntent`

- [ ] **Step 1: Write the failing tests**

`tests/sim/ai-defense.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { DECISION_INTERVAL_TICKS, decide } from '../../src/sim/ai/brain';
import { assignMarks, decidePress, markPosition, planDefence } from '../../src/sim/ai/defense';
import { createAiMemory, type AiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES, type AiProfile, type AiProfileId } from '../../src/sim/ai/profile';
import { giveBall } from '../../src/sim/ball';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { startShot } from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchSettings,
  type MatchState,
  type PlayerIntent,
  type PlayerState,
  type SimEvent,
} from '../../src/sim/types';

const court = getCourt('gym');
const matchSettings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function live(seed = 1): MatchState {
  const s = createMatch({ ...matchSettings, seed }, court, roster);
  s.phase = 'live';
  s.possession = 0;
  return s;
}

function player(state: MatchState, id: string): PlayerState {
  const p = findPlayer(state, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(state: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(state, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

const rim = hoopGeometry(court, 1).rimCenter; // team 0 attacks this one; team 1 defends it
const exact: AiProfile = { ...AI_PROFILES.fair, perceptionNoise: 0 };

describe('assignMarks', () => {
  it('minimises total distance and is the same whichever brain computes it', () => {
    const s = live();
    place(s, 'home1', 2, 3);
    place(s, 'home2', 2, -3);
    place(s, 'away1', 4, -2.5);
    place(s, 'away2', 4, 2.5);
    const marks = assignMarks(s, 1);
    expect(marks.get('away1')).toBe('home2');
    expect(marks.get('away2')).toBe('home1');
    expect(assignMarks(s, 1)).toEqual(marks);
    // Independent of roster order in the state.
    s.teams[1].players.reverse();
    expect(assignMarks(s, 1)).toEqual(marks);
  });

  it('covers both teams and handles unequal sizes by doubling the nearest opponent', () => {
    const s = live();
    expect(assignMarks(s, 0).size).toBe(2);
    s.teams[0].players.pop();
    const marks = assignMarks(s, 1);
    expect(marks.size).toBe(2);
    expect(marks.get('away1')).toBe('home1');
    expect(marks.get('away2')).toBe('home1');
  });
});

describe('markPosition', () => {
  it('stands between the mark and the hoop, closer when the mark has the ball, never behind the rim', () => {
    const mark = { x: rim.x - 6, y: 0, z: 0 };
    const off = markPosition(mark, rim, false);
    expect(off.x).toBeCloseTo(mark.x + 2.4); // 0.4 · 6
    const on = markPosition(mark, rim, true);
    expect(on.x).toBeCloseTo(mark.x + 0.8);
    const far = markPosition({ x: rim.x - 12, y: 0, z: 0 }, rim, false);
    expect(far.x).toBeCloseTo(rim.x - 12 + 2.5); // capped
    const close = markPosition({ x: rim.x - 0.5, y: 0, z: 0 }, rim, false);
    expect(close.x).toBeLessThanOrEqual(rim.x);
  });
});

describe('planDefence', () => {
  it('assigns a mark once per possession and keeps it while the possession lasts', () => {
    const s = live();
    const me = player(s, 'away1');
    const m = createAiMemory('away1', 1, 0, false);
    const first = planDefence(s, me, m);
    expect(first.kind).toBe('mark');
    expect(m.marksForPossession).toBe(0);
    // Positions change but the mark stays.
    place(s, 'home1', 10, 6);
    place(s, 'home2', -10, -6);
    expect(planDefence(s, me, m)).toEqual(first);
    // New possession: re-assigned.
    s.possession = 1;
    planDefence(s, me, m);
    s.possession = 0;
    const again = planDefence(s, me, m);
    expect(m.marksForPossession).toBe(0);
    expect(again.kind).toBe('mark');
  });
});

describe('decidePress', () => {
  function stealSetup(): { s: MatchState; me: PlayerState } {
    const s = live();
    const holder = place(s, 'home1', rim.x - 6, 0);
    giveBall(s, holder, []);
    const me = place(s, 'away1', rim.x - 5.3, 0);
    me.facing = -Math.PI / 2;
    place(s, 'home2', -8, 6);
    place(s, 'away2', -8, -6);
    return { s, me };
  }

  it('never presses when the sim would do nothing or only jump', () => {
    const { s, me } = stealSetup();
    const m = createAiMemory('away1', 1, 0, false);
    me.cooldowns.steal = 10; // steal on cooldown → null
    for (let i = 0; i < 50; i++) expect(decidePress(s, me, m, AI_PROFILES.hard, court, true)).toBe(false);
    me.cooldowns.steal = 0;
    place(s, 'away1', -5, 0); // far from everyone → jump
    for (let i = 0; i < 50; i++) expect(decidePress(s, me, m, AI_PROFILES.hard, court, true)).toBe(false);
  });

  it('steals at about the profile rate, only on decision ticks', () => {
    for (const [id, rate] of [
      ['easy', 0.2],
      ['fair', 0.4],
      ['hard', 0.6],
    ] as [AiProfileId, number][]) {
      const { s, me } = stealSetup();
      const m = createAiMemory('away1', 11, 0, false);
      let presses = 0;
      for (let i = 0; i < 1000; i++) if (decidePress(s, me, m, AI_PROFILES[id], court, true)) presses++;
      // 4σ band for n = 1000; the seed is fixed, so this is deterministic.
      expect(Math.abs(presses / 1000 - rate)).toBeLessThan(0.06);
      expect(decidePress(s, me, m, AI_PROFILES.hard, court, false)).toBe(false);
    }
  });

  it('blocks a shot only once it has been visible for reactionTicks', () => {
    const { s, me } = stealSetup();
    const holder = player(s, 'home1');
    startShot(s, holder, court);
    const m = createAiMemory('away1', 1, 0, false);
    holder.actionTicks = AI_PROFILES.fair.reactionTicks - 1;
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, false)).toBe(false);
    holder.actionTicks = AI_PROFILES.fair.reactionTicks;
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, false)).toBe(true);
    // Per tick, not per decision: the block does not wait for a decision tick.
    expect(decidePress(s, me, m, AI_PROFILES.fair, court, true)).toBe(true);
  });

  it('shoves a driving mark by the profile rate, never a standing one, and only with turbo', () => {
    const s = live();
    const driver = place(s, 'home2', rim.x - 6, 0); // no ball: shove is what the press does
    place(s, 'home1', -8, 6);
    giveBall(s, player(s, 'home1'), []);
    const me = place(s, 'away1', rim.x - 5, 0);
    me.facing = -Math.PI / 2; // facing −X, towards the driver
    place(s, 'away2', -8, -6);
    const m = createAiMemory('away1', 3, 0, false);
    const always = { ...AI_PROFILES.hard, shoveRate: 1 };
    expect(decidePress(s, me, m, always, court, true)).toBe(false); // standing
    driver.vel = { x: 5, y: 0, z: 0 }; // driving at the rim
    expect(decidePress(s, me, m, always, court, true)).toBe(true);
    me.turbo = 0.1;
    expect(decidePress(s, me, m, always, court, true)).toBe(false);
    me.turbo = 1;
    expect(decidePress(s, me, m, { ...always, shoveRate: 0 }, court, true)).toBe(false);
  });
});

/** Runs the four brains against the sim. */
function playBrains(
  state: MatchState,
  ticks: number,
  profile: AiProfile,
  memories: AiMemory[],
  override?: (s: MatchState) => Map<string, PlayerIntent>,
): { state: MatchState; events: SimEvent[]; rngSeeds: number[] } {
  let s = state;
  const events: SimEvent[] = [];
  const rngSeeds: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const intents = override?.(s) ?? new Map<string, PlayerIntent>();
    for (const m of memories) {
      if (!intents.has(m.playerId)) intents.set(m.playerId, decide(s, m, profile, court));
    }
    rngSeeds.push(s.rng.seed);
    const r = tick(s, intents, court);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events, rngSeeds };
}

describe('decide (brain)', () => {
  it('fair and hard block a jump shot taken in their face; easy is too slow', () => {
    for (const [id, blocked] of [
      ['easy', false],
      ['fair', true],
      ['hard', true],
    ] as [AiProfileId, boolean][]) {
      const s = live();
      const shooter = place(s, 'home1', rim.x - 5, 0);
      giveBall(s, shooter, []);
      place(s, 'away1', rim.x - 4.2, 0);
      place(s, 'home2', -8, 6);
      place(s, 'away2', -8, -6);
      const defender = createAiMemory('away1', 1, 0, false);
      const { events } = playBrains(
        s,
        40,
        { ...AI_PROFILES[id], perceptionNoise: 0 },
        [defender],
        (st) => new Map([['home1', { ...NO_INTENT, action: st.tick === 0 }]]),
      );
      expect(events.some((e) => e.type === 'block')).toBe(blocked);
    }
  });

  it('plans every 6 ticks at its offset, steers every tick, presses for one tick only', () => {
    const s = live();
    const me = place(s, 'home1', rim.x - 2.2, 0);
    giveBall(s, me, []);
    place(s, 'home2', -8, 6);
    place(s, 'away1', -8, -6);
    place(s, 'away2', -8, 0);
    const m = createAiMemory('home1', 1, 2, false);
    s.tick = 0;
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT); // before the offset: idle goal
    s.tick = 2;
    const first = decide(s, m, exact, court);
    expect(m.goal).toEqual({ kind: 'shoot' });
    expect(first.action).toBe(true);
    expect(m.nextDecisionTick).toBe(2 + DECISION_INTERVAL_TICKS);
    s.tick = 3;
    expect(decide(s, m, exact, court).action).toBe(false); // forced release
    s.tick = 4;
    expect(decide(s, m, exact, court).action).toBe(true); // still wants to shoot (the sim would have locked it)
  });

  it('is silent when not live, when action-locked and when airborne', () => {
    const s = live();
    const me = player(s, 'home1');
    const m = createAiMemory('home1', 1, 0, false);
    s.phase = 'scored';
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT);
    s.phase = 'live';
    me.action = 'shoot';
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT);
    me.action = 'idle';
    me.onGround = false;
    expect(decide(s, m, exact, court)).toEqual(NO_INTENT);
  });

  it('resets its memory on the phase change to inbound and tipoff, keeping the RNG', () => {
    const s = live();
    const m = createAiMemory('away1', 1, 1, false);
    m.lastPhase = 'live';
    m.goal = { kind: 'chase' };
    m.markId = 'home1';
    const seed = m.rng.seed;
    s.phase = 'inbound';
    s.tick = 300;
    decide(s, m, exact, court);
    expect(m.goal).toEqual({ kind: 'idle' });
    expect(m.markId).toBeNull();
    expect(m.nextDecisionTick).toBe(301);
    expect(m.rng.seed).toBe(seed);
    expect(m.lastPhase).toBe('inbound');
  });

  it('never touches the simulation RNG', () => {
    const s = live();
    const memories = roster.map((e, i) => createAiMemory(e.id, 1, i, e.id === 'home2'));
    const before = s.rng.seed;
    for (let t = 0; t < 120; t++) {
      s.tick = t;
      for (const m of memories) decide(s, m, AI_PROFILES.fair, court);
    }
    expect(s.rng.seed).toBe(before);
  });

  it('four brains play 20 seconds of a match without anyone standing still the whole time', () => {
    const s = createMatch({ ...matchSettings, seed: 4 }, court, roster);
    const memories = roster.map((e, i) => createAiMemory(e.id, 4, i, e.id === 'home2'));
    const start = structuredClone(s);
    const { state, events } = playBrains(s, 1200, AI_PROFILES.fair, memories);
    for (const e of roster) {
      const a = player(start, e.id).pos;
      const b = player(state, e.id).pos;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.5);
    }
    expect(events.some((e) => e.type === 'shotReleased' || e.type === 'pass')).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- tests/sim/ai-defense.test.ts`
Expected: FAIL — `src/sim/ai/defense` and `src/sim/ai/brain` do not exist.

- [ ] **Step 3: Implement defense.ts**

`src/sim/ai/defense.ts`:

```ts
import { nearestOpponent, resolveDefensivePress } from '../defence';
import { hoopGeometry } from '../hoop';
import { clamp, v3DistanceXZ, type Vec3 } from '../math';
import { findPlayer } from '../match';
import { otherTeam } from '../phases';
import { nextFloat } from '../rng';
import { targetHoopIndex } from '../shooting';
import { SHOT_ACTIONS } from '../types';
import type { CourtDef, MatchState, PlayerId, PlayerState, TeamIndex } from '../types';
import type { AiGoal, AiMemory } from './memory';
import type { AiProfile } from './profile';

/** Spec C.5 "defending" numbers. */
export const MARK_GAP_WITH_BALL = 0.8;
export const MARK_GAP_MIN = 0.8;
export const MARK_GAP_MAX = 2.5;
export const MARK_GAP_FACTOR = 0.4;
/** A mark moving towards the rim faster than this is "driving" (shove candidate). */
export const DRIVE_SPEED = 3;
/** Permutation search up to this many defenders; greedy beyond. */
const PERMUTATION_LIMIT = 3;

function byId(a: PlayerState, b: PlayerState): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Spec C.5: defender → opponent, a deterministic function of the state (ids sorted), so every
 * brain on the team computes the same answer. Minimum total distance over permutations for up
 * to PERMUTATION_LIMIT defenders, greedy nearest-unassigned beyond; extra defenders (unequal
 * teams) double the nearest opponent. Ties keep the first permutation in sorted order.
 */
export function assignMarks(state: MatchState, team: TeamIndex): Map<PlayerId, PlayerId> {
  const defenders = [...state.teams[team].players].sort(byId);
  const opponents = [...state.teams[otherTeam(team)].players].sort(byId);
  const marks = new Map<PlayerId, PlayerId>();
  if (defenders.length === 0 || opponents.length === 0) return marks;
  const n = Math.min(defenders.length, opponents.length);
  const dist = (d: number, o: number): number => v3DistanceXZ(defenders[d].pos, opponents[o].pos);

  let best: number[] | null = null;
  if (defenders.length <= PERMUTATION_LIMIT) {
    let bestCost = Infinity;
    const used = new Array<boolean>(opponents.length).fill(false);
    const current: number[] = [];
    const search = (d: number, cost: number): void => {
      if (d === n) {
        if (cost < bestCost) {
          bestCost = cost;
          best = [...current];
        }
        return;
      }
      for (let o = 0; o < opponents.length; o++) {
        if (used[o]) continue;
        used[o] = true;
        current.push(o);
        search(d + 1, cost + dist(d, o));
        current.pop();
        used[o] = false;
      }
    };
    search(0, 0);
  } else {
    const used = new Array<boolean>(opponents.length).fill(false);
    best = [];
    for (let d = 0; d < n; d++) {
      let pick = -1;
      for (let o = 0; o < opponents.length; o++) {
        if (!used[o] && (pick === -1 || dist(d, o) < dist(d, pick))) pick = o;
      }
      used[pick] = true;
      best.push(pick);
    }
  }
  const assignment = best ?? [];
  for (let d = 0; d < defenders.length; d++) {
    if (d < n) {
      marks.set(defenders[d].id, opponents[assignment[d]].id);
    } else {
      let pick = 0;
      for (let o = 1; o < opponents.length; o++) if (dist(d, o) < dist(d, pick)) pick = o;
      marks.set(defenders[d].id, opponents[pick].id);
    }
  }
  return marks;
}

/** Spec C.5: on the segment mark→rim, `clamp(0.4·d, 0.8, 2.5)` from the mark (0.8 with the ball). */
export function markPosition(markPos: Vec3, rim: Vec3, markHasBall: boolean): Vec3 {
  const d = v3DistanceXZ(markPos, rim);
  let gap = markHasBall ? MARK_GAP_WITH_BALL : clamp(MARK_GAP_FACTOR * d, MARK_GAP_MIN, MARK_GAP_MAX);
  gap = Math.min(gap, d); // never past the rim
  if (d < 1e-6) return { x: rim.x, y: 0, z: rim.z };
  return {
    x: markPos.x + ((rim.x - markPos.x) / d) * gap,
    y: 0,
    z: markPos.z + ((rim.z - markPos.z) / d) * gap,
  };
}

/** Marks are assigned once per possession (spec C.5) and remembered. */
export function planDefence(state: MatchState, me: PlayerState, memory: AiMemory): AiGoal {
  if (memory.markId === null || memory.marksForPossession !== state.possession) {
    memory.markId = assignMarks(state, me.team).get(me.id) ?? null;
    memory.marksForPossession = state.possession;
  }
  return memory.markId === null ? { kind: 'idle' } : { kind: 'mark', markId: memory.markId };
}

function isDriving(player: PlayerState, rim: Vec3): boolean {
  const dx = rim.x - player.pos.x;
  const dz = rim.z - player.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  return (player.vel.x * dx + player.vel.z * dz) / len > DRIVE_SPEED;
}

/**
 * Spec C.5: press the action button only when the sim would do what I intend. Blocks are checked
 * every tick (after `reactionTicks` of the shot); steals and shoves roll on decision ticks only.
 * RNG draw order: at most one draw per decision tick, for the move that is on.
 */
export function decidePress(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
  isDecisionTick: boolean,
): boolean {
  const press = resolveDefensivePress(state, me, court);
  if (press === null || press === 'jump') return false;
  if (press === 'block') {
    const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
    if (!holder || !SHOT_ACTIONS.has(holder.action)) return false; // a near-hoop holder is not worth a jump
    return holder.actionTicks >= profile.reactionTicks;
  }
  if (!isDecisionTick) return false;
  if (press === 'steal') return nextFloat(memory.rng) < profile.stealRate;
  // shove
  const target = nearestOpponent(state, me);
  if (!target) return false;
  const rim = hoopGeometry(court, targetHoopIndex(state, target, court)).rimCenter;
  if (!isDriving(target, rim) || me.turbo < profile.turboThreshold) return false;
  return nextFloat(memory.rng) < profile.shoveRate;
}
```

- [ ] **Step 4: Implement brain.ts**

`src/sim/ai/brain.ts`:

```ts
import { nearestOpponent } from '../defence';
import { hoopGeometry } from '../hoop';
import { v3DistanceXZ } from '../math';
import { findPlayer } from '../match';
import { isActionLocked } from '../player-movement';
import { targetHoopIndex } from '../shooting';
import { NO_INTENT } from '../types';
import type { CourtDef, MatchState, PlayerIntent, PlayerState } from '../types';
import { decidePress, markPosition, planDefence } from './defense';
import { resetAiMemory, type AiGoal, type AiMemory } from './memory';
import { planOffBall, planRebound, shouldChase, wantsAlleyOopInvite } from './offball';
import { planWithBall } from './offense';
import type { AiProfile } from './profile';
import { steerTowards, wantsTurbo } from './steering';

/** Spec §6 / C.2: re-plan at 10 Hz, steer every tick. */
export const DECISION_INTERVAL_TICKS = 6;
const CHASE_ARRIVE_RADIUS = 0.1;
const DRIVE_ARRIVE_RADIUS = 0.2;

/**
 * Spec C.2: the AI's single entry point. Pure over (state, memory): reads the state, mutates only
 * `memory`, never `state` or `state.rng`. Returns this tick's intent for `memory.playerId`.
 */
export function decide(
  state: MatchState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
): PlayerIntent {
  const me = findPlayer(state, memory.playerId);
  if (!me) return NO_INTENT;
  if (state.phase !== memory.lastPhase) {
    if (state.phase === 'inbound' || state.phase === 'tipoff') resetAiMemory(memory, state.tick);
    memory.lastPhase = state.phase;
  }
  if (state.phase !== 'live' || isActionLocked(me) || !me.onGround) return finish(memory, NO_INTENT);

  const isDecisionTick = state.tick >= memory.nextDecisionTick;
  if (isDecisionTick) {
    memory.goal = plan(state, me, memory, profile, court);
    memory.nextDecisionTick = state.tick + DECISION_INTERVAL_TICKS;
  }
  return finish(memory, act(state, me, memory, profile, court, isDecisionTick));
}

/** One-tick presses: a button emitted last tick is forced off this tick (spec C.2). */
function finish(memory: AiMemory, intent: PlayerIntent): PlayerIntent {
  const out: PlayerIntent = {
    ...intent,
    action: intent.action && !memory.pressedLastTick,
    pass: intent.pass && !memory.passedLastTick,
  };
  memory.pressedLastTick = out.action;
  memory.passedLastTick = out.pass;
  return out;
}

function plan(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
): AiGoal {
  const { ball } = state;
  const myHoop = hoopGeometry(court, targetHoopIndex(state, me, court));
  if (ball.holder === me.id) return planWithBall(state, me, memory, profile, court);
  const holder = ball.holder === null ? undefined : findPlayer(state, ball.holder);
  if (holder) {
    return holder.team === me.team
      ? planOffBall(state, me, memory, myHoop, holder.pos)
      : planDefence(state, me, memory);
  }
  if (ball.mode === 'flight' && ball.flight) {
    if (ball.flight.kind === 'shot') return planRebound(state, me, court);
    if (ball.flight.receiver === me.id) return { kind: 'idle' }; // plant the feet for the catch
    if (ball.flight.team !== me.team) return planDefence(state, me, memory);
    const receiver = ball.flight.receiver === null ? undefined : findPlayer(state, ball.flight.receiver);
    return planOffBall(state, me, memory, myHoop, receiver?.pos ?? ball.pos);
  }
  // Loose ball.
  if (shouldChase(state, me)) return { kind: 'chase' };
  return state.possession === null || state.possession === me.team
    ? planOffBall(state, me, memory, myHoop, ball.pos)
    : planDefence(state, me, memory);
}

function act(
  state: MatchState,
  me: PlayerState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
  isDecisionTick: boolean,
): PlayerIntent {
  const goal = memory.goal;
  switch (goal.kind) {
    case 'idle':
      return NO_INTENT;
    case 'shoot':
      return state.ball.holder === me.id ? { ...NO_INTENT, action: true } : NO_INTENT;
    case 'pass':
      return state.ball.holder === me.id ? { ...NO_INTENT, pass: true } : NO_INTENT;
    case 'drive': {
      if (state.ball.holder !== me.id) return NO_INTENT;
      const rim = hoopGeometry(court, targetHoopIndex(state, me, court)).rimCenter;
      const target = goal.sideStep ?? rim;
      return {
        ...NO_INTENT,
        move: steerTowards(me.pos, target, DRIVE_ARRIVE_RADIUS),
        turbo: goal.sideStep === null && wantsTurbo(me, v3DistanceXZ(me.pos, rim), profile),
      };
    }
    case 'moveTo': {
      const holder = state.ball.holder === null ? undefined : findPlayer(state, state.ball.holder);
      const invite =
        holder !== undefined &&
        holder.team === me.team &&
        holder.id !== me.id &&
        wantsAlleyOopInvite(state, me, holder, memory);
      if (invite) memory.lastInviteTick = state.tick;
      return { ...NO_INTENT, move: steerTowards(me.pos, goal.spot), action: invite };
    }
    case 'chase': {
      const d = v3DistanceXZ(me.pos, state.ball.pos);
      return {
        ...NO_INTENT,
        move: steerTowards(me.pos, state.ball.pos, CHASE_ARRIVE_RADIUS),
        turbo: wantsTurbo(me, d, profile),
      };
    }
    case 'mark': {
      const mark = findPlayer(state, goal.markId) ?? nearestOpponent(state, me);
      if (!mark) return NO_INTENT;
      const rim = hoopGeometry(court, targetHoopIndex(state, mark, court)).rimCenter;
      const target = markPosition(mark.pos, rim, state.ball.holder === mark.id);
      const d = v3DistanceXZ(me.pos, target);
      return {
        ...NO_INTENT,
        move: steerTowards(me.pos, target),
        turbo: wantsTurbo(me, d, profile),
        action: decidePress(state, me, memory, profile, court, isDecisionTick),
      };
    }
  }
}
```

Add to `src/sim/ai/index.ts`:

```ts
export * from './defense';
export * from './brain';
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- tests/sim/ai-defense.test.ts` → PASS.

If "fair and hard block a jump shot" fails for `fair`: the defender is 0.8 m from the shooter and must be rising with its hand (feet + 2.6 m) at or above the release height at tick 27; check that `decidePress` sees `holder.actionTicks` reach 15 (the press is emitted at the tick the shooter's `actionTicks === 15`) and that the defender is not stuck behind `isActionLocked` from an earlier press. Do not loosen the block window in the sim; adjust only the test geometry (defender within `blockReach`).

- [ ] **Step 6: Full check and commit**

Run: `npm run format && npm run check` → green. The `determinism.test.ts` hashes are unchanged by this task (no sim change).

```bash
git add src/sim/ai tests/sim/ai-defense.test.ts
git commit -m "feat(sim/ai): defence (marks, press gating, reaction window) and the decide() brain"
```

---

### Task 4: Match mode in the app — formation, URL options, AI controllers, restart, final banner

**Files:**
- Modify: `src/sim/phases.ts` (formation at inbound and tip-off)
- Create: `src/app/controller.ts`, `src/app/ai-controller.ts`, `src/app/url-options.ts`
- Modify: `src/app/dummies.ts` (import the `Controller` type), `src/app.ts` (rewrite), `src/main.ts`
- Modify: `src/ui/hud.ts`, `src/ui/hud.css`, `src/ui/debug-overlay.ts`
- Modify: `README.md`
- Test: `tests/sim/formation.test.ts` (new), `tests/app/url-options.test.ts` (new), `tests/app/ai-controller.test.ts` (new), `tests/ui/hud.test.ts` (modify), `tests/sim/determinism.test.ts` (re-pin)

**Interfaces:**
- Consumes (Tasks 1–3): `decide`, `createAiMemory`, `AiMemory`, `AiProfile`, `AI_PROFILES`, `DEFAULT_AI_PROFILE_ID`, `isAiProfileId`, `AiProfileId`; (existing) `inboundPosition`, `otherTeam`, `attackingHoopIndex`, `hoopGeometry`, `giveBall`, `buttonsOf`, `justPressed`, `NO_BUTTONS`, `createMatch`, `RosterEntry`, `characters`, `DEFAULT_CHARACTER_ID`, `getCharacter`.
- Produces (used by Task 5 and the app):
  - `placeFormation(state, court, team): void` (sim)
  - `Controller` type in `src/app/controller.ts`
  - `createAiController(id, court, { profile, seed, offset, favourTeammate }): { id, memory, controller }`
  - `readGameOptions(search, now): GameOptions` with `{ mode, characterId, teammateId, opponentIds: [string, string], aiProfile, seed, debug }`, `DEFAULT_TEAMMATE_ID = 'ace'`, `DEFAULT_OPPONENT_IDS = ['brick', 'dash']`, `SHOOTAROUND_SEED = 1`
  - `buildRoster(options)`, `buildSettings(options, court, seed)`, `buildSession(options, court, seed, human)` exported from `src/app.ts`
  - `Hud(parent, humanTeam = 0)`, `finalBanner(state, humanTeam): string`; `bannerFor(phaseChange)` now returns `null`
  - `DebugData.ai: string[]`

- [ ] **Step 1: Formation — failing tests**

`tests/sim/formation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { allPlayers, createMatch, findPlayer } from '../../src/sim/match';
import { inbound, inboundPosition, placeFormation } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState, SimEvent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'placeholder' },
  { id: 'home2', team: 0 as const, characterId: 'placeholder' },
  { id: 'away1', team: 1 as const, characterId: 'placeholder' },
  { id: 'away2', team: 1 as const, characterId: 'placeholder' },
];

function scattered(mode: MatchSettings['mode'] = 'match'): MatchState {
  const s = createMatch({ ...settings, mode }, court, roster);
  s.phase = 'live';
  let i = 0;
  for (const p of allPlayers(s)) {
    p.pos = { x: 3 - i * 2, y: 0, z: 1 + i };
    p.action = 'run';
    i++;
  }
  return s;
}

describe('formation (spec C.6)', () => {
  it('places the receiver at the baseline, the teammate on the wing and the defenders at the key', () => {
    const s = scattered();
    placeFormation(s, court, 1);
    const away1 = findPlayer(s, 'away1')!;
    const away2 = findPlayer(s, 'away2')!;
    const home1 = findPlayer(s, 'home1')!;
    const home2 = findPlayer(s, 'home2')!;
    expect(away1.pos).toEqual(inboundPosition(court, 1));
    expect(away2.pos.x).toBeCloseTo(court.playArea.length / 4);
    expect(Math.abs(away2.pos.z)).toBeCloseTo(4);
    // Team 1 attacks hoop 0 (−X): the defenders stand at the top of its key.
    for (const d of [home1, home2]) {
      expect(d.pos.x).toBeCloseTo(court.hoops[0].pos.x + 5.8);
      expect(Math.abs(d.pos.z)).toBeCloseTo(1.5);
      expect(d.action).toBe('idle');
    }
    expect(home1.pos.z).not.toBeCloseTo(home2.pos.z);
  });

  it('a match inbound uses the formation and hands the receiver the ball', () => {
    const s = scattered();
    s.pendingInbound = 0;
    s.phase = 'inbound';
    const events: SimEvent[] = [];
    inbound(s, court, events);
    expect(s.ball.holder).toBe('home1');
    expect(findPlayer(s, 'home1')!.pos).toEqual(inboundPosition(court, 0));
    expect(findPlayer(s, 'away1')!.pos.x).toBeCloseTo(court.hoops[1].pos.x - 5.8);
    expect(s.phase).toBe('live');
  });

  it('a shootaround inbound moves only the receiver (B.1 unchanged)', () => {
    const s = scattered('shootaround');
    const before = structuredClone(findPlayer(s, 'away1')!.pos);
    s.pendingInbound = 0;
    s.phase = 'inbound';
    inbound(s, court, []);
    expect(findPlayer(s, 'away1')!.pos).toEqual(before);
    expect(s.ball.holder).toBe('home1');
  });

  it('a match tip-off starts everyone in formation', () => {
    const s = tick(createMatch(settings, court, roster), new Map(), court).state;
    expect(s.phase).toBe('live');
    const holder = findPlayer(s, s.ball.holder ?? '')!;
    expect(Math.abs(holder.pos.x)).toBeCloseTo(court.playArea.length / 2 - 1.5);
    for (const p of allPlayers(s)) expect([0, 4, 1.5]).toContain(Math.abs(Math.round(p.pos.z * 10) / 10));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- tests/sim/formation.test.ts`
Expected: FAIL — `placeFormation` is not exported.

- [ ] **Step 3: Implement the formation in `src/sim/phases.ts`**

Change the hoop import to `import { attackingHoopIndex, hoopGeometry } from './hoop';` and add after `shootaroundPosition`:

```ts
const FORMATION_WING_SIDE = 4;
/** Top of the key: 5.8 m from the rim towards centre court. */
const FORMATION_KEY_BACK = 5.8;
const FORMATION_KEY_SIDE = 1.5;

/**
 * Spec C.6 (match mode): a possession starts in formation — the receiver at their baseline,
 * their teammates on the own-half wings, the defenders at the top of the key of the hoop they
 * defend (the one `team` attacks). Resets actions; does not touch the ball.
 */
export function placeFormation(state: MatchState, court: CourtDef, team: TeamIndex): void {
  const side = team === 0 ? -1 : 1;
  const defended = hoopGeometry(court, attackingHoopIndex(court, team));
  state.teams[team].players.forEach((p, i) => {
    const pos =
      i === 0
        ? inboundPosition(court, team)
        : {
            x: side * (court.playArea.length / 4 + Math.floor((i - 1) / 2) * 2),
            y: 0,
            z: (i % 2 === 1 ? 1 : -1) * FORMATION_WING_SIDE,
          };
    resetForInbound(p, pos);
  });
  state.teams[otherTeam(team)].players.forEach((p, i) => {
    resetForInbound(p, {
      x: defended.rimCenter.x - defended.side * FORMATION_KEY_BACK,
      y: 0,
      z: (i % 2 === 0 ? -1 : 1) * FORMATION_KEY_SIDE * (Math.floor(i / 2) + 1),
    });
  });
}
```

Replace the body of the `if (receiver)` branch in `inbound()`:

```ts
  if (receiver) {
    if (state.settings.mode === 'shootaround') {
      // Back to the top of the key of the hoop the ball is under (the one just scored on).
      resetForInbound(receiver, shootaroundPosition(court, hoopNearest(court, state.ball.pos)));
    } else {
      placeFormation(state, court, team);
    }
    giveBall(state, receiver, events);
  } else {
```

In `handleTipoff`, before `if (receiver) giveBall(...)`, add:

```ts
  if (state.settings.mode === 'match') placeFormation(state, court, team);
```

- [ ] **Step 4: Run formation tests, then re-pin the goldens**

Run: `npm test -- tests/sim/formation.test.ts` → PASS.
Run: `npm test -- tests/sim/determinism.test.ts` → the three pinned hashes FAIL (match-mode runs now start and inbound in formation). Run `npx vitest run tests/sim/determinism.test.ts -u`, then `npm test -- tests/sim/determinism.test.ts` without `-u` → PASS. Record old → new hashes in the commit message and on the PR. The 2v2 run must still produce `pass`, `steal|stealFailed`, `shove`, `block|intercept` events; if one disappears because the scripted players now start elsewhere, change only the script's constants in the test (e.g. the press cadence), never the sim.
Run: `npm test` → everything else still green (the dummies tests run in shootaround and are unaffected).

- [ ] **Step 5: Commit the sim change**

```bash
git add src/sim/phases.ts tests/sim/formation.test.ts tests/sim/determinism.test.ts
git commit -m "feat(sim): inbound and tip-off formation in match mode (spec C.6); re-pin goldens <old>→<new>"
```

- [ ] **Step 6: URL options — failing test**

`tests/app/url-options.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readGameOptions } from '../../src/app/url-options';

describe('readGameOptions (spec C.1)', () => {
  it('defaults to a fair 2v2 match seeded from the clock', () => {
    const o = readGameOptions('', 123_456);
    expect(o).toEqual({
      mode: 'match',
      characterId: 'rook',
      teammateId: 'ace',
      opponentIds: ['brick', 'dash'],
      aiProfile: 'fair',
      seed: 123_456,
      debug: false,
    });
  });

  it('reads every parameter and ignores unknown ids', () => {
    const o = readGameOptions(
      '?mode=match&character=dash&teammate=brick&opponents=ace,rook&ai=hard&seed=42&debug',
      0,
    );
    expect(o).toMatchObject({
      characterId: 'dash',
      teammateId: 'brick',
      opponentIds: ['ace', 'rook'],
      aiProfile: 'hard',
      seed: 42,
      debug: true,
    });
    const bad = readGameOptions('?character=zorg&teammate=nope&opponents=x&ai=brutal&seed=-3', 9);
    expect(bad).toMatchObject({
      characterId: 'rook',
      teammateId: 'ace',
      opponentIds: ['brick', 'dash'],
      aiProfile: 'fair',
      seed: 9,
    });
  });

  it('shootaround keeps the fixed seed unless one is given', () => {
    expect(readGameOptions('?mode=shootaround', 777).seed).toBe(1);
    expect(readGameOptions('?mode=shootaround&seed=5', 777).seed).toBe(5);
    expect(readGameOptions('?mode=shootaround', 777).mode).toBe('shootaround');
    expect(readGameOptions('?mode=bogus', 777).mode).toBe('match');
  });
});
```

- [ ] **Step 7: Implement `src/app/url-options.ts`**

```ts
import { characters, DEFAULT_CHARACTER_ID } from '../content/characters';
import { DEFAULT_AI_PROFILE_ID, isAiProfileId, type AiProfileId } from '../sim/ai/profile';
import type { MatchMode } from '../sim/types';

/** Everything the menus will choose in phase 6, read from the query string for now (spec C.1). */
export interface GameOptions {
  mode: MatchMode;
  characterId: string;
  teammateId: string;
  opponentIds: [string, string];
  aiProfile: AiProfileId;
  seed: number;
  debug: boolean;
}

export const DEFAULT_TEAMMATE_ID = 'ace';
export const DEFAULT_OPPONENT_IDS: readonly [string, string] = ['brick', 'dash'];
/** Shootaround stays reproducible run to run, as in Phase 3. */
export const SHOOTAROUND_SEED = 1;

function characterOr(value: string | null | undefined, fallback: string): string {
  return value && characters.some((c) => c.id === value) ? value : fallback;
}

/** `now` (ms) seeds a match when `?seed=` is absent, so every game is different. */
export function readGameOptions(search: string, now: number): GameOptions {
  const params = new URLSearchParams(search);
  const mode: MatchMode = params.get('mode') === 'shootaround' ? 'shootaround' : 'match';
  const requested = (params.get('opponents') ?? '').split(',');
  const ai = params.get('ai');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed =
    Number.isFinite(seedParam) && seedParam >= 0
      ? seedParam
      : mode === 'match'
        ? now >>> 0
        : SHOOTAROUND_SEED;
  return {
    mode,
    characterId: characterOr(params.get('character'), DEFAULT_CHARACTER_ID),
    teammateId: characterOr(params.get('teammate'), DEFAULT_TEAMMATE_ID),
    opponentIds: [
      characterOr(requested[0], DEFAULT_OPPONENT_IDS[0]),
      characterOr(requested[1], DEFAULT_OPPONENT_IDS[1]),
    ],
    aiProfile: ai !== null && isAiProfileId(ai) ? ai : DEFAULT_AI_PROFILE_ID,
    seed,
    debug: params.has('debug'),
  };
}
```

Run: `npm test -- tests/app/url-options.test.ts` → PASS.

- [ ] **Step 8: Controller type and AI controller — failing test**

`tests/app/ai-controller.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createAiController } from '../../src/app/ai-controller';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchState, PlayerIntent } from '../../src/sim/types';

const court = getCourt('gym');
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function match(seed: number): MatchState {
  return createMatch(
    { durationMs: 180_000, shotClockMs: 14_000, seed, ruleIds: ['shotClock'], courtId: 'gym', mode: 'match' },
    court,
    roster,
  );
}

describe('createAiController', () => {
  it('drives a player through the Controller signature and exposes its goal for the overlay', () => {
    const ai = createAiController('away1', court, {
      profile: AI_PROFILES.fair,
      seed: 3,
      offset: 2,
      favourTeammate: false,
    });
    let s = match(3);
    for (let i = 0; i < 120; i++) {
      s = tick(s, new Map<string, PlayerIntent>([['away1', ai.controller(s)]]), court).state;
    }
    expect(ai.id).toBe('away1');
    expect(ai.memory.playerId).toBe('away1');
    expect(ai.memory.goal.kind).not.toBe('idle');
  });

  it('two controllers with the same seed produce the same intents; a different seed differs eventually', () => {
    const make = (seed: number) =>
      createAiController('home2', court, { profile: AI_PROFILES.fair, seed, offset: 1, favourTeammate: true });
    const a = make(5);
    const b = make(5);
    const c = make(6);
    let sa = match(5);
    let sb = match(5);
    let sc = match(6);
    let differed = false;
    for (let i = 0; i < 600; i++) {
      const ia = a.controller(sa);
      const ib = b.controller(sb);
      const ic = c.controller(sc);
      expect(ia).toEqual(ib);
      if (JSON.stringify(ia) !== JSON.stringify(ic)) differed = true;
      sa = tick(sa, new Map([['home2', ia]]), court).state;
      sb = tick(sb, new Map([['home2', ib]]), court).state;
      sc = tick(sc, new Map([['home2', ic]]), court).state;
    }
    expect(differed).toBe(true);
  });
});
```

- [ ] **Step 9: Implement the controller modules**

`src/app/controller.ts`:

```ts
import type { MatchState, PlayerIntent } from '../sim/types';

/** One intent per tick from the match state. Humans wrap InputManager; AI brains and dummies implement it too. */
export type Controller = (state: MatchState) => PlayerIntent;
```

In `src/app/dummies.ts` delete the `Controller` type definition and its doc comment, and add `import type { Controller } from './controller';`.

`src/app/ai-controller.ts`:

```ts
import { decide } from '../sim/ai/brain';
import { createAiMemory, type AiMemory } from '../sim/ai/memory';
import type { AiProfile } from '../sim/ai/profile';
import type { CourtDef, PlayerId } from '../sim/types';
import type { Controller } from './controller';

export interface AiControllerOptions {
  profile: AiProfile;
  /** The match seed; the brain derives its own stream from it and the player id (spec C.2). */
  seed: number;
  /** Decision cadence offset, 0..5. */
  offset: number;
  favourTeammate: boolean;
}

export interface AiController {
  readonly id: PlayerId;
  /** Exposed read-only for the `?debug` overlay (goal.kind). */
  readonly memory: AiMemory;
  readonly controller: Controller;
}

/** Wraps the pure brain as a Controller; all state lives in `memory`. */
export function createAiController(
  id: PlayerId,
  court: CourtDef,
  options: AiControllerOptions,
): AiController {
  const memory = createAiMemory(id, options.seed, options.offset, options.favourTeammate);
  return { id, memory, controller: (state) => decide(state, memory, options.profile, court) };
}
```

Run: `npm test -- tests/app/ai-controller.test.ts tests/app/dummies.test.ts` → PASS.

- [ ] **Step 10: HUD — failing tests**

In `tests/ui/hud.test.ts`: change line 40 to `expect(bannerFor({ type: 'phaseChange', from: 'live', to: 'finished' })).toBeNull();` and append inside `describe('Hud')`:

```ts
  it('shows a sticky final banner with the result for the human team', () => {
    const state = createMatch(settings, court, []);
    state.score = [21, 18];
    state.phase = 'finished';
    hud.update(state);
    hud.tick(5);
    const banner = parent.querySelector<HTMLElement>('.hud-banner')!;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('FINAL 21–18 · YOU WIN!');
    expect(banner.classList.contains('is-final')).toBe(true);
    state.score = [18, 21];
    hud.update(state);
    expect(banner.textContent).toBe('FINAL 18–21 · YOU LOSE');
    // A restart (new match in tipoff) clears it.
    hud.update(createMatch(settings, court, []));
    expect(banner.hidden).toBe(true);
    expect(banner.classList.contains('is-final')).toBe(false);
  });

  it('announces overtime once when sudden death starts', () => {
    const state = createMatch(settings, court, []);
    state.overtime = true;
    hud.update(state);
    hud.update(state);
    hud.tick(0);
    expect(text('.hud-banner')).toBe('OVERTIME!');
    hud.tick(1.3);
    expect(parent.querySelector<HTMLElement>('.hud-banner')?.hidden).toBe(true);
  });

  it('writes the DOM only when a value changes', () => {
    const state = createMatch(settings, court, []);
    hud.update(state);
    const home = parent.querySelector<HTMLElement>('.hud-home')!;
    let writes = 0;
    const original = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
    Object.defineProperty(home, 'textContent', {
      set(v: string) {
        writes++;
        original.set!.call(this, v);
      },
      get() {
        return original.get!.call(this) as string;
      },
      configurable: true,
    });
    hud.update(state);
    hud.update(state);
    expect(writes).toBe(0);
    state.score = [1, 0];
    hud.update(state);
    expect(writes).toBe(1);
  });
```

Also update `bannerFor`'s test description if it lists FINAL.

- [ ] **Step 11: Implement the HUD changes**

`src/ui/hud.ts`:

```ts
import type { MatchState, SimEvent, TeamIndex } from '../sim/types';
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
    case 'block':
      return 'BLOCKED!';
    case 'steal':
      return 'STEAL!';
    case 'intercept':
      return 'INTERCEPTED!';
    case 'alleyOop':
      return 'ALLEY-OOP!';
    default:
      return null; // the final is a sticky banner built from the state (spec C.6)
  }
}

/** Spec C.6: `FINAL 21–18 · YOU WIN!` from the human team's point of view. */
export function finalBanner(state: MatchState, humanTeam: TeamIndex): string {
  const [home, away] = state.score;
  const won = state.score[humanTeam] > state.score[humanTeam === 0 ? 1 : 0];
  return `FINAL ${home}–${away} · ${won ? 'YOU WIN!' : 'YOU LOSE'}`;
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
  private wasOvertime = false;
  private final = false;
  /** Last text written per element, so a frame with no change writes nothing to the DOM. */
  private readonly written = new Map<HTMLElement, string>();

  constructor(
    parent: HTMLElement,
    private readonly humanTeam: TeamIndex = 0,
  ) {
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

  private setText(el: HTMLElement, text: string): void {
    if (this.written.get(el) === text) return;
    el.textContent = text;
    this.written.set(el, text);
  }

  update(state: MatchState): void {
    this.setText(this.home, String(state.score[0]));
    this.setText(this.away, String(state.score[1]));
    const hideClock = state.settings.mode === 'shootaround';
    if (this.clock.hidden !== hideClock) this.clock.hidden = hideClock;
    this.setText(this.clock, state.overtime ? 'OT' : formatClock(state.clockMs));
    this.setText(this.shotClock, String(Math.ceil(state.shotClockMs / 1000)));
    this.shotClock.classList.toggle('is-low', state.shotClockMs <= 5000);

    if (state.overtime && !this.wasOvertime) this.queue.push('OVERTIME!');
    this.wasOvertime = state.overtime;

    const final = state.phase === 'finished';
    if (final) {
      this.setText(this.banner, finalBanner(state, this.humanTeam));
      this.banner.classList.add('is-final');
      this.banner.hidden = false;
    } else if (this.final) {
      // A new match started: drop the sticky banner and any stale queue.
      this.banner.classList.remove('is-final');
      this.banner.hidden = true;
      this.written.delete(this.banner);
      this.queue.length = 0;
      this.bannerLeft = 0;
    }
    this.final = final;
  }

  handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      const text = bannerFor(event);
      if (text) this.queue.push(text);
    }
  }

  tick(dtSeconds: number): void {
    if (this.final) return;
    this.bannerLeft -= dtSeconds;
    if (this.bannerLeft <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.setText(this.banner, next);
        this.banner.hidden = false;
        this.bannerLeft = BANNER_SECONDS;
      } else if (!this.banner.hidden) {
        this.banner.hidden = true;
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
```

Append to `src/ui/hud.css`:

```css
.hud-banner.is-final {
  top: 40%;
  padding: 0.3em 0.8em;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.55);
  font-size: clamp(22px, 5.5vmin, 48px);
  white-space: nowrap;
}
```

Run: `npm test -- tests/ui/hud.test.ts` → PASS.

- [ ] **Step 12: Debug overlay**

In `src/ui/debug-overlay.ts` add `ai: string[];` to `DebugData` and the line `` `ai     ${data.ai.join(' | ') || '-'}`, `` after the `action` line.

- [ ] **Step 13: Rewrite `src/app.ts` and `src/main.ts`**

`src/main.ts`:

```ts
import { startGame } from './app';
import { readGameOptions } from './app/url-options';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

startGame(root, readGameOptions(window.location.search, Date.now()));
```

`src/app.ts` (whole file):

```ts
import { createAiController, type AiController } from './app/ai-controller';
import type { Controller } from './app/controller';
import { defenderDummy, teammateDummy } from './app/dummies';
import { GameLoop } from './app/game-loop';
import { MatchRunner } from './app/match-runner';
import type { GameOptions } from './app/url-options';
import { getCharacter } from './content/characters';
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
import { AI_PROFILES } from './sim/ai/profile';
import { buttonsOf, justPressed } from './sim/buttons';
import { createMatch, findPlayer, type RosterEntry } from './sim/match';
import {
  NO_BUTTONS,
  type Buttons,
  type CourtDef,
  type MatchSettings,
  type PlayerId,
  type PlayerIntent,
  type TeamIndex,
} from './sim/types';
import { DebugOverlay } from './ui/debug-overlay';
import { Hud } from './ui/hud';

export type { GameOptions } from './app/url-options';

const HUMAN_ID: PlayerId = 'home1';
const HUMAN_TEAM: TeamIndex = 0;
const TEAM_COLORS = [0x2f80ed, 0xeb5757] as const;
const RESTART_BUTTONS = ['action', 'pass', 'special'] as const;

/** Spec C.1 rosters: 2v2 in a match; the Phase 3 trio (human, dummy teammate, dummy defender) in shootaround. */
export function buildRoster(options: GameOptions): RosterEntry[] {
  const entry = (id: PlayerId, team: TeamIndex, characterId: string): RosterEntry => ({
    id,
    team,
    characterId,
    character: getCharacter(characterId),
  });
  if (options.mode === 'shootaround') {
    return [entry(HUMAN_ID, 0, options.characterId), entry('home2', 0, 'rook'), entry('away1', 1, 'brick')];
  }
  return [
    entry(HUMAN_ID, 0, options.characterId),
    entry('home2', 0, options.teammateId),
    entry('away1', 1, options.opponentIds[0]),
    entry('away2', 1, options.opponentIds[1]),
  ];
}

/** Spec A.5 defaults; only the seed and the mode vary. */
export function buildSettings(options: GameOptions, court: CourtDef, seed: number): MatchSettings {
  return {
    durationMs: 180_000,
    shotClockMs: 14_000,
    seed,
    ruleIds: ['shotClock'],
    courtId: court.id,
    mode: options.mode,
  };
}

export interface Session {
  runner: MatchRunner;
  controllers: Map<PlayerId, Controller>;
  ais: AiController[];
}

/** A match and its controllers for `seed`; built again with `seed + 1` on restart (spec C.6). */
export function buildSession(
  options: GameOptions,
  court: CourtDef,
  seed: number,
  human: Controller,
): Session {
  const runner = new MatchRunner(
    court,
    createMatch(buildSettings(options, court, seed), court, buildRoster(options)),
  );
  const controllers = new Map<PlayerId, Controller>([[HUMAN_ID, human]]);
  const ais: AiController[] = [];
  if (options.mode === 'shootaround') {
    controllers.set('home2', teammateDummy('home2', HUMAN_ID, court));
    controllers.set('away1', defenderDummy('away1', HUMAN_ID, court));
  } else {
    const profile = AI_PROFILES[options.aiProfile];
    const brains: [PlayerId, number, boolean][] = [
      ['home2', 1, true],
      ['away1', 2, false],
      ['away2', 3, false],
    ];
    for (const [id, offset, favourTeammate] of brains) {
      const ai = createAiController(id, court, { profile, seed, offset, favourTeammate });
      ais.push(ai);
      controllers.set(id, ai.controller);
    }
  }
  return { runner, controllers, ais };
}

/** Entry point: a 2v2 match by default, the Phase 3 shootaround with `?mode=shootaround` (spec C.1). */
export function startGame(root: HTMLElement, options: GameOptions): { stop(): void } {
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);

  const court = getCourt('gym');
  const scene = new GameScene(canvas);
  scene.setBackground(court.lighting.skyColor);
  scene.scene.add(buildCourtView(court));

  const touch = new TouchBackend(root);
  const input = new InputManager([new KeyboardBackend(window), touch]);
  input.onActiveKindChange = (kind) => (kind === 'touch' ? touch.show() : touch.hide());
  const onFirstTouch = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') touch.show();
  };
  root.addEventListener('pointerdown', onFirstTouch);

  const human: Controller = () => input.sample();
  let seed = options.seed;
  let session = buildSession(options, court, seed, human);

  // Views are keyed by player id; the roster is the same on every restart, so they are built once.
  const playerViews = new Map<PlayerId, PlayerView>();
  for (const team of session.runner.current.teams) {
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

  const broadcastCamera = new BroadcastCamera(scene.camera);
  input.cameraYaw = broadcastCamera.yaw;

  const hud = new Hud(root, HUMAN_TEAM);

  const resize = (): void => {
    scene.resize(root.clientWidth, root.clientHeight, window.devicePixelRatio);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(root);

  const overlay = options.debug ? new DebugOverlay(root) : null;
  const characterName = getCharacter(options.characterId).name;
  let lastTickNumber = session.runner.current.tick;
  let frameCount = 0;
  let statsWindowStart = performance.now();
  let fps = 0;
  let ticksPerSecond = 0;

  const intents = new Map<PlayerId, PlayerIntent>();
  let prevHumanButtons: Buttons = { ...NO_BUTTONS };

  const restart = (): void => {
    seed += 1;
    session = buildSession(options, court, seed, human);
    lastTickNumber = session.runner.current.tick;
  };

  const loop = new GameLoop(
    () => {
      const { runner, controllers } = session;
      for (const [id, controller] of controllers) intents.set(id, controller(runner.current));
      const humanIntent = intents.get(HUMAN_ID);
      if (humanIntent) {
        // Spec C.6: after the final, any ACTION/PASS/SPECIAL press starts the next match.
        const pressed = RESTART_BUTTONS.some((b) => justPressed(prevHumanButtons, humanIntent, b));
        prevHumanButtons = buttonsOf(humanIntent);
        if (runner.current.phase === 'finished') {
          if (pressed) restart();
          return;
        }
      }
      const events = runner.step(intents);
      hud.handleEvents(events);
      for (const event of events) {
        if (event.type === 'basket') effects.spawnFlash(runner.current.ball.pos);
      }
    },
    (alpha, frameMs) => {
      const dt = frameMs / 1000;
      const prev = session.runner.previous;
      const next = session.runner.current;
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
      const humanState = findPlayer(next, HUMAN_ID);
      if (overlay && humanState) {
        overlay.update({
          fps,
          ticksPerSecond,
          tick: next.tick,
          pos: humanState.pos,
          speed: Math.hypot(humanState.vel.x, humanState.vel.z),
          turbo: humanState.turbo,
          inputKind: input.activeKind ?? '-',
          phase: next.phase,
          ballMode: next.ball.mode,
          shotClockMs: next.shotClockMs,
          character: characterName,
          action: humanState.action,
          ai: session.ais.map((ai) => `${ai.id} ${ai.memory.goal.kind}`),
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

Check the `PlayerView` team colours still come from `player.team` (unchanged) and that `MatchRunner.previous` after a restart is the new initial state (the constructor sets both to `initial`).

- [ ] **Step 14: Session tests**

Append to `tests/app/ai-controller.test.ts`:

```ts
import { buildRoster, buildSession, buildSettings } from '../../src/app';
import type { GameOptions } from '../../src/app/url-options';
import { NO_INTENT } from '../../src/sim/types';

describe('buildSession (spec C.1)', () => {
  const base: GameOptions = {
    mode: 'match',
    characterId: 'dash',
    teammateId: 'ace',
    opponentIds: ['brick', 'rook'],
    aiProfile: 'easy',
    seed: 9,
    debug: false,
  };

  it('a match has four players, three AI controllers and the chosen characters', () => {
    const session = buildSession(base, court, 9, () => NO_INTENT);
    expect(buildRoster(base).map((e) => e.characterId)).toEqual(['dash', 'ace', 'brick', 'rook']);
    expect(session.controllers.size).toBe(4);
    expect(session.ais.map((a) => a.id)).toEqual(['home2', 'away1', 'away2']);
    expect(session.ais[0].memory.favourTeammate).toBe(true);
    expect(session.ais[1].memory.favourTeammate).toBe(false);
    expect(buildSettings(base, court, 9)).toMatchObject({ mode: 'match', seed: 9, durationMs: 180_000 });
  });

  it('a shootaround keeps the Phase 3 trio and no AI', () => {
    const session = buildSession({ ...base, mode: 'shootaround' }, court, 1, () => NO_INTENT);
    expect(session.controllers.size).toBe(3);
    expect(session.ais).toEqual([]);
    expect(session.runner.current.settings.mode).toBe('shootaround');
  });
});
```

`src/app.ts` imports Three.js through the render modules; this test file therefore needs `// @vitest-environment jsdom` as its first line (as `tests/ui/hud.test.ts` does) — add it. If `GameScene` or `TouchBackend` touch the DOM at import time and fail under jsdom, move `buildRoster`/`buildSettings`/`buildSession` into a new `src/app/session.ts` (importing only sim, content and the controller modules) and re-export them from `src/app.ts`; then the test imports from `src/app/session` and needs no jsdom.

Run: `npm test -- tests/app` → PASS.

- [ ] **Step 15: README**

In `README.md`, replace the two URL-parameter bullets (lines ~31–34) with:

```markdown
- The page starts a **2v2 match** (3 minutes, 14 s shot clock, sudden-death overtime): you and an
  AI teammate against two AI opponents. After the final, press ACTION/PASS/SPECIAL (or tap a
  button) to play again.
- `?mode=shootaround` — the practice build with the training dummies instead of the AI.
- `?character=brick|ace|dash|rook` picks your player (default `rook`);
  `?teammate=<id>` (default `ace`) and `?opponents=<id>,<id>` (default `brick,dash`) pick the rest.
- `?ai=easy|fair|hard` — the AI profile for all three AI players (default `fair`).
- `?seed=<n>` — reproduce a match (the default seed is the clock, so every game differs).
- `?debug` shows the debug overlay (now with each AI's current goal).

Parameters combine, e.g. `?character=dash&teammate=brick&ai=hard&debug`.
```

- [ ] **Step 16: Browser verification, full check, commit**

Run `npm run dev` and open `http://localhost:5173/?debug`: a 2v2 match starts (clock visible, four figures in formation), the teammate passes when you press PASS, opponents mark you and jump at your shots, the final banner appears at 0:00 and a press restarts the match. Then open `?mode=shootaround` and confirm the Phase 3 build is unchanged. Note any feel issue (not fixes) on the PR for the final review.

Run: `npm run format && npm run check` → green.

```bash
git add src/app.ts src/main.ts src/app src/ui tests/app tests/ui README.md
git commit -m "feat(app,ui): match mode by default — URL options, AI controllers, restart, sticky final banner, overlay goals"
```

---

### Task 5: Harness — AI golden, no-soft-lock sweep, replay, balance report; cheap leftovers

**Files:**
- Create: `tests/sim/ai-match.ts` (shared helper, not a test), `tests/sim/ai-golden.test.ts`, `tests/sim/ai-sweep.test.ts`, `tests/balance/ai.balance.ts`, `vitest.balance.config.ts`, `public/favicon.svg`, `docs/balance/<today>.md` (generated)
- Modify: `package.json` (`balance` script), `index.html` (favicon), `vite.config.ts` (`sourcemap: 'hidden'`), `README.md` (balance script)

**Interfaces:**
- Consumes (Tasks 1–4): `decide`, `createAiMemory`, `AI_PROFILES`, `AiProfile`, `AiMemory`; (existing) `createMatch`, `tick`, `getCharacter`, `getCourt`, `LOOSE_BALL_TIMEOUT_TICKS`.
- Produces: `npm run balance`; the sweep's assertions are the no-soft-lock contract for later phases.

- [ ] **Step 1: Shared AI-match runner and the golden**

`tests/sim/ai-match.ts` (a plain module: vitest only collects `*.test.ts`, so importing it from two test files registers nothing twice):

```ts
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES, type AiProfile } from '../../src/sim/ai/profile';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState, PlayerIntent, SimEvent } from '../../src/sim/types';

export const court = getCourt('gym');
export const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 7,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
export const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];
/** Overtime guard: a sudden-death match ends at the next basket, well before this. */
const MAX_TICKS = 20_000;

export interface AiRun {
  state: MatchState;
  events: SimEvent[];
  intents: Map<string, PlayerIntent>[];
}

/** Four brains (the human slot too) play a full match; every intent is recorded for replay. */
export function playAiMatch(seed: number, profile: AiProfile = AI_PROFILES.fair): AiRun {
  let state = createMatch({ ...settings, seed }, court, roster);
  const memories = roster.map((e, i) => createAiMemory(e.id, seed, i, e.id === 'home2'));
  const events: SimEvent[] = [];
  const intents: Map<string, PlayerIntent>[] = [];
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    const frame = new Map(memories.map((m) => [m.playerId, decide(state, m, profile, court)]));
    intents.push(frame);
    const r = tick(state, frame, court);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events, intents };
}

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
```

`tests/sim/ai-golden.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { court, fnv1a, playAiMatch, roster, settings } from './ai-match';

describe('AI golden (spec C.7)', () => {
  it('a full 2v2 AI match finishes, scores on both sides and uses the whole move set', () => {
    const run = playAiMatch(7);
    expect(run.state.phase).toBe('finished');
    expect(run.state.score[0]).toBeGreaterThan(0);
    expect(run.state.score[1]).toBeGreaterThan(0);
    const types = new Set(run.events.map((e) => e.type));
    expect(types.has('pass')).toBe(true);
    expect(types.has('steal') || types.has('stealFailed')).toBe(true);
    expect(types.has('block') || types.has('shove')).toBe(true);
    expect(types.has('basket')).toBe(true);
  });

  it('matches the pinned hash — update it only for an intentional simulation or AI change', () => {
    expect(fnv1a(JSON.stringify(playAiMatch(7).state))).toMatchInlineSnapshot();
  });

  it('replays from seed + recorded intents to the identical state (spec §4.10)', () => {
    const run = playAiMatch(7);
    let state = createMatch({ ...settings, seed: 7 }, court, roster);
    for (const frame of run.intents) state = tick(state, frame, court).state;
    expect(fnv1a(JSON.stringify(state))).toBe(fnv1a(JSON.stringify(run.state)));
  });

  it('the simulation RNG advances only through the sim: brains never draw from it', () => {
    const a = playAiMatch(7);
    let state = createMatch({ ...settings, seed: 7 }, court, roster);
    for (const frame of a.intents) state = tick(state, frame, court).state;
    expect(state.rng.seed).toBe(a.state.rng.seed);
  });
});
```

Run: `npm test -- tests/sim/ai-golden.test.ts` → the empty `toMatchInlineSnapshot()` is filled on the first run; run again without changes → PASS. Report the pinned hash and the final score on the PR. If the match does not finish within `MAX_TICKS` or one team scores 0, that is an AI bug (soft lock or a brain that never shoots): inspect `run.events` for the last `phaseChange`/`possessionChange` and fix the brain, not the test.

- [ ] **Step 2: No-soft-lock sweep**

`tests/sim/ai-sweep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../../src/sim/constants';
import { allPlayers, createMatch } from '../../src/sim/match';
import { LOOSE_BALL_TIMEOUT_TICKS } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import type { PlayerIntent, SimEvent } from '../../src/sim/types';
import { court, playAiMatch, roster, settings } from './ai-match';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
/** A possession must show progress within shot clock + loose-ball timeout (spec C.7), plus slack. */
const MAX_PROGRESS_GAP_TICKS = Math.ceil(14_000 / TICK_MS) + LOOSE_BALL_TIMEOUT_TICKS + 120;
const PROGRESS: ReadonlySet<SimEvent['type']> = new Set([
  'shotReleased',
  'basket',
  'possessionChange',
  'shotClockViolation',
  'phaseChange',
  'steal',
  'intercept',
  'block',
  'pickup',
]);
const IDLE_STRETCH_TICKS = 60;
const MAX_STUN_SHARE = 0.3;

function isIdle(intent: PlayerIntent): boolean {
  return (
    intent.move.x === 0 && intent.move.y === 0 && !intent.action && !intent.pass && !intent.turbo
  );
}

/** Replays the recorded frames to attribute events and stun time to exact ticks. */
function walk(seed: number, frames: Map<string, PlayerIntent>[]) {
  let state = createMatch({ ...settings, seed }, court, roster);
  let lastProgress = 0;
  let maxGap = 0;
  let liveTicks = 0;
  const stunned: Record<string, number> = {};
  for (let i = 0; i < frames.length; i++) {
    const r = tick(state, frames[i], court);
    state = r.state;
    if (state.phase === 'live') {
      liveTicks++;
      for (const p of allPlayers(state)) {
        if (p.action === 'stunned') stunned[p.id] = (stunned[p.id] ?? 0) + 1;
      }
    }
    if (r.events.some((e) => PROGRESS.has(e.type))) {
      maxGap = Math.max(maxGap, i - lastProgress);
      lastProgress = i;
    }
  }
  return { maxGap, stunned, liveTicks };
}

describe('AI seed sweep: no soft locks (spec C.7)', () => {
  it.each(SEEDS)(
    'seed %i plays a complete, lively match',
    (seed) => {
      const run = playAiMatch(seed);
      expect(run.state.phase).toBe('finished');
      expect(run.state.score[0]).toBeGreaterThanOrEqual(6);
      expect(run.state.score[1]).toBeGreaterThanOrEqual(6);

      const { maxGap, stunned, liveTicks } = walk(seed, run.intents);
      expect(maxGap).toBeLessThanOrEqual(MAX_PROGRESS_GAP_TICKS);
      for (const id of Object.keys(stunned)) expect(stunned[id] / liveTicks).toBeLessThan(MAX_STUN_SHARE);

      let idleRun = 0;
      let longestIdle = 0;
      for (const frame of run.intents) {
        idleRun = [...frame.values()].every(isIdle) ? idleRun + 1 : 0;
        longestIdle = Math.max(longestIdle, idleRun);
      }
      expect(longestIdle).toBeLessThan(IDLE_STRETCH_TICKS);
    },
    120_000,
  );
});
```

The sweep replays each match once more (two sims per seed) for exact per-tick attribution; that is intentional.

Run: `npm test -- tests/sim/ai-sweep.test.ts` and note the wall time on the PR. If the file takes more than 30 s on the dev machine, change `SEEDS` to 10 seeds here and keep 20 in the balance report (state this in the commit message); do not shorten the matches. Any failing seed is an AI/sim bug to fix (report which assertion and the seed on the PR), not a reason to loosen the band.

- [ ] **Step 3: Balance report**

`vitest.balance.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

/** `npm run balance`: the on-demand AI-vs-AI report (spec C.7); minutes, not for CI. */
export default defineConfig({
  test: {
    include: ['tests/balance/**/*.balance.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
});
```

`package.json` scripts: add `"balance": "vitest run --config vitest.balance.config.ts"`.

`tests/balance/ai.balance.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { characters, getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { createMatch, type RosterEntry } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchSettings, MatchState } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 0,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
const SEEDS_PER_PAIRING = 10;
const MAX_TICKS = 20_000;
const ids = characters.map((c) => c.id);

function roster(home: [string, string], away: [string, string]): RosterEntry[] {
  return [
    { id: 'home1', team: 0, characterId: home[0], character: getCharacter(home[0]) },
    { id: 'home2', team: 0, characterId: home[1], character: getCharacter(home[1]) },
    { id: 'away1', team: 1, characterId: away[0], character: getCharacter(away[0]) },
    { id: 'away2', team: 1, characterId: away[1], character: getCharacter(away[1]) },
  ];
}

function play(seed: number, entries: RosterEntry[]): MatchState {
  let state = createMatch({ ...settings, seed }, court, entries);
  const memories = entries.map((e, i) => createAiMemory(e.id, seed, i, false));
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    state = tick(
      state,
      new Map(memories.map((m) => [m.playerId, decide(state, m, AI_PROFILES.fair, court)])),
      court,
    ).state;
  }
  return state;
}

interface Row {
  label: string;
  homeWins: number;
  games: number;
  meanHome: number;
  meanAway: number;
}

function series(label: string, home: [string, string], away: [string, string]): Row {
  let homeWins = 0;
  let sumHome = 0;
  let sumAway = 0;
  for (let seed = 1; seed <= SEEDS_PER_PAIRING; seed++) {
    const s = play(seed, roster(home, away));
    if (s.score[0] > s.score[1]) homeWins++;
    sumHome += s.score[0];
    sumAway += s.score[1];
  }
  return {
    label,
    homeWins,
    games: SEEDS_PER_PAIRING,
    meanHome: sumHome / SEEDS_PER_PAIRING,
    meanAway: sumAway / SEEDS_PER_PAIRING,
  };
}

function table(rows: Row[]): string {
  const lines = ['| pairing | home wins | mean score |', '|---|---|---|'];
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.homeWins}/${r.games} (${((100 * r.homeWins) / r.games).toFixed(0)} %) | ${r.meanHome.toFixed(1)}–${r.meanAway.toFixed(1)} |`,
    );
  }
  return lines.join('\n');
}

describe('balance report (spec C.7, on demand)', () => {
  it('mirrored duos show no side bias; strength table reported', () => {
    // Mirror set: every ordered duo against itself (16 × SEEDS games) — equal characters, so any
    // bias is a side bias (team 0 attacks +X, gets the tip-off half the time, etc.).
    const mirror: Row[] = [];
    for (const a of ids) for (const b of ids) mirror.push(series(`${a}+${b} vs ${a}+${b}`, [a, b], [a, b]));
    // Strength set: each character as the lead with a Rook partner against each other lead.
    const strength: Row[] = [];
    for (const a of ids) for (const c of ids) strength.push(series(`${a}+rook vs ${c}+rook`, [a, 'rook'], [c, 'rook']));

    const games = mirror.reduce((n, r) => n + r.games, 0);
    const homeWins = mirror.reduce((n, r) => n + r.homeWins, 0);
    const homeRate = homeWins / games;
    const meanTotal =
      mirror.reduce((n, r) => n + r.meanHome + r.meanAway, 0) / mirror.length;

    const date = new Date().toISOString().slice(0, 10);
    const report = [
      `# AI balance report — ${date}`,
      '',
      `Fair profile, gym court, ${SEEDS_PER_PAIRING} seeds per pairing, 3-minute matches.`,
      '',
      `**Side bias (mirrored duos, ${games} games):** home wins ${(100 * homeRate).toFixed(1)} % — band 40–60 %.`,
      `**Mean total score (mirrored):** ${meanTotal.toFixed(1)} — band 20–60.`,
      '',
      '## Mirrored duos',
      '',
      table(mirror),
      '',
      '## Lead vs lead (Rook partners)',
      '',
      table(strength),
      '',
    ].join('\n');
    mkdirSync('docs/balance', { recursive: true });
    writeFileSync(`docs/balance/${date}.md`, report);
    process.stdout.write(`\n${report}\n`);

    expect(homeRate).toBeGreaterThanOrEqual(0.4);
    expect(homeRate).toBeLessThanOrEqual(0.6);
    expect(meanTotal).toBeGreaterThanOrEqual(20);
    expect(meanTotal).toBeLessThanOrEqual(60);
  });
});
```

Run: `npm run balance` (expect several minutes: 320 full matches). Commit the generated `docs/balance/<date>.md`. If the side-bias band fails, that is a real finding — report it on the PR with the table (the likely causes are the tip-off award and the inbound formation favouring one side); if the score band fails, say so and leave the thresholds as they are for the final review.

- [ ] **Step 4: Cheap leftovers**

`public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#e8742c" stroke="#5a2a0a" stroke-width="3"/>
  <path d="M32 2v60M2 32h60M11 11c12 10 30 10 42 0M11 53c12-10 30-10 42 0" fill="none" stroke="#5a2a0a" stroke-width="3"/>
</svg>
```

`index.html`: add `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` after the theme-color meta (Vite rewrites it for `BASE_PATH`).
`vite.config.ts`: `build: { target: 'es2022', sourcemap: 'hidden' }`.
`README.md`: under **Run**, add `npm run balance  # AI-vs-AI balance report → docs/balance/<date>.md (minutes)`.

- [ ] **Step 5: Full check and commit**

Run: `npm run format && npm run check` → green (the sweep is part of `npm test` now; note its time on the PR).

```bash
git add tests/sim/ai-match.ts tests/sim/ai-golden.test.ts tests/sim/ai-sweep.test.ts tests/balance vitest.balance.config.ts package.json docs/balance public/favicon.svg index.html vite.config.ts README.md
git commit -m "test(sim): AI golden, replay and no-soft-lock sweep; balance report script; favicon, hidden sourcemaps"
```

---

## Phase 4 acceptance checklist (final reassessment)

- [ ] `npm run check` green on `main`; CI + Pages green; the live URL starts a 2v2 match; `?mode=shootaround` is the Phase 3 build.
- [ ] C.1 URL parameters all honoured; bad ids fall back; shootaround seed fixed, match seed from the clock unless given.
- [ ] C.2 brain: `decide` pure over (state, memory); `state.rng` untouched (test); one-tick presses; reset on inbound/tipoff; 6-tick cadence with offsets.
- [ ] C.3 three profiles with the table's numbers; teammate bias −0.15.
- [ ] C.4 `evaluateShot` ≡ real shot; `resolveDefensivePress` ≡ tick behaviour or null.
- [ ] C.5 all branches tested: panic, alley-oop, call, shoot (incl. layup/dunk rule), pass, drive/side-step/reset; spots + hysteresis + invite + chase; marks deterministic/stable; press gating; reaction window per profile (fair blocks, easy misses).
- [ ] C.6 formation at inbound and tip-off (match only); sticky final banner + OVERTIME!; restart on press with seed + 1.
- [ ] C.7 AI golden pinned and explained; replay determinism; 20-seed sweep green (or 10 with the reason recorded); `npm run balance` report committed with the side-bias and score bands.
- [ ] Tablet playtest with the first player done; feel notes recorded on the epic (teammate gives up the ball when asked; a drive beats the opponents; ~20–30 points a game; no stuck corners).
- [ ] Leftovers folded in: favicon, hidden sourcemaps, HUD write-on-change.
- [ ] Each task has a closed issue and a merged PR with an Opus review; rulings listed on the epic.

## Deferred (recorded)

- Abilities (`aiWantsToUse`, §6) and court `aiHint` (§7) — phase 5 extends `planWithBall` and the steering.
- Menus replace the URL parameters; Results screen replaces the sticky banner — phase 6.
- Difficulty levels as rule-set + profile presets with UI — out of scope for the first release (§12); the profiles exist.
- Still open from earlier phases: chunk split; thin 2 m sweep bucket.
