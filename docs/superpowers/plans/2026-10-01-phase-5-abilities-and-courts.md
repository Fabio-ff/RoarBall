# RoarBall Phase 5 — Abilities and Court Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every player has their character's signature ability (Rocket Dunk, Hot Hand, Blur, Earthquake), charged by play and used by humans and AI alike, and `?court=` picks one of four courts — the gym plus Rooftop Storm (gusts), Volcano Rim (heat) and Frozen Lake (slick) — each with its light modifier and placeholder dressing.

**Architecture:** The simulation gains a hook system that content plugs into without importing simulation values: `tick(state, intents, court, abilities = NO_ABILITIES)` rebuilds every player's `stats` from `baseStats` each tick (court `modifyStats`, then the active ability's), activates abilities on a SPECIAL press, counts down timers and pays charge from the tick's events. Abilities and court modifiers live in `src/content/` and talk to the sim only through typed hook arguments and a `HookContext` (`rng`, pure `math` helpers, `court`, `emit`, `knockDown`). The sim reads four ability flags in its dunk, block, steal and turbo code and a court `ballDrift` at shot/pass release. The AI presses SPECIAL for one tick when `aiWantsToUse` says so and leads loose balls by the court's `aiHint`. The HUD, touch controls, debug overlay and court view present it all.

**Tech Stack:** unchanged (Vite 8, TypeScript 5.9 strict, Three.js 0.186, Vitest 5 + jsdom, ESLint 10 with the `src/sim` and `src/content` lockdowns). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-roarball-design.md` — **Appendix D (Phase 5 decisions)** first, then §4.2 (pipeline), §5.3 (ability system), §6 (AI), §7 (courts), A.7 (content and the RNG), and Appendices B/C for the existing shooting, defence and AI behaviour this phase builds on.

## Plan decisions

Details the spec leaves open or that the code forced, decided here (one line each, with the reason):

1. `HookContext = { rng, math, court, emit, knockDown }`, a superset of D.2's `{ rng, math }`: content may import only types, so hooks need `emit` to push events and `knockDown` to reuse the shove's ball drop; `math` carries `nextFloat`/`nextInt`/`TICK_DT` so `ctx.math.nextFloat(ctx.rng)` is the only way content draws.
2. `aiWantsToUse(state, player, ctx)` takes an `AbilityQueryContext = { math, court }` with **no** RNG, so brains still never touch `state.rng` (C.2); `court` is needed for target-hoop distances.
3. `CourtModifier` gains a fourth optional hook `ballDrift(state) → Vec3 | null` (m/s²), read by the sim when a shot or pass is released (bow, landing shift); the rooftop's `onTick` applies the free-ball/airborne pushes and its `aiHint` returns the same drift. Flights are sim code; reading `aiHint` from physics would mislabel it.
4. `PlayerState.abilityId: string | null` is copied from `CharacterDef.abilityId` at `createMatch` (placeholders: `null`); the sim needs it to find the definition (§4.1's `abilityActive.abilityId` moves here).
5. `ActiveAbility.uses` means "shots that cannot miss" for the sim (Hot Hand sets 3 in `onActivate`); `releaseShot` spends one per released shot. No fifth flag.
6. `AbilityDef.durationTicks: number | 'instant' | null`; `null` = until `uses` reach 0; `'instant'` ends on its activation tick (`abilityActivated` and `abilityEnded` in the same tick). No `chargeCost` field: activation always needs the full bar (D.2).
7. The ability's `modifyStats` is also applied at activation, so a timed ability affects exactly `durationTicks` ticks counting the activation tick, and a same-tick shot press already sees Rocket Dunk.
8. Step 3 runs every player's SPECIAL first (roster order), then every `resolveAction`, so Earthquake's victims are locked out on that tick whichever team activates.
9. Step 9 pays charge before the ability timers run (charge is blocked while one's own ability is active, including an instant one on its tick).
10. Assists: the passer is read from the pass flight after step 3; each `catch` event of the tick sets the receiver's `lastCatch` (teammate passes only); a basket within 180 ticks pays the passer and clears it. Event payloads are unchanged, so the gym event pins hold.
11. `knockDown(state, by, target, ticks, events)` lives in `defence.ts` and lands in Task 1 (the `HookContext` needs it); `resolveShove` is refactored onto the same `popBallLoose`, byte for byte.
12. `ShotFlight.bow: Vec3 | null` is added in Task 1 (always `null` until Task 3), so later tasks never change the state shape again.
13. Bow amplitude `drift · T² / 8` (the midpoint offset of a constant-acceleration path with fixed ends), applied as `sin(π·elapsed/totalTicks)` with the scripted `totalTicks` (miss handover included); `ball.vel` is not bowed, so the handover to free physics is unchanged.
14. Only ordinary passes get the gust landing shift; alley-oop lobs aim above the rim and are not shifted.
15. Gusts: the first gust is scheduled on the rooftop's first `onTick` (`courtState` starts `{}`), the next one when a gust ends; direction angle = `nextFloat · 2π`; pushes start on the `gustStart` tick and last 180 ticks.
16. Rocket Dunk drive: travel = distance − 0.6 m (the normal dunk stop), speed = travel ÷ release time with no turbo cap, jump speed unchanged; points by the usual distance rule at release (so 2).
17. `evaluateShot` reports quality 1 while Hot Hand has uses, so the AI takes its sure shots.
18. Earthquake pops each victim 2 m/s away from the user like a shove and re-knocks a player already down (reset to 90).
19. Restart leak (D.6): `buildSession` takes the intents of the restarting frame and seeds each player's `prevButtons` (`primeHeldButtons`).
20. D.7 invariant check: before touching code, Task 1 pins `fnv1a(events)`, score and event count of the three determinism runs and the AI golden; these pins never change in Tasks 1–5 (gym, `NO_ABILITIES`). Only the four state-hash pins are re-pinned, once, in Task 1.
21. The existing gym AI golden stays on `NO_ABILITIES` (it is the invariant); Task 4 adds one golden per court **with** abilities (gym, rooftop, volcano, frozen) as one object snapshot.
22. AI loose-ball lead = ball + drift × ½ · 0.75² (where the drift carries a ball in 0.75 s).
23. Balance: gym mirrored 20 seeds + strength 10 seeds (was 20) + mirrored duos on each other court at 8 seeds ≈ 864 matches ≈ 5 minutes. D.7's 45–55 % side-bias band is asserted on the aggregate of all mirrored games; per court only 35–65 % (128 games is too few for ±5 %). Ability uses are reported against 1.5–3 and asserted only > 0.
24. The volcano glow strip is tied to `weather: 'embers'` (no extra dressing field); the gym dressing reproduces today's look (floor `0xc9a06a`, white lines, roughness 1).
25. The HUD gets ability names from the table the app passes in (`ui` never imports `content`); banner colour comes from the activating player's team via `handleEvents(events, state)`.
26. The GUST chip is driven by `gustStart`/`gustEnd` events; arrow `rotate(atan2(dir.z, dir.x))` (camera on +Z: court X is screen right, Z screen down).
27. Content gets the sim's `Math.random`/`Date.now` lint ban too (hooks run inside `tick`).

**Spec vs code, resolved towards the spec's intent:** §5.3 hook signatures `onActivate(state, player)` gain the `ctx` argument (A.7 demands randomness/math through it); D.2's two-field `HookContext` is extended (decision 1); §4.1 `abilityActive { abilityId, ticksLeft, data }` is D.2's `ability { ticksLeft, uses }` plus `PlayerState.abilityId` (decision 4); D.3 "arrives on the normal release tick" is read with the existing 0.6 m dunk stop (decision 16).

## Global Constraints

Everything from the Phase 1–4 plans still applies (60 Hz, `src/sim` purity enforced by ESLint + `tsconfig.sim.json` + `tests/lint/boundaries.test.ts`, seeded RNG only with a documented draw order, court coordinates with team 0 on −X attacking +X, camera on +Z, touch ≥ 56 px, strict TS, attribution trailers, `npm run format && npm run check` green per commit). In addition, from Appendix D:

- `?court=gym|rooftop|volcano|frozen` picks the court (default `gym`, which stays the balance baseline). Every player has their character's ability; the AI uses abilities too (D.1).
- Stats are rebuilt every tick: `PlayerState.baseStats` resolved once; step 1 sets `stats = court.modifier.modifyStats(baseStats, state)`, step 2 applies the active ability's `modifyStats`. `ResolvedStats` gains `dunkFromArc`, `unblockableDunk`, `stealAlwaysSucceeds`, `unlimitedTurbo` (default `false`) (D.2).
- `PlayerState` gains `charge` (0..100) and `ability: { ticksLeft: number | null; uses: number } | null`; `MatchState` gains `courtState` (plain, JSON-safe, `{}` on the gym) (D.2).
- Content stays outside `sim/`: the sim defines `AbilityDef`, `AbilityEffect`, `CourtModifier`, `HookContext`; content imports only types. `tick(state, intents, court, abilities = NO_ABILITIES)`; with `NO_ABILITIES` nothing activates (D.2).
- Pipeline: 1. `court.modifier.onTick(state, ctx)`, then rebuild stats. 2. active ability `onTick?`, then `modifyStats?`. 3. SPECIAL activates when `charge === 100`, phase `live`, on the ground, not action-locked: `charge = 0`, `ability` set, `onActivate`, `abilityActivated`. 9. timers count down; at 0 `onEnd?`, `ability = null`, `abilityEnded`; charge gains from this tick's events; none while one's own ability is active; charge persists across phases, resets only with a new match (D.2).
- Charge gains: basket +12 (2 points) / +18 (3 points) to the scorer; assist +10 to the passer when the receiver scores within **180 ticks** of catching their pass (`lastCatch: { from, tick }`); steal +15; block +15; cap 100 (D.2).
- RNG: hooks draw from `state.rng` only through `ctx.rng`; a gym match with `NO_ABILITIES` keeps its event sequence; only state hashes change (D.2).
- Events: `abilityActivated { playerId, abilityId }`, `abilityEnded { playerId, abilityId }`, `knockdown { by, target }`, `gustStart { dir: Vec3 }`, `gustEnd` (D.2).
- Abilities (D.3): Rocket Dunk (Brick, 480 ticks, `dunkFromArc` + `unblockableDunk`, < 6.75 m is a dunk, launch arrives on the release tick); Hot Hand (Ace, until used, `uses = 3`, every released shot consumes one and is made, the draw is still taken, a blocked shot does not consume); Blur (Dash, 360 ticks, `runSpeed`, `turboSpeed`, `acceleration`, `deceleration` ×2, `unlimitedTurbo`, `stealAlwaysSucceeds` — reach, facing, cooldown still apply, draw taken); Earthquake (Rook, instant, opponents within 4 m stunned 90 ticks ignoring resistance and immunity, holder drops the ball as after a shove, one `knockdown` per victim, no RNG).
- Courts (D.4): Rooftop gusts — next gust 900–1500 ticks ahead (one draw), horizontal direction (one draw), 180 ticks; shot bow `sin(π·t) × drift`, zero at both ends; `shooting` ×0.85 during a gust; pass landing shifted by 4 m/s² × T²/2; free ball 4 m/s², airborne players 2 m/s²; `aiHint` returns the drift. Volcano heat — `turboDrainPerTick` ×1.5, `stunTicksDealt` ×1.4, `stunResistTicks` ×0.5, Earthquake's 90 not scaled. Frozen slick — `physics.friction = 0.3`, `acceleration` ×0.4, `deceleration` ×0.25. All four courts share the gym's play area and hoops.
- AI (D.5): `aiWantsToUse` on decision ticks only → one-tick SPECIAL press. Rocket Dunk: holding the ball 3.5–6.5 m from the target hoop; Hot Hand: own team in possession; Blur: defending with the opposing holder within 5 m, or holding the ball > 10 m from the target hoop; Earthquake: ≥ 2 opponents within 4 m, or the opposing holder within 4 m. `aiHint` read by the loose-ball chase only.
- Presentation (D.6): HUD ability bar top centre with the ability's name, team-colour fill, "READY" pulse at 100, remaining time while active, three pips for Hot Hand; banners "ROCKET DUNK!", "HOT HAND!", "BLUR!", "EARTHQUAKE!" in the activating team's colour; "GUST" chip with an arrow; touch SP dimmed until full; `?debug` shows charge and active ability. `CourtDef.dressing: { floorColor, lineColor, floorRoughness, weather: 'none' | 'rain' | 'embers' }`; rooftop dark slate sky, wet dark floor, rain slanting with the gust; volcano dark red sky, orange key light, embers, glow strip beyond each baseline; frozen pale-blue glossy floor, teal sky; gym unchanged. Restart press leak fixed.
- Testing (D.7): unit tests per hook (gating, charge incl. assist window, each ability's effect and expiry, each modifier's stats, gust scheduling, bow zero at both ends, Hot Hand draw order, Earthquake ignores immunity); gym + `NO_ABILITIES` keeps the Phase 4 golden event sequences and scores (hashes re-pinned); one new AI golden per court with abilities; sweep + 5 seeds per court with abilities; balance report + ability uses per character per match (target 1.5–3), per-court mean totals and side bias (45–55 %).

---

## Execution process

As Phases 1–4: one GitHub issue per task, Sonnet 5.5 implements on `task/<N>-<slug>` (`task/1-ability-foundation`, `task/2-abilities`, `task/3-courts`, `task/4-ai-abilities`, `task/5-presentation`), one PR per task, Opus 5.5 reviews on the PR (comment review, first line `VERDICT: …`), merge after approval, final whole-phase Opus review, hardening wave if needed, Fable reassessment on the epic. Milestone **"Phase 5 – Abilities and courts"**, labels `task`, `phase-5`, `epic`. Tasks run in order 1 → 5; each needs the previous one merged.

Each task's implementer runs `npm test -- <file>` while iterating and `npm run format && npm run check` before every commit. Commit messages end with:

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JtcKrCXptNT4ocdP5U9a4d
```

(The `git commit -m` lines below show only the subject; add a blank line and the two trailer lines.)

**Golden pins.** `tests/sim/determinism.test.ts` and `tests/sim/ai-golden.test.ts` carry two kinds of pins after Task 1 Step 1: **state hashes** (change whenever the state shape changes) and **event pins** (`fnv1a(events) score count`, change only if behaviour changes). Task 1 re-pins the four state hashes exactly once and must leave every event pin untouched; Tasks 2–5 must leave **all** of them untouched (they only add behaviour behind abilities and court modifiers, which these runs do not use). Task 4 adds new pins for the per-court goldens with abilities. Whenever a pin must be (re)filled: run the file once **without** `-u` and confirm that only the intended pins fail, then run with `-u`, then run again without `-u` (stable), and put old → new in the PR description.

---

## File structure

```
src/sim/types.ts                 MODIFY  ResolvedStats flags, ActiveAbility, LastCatch, PlayerState fields, ShotFlight.bow,
                                          MatchState.courtState, new SimEvents, CourtDef.modifier (T1); CourtDressing (T3)
src/sim/hooks.ts                 NEW     HOOK_MATH, HookContext, AbilityDef/Effect/Table, NO_ABILITIES, CourtModifier, createHookContext (T1)
src/sim/abilities.ts             NEW     charge constants, rebuildStats, stepActiveAbility, canActivateAbility,
                                          tryActivateAbility, stepAbilityTimer, applyChargeGains (T1)
src/sim/court-drift.ts           NEW     ballDriftOf (T3)
src/sim/stats.ts                 MODIFY  flags in DEFAULT_STATS / resolveStats (T1)
src/sim/match.ts                 MODIFY  baseStats, abilityId, charge, ability, lastCatch, courtState (T1)
src/sim/defence.ts               MODIFY  popBallLoose, knockDown (T1); stealAlwaysSucceeds (T2)
src/sim/tick.ts                  MODIFY  abilities param, steps 1/2/3/9 (T1)
src/sim/shooting.ts              MODIFY  bow: null (T1); dunkFromArc, rocket drive, unblockable, sure shots (T2); bow (T3)
src/sim/passing.ts               MODIFY  bow: null (T1); gust landing shift (T3)
src/sim/player-movement.ts       MODIFY  unlimitedTurbo (T2)
src/sim/index.ts                 MODIFY  exports (T1, T3)
src/sim/ai/memory.ts             MODIFY  specialLastTick (T4)
src/sim/ai/brain.ts              MODIFY  abilities param, wantsAbility, chaseTarget, one-tick SPECIAL (T4)
src/content/abilities/*.ts       NEW     rocket-dunk, hot-hand, blur, earthquake, index (T2)
src/content/courts/*.ts          NEW/MOD gym dressing; rooftop, volcano, frozen; registry (T3)
src/app/session.ts               MODIFY  primeHeldButtons (T1); ABILITIES (T4)
src/app/url-options.ts           MODIFY  courtId (T3)
src/app/match-runner.ts          MODIFY  abilities (T4)
src/app/ai-controller.ts         MODIFY  abilities (T4)
src/app.ts                       MODIFY  restart leak (T1); court (T3); HUD/weather/touch/overlay (T5)
src/ui/hud.ts, hud.css           MODIFY  ability bar, ability banners, GUST chip (T5)
src/ui/debug-overlay.ts          MODIFY  abilityLines (T5)
src/input/touch.ts, touch.css    MODIFY  setSpecialReady (T5)
src/render/court-view.ts         MODIFY  dressing, glow strip (T5)
src/render/weather-view.ts       NEW     rain / embers (T5)
eslint.config.js                 MODIFY  content: no Math.random / Date.now (T1)
README.md                        MODIFY  abilities, ?court= (T5)
tests/sim/abilities.test.ts      NEW     foundation with a fake ability (T1)
tests/sim/ability-effects.test.ts NEW    the four abilities (T2)
tests/sim/court-modifiers.test.ts NEW    the three courts (T3)
tests/sim/ai-abilities.test.ts   NEW     aiWantsToUse, SPECIAL press, chase lead (T4)
tests/sim/determinism.test.ts    MODIFY  event pins (T1 step 1), state re-pins (T1)
tests/sim/ai-golden.test.ts      MODIFY  event pin, re-pin (T1); per-court goldens (T4)
tests/sim/ai-match.ts            MODIFY  court/abilities options (T4)
tests/sim/ai-sweep.test.ts       MODIFY  + 5 seeds per court (T4)
tests/balance/ai.balance.ts      MODIFY  courts, ability uses (T4)
docs/balance/<date>.md           NEW     regenerated report (T4)
tests/ui/hud.test.ts, tests/ui/debug-overlay.test.ts, tests/input/touch.test.ts,
tests/render/court-view.test.ts, tests/render/weather-view.test.ts   (T5)
```

Court facts used in tests: gym `playArea` 28 × 15; hoop 0 rim at `x = −12.425`, hoop 1 rim at `x = +12.425`, rim height 3.05; team 0 attacks hoop 1, team 1 attacks hoop 0. Character facts: Brick `power` 9 (stun resist 27), Ace `defense` 4 (block reach 1.29), Dash `defense` 8 (steal reach 1.11), Rook all 6. `SHOT_TIMING.dunk.releaseTick` 24, jump shot 27, layup 15.

---
### Task 1: Ability foundation — hook types, stats rebuild, activation, timers, charge, restart leak

**Files:**
- Create: `src/sim/hooks.ts`, `src/sim/abilities.ts`, `tests/sim/abilities.test.ts`
- Modify: `src/sim/types.ts`, `src/sim/stats.ts`, `src/sim/match.ts`, `src/sim/defence.ts`, `src/sim/tick.ts`, `src/sim/shooting.ts` (one line), `src/sim/passing.ts` (one line), `src/sim/index.ts`, `src/app/session.ts`, `src/app.ts`, `eslint.config.js`
- Test: `tests/sim/determinism.test.ts`, `tests/sim/ai-golden.test.ts`, `tests/sim/defence.test.ts`, `tests/sim/ai-offense.test.ts` (one literal), `tests/app/session.test.ts`, `tests/lint/boundaries.test.ts`

**Interfaces:**
- Consumes (existing): `tick`, `createMatch`, `RosterEntry`, `applyStun`, `holdPosition`, `justPressed`, `buttonsOf`, `isActionLocked`, `targetHoopIndex`, `hoopGeometry`, `nextFloat`, `nextInt`.
- Produces (later tasks rely on these exact names):
  - `src/sim/types.ts`: `ResolvedStats.{dunkFromArc, unblockableDunk, stealAlwaysSucceeds, unlimitedTurbo}: boolean`; `ActiveAbility { ticksLeft: number | null; uses: number }`; `LastCatch { from: PlayerId; tick: number }`; `PlayerState.{baseStats: ResolvedStats; abilityId: string | null; charge: number; ability: ActiveAbility | null; lastCatch: LastCatch | null}`; `ShotFlight.bow: Vec3 | null`; `CourtState = Record<string, unknown>`; `MatchState.courtState: CourtState`; `CourtDef.modifier?: CourtModifier`; `SimEvent` members `abilityActivated`, `abilityEnded`, `knockdown`, `gustStart { dir: Vec3 }`, `gustEnd`.
  - `src/sim/hooks.ts`: `HOOK_MATH` (`TICK_DT, clamp, lerp, v3Add, v3Sub, v3Scale, v3Length, v3DistanceXZ, nextFloat, nextInt, targetRimDistance(state, player, court)`), `type HookMath`, `interface AbilityQueryContext { math; court }`, `interface HookContext extends AbilityQueryContext { rng; emit(event); knockDown(by, target, ticks) }`, `interface AbilityEffect { onActivate(state, player, ctx); onTick?(state, player, ctx); onEnd?(state, player, ctx); modifyStats?(stats) }`, `interface AbilityDef { id; name; description; icon; durationTicks: number | 'instant' | null; effect; aiWantsToUse?(state, player, ctx: AbilityQueryContext) }`, `type AbilityTable = Readonly<Partial<Record<string, AbilityDef>>>`, `NO_ABILITIES`, `interface CourtModifier { id; name; description; onTick?(state, ctx); modifyStats?(stats, state); aiHint?(state, player): { ballDrift?: Vec3 }; ballDrift?(state): Vec3 | null }`, `createHookContext(state, court, events): HookContext`.
  - `src/sim/abilities.ts`: `CHARGE_MAX = 100`, `CHARGE_GAIN`, `ASSIST_WINDOW_TICKS = 180`, `rebuildStats(state, court)`, `stepActiveAbility(state, player, abilities, ctx)`, `canActivateAbility(state, player, abilities): boolean`, `tryActivateAbility(state, player, intent, abilities, ctx): boolean`, `stepAbilityTimer(state, player, abilities, ctx)`, `applyChargeGains(state, events, passer: PlayerId | null)`.
  - `src/sim/defence.ts`: `knockDown(state, by: PlayerState, target: PlayerState, ticks: number, events: SimEvent[]): void`.
  - `src/sim/tick.ts`: `tick(state, intents, court, abilities: AbilityTable = NO_ABILITIES): TickResult`.
  - `src/app/session.ts`: `primeHeldButtons(state, held)`, `buildSession(options, court, seed, human, held = new Map())`.

- [ ] **Step 1: Pin the golden event sequences on the unchanged code (D.7 invariant)**

Do this first, before any source change, on the fresh branch.

In `tests/sim/determinism.test.ts`, make `play()` return its events too (the state hash does not change):

```ts
function play(): { state: MatchState; events: SimEvent[] } {
  let state = createMatch(settings, court, roster);
  const events: SimEvent[] = [];
  for (let i = 0; i < 1500; i++) {
    const result = tick(
      state,
      new Map([
        ['home1', scriptedIntent(i, 0)],
        ['away1', scriptedIntent(i, 37)],
      ]),
      court,
    );
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
```

Update its two users and add the event pin at the end of the `describe`:

```ts
  it('two runs with the same seed and inputs end in the identical state', () => {
    const a = play();
    const b = play();
    expect(a).toEqual(b);
    expect(a.state.score[0] + a.state.score[1]).toBeGreaterThan(0); // the script actually shoots
  });

  it('matches the pinned hash — update it only for an intentional simulation change', () => {
    expect(fnv1a(JSON.stringify(play().state))).toMatchInlineSnapshot(`"3cbe5a85"`);
  });
```

```ts
  it('pins each run’s events and score (spec D.7: phase 5 never changes them on the gym without abilities)', () => {
    const pin = (run: { state: MatchState; events: SimEvent[] }): string =>
      `${fnv1a(JSON.stringify(run.events))} ${run.state.score[0]}-${run.state.score[1]} ${run.events.length}`;
    expect({
      long: pin(play()),
      short: pin(playShort()),
      teams: pin(playTeams()),
    }).toMatchInlineSnapshot();
  });
```

In `tests/sim/ai-golden.test.ts`, add inside the `describe`:

```ts
  it('pins the events and score (spec D.7: phase 5 never changes them on the gym without abilities)', () => {
    const run = playAiMatch(7);
    expect(
      `${fnv1a(JSON.stringify(run.events))} ${run.state.score[0]}-${run.state.score[1]} ${run.events.length}`,
    ).toMatchInlineSnapshot();
  });
```

Run: `npx vitest run tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts -u`, then `npx vitest run tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts`.
Expected: the second run passes; `git diff` shows the two new snapshots filled and **no** change to the existing hashes `3cbe5a85`, `c2687487`, `3d776fad`, `46c64171`.

```bash
git add tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts
git commit -m "test(sim): pin golden event sequences and scores before phase 5 (spec D.7)"
```

- [ ] **Step 2: Write the failing foundation tests**

Create `tests/sim/abilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { applyChargeGains, ASSIST_WINDOW_TICKS, CHARGE_MAX } from '../../src/sim/abilities';
import { NO_ABILITIES, type AbilityDef, type AbilityTable } from '../../src/sim/hooks';
import { createMatch, findPlayer, type RosterEntry } from '../../src/sim/match';
import { nextFloat } from '../../src/sim/rng';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type CourtDef,
  type MatchState,
  type PlayerIntent,
  type PlayerState,
  type SimEvent,
} from '../../src/sim/types';

const gym = getCourt('gym');
const calls: string[] = [];

/** Test-only ability: records every hook call and doubles run speed for 5 ticks. */
const fake: AbilityDef = {
  id: 'fake',
  name: 'Fake',
  description: 'test',
  icon: '?',
  durationTicks: 5,
  effect: {
    onActivate: (state, player) => {
      calls.push(`activate ${player.id} ${state.tick}`);
    },
    onTick: (state, player) => {
      calls.push(`tick ${player.id} ${state.tick}`);
    },
    onEnd: (state, player) => {
      calls.push(`end ${player.id} ${state.tick}`);
    },
    modifyStats: (stats) => ({ ...stats, runSpeed: stats.runSpeed * 2 }),
  },
};
const instant: AbilityDef = {
  ...fake,
  id: 'instant',
  durationTicks: 'instant',
  effect: { onActivate: () => {} },
};
const untimed: AbilityDef = {
  ...fake,
  id: 'untimed',
  durationTicks: null,
  effect: {
    onActivate: (_state, player) => {
      if (player.ability) player.ability.uses = 2;
    },
  },
};
const TABLE: AbilityTable = { fake, instant, untimed };
const special: PlayerIntent = { ...NO_INTENT, special: true };

function entry(id: string, team: 0 | 1, abilityId: string): RosterEntry {
  return { id, team, characterId: 'rook', character: { ...getCharacter('rook'), abilityId } };
}

function live(abilityId = 'fake', court: CourtDef = gym): MatchState {
  const s = createMatch(
    {
      durationMs: 180_000,
      shotClockMs: 14_000,
      seed: 3,
      ruleIds: [],
      courtId: court.id,
      mode: 'match',
    },
    court,
    [entry('a', 0, abilityId), entry('b', 0, abilityId), entry('x', 1, abilityId)],
  );
  s.phase = 'live';
  return s;
}

function player(s: MatchState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function step(
  s: MatchState,
  intents: Map<string, PlayerIntent> = new Map(),
  table: AbilityTable = TABLE,
  court: CourtDef = gym,
) {
  return tick(s, intents, court, table);
}

describe('player state (spec D.2)', () => {
  it('starts with base stats, no charge, no ability and an empty court state', () => {
    const s = live();
    const a = player(s, 'a');
    expect(a.stats).toEqual(a.baseStats);
    expect(a.stats).toMatchObject({
      dunkFromArc: false,
      unblockableDunk: false,
      stealAlwaysSucceeds: false,
      unlimitedTurbo: false,
    });
    expect(a.abilityId).toBe('fake');
    expect(a.charge).toBe(0);
    expect(a.ability).toBeNull();
    expect(a.lastCatch).toBeNull();
    expect(s.courtState).toEqual({});
  });

  it('placeholders have no ability', () => {
    const s = createMatch(
      { durationMs: 1000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: 'gym', mode: 'match' },
      gym,
      [{ id: 'p', team: 0, characterId: 'placeholder' }],
    );
    expect(player(s, 'p').abilityId).toBeNull();
  });

  it('rebuilds stats from baseStats every tick', () => {
    const s = live();
    player(s, 'a').stats.runSpeed = 99;
    const { state } = step(s);
    expect(player(state, 'a').stats).toEqual(player(state, 'a').baseStats);
  });
});

describe('activation (spec D.2 step 3)', () => {
  it('a SPECIAL press with a full bar activates: charge 0, timer, event, onActivate, stats at once', () => {
    calls.length = 0;
    const s = live();
    player(s, 'a').charge = CHARGE_MAX;
    const { state, events } = step(s, new Map([['a', special]]));
    const a = player(state, 'a');
    expect(a.charge).toBe(0);
    // durationTicks 5; step 9 of the activation tick already counted one.
    expect(a.ability).toEqual({ ticksLeft: 4, uses: 0 });
    expect(events).toContainEqual({ type: 'abilityActivated', playerId: 'a', abilityId: 'fake' });
    expect(calls).toEqual([`activate a ${state.tick}`]);
    expect(a.stats.runSpeed).toBeCloseTo(a.baseStats.runSpeed * 2);
  });

  const blocked: [string, (s: MatchState) => void, AbilityTable][] = [
    ['with NO_ABILITIES', () => {}, NO_ABILITIES],
    ['below a full bar', (s) => void (player(s, 'a').charge = 99), TABLE],
    ['outside live play', (s) => void (s.phase = 'scored'), TABLE],
    [
      'in the air',
      (s) => {
        const a = player(s, 'a');
        a.onGround = false;
        a.pos.y = 1;
      },
      TABLE,
    ],
    ['while action-locked', (s) => void (player(s, 'a').action = 'steal'), TABLE],
    ['while already active', (s) => void (player(s, 'a').ability = { ticksLeft: 50, uses: 0 }), TABLE],
    ['when SPECIAL was already held', (s) => void (player(s, 'a').prevButtons.special = true), TABLE],
  ];
  for (const [name, arrange, table] of blocked) {
    it(`does nothing ${name}`, () => {
      const s = live();
      player(s, 'a').charge = CHARGE_MAX;
      arrange(s);
      const { events } = step(s, new Map([['a', special]]), table);
      expect(events.some((e) => e.type === 'abilityActivated')).toBe(false);
    });
  }
});

describe('timers and expiry (spec D.2 step 9)', () => {
  it('runs onTick after activation and ends after durationTicks ticks, activation tick included', () => {
    calls.length = 0;
    const s0 = live();
    player(s0, 'a').charge = CHARGE_MAX;
    let r = step(s0, new Map([['a', special]]));
    let s = r.state;
    const all: SimEvent[] = [...r.events];
    const t = s.tick;
    for (let i = 0; i < 6; i++) {
      r = step(s);
      s = r.state;
      all.push(...r.events);
    }
    expect(calls).toEqual([
      `activate a ${t}`,
      `tick a ${t + 1}`,
      `tick a ${t + 2}`,
      `tick a ${t + 3}`,
      `tick a ${t + 4}`,
      `end a ${t + 4}`,
    ]);
    expect(all.filter((e) => e.type === 'abilityEnded')).toEqual([
      { type: 'abilityEnded', playerId: 'a', abilityId: 'fake' },
    ]);
    expect(player(s, 'a').ability).toBeNull();
    expect(player(s, 'a').stats.runSpeed).toBeCloseTo(player(s, 'a').baseStats.runSpeed);
  });

  it('an instant ability ends on its activation tick', () => {
    const s = live('instant');
    player(s, 'a').charge = CHARGE_MAX;
    const { state, events } = step(s, new Map([['a', special]]));
    const types = events.map((e) => e.type);
    expect(types.indexOf('abilityActivated')).toBeLessThan(types.indexOf('abilityEnded'));
    expect(player(state, 'a').ability).toBeNull();
  });

  it('an untimed ability lasts until its uses run out', () => {
    const s0 = live('untimed');
    player(s0, 'a').charge = CHARGE_MAX;
    let s = step(s0, new Map([['a', special]])).state;
    expect(player(s, 'a').ability).toEqual({ ticksLeft: null, uses: 2 });
    for (let i = 0; i < 100; i++) s = step(s).state;
    expect(player(s, 'a').ability).toEqual({ ticksLeft: null, uses: 2 });
    const a = player(s, 'a');
    if (a.ability) a.ability.uses = 0;
    const r = step(s);
    expect(r.events).toContainEqual({ type: 'abilityEnded', playerId: 'a', abilityId: 'untimed' });
    expect(player(r.state, 'a').ability).toBeNull();
  });

  it('never mutates the input state while an ability runs', () => {
    const s = live();
    player(s, 'a').ability = { ticksLeft: 3, uses: 0 };
    const snapshot = structuredClone(s);
    step(s, new Map([['a', special]]));
    expect(s).toEqual(snapshot);
  });
});

describe('charge gains (spec D.2)', () => {
  const basket = (playerId: string, points: 2 | 3): SimEvent => ({
    type: 'basket',
    playerId,
    team: 0,
    points,
    shotType: 'jumpshot',
  });

  it('baskets pay +12 / +18 to the scorer, steals and blocks +15, capped at 100', () => {
    const s = live();
    applyChargeGains(s, [basket('a', 2)], null);
    expect(player(s, 'a').charge).toBe(12);
    applyChargeGains(s, [basket('a', 3)], null);
    expect(player(s, 'a').charge).toBe(30);
    applyChargeGains(
      s,
      [
        { type: 'steal', by: 'x', from: 'a' },
        { type: 'block', by: 'x', shooter: 'a' },
      ],
      null,
    );
    expect(player(s, 'x').charge).toBe(30);
    player(s, 'a').charge = 95;
    applyChargeGains(s, [basket('a', 3)], null);
    expect(player(s, 'a').charge).toBe(CHARGE_MAX);
  });

  it('pays nothing while one’s own ability is active', () => {
    const s = live();
    player(s, 'a').ability = { ticksLeft: 10, uses: 0 };
    applyChargeGains(s, [basket('a', 3)], null);
    expect(player(s, 'a').charge).toBe(0);
  });

  it('an assist pays the passer when the receiver scores within 180 ticks of the catch', () => {
    const s = live();
    s.tick = 1000;
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'a');
    expect(player(s, 'b').lastCatch).toEqual({ from: 'a', tick: 1000 });
    s.tick = 1000 + ASSIST_WINDOW_TICKS;
    applyChargeGains(s, [basket('b', 2)], null);
    expect(player(s, 'a').charge).toBe(10);
    expect(player(s, 'b').charge).toBe(12);
    expect(player(s, 'b').lastCatch).toBeNull();
  });

  it('no assist after the window, and no lastCatch from an opponent’s pass', () => {
    const s = live();
    s.tick = 1000;
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'a');
    s.tick = 1001 + ASSIST_WINDOW_TICKS;
    applyChargeGains(s, [basket('b', 2)], null);
    expect(player(s, 'a').charge).toBe(0);
    applyChargeGains(s, [{ type: 'catch', playerId: 'b' }], 'x');
    expect(player(s, 'b').lastCatch).toBeNull();
  });

  it('charge persists across phases', () => {
    let s = live();
    player(s, 'a').charge = 40;
    s.phase = 'scored';
    s.phaseTicks = 89;
    for (let i = 0; i < 5; i++) s = step(s).state;
    expect(s.phase).toBe('live');
    expect(player(s, 'a').charge).toBe(40);
  });
});

describe('court modifier hooks and the hook context (spec D.2 step 1, A.7)', () => {
  it('onTick runs first with the match RNG and can emit; modifyStats rebuilds from base with the state', () => {
    const seen: number[] = [];
    const windy: CourtDef = {
      ...gym,
      id: 'windy',
      modifier: {
        id: 'test',
        name: 'Test',
        description: '',
        onTick: (state, ctx) => {
          seen.push(ctx.math.nextFloat(ctx.rng));
          ctx.emit({ type: 'gustEnd' });
          state.courtState.ticks = ((state.courtState.ticks as number | undefined) ?? 0) + 1;
        },
        modifyStats: (stats, state) => ({
          ...stats,
          runSpeed: stats.runSpeed + (state.courtState.ticks as number),
        }),
      },
    };
    const s = live('fake', windy);
    const expected = { seed: s.rng.seed };
    const draw = nextFloat(expected);
    const { state, events } = step(s, new Map(), TABLE, windy);
    expect(seen).toEqual([draw]);
    expect(state.rng.seed).toBe(expected.seed);
    expect(events[0]).toEqual({ type: 'gustEnd' });
    expect(state.courtState).toEqual({ ticks: 1 });
    expect(player(state, 'a').stats.runSpeed).toBeCloseTo(player(state, 'a').baseStats.runSpeed + 1);
    expect(s.courtState).toEqual({});
  });
});
```

Append to `tests/sim/defence.test.ts` (add `knockDown` to the existing `../../src/sim/defence` import):

```ts
describe('knockDown (spec D.3, used by Earthquake through the hook context)', () => {
  it('stuns for exactly the given ticks, ignoring resistance and immunity; a holder drops the ball', () => {
    const s = setup();
    const a = findPlayer(s, 'a');
    const x = findPlayer(s, 'x');
    if (!a || !x) throw new Error('no players');
    a.shoveImmunityTicks = 30;
    const events: SimEvent[] = [];
    knockDown(s, x, a, 90, events);
    expect(a.action).toBe('stunned');
    expect(a.stunTicks).toBe(90);
    expect(s.ball.holder).toBeNull();
    expect(s.ball.mode).toBe('free');
    expect(s.ball.vel.y).toBeGreaterThan(0);
    expect(events).toEqual([{ type: 'knockdown', by: 'x', target: 'a' }]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/sim/abilities.test.ts tests/sim/defence.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/sim/abilities"` / `knockDown is not a function`.

- [ ] **Step 4: Types**

In `src/sim/types.ts`:

1. Add after the existing imports:

```ts
import type { CourtModifier } from './hooks';
```

2. Append to `ResolvedStats` (after `stunResistTicks: number;`):

```ts
  /** Spec D.2 ability flags: false unless an active ability sets them. Rocket Dunk: a shot press inside the 3-point line is a dunk. */
  dunkFromArc: boolean;
  /** Rocket Dunk: tryBlockShot ignores this player's dunks. */
  unblockableDunk: boolean;
  /** Blur: a steal that reaches the holder always succeeds (the draw is still taken). */
  stealAlwaysSucceeds: boolean;
  /** Blur: turbo never drains. */
  unlimitedTurbo: boolean;
```

3. Insert before `export interface PlayerState`:

```ts
/** Spec D.2: a signature ability in progress. */
export interface ActiveAbility {
  /** Ticks left before it ends; null = no timer (it ends when `uses` reaches 0). */
  ticksLeft: number | null;
  /** Shots that cannot miss (Hot Hand, spec D.3); 0 for every other ability. */
  uses: number;
}

/** The last pass this player caught from a teammate: the assist window (spec D.2). */
export interface LastCatch {
  from: PlayerId;
  tick: number;
}
```

4. In `PlayerState`, replace `  stats: ResolvedStats;` with:

```ts
  /** Derived every tick (spec D.2): baseStats × court modifier × active ability. */
  stats: ResolvedStats;
  /** Resolved once from the character; `stats` is rebuilt from it at the start of every tick. */
  baseStats: ResolvedStats;
  /** The character's signature ability, or null (placeholders). */
  abilityId: string | null;
  /** Ability charge, 0..100; a full bar plus SPECIAL activates (spec D.2). */
  charge: number;
  ability: ActiveAbility | null;
  lastCatch: LastCatch | null;
```

5. In `ShotFlight`, after `team: TeamIndex;` add:

```ts
  /** Spec D.4: sideways bow amplitude of a shot released in a gust (sin-shaped, zero at both ends); null otherwise. */
  bow: Vec3 | null;
```

6. Before `export interface MatchState` add, and inside `MatchState` after `settings: MatchSettings;` add the field:

```ts
/** Plain, JSON-safe state owned by the court's modifier (spec D.2); `{}` when there is none. */
export type CourtState = Record<string, unknown>;
```

```ts
  courtState: CourtState;
```

7. Extend `SimEvent` (after the `shove` member):

```ts
  | { type: 'shove'; by: PlayerId; target: PlayerId }
  | { type: 'abilityActivated'; playerId: PlayerId; abilityId: string }
  | { type: 'abilityEnded'; playerId: PlayerId; abilityId: string }
  | { type: 'knockdown'; by: PlayerId; target: PlayerId }
  | { type: 'gustStart'; dir: Vec3 }
  | { type: 'gustEnd' };
```

8. In `CourtDef`, after `lighting: {…};` add:

```ts
  /** Spec §7.1 / D.4: the court's light gameplay modifier (none on the gym). */
  modifier?: CourtModifier;
```

- [ ] **Step 5: Flags in the stat table**

In `src/sim/stats.ts`, append to `DEFAULT_STATS` (after `stunResistTicks: 15,`) and to the object returned by `resolveStats` (after `stunResistTicks: 3 * s.power,`):

```ts
  dunkFromArc: false,
  unblockableDunk: false,
  stealAlwaysSucceeds: false,
  unlimitedTurbo: false,
```

- [ ] **Step 6: `knockDown` and the shared ball drop**

In `src/sim/defence.ts`, add `awayFrom` and `popBallLoose` after `movingAway`, replace `resolveShove` with the version below (identical behaviour, now sharing `popBallLoose`), and add `knockDown` after it:

```ts
/** Unit vector on the court plane from `from` towards `to` (0, 0 when they coincide). */
function awayFrom(from: PlayerState, to: PlayerState): { ux: number; uz: number } {
  const dx = to.pos.x - from.pos.x;
  const dz = to.pos.z - from.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  return { ux: dx / len, uz: dz / len };
}

/** A knocked-down holder loses the ball: it pops out of their hand, away from the hit (spec B.4). */
function popBallLoose(state: MatchState, holder: PlayerState, ux: number, uz: number): void {
  const { ball } = state;
  const hand = holdPosition(holder);
  ball.mode = 'free';
  ball.holder = null;
  ball.flight = null;
  ball.lastShot = null;
  ball.freeTicks = 0;
  ball.pos = { x: hand.x, y: hand.y + 0.3, z: hand.z };
  ball.vel = { x: ux * POP_SPEED, y: POP_SPEED, z: uz * POP_SPEED };
}

/** Spec B.4 shove: the nearest opponent in reach and in front is knocked down; the ball pops loose. */
export function resolveShove(state: MatchState, shover: PlayerState, events: SimEvent[]): void {
  const target = shover.targetId === null ? undefined : findPlayer(state, shover.targetId);
  if (!target || target.team === shover.team || !canBeShoved(target)) return;
  if (v3DistanceXZ(shover.pos, target.pos) > SHOVE_REACH || !inFront(shover, target.pos)) return;
  const dealt = shover.stats.stunTicksDealt * (shover.turboActive ? SHOVE_TURBO_MULTIPLIER : 1);
  const stun = dealt - target.stats.stunResistTicks;
  const { ux, uz } = awayFrom(shover, target);
  applyStun(target, stun);
  target.vel.x = ux * POP_SPEED;
  target.vel.z = uz * POP_SPEED;
  if (state.ball.holder === target.id) popBallLoose(state, target, ux, uz);
  events.push({ type: 'shove', by: shover.id, target: target.id });
}

/**
 * Spec D.3 (Earthquake): `target` is knocked down for exactly `ticks`, ignoring stun resistance and
 * shove immunity; the normal get-up and immunity follow. A holder drops the ball as after a shove.
 */
export function knockDown(
  state: MatchState,
  by: PlayerState,
  target: PlayerState,
  ticks: number,
  events: SimEvent[],
): void {
  const { ux, uz } = awayFrom(by, target);
  applyStun(target, ticks);
  target.vel.x = ux * POP_SPEED;
  target.vel.z = uz * POP_SPEED;
  if (state.ball.holder === target.id) popBallLoose(state, target, ux, uz);
  events.push({ type: 'knockdown', by: by.id, target: target.id });
}
```

- [ ] **Step 7: Hook types and the hook context**

Create `src/sim/hooks.ts`:

```ts
import { TICK_DT } from './constants';
import { knockDown } from './defence';
import { hoopGeometry } from './hoop';
import { clamp, lerp, v3Add, v3DistanceXZ, v3Length, v3Scale, v3Sub, type Vec3 } from './math';
import { nextFloat, nextInt, type RngState } from './rng';
import { targetHoopIndex } from './shooting';
import type { CourtDef, MatchState, PlayerState, ResolvedStats, SimEvent } from './types';

/**
 * Spec A.7 / D.2: the sim's pure helpers, handed to content hooks (content may import only types
 * from `src/sim`). Content draws randomness only as `ctx.math.nextFloat(ctx.rng)` or
 * `ctx.math.nextInt(ctx.rng, n)`.
 */
export const HOOK_MATH = Object.freeze({
  TICK_DT,
  clamp,
  lerp,
  v3Add,
  v3Sub,
  v3Scale,
  v3Length,
  v3DistanceXZ,
  nextFloat,
  nextInt,
  /** XZ distance from `player` to the rim they shoot at (spec A.4 target hoop). */
  targetRimDistance(state: MatchState, player: PlayerState, court: CourtDef): number {
    const rim = hoopGeometry(court, targetHoopIndex(state, player, court)).rimCenter;
    return v3DistanceXZ(player.pos, rim);
  },
});
export type HookMath = typeof HOOK_MATH;

/** What `aiWantsToUse` may look at: no RNG, so brains never touch `state.rng` (spec C.2). */
export interface AbilityQueryContext {
  math: HookMath;
  court: CourtDef;
}

/** Spec D.2: everything a hook may use besides the state and its own arguments. */
export interface HookContext extends AbilityQueryContext {
  /** `state.rng`; hooks draw only through it (spec A.7, D.2). */
  rng: RngState;
  /** Adds an event to this tick's events. */
  emit(event: SimEvent): void;
  /** Spec D.3: knock `target` down for `ticks`, ignoring stun resistance and shove immunity. */
  knockDown(by: PlayerState, target: PlayerState, ticks: number): void;
}

/** Spec §5.3 / D.2. Hooks mutate the state they are given; `modifyStats` returns a new object. */
export interface AbilityEffect {
  onActivate(state: MatchState, player: PlayerState, ctx: HookContext): void;
  onTick?(state: MatchState, player: PlayerState, ctx: HookContext): void;
  onEnd?(state: MatchState, player: PlayerState, ctx: HookContext): void;
  modifyStats?(stats: ResolvedStats): ResolvedStats;
}

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Ticks it lasts; 'instant' ends on the activation tick; null lasts until its `uses` run out. */
  durationTicks: number | 'instant' | null;
  effect: AbilityEffect;
  /** Spec D.5: checked on AI decision ticks only, when the ability could activate. */
  aiWantsToUse?(state: MatchState, player: PlayerState, ctx: AbilityQueryContext): boolean;
}

/** Abilities keyed by id; the app passes the content table, tests pass their own. */
export type AbilityTable = Readonly<Partial<Record<string, AbilityDef>>>;

/** With this table nothing ever activates (the gym baseline of spec D.2). */
export const NO_ABILITIES: AbilityTable = Object.freeze({});

/** Spec §7.1 / D.4. */
export interface CourtModifier {
  id: string;
  name: string;
  description: string;
  onTick?(state: MatchState, ctx: HookContext): void;
  modifyStats?(stats: ResolvedStats, state: MatchState): ResolvedStats;
  aiHint?(state: MatchState, player: PlayerState): { ballDrift?: Vec3 };
  /** Horizontal acceleration (m/s²) the weather puts on the ball right now, or null; read when a shot or pass is released. */
  ballDrift?(state: MatchState): Vec3 | null;
}

/** One context per tick, bound to the state being built and this tick's events. */
export function createHookContext(
  state: MatchState,
  court: CourtDef,
  events: SimEvent[],
): HookContext {
  return {
    rng: state.rng,
    math: HOOK_MATH,
    court,
    emit: (event) => {
      events.push(event);
    },
    knockDown: (by, target, ticks) => knockDown(state, by, target, ticks, events),
  };
}
```

- [ ] **Step 8: The ability pipeline**

Create `src/sim/abilities.ts`:

```ts
import { justPressed } from './buttons';
import type { AbilityTable, HookContext } from './hooks';
import { allPlayers, findPlayer } from './match';
import { isActionLocked } from './player-movement';
import type {
  CourtDef,
  MatchState,
  PlayerId,
  PlayerIntent,
  PlayerState,
  ResolvedStats,
  SimEvent,
} from './types';

/** Spec D.2: a full bar. */
export const CHARGE_MAX = 100;
/** Spec D.2 charge gains (≈ 2 uses per player per match). */
export const CHARGE_GAIN = Object.freeze({ basket2: 12, basket3: 18, assist: 10, steal: 15, block: 15 });
/** A basket within this many ticks of catching a teammate's pass is an assist. */
export const ASSIST_WINDOW_TICKS = 180;

/** Pipeline step 1: every player's stats from base, through the court modifier (spec D.2). */
export function rebuildStats(state: MatchState, court: CourtDef): void {
  for (const player of allPlayers(state)) {
    const base: ResolvedStats = { ...player.baseStats };
    player.stats = court.modifier?.modifyStats ? court.modifier.modifyStats(base, state) : base;
  }
}

/** Pipeline step 2: the active ability's onTick, then its modifyStats. */
export function stepActiveAbility(
  state: MatchState,
  player: PlayerState,
  abilities: AbilityTable,
  ctx: HookContext,
): void {
  if (player.ability === null || player.abilityId === null) return;
  const def = abilities[player.abilityId];
  if (!def) return;
  def.effect.onTick?.(state, player, ctx);
  if (def.effect.modifyStats) player.stats = def.effect.modifyStats(player.stats);
}

/** Spec D.2 gating: own ability known, none active, full bar, live play, on the ground, not locked. */
export function canActivateAbility(
  state: MatchState,
  player: PlayerState,
  abilities: AbilityTable,
): boolean {
  if (player.abilityId === null || player.ability !== null || player.charge < CHARGE_MAX)
    return false;
  if (!abilities[player.abilityId]) return false;
  return state.phase === 'live' && player.onGround && !isActionLocked(player);
}

/**
 * Pipeline step 3: a SPECIAL press activates the ability. Its modifyStats applies at once, so a
 * timed ability affects exactly `durationTicks` ticks counting this one. True when it activated.
 */
export function tryActivateAbility(
  state: MatchState,
  player: PlayerState,
  intent: PlayerIntent,
  abilities: AbilityTable,
  ctx: HookContext,
): boolean {
  if (!justPressed(player.prevButtons, intent, 'special')) return false;
  if (!canActivateAbility(state, player, abilities) || player.abilityId === null) return false;
  const def = abilities[player.abilityId];
  if (!def) return false;
  player.charge = 0;
  player.ability = {
    ticksLeft: typeof def.durationTicks === 'number' ? def.durationTicks : null,
    uses: 0,
  };
  ctx.emit({ type: 'abilityActivated', playerId: player.id, abilityId: def.id });
  def.effect.onActivate(state, player, ctx);
  if (def.effect.modifyStats) player.stats = def.effect.modifyStats(player.stats);
  return true;
}

/**
 * Pipeline step 9: a timer counts down and ends the ability at 0; an untimed one (Hot Hand,
 * instant) ends once its uses are 0.
 */
export function stepAbilityTimer(
  state: MatchState,
  player: PlayerState,
  abilities: AbilityTable,
  ctx: HookContext,
): void {
  const active = player.ability;
  if (active === null) return;
  if (active.ticksLeft !== null) {
    active.ticksLeft -= 1;
    if (active.ticksLeft > 0) return;
  } else if (active.uses > 0) {
    return;
  }
  const abilityId = player.abilityId ?? '';
  player.ability = null;
  abilities[abilityId]?.effect.onEnd?.(state, player, ctx);
  ctx.emit({ type: 'abilityEnded', playerId: player.id, abilityId });
}

/**
 * Pipeline step 9: charge from this tick's events (spec D.2). `passer` is the thrower of the pass
 * that was in the air this tick, so a `catch` records the receiver's assist window. Nothing is
 * gained while one's own ability is active; the bar caps at CHARGE_MAX.
 */
export function applyChargeGains(
  state: MatchState,
  events: readonly SimEvent[],
  passer: PlayerId | null,
): void {
  const add = (id: PlayerId, amount: number): void => {
    const p = findPlayer(state, id);
    if (!p || p.ability !== null) return;
    p.charge = Math.min(CHARGE_MAX, p.charge + amount);
  };
  for (const event of events) {
    switch (event.type) {
      case 'catch': {
        const receiver = findPlayer(state, event.playerId);
        const from = passer === null ? undefined : findPlayer(state, passer);
        if (receiver && from && from.team === receiver.team && from.id !== receiver.id)
          receiver.lastCatch = { from: from.id, tick: state.tick };
        break;
      }
      case 'basket': {
        add(event.playerId, event.points === 3 ? CHARGE_GAIN.basket3 : CHARGE_GAIN.basket2);
        const scorer = findPlayer(state, event.playerId);
        const last = scorer?.lastCatch;
        if (scorer && last && state.tick - last.tick <= ASSIST_WINDOW_TICKS)
          add(last.from, CHARGE_GAIN.assist);
        if (scorer) scorer.lastCatch = null;
        break;
      }
      case 'steal':
        add(event.by, CHARGE_GAIN.steal);
        break;
      case 'block':
        add(event.by, CHARGE_GAIN.block);
        break;
      default:
        break;
    }
  }
}
```

- [ ] **Step 9: New player and match fields**

In `src/sim/match.ts`, inside `createMatch`'s returned object add after `settings: …,`:

```ts
    courtState: {},
```

and replace `createPlayer` with:

```ts
function createPlayer(entry: RosterEntry, indexInTeam: number, court: CourtDef): PlayerState {
  const side = entry.team === 0 ? -1 : 1;
  const baseStats = entry.character ? resolveStats(entry.character) : { ...DEFAULT_STATS };
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
    cooldowns: { block: 0, steal: 0, shove: 0 },
    stunTicks: 0,
    shoveImmunityTicks: 0,
    callingForPassTicks: 0,
    targetId: null,
    stats: { ...baseStats },
    baseStats,
    abilityId: entry.character?.abilityId ?? null,
    charge: 0,
    ability: null,
    lastCatch: null,
  };
}
```

In `src/sim/shooting.ts` (`launchShot`, the `ball.flight = { … }` literal) and `src/sim/passing.ts` (`releasePass`, the `ball.flight = { … }` literal), add after `team: player.team,`:

```ts
    bow: null,
```

In `tests/sim/ai-offense.test.ts`, the hand-built flight in "crashes the boards …" gets `bow: null,` after `team: 0,`.

- [ ] **Step 10: Wire steps 1, 2, 3 and 9 into the tick**

Replace `src/sim/tick.ts` with:

```ts
import {
  applyChargeGains,
  rebuildStats,
  stepAbilityTimer,
  stepActiveAbility,
  tryActivateAbility,
} from './abilities';
import { stepLockedAction } from './actions';
import { stepBall, tryPickup } from './ball';
import { deflectBallOffPlayers, separatePlayers } from './bodies';
import { buttonsOf, justPressed } from './buttons';
import { TICK_DT } from './constants';
import {
  chooseDefensiveAction,
  nearestOpponent,
  startBlock,
  startShove,
  startSteal,
  stepDefenceAction,
} from './defence';
import { createHookContext, NO_ABILITIES, type AbilityTable } from './hooks';
import { allPlayers, findPlayer } from './match';
import { receivingTeam, setPhase, stepClocks, stepPhases } from './phases';
import { isActionLocked, startJump, stepPlayer, stepTurbo } from './player-movement';
import { callForPass, startPass, stepPassAction, stepPassFlight } from './passing';
import { applyRules } from './rules';
import { detectBasket, startShot, stepFlight } from './shooting';
import { NO_INTENT } from './types';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, PlayerState, SimEvent } from './types';

export interface TickResult {
  state: MatchState;
  events: SimEvent[];
}

/**
 * Advances the match by one fixed step (spec §4.2, D.2). Pure: returns a new state and never
 * mutates `state`. Pipeline order is part of the game's definition — keep it stable:
 *   1. court modifier onTick, then every player's stats rebuilt from base
 *   2. active abilities: onTick, modifyStats
 *   3. SPECIAL presses (everyone), then intents → actions
 *   4. move players
 *   5. move ball (held / flight / free, incl. floor, rim and board)
 *   6. bodies: player separation, ball deflection, pickup
 *   7. rules
 *   8. scoring / phases
 *   9. timers, charge gains, ability timers
 *  10. events
 * With `NO_ABILITIES` (the default) nothing activates.
 */
export function tick(
  state: MatchState,
  intents: ReadonlyMap<PlayerId, PlayerIntent>,
  court: CourtDef,
  abilities: AbilityTable = NO_ABILITIES,
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
  const ctx = createHookContext(next, court, events);

  // 1. court modifier, then stats rebuilt from base
  court.modifier?.onTick?.(next, ctx);
  rebuildStats(next, court);

  // 2. active abilities
  for (const player of players) stepActiveAbility(next, player, abilities, ctx);

  // 3. SPECIAL presses for everyone first (an Earthquake locks its victims out this tick), then actions
  for (const player of players)
    tryActivateAbility(next, player, intentFor(player), abilities, ctx);
  for (const player of players) resolveAction(next, player, intentFor(player), court, events);
  // Any catch this tick comes from the pass in the air now (assists, spec D.2).
  const passer = next.ball.flight?.kind === 'pass' ? next.ball.flight.passer : null;

  // 4. move players
  for (const player of players) stepPlayer(player, intentFor(player), court, TICK_DT);

  // 5. move ball
  const prevBallPos = { ...next.ball.pos };
  if (next.ball.mode === 'flight' && next.ball.flight?.kind === 'pass')
    stepPassFlight(next, court, events);
  else if (next.ball.mode === 'flight') stepFlight(next.ball, court);
  else stepBall(next, court, events);

  // 6. bodies
  separatePlayers(players, court);
  deflectBallOffPlayers(next, events);
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

  // 9. timers, charge, abilities
  stepClocks(
    next,
    events,
    events.some((e) => e.type === 'rimHit'),
  );
  applyChargeGains(next, events, passer);
  for (const player of players) {
    stepTurbo(player);
    if (player.shotCooldownTicks > 0) player.shotCooldownTicks -= 1;
    if (player.cooldowns.block > 0) player.cooldowns.block -= 1;
    if (player.cooldowns.steal > 0) player.cooldowns.steal -= 1;
    if (player.cooldowns.shove > 0) player.cooldowns.shove -= 1;
    if (player.shoveImmunityTicks > 0) player.shoveImmunityTicks -= 1;
    if (player.callingForPassTicks > 0) player.callingForPassTicks -= 1;
    stepAbilityTimer(next, player, abilities, ctx);
    player.prevButtons = buttonsOf(intentFor(player));
  }

  return { state: next, events };
}
```

followed by the unchanged `resolveAction` function (copy it verbatim from the current file).

In `src/sim/index.ts` add after `export * from './defence';`:

```ts
export * from './hooks';
export * from './abilities';
```

- [ ] **Step 11: Run the foundation tests**

Run: `npm test -- tests/sim/abilities.test.ts tests/sim/defence.test.ts`
Expected: PASS.

Run: `npx tsc -p tsconfig.json && npx tsc -p tsconfig.sim.json`
Expected: no errors. (If a test file builds a `ShotFlight` or `PlayerState` literal that now misses a field, add the field there — `bow: null` / the five player fields — never loosen the type.)

- [ ] **Step 12: Re-pin the state hashes, and only them**

Run: `npx vitest run tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts`
Expected: exactly **four** failures — the three `matches the pinned … hash` tests in `determinism.test.ts` and `matches the pinned hash` in `ai-golden.test.ts` (new state fields). Both **event pin** tests from Step 1 must PASS. If an event pin fails, stop: something changed behaviour on the gym without abilities (typical causes: stats not copied exactly from base, a changed draw, `resolveShove` not byte-identical); fix it before going on.

Then run `npx vitest run tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts -u`, run once more without `-u` (PASS), and check `git diff tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts`: only the four hash strings changed. Record `old → new` for each in the PR description with the reason "phase 5 state fields (baseStats, abilityId, charge, ability, lastCatch, stat flags, courtState, flight bow)".

- [ ] **Step 13: Restart press leak (D.6) — failing test**

In `tests/app/session.test.ts`, add `findPlayer` (`import { findPlayer } from '../../src/sim/match';`) and inside the `describe`:

```ts
  it('seeds every prevButtons with the buttons held at the restart (spec D.6)', () => {
    const held = new Map([['home1', { ...NO_INTENT, pass: true, special: true }]]);
    const session = buildSession(base, court, 9, () => NO_INTENT, held);
    expect(findPlayer(session.runner.current, 'home1')?.prevButtons).toEqual({
      action: false,
      pass: true,
      special: true,
      turbo: false,
    });
    expect(findPlayer(session.runner.current, 'away1')?.prevButtons.pass).toBe(false);
    // Still holding PASS on the first tick of the new match is not a press: no call for the ball leaks in.
    session.runner.step(new Map([['home1', { ...NO_INTENT, pass: true }]]));
    expect(findPlayer(session.runner.current, 'home1')?.callingForPassTicks).toBe(0);
  });
```

Run: `npm test -- tests/app/session.test.ts`
Expected: FAIL (`buildSession` ignores the fifth argument; `prevButtons.pass` is false).

- [ ] **Step 14: Restart press leak — implementation**

In `src/app/session.ts`, add the imports `import { buttonsOf } from '../sim/buttons';` and `MatchState`, `PlayerIntent` to the `../sim/types` type import, then add `primeHeldButtons` and change `buildSession`:

```ts
/** Spec D.6: buttons held when a match starts are not presses in it (the restart press must not leak). */
export function primeHeldButtons(
  state: MatchState,
  held: ReadonlyMap<PlayerId, PlayerIntent>,
): void {
  for (const team of state.teams) {
    for (const player of team.players) {
      const intent = held.get(player.id);
      if (intent) player.prevButtons = buttonsOf(intent);
    }
  }
}

/** A match and its controllers for `seed`; built again with `seed + 1` on restart (spec C.6). */
export function buildSession(
  options: GameOptions,
  court: CourtDef,
  seed: number,
  human: Controller,
  held: ReadonlyMap<PlayerId, PlayerIntent> = new Map(),
): Session {
  const state = createMatch(buildSettings(options, court, seed), court, buildRoster(options));
  primeHeldButtons(state, held);
  const runner = new MatchRunner(court, state);
  const controllers = new Map<PlayerId, Controller>([[HUMAN_ID, human]]);
  const ais: AiController[] = [];
  if (options.mode === 'shootaround') {
    controllers.set('home2', teammateDummy('home2', HUMAN_ID, court));
    controllers.set('away1', defenderDummy('away1', HUMAN_ID, court));
  } else {
    const profile = AI_PROFILES[options.aiProfile];
    const brains: [PlayerId, number, boolean][] = [
      ['home2', 1, true],
      ['away1', 0, false],
      ['away2', 1, false],
    ];
    for (const [id, slot, favourTeammate] of brains) {
      const ai = createAiController(id, court, { profile, seed, slot, favourTeammate });
      ais.push(ai);
      controllers.set(id, ai.controller);
    }
  }
  return { runner, controllers, ais };
}
```

In `src/app.ts`, replace the `restart` function with:

```ts
  const restart = (): void => {
    seed += 1;
    // Spec D.6: the buttons held right now (the restarting press) are not presses in the new match.
    session = buildSession(options, court, seed, human, intents);
    lastTickNumber = session.runner.current.tick;
  };
```

Run: `npm test -- tests/app/session.test.ts`
Expected: PASS.

- [ ] **Step 15: Lint — content never reaches for `Math.random` or the clock**

In `eslint.config.js`, inside the `src/content/**/*.ts` block's `rules`, add:

```js
      // Hooks run inside tick(): randomness only through ctx.rng (spec A.7).
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Content draws randomness through ctx.rng (spec A.7)' },
        { object: 'Date', property: 'now', message: 'Content must not read the wall clock' },
      ],
```

Append to `tests/lint/boundaries.test.ts` inside `describe('src/content boundary', …)`:

```ts
  it('rejects Math.random', async () => {
    expect(await errorsFor('src/content/probe.ts', 'export const r = Math.random();')).not.toHaveLength(0);
  });

  it('accepts an ability written against the hook types only', async () => {
    expect(
      await errorsFor(
        'src/content/probe.ts',
        "import type { AbilityDef } from '../sim/hooks';\n" +
          "export const a: AbilityDef = { id: 'x', name: 'X', description: '', icon: '', durationTicks: 'instant', " +
          'effect: { onActivate(state, player, ctx) { void state; void player; ctx.math.nextFloat(ctx.rng); } } };',
      ),
    ).toHaveLength(0);
  });
```

Run: `npm test -- tests/lint/boundaries.test.ts && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 16: Full check and commit**

Run: `npm run format && npm run check`
Expected: green. The two event pins from Step 1 unchanged (`git diff main -- tests/sim` shows only the four re-pinned hashes in the golden files).

```bash
git add src/sim src/app/session.ts src/app.ts eslint.config.js tests
git commit -m "feat(sim): ability and court-modifier hooks, per-tick stats, charge and timers; restart press leak"
```

---
### Task 2: The four abilities, and the sim reading their flags

**Files:**
- Create: `src/content/abilities/rocket-dunk.ts`, `src/content/abilities/hot-hand.ts`, `src/content/abilities/blur.ts`, `src/content/abilities/earthquake.ts`, `src/content/abilities/index.ts`, `tests/sim/ability-effects.test.ts`
- Modify: `src/sim/shooting.ts` (`chooseShotType`, `startShot`, `resolveShotOutcome`, `releaseShot`, `tryBlockShot`, `evaluateShot`, new `hasSureShot`), `src/sim/defence.ts` (`resolveSteal`), `src/sim/player-movement.ts` (`stepPlayer`, `stepTurbo`)

**Interfaces:**
- Consumes (Task 1): `AbilityDef`, `AbilityTable`, `HookContext`, `AbilityQueryContext`, `HOOK_MATH.targetRimDistance`, `HOOK_MATH.v3DistanceXZ`, `ctx.knockDown`, `CHARGE_MAX`, `tick(…, abilities)`, `PlayerState.ability`, the four `ResolvedStats` flags. Characters already carry `abilityId` `'rocketDunk'` (Brick), `'hotHand'` (Ace), `'blur'` (Dash), `'earthquake'` (Rook).
- Produces: `src/content/abilities/index.ts` → `abilities: readonly AbilityDef[]` (order rocketDunk, hotHand, blur, earthquake), `ABILITIES: AbilityTable`, `getAbility(id): AbilityDef`; constants `ROCKET_DUNK_TICKS = 480`, `HOT_HAND_SHOTS = 3`, `BLUR_TICKS = 360`, `EARTHQUAKE_RADIUS = 4`, `EARTHQUAKE_STUN_TICKS = 90`; `src/sim/shooting.ts` → `hasSureShot(player): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/sim/ability-effects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES, abilities, getAbility } from '../../src/content/abilities';
import { characters, getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { CHARGE_MAX } from '../../src/sim/abilities';
import { giveBall } from '../../src/sim/ball';
import { resolveSteal } from '../../src/sim/defence';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer, type RosterEntry } from '../../src/sim/match';
import { createRng, nextFloat } from '../../src/sim/rng';
import {
  chooseShotType,
  evaluateShot,
  releaseShot,
  resolveShotOutcome,
  tryBlockShot,
} from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import {
  NO_INTENT,
  type MatchState,
  type PlayerIntent,
  type PlayerState,
  type SimEvent,
} from '../../src/sim/types';

const court = getCourt('gym');
const hoop = hoopGeometry(court, 1); // team 0 attacks hoop 1 (x = +12.425)
const special: PlayerIntent = { ...NO_INTENT, special: true };
const press: PlayerIntent = { ...NO_INTENT, action: true };

function cast(id: string, team: 0 | 1, characterId: string): RosterEntry {
  return { id, team, characterId, character: getCharacter(characterId) };
}

/** 'a' (team 0) and 'x' (team 1), standing still far apart; extra players for Earthquake. */
function live(home: string, away: string, extra: RosterEntry[] = []): MatchState {
  const s = createMatch(
    { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: 'gym', mode: 'match' },
    court,
    [cast('a', 0, home), cast('x', 1, away), ...extra],
  );
  s.phase = 'live';
  s.possession = 0;
  place(s, 'a', 0, 0);
  place(s, 'x', -8, 5);
  return s;
}

function player(s: MatchState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(s: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(s, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

/** A seed whose first draw is ≥ 0.9: any shot or steal below 90 % fails on it. */
function unluckySeed(): number {
  let seed = 1;
  while (nextFloat(createRng(seed)) < 0.9) seed++;
  return seed;
}

function run(
  state: MatchState,
  ticks: number,
  intents: Map<string, PlayerIntent> = new Map(),
  stop?: (events: SimEvent[]) => boolean,
): { state: MatchState; events: SimEvent[] } {
  let s = state;
  const all: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const r = tick(s, intents, court, ABILITIES);
    s = r.state;
    all.push(...r.events);
    if (stop?.(r.events)) break;
  }
  return { state: s, events: all };
}

function activate(s: MatchState, id: string): { state: MatchState; events: SimEvent[] } {
  player(s, id).charge = CHARGE_MAX;
  return run(s, 1, new Map([[id, special]]));
}

describe('ability registry (spec D.3)', () => {
  it('has the four launch abilities, one per character', () => {
    expect(abilities.map((a) => a.id)).toEqual(['rocketDunk', 'hotHand', 'blur', 'earthquake']);
    for (const c of characters) expect(ABILITIES[c.abilityId]?.id).toBe(c.abilityId);
    expect(getAbility('blur').name).toBe('Blur');
    expect(() => getAbility('nope')).toThrow(/unknown ability/i);
  });
});

describe('Rocket Dunk (Brick)', () => {
  it('sets dunkFromArc and unblockableDunk for 480 ticks', () => {
    let { state } = activate(live('brick', 'ace'), 'a');
    expect(player(state, 'a').stats).toMatchObject({ dunkFromArc: true, unblockableDunk: true });
    expect(player(state, 'a').baseStats.dunkFromArc).toBe(false);
    ({ state } = run(state, 478));
    expect(player(state, 'a').ability).not.toBeNull();
    const end = run(state, 1);
    expect(end.events).toContainEqual({ type: 'abilityEnded', playerId: 'a', abilityId: 'rocketDunk' });
    expect(player(end.state, 'a').ability).toBeNull();
    expect(player(end.state, 'a').stats.dunkFromArc).toBe(false);
  });

  it('makes any shot press inside the arc a dunk, even standing still', () => {
    const s = live('brick', 'ace');
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    expect(chooseShotType(a, hoop)).toBe('jumpshot');
    a.stats.dunkFromArc = true;
    expect(chooseShotType(a, hoop)).toBe('dunk');
    place(s, 'a', hoop.rimCenter.x - 7, 0); // outside the 6.75 m arc
    expect(chooseShotType(a, hoop)).toBe('jumpshot');
  });

  it('launches the dunker on a line to the rim that arrives at the release tick, and scores', () => {
    let s = live('brick', 'ace');
    giveBall(s, place(s, 'a', hoop.rimCenter.x - 6, 0), []);
    s = activate(s, 'a').state;
    const pressed = run(s, 1, new Map([['a', press]]));
    const a = player(pressed.state, 'a');
    expect(a.action).toBe('dunk');
    // (6 m − the 0.6 m dunk stop) ÷ the 24-tick release time, no turbo cap.
    expect(Math.hypot(a.vel.x, a.vel.z)).toBeCloseTo((6 - 0.6) / (24 / 60), 1);
    const rest = run(pressed.state, 90, new Map(), (ev) => ev.some((e) => e.type === 'basket'));
    expect(rest.events).toContainEqual(
      expect.objectContaining({ type: 'basket', playerId: 'a', shotType: 'dunk', points: 2 }),
    );
  });

  it('cannot be blocked, even by a block that started first', () => {
    const s = live('brick', 'ace');
    const a = place(s, 'a', hoop.rimCenter.x - 1, 0);
    giveBall(s, a, []);
    a.shot = { type: 'dunk', hoop: 1, approachSpeed: 5 };
    a.action = 'dunk';
    a.actionTicks = 24;
    a.onGround = false;
    a.pos.y = 0.5;
    const x = place(s, 'x', hoop.rimCenter.x - 0.5, 0);
    x.action = 'block';
    x.actionTicks = 30; // started before the dunk
    x.onGround = false;
    x.pos.y = 0.5;
    x.vel.y = 2;
    const normal = structuredClone(s);
    expect(tryBlockShot(normal, player(normal, 'a'), court, [])).toBe(true);
    a.stats.unblockableDunk = true;
    expect(tryBlockShot(s, a, court, [])).toBe(false);
    expect(s.ball.holder).toBe('a');
  });
});

describe('Hot Hand (Ace)', () => {
  it('gives three sure shots with no timer', () => {
    const activated = activate(live('ace', 'brick'), 'a');
    expect(activated.events).toContainEqual({
      type: 'abilityActivated',
      playerId: 'a',
      abilityId: 'hotHand',
    });
    expect(player(activated.state, 'a').ability).toEqual({ ticksLeft: null, uses: 3 });
    const later = run(activated.state, 600);
    expect(player(later.state, 'a').ability).toEqual({ ticksLeft: null, uses: 3 });
  });

  it('a sure shot is made but still takes the outcome draw (draw order unchanged)', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 10, 0);
    giveBall(s, a, []);
    a.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    a.ability = { ticksLeft: null, uses: 3 };
    const seed = unluckySeed();
    s.rng = createRng(seed);
    const after = createRng(seed);
    nextFloat(after);
    const outcome = resolveShotOutcome(s, a, court);
    expect(outcome.made).toBe(true);
    expect(outcome.quality).toBeLessThan(0.5); // the real quality is still reported
    expect(s.rng.seed).toBe(after.seed); // exactly one draw, as for any make
  });

  it('each released shot spends a use; a blocked shot does not', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 5, 0);
    giveBall(s, a, []);
    a.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    a.ability = { ticksLeft: null, uses: 3 };
    const events: SimEvent[] = [];
    releaseShot(s, a, court, events);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'shotReleased', playerId: 'a', made: true }),
    );
    expect(a.ability?.uses).toBe(2);

    const b = live('ace', 'brick');
    const shooter = place(b, 'a', hoop.rimCenter.x - 5, 0);
    giveBall(b, shooter, []);
    shooter.shot = { type: 'jumpshot', hoop: 1, approachSpeed: 0 };
    shooter.ability = { ticksLeft: null, uses: 3 };
    const x = place(b, 'x', hoop.rimCenter.x - 4.5, 0);
    x.action = 'block';
    x.onGround = false;
    x.vel.y = 2;
    const blocked: SimEvent[] = [];
    releaseShot(b, shooter, court, blocked);
    expect(blocked).toContainEqual({ type: 'block', by: 'x', shooter: 'a' });
    expect(shooter.ability?.uses).toBe(3);
  });

  it('ends on the tick its last sure shot is released', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 5, 0);
    giveBall(s, a, []);
    a.ability = { ticksLeft: null, uses: 1 };
    const r = run(s, 40, new Map([['a', press]]), (ev) =>
      ev.some((e) => e.type === 'shotReleased'),
    );
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'shotReleased', playerId: 'a', made: true }),
    );
    expect(r.events).toContainEqual({ type: 'abilityEnded', playerId: 'a', abilityId: 'hotHand' });
    expect(player(r.state, 'a').ability).toBeNull();
  });

  it('the AI sees its sure shots: evaluateShot reports quality 1 while uses remain', () => {
    const s = live('ace', 'brick');
    const a = place(s, 'a', hoop.rimCenter.x - 10, 0);
    expect(evaluateShot(s, a, court).quality).toBeLessThan(0.5);
    a.ability = { ticksLeft: null, uses: 1 };
    expect(evaluateShot(s, a, court).quality).toBe(1);
  });
});

describe('Blur (Dash)', () => {
  it('doubles speeds and acceleration with unlimited turbo and sure steals, for 360 ticks', () => {
    const { state } = activate(live('dash', 'brick'), 'a');
    const a = player(state, 'a');
    for (const k of ['runSpeed', 'turboSpeed', 'acceleration', 'deceleration'] as const)
      expect(a.stats[k]).toBeCloseTo(a.baseStats[k] * 2);
    expect(a.stats).toMatchObject({ unlimitedTurbo: true, stealAlwaysSucceeds: true });
    expect(a.ability).toEqual({ ticksLeft: 359, uses: 0 });
  });

  it('turbo never drains, even from an empty bar', () => {
    const s = activate(live('dash', 'brick'), 'a').state;
    player(s, 'a').turbo = 0;
    const r = run(s, 120, new Map([['a', { ...NO_INTENT, move: { x: 0, y: 1 }, turbo: true }]]));
    expect(player(r.state, 'a').turbo).toBe(0);
    expect(player(r.state, 'a').turboActive).toBe(true);
  });

  it('a steal that reaches the holder always succeeds; the draw is still taken', () => {
    const seed = unluckySeed();
    const attempt = (sure: boolean) => {
      const s = live('dash', 'brick');
      giveBall(s, place(s, 'x', 0, 0), []);
      const a = place(s, 'a', 0.8, 0);
      a.stats.stealAlwaysSucceeds = sure;
      s.rng = createRng(seed);
      const events: SimEvent[] = [];
      resolveSteal(s, a, events);
      return { s, events };
    };
    const after = createRng(seed);
    nextFloat(after);
    expect(attempt(false).events).toContainEqual({ type: 'stealFailed', by: 'a' });
    const blur = attempt(true);
    expect(blur.events).toContainEqual({ type: 'steal', by: 'a', from: 'x' });
    expect(blur.s.rng.seed).toBe(after.seed);
  });

  it('still needs reach: an out-of-reach holder keeps the ball and no draw is taken', () => {
    const s = live('dash', 'brick');
    giveBall(s, place(s, 'x', 0, 0), []);
    const a = place(s, 'a', 3, 0);
    a.stats.stealAlwaysSucceeds = true;
    const before = s.rng.seed;
    const events: SimEvent[] = [];
    resolveSteal(s, a, events);
    expect(events).toEqual([{ type: 'stealFailed', by: 'a' }]);
    expect(s.rng.seed).toBe(before);
  });
});

describe('Earthquake (Rook)', () => {
  function quake() {
    const s = live('rook', 'brick', [cast('b', 0, 'ace'), cast('y', 1, 'dash'), cast('z', 1, 'ace')]);
    place(s, 'a', 0, 0);
    const x = place(s, 'x', 2, 0);
    giveBall(s, x, []); // the holder: Brick, 27 ticks of stun resistance
    x.shoveImmunityTicks = 30;
    const y = place(s, 'y', 0, 3.5);
    y.onGround = false; // in the air
    y.pos.y = 0.8;
    place(s, 'z', 5, 0); // out of range
    place(s, 'b', -1, -1); // a teammate in range
    const seed = s.rng.seed;
    return { seed, ...activate(s, 'a') };
  }

  it('knocks every opponent within 4 m down for 90 ticks, ignoring resistance and immunity', () => {
    const { state, events, seed } = quake();
    expect(events.filter((e) => e.type === 'knockdown')).toEqual([
      { type: 'knockdown', by: 'a', target: 'x' },
      { type: 'knockdown', by: 'a', target: 'y' },
    ]);
    for (const id of ['x', 'y']) {
      expect(player(state, id).action).toBe('stunned');
      expect(player(state, id).stunTicks).toBe(90);
    }
    expect(player(state, 'z').action).not.toBe('stunned');
    expect(player(state, 'b').action).not.toBe('stunned');
    expect(state.ball.holder).toBeNull();
    expect(state.ball.mode).toBe('free');
    const types = events.map((e) => e.type);
    expect(types.indexOf('abilityActivated')).toBeLessThan(types.indexOf('knockdown'));
    expect(types).toContain('abilityEnded');
    expect(player(state, 'a').ability).toBeNull();
    expect(state.rng.seed).toBe(seed); // no RNG
  });

  it('victims get up and are immune afterwards, as after a shove', () => {
    const later = run(quake().state, 115);
    const x = player(later.state, 'x');
    expect(['stunned', 'getup']).not.toContain(x.action);
    expect(x.shoveImmunityTicks).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/sim/ability-effects.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/content/abilities"`.

- [ ] **Step 3: The ability definitions**

Create `src/content/abilities/rocket-dunk.ts`:

```ts
import type { AbilityDef } from '../../sim/hooks';

export const ROCKET_DUNK_TICKS = 480;
/** Spec D.5: the AI fires it holding the ball this far from the target hoop. */
const AI_MIN_DISTANCE = 3.5;
const AI_MAX_DISTANCE = 6.5;

/** Brick (spec D.3): for 8 s any shot press inside the arc is a dunk, and dunks cannot be blocked. */
export const rocketDunk: AbilityDef = {
  id: 'rocketDunk',
  name: 'Rocket Dunk',
  description: 'For 8 seconds, dunk from anywhere inside the arc. Cannot be blocked.',
  icon: '🚀',
  durationTicks: ROCKET_DUNK_TICKS,
  effect: {
    onActivate: () => {},
    modifyStats: (stats) => ({ ...stats, dunkFromArc: true, unblockableDunk: true }),
  },
  aiWantsToUse(state, player, ctx) {
    if (state.ball.holder !== player.id) return false;
    const d = ctx.math.targetRimDistance(state, player, ctx.court);
    return d >= AI_MIN_DISTANCE && d <= AI_MAX_DISTANCE;
  },
};
```

Create `src/content/abilities/hot-hand.ts`:

```ts
import type { AbilityDef } from '../../sim/hooks';

export const HOT_HAND_SHOTS = 3;

/** Ace (spec D.3): the next three released shots cannot miss; the sim spends `uses` at release. */
export const hotHand: AbilityDef = {
  id: 'hotHand',
  name: 'Hot Hand',
  description: 'Your next three shots cannot miss.',
  icon: '🔥',
  durationTicks: null,
  effect: {
    onActivate(_state, player) {
      if (player.ability) player.ability.uses = HOT_HAND_SHOTS;
    },
  },
  aiWantsToUse: (state, player) => state.possession === player.team,
};
```

Create `src/content/abilities/blur.ts`:

```ts
import type { AbilityDef } from '../../sim/hooks';
import type { PlayerState } from '../../sim/types';

export const BLUR_TICKS = 360;
const AI_DEFEND_RANGE = 5;
const AI_FAR_FROM_HOOP = 10;

/** Dash (spec D.3): 6 s of double speed, unlimited turbo and steals that always succeed. */
export const blur: AbilityDef = {
  id: 'blur',
  name: 'Blur',
  description: 'For 6 seconds: double speed, unlimited turbo, every steal succeeds.',
  icon: '⚡',
  durationTicks: BLUR_TICKS,
  effect: {
    onActivate: () => {},
    modifyStats: (stats) => ({
      ...stats,
      runSpeed: stats.runSpeed * 2,
      turboSpeed: stats.turboSpeed * 2,
      acceleration: stats.acceleration * 2,
      deceleration: stats.deceleration * 2,
      unlimitedTurbo: true,
      stealAlwaysSucceeds: true,
    }),
  },
  aiWantsToUse(state, player, ctx) {
    const holderId = state.ball.holder;
    if (holderId === null) return false;
    if (holderId === player.id)
      return ctx.math.targetRimDistance(state, player, ctx.court) > AI_FAR_FROM_HOOP;
    const everyone: PlayerState[] = [...state.teams[0].players, ...state.teams[1].players];
    const holder = everyone.find((p) => p.id === holderId);
    return (
      holder !== undefined &&
      holder.team !== player.team &&
      ctx.math.v3DistanceXZ(holder.pos, player.pos) <= AI_DEFEND_RANGE
    );
  },
};
```

Create `src/content/abilities/earthquake.ts`:

```ts
import type { AbilityDef } from '../../sim/hooks';
import type { MatchState, PlayerState } from '../../sim/types';

export const EARTHQUAKE_RADIUS = 4;
export const EARTHQUAKE_STUN_TICKS = 90;

function opponentsInRange(state: MatchState, player: PlayerState, distance: (a: PlayerState) => number): PlayerState[] {
  const everyone: PlayerState[] = [...state.teams[0].players, ...state.teams[1].players];
  return everyone.filter((p) => p.team !== player.team && distance(p) <= EARTHQUAKE_RADIUS);
}

/** Rook (spec D.3): every opponent within 4 m, on the ground or in the air, is knocked down. No RNG. */
export const earthquake: AbilityDef = {
  id: 'earthquake',
  name: 'Earthquake',
  description: 'Knock down every opponent within 4 metres.',
  icon: '🌋',
  durationTicks: 'instant',
  effect: {
    onActivate(state, player, ctx) {
      const victims = opponentsInRange(state, player, (p) =>
        ctx.math.v3DistanceXZ(p.pos, player.pos),
      );
      for (const victim of victims) ctx.knockDown(player, victim, EARTHQUAKE_STUN_TICKS);
    },
  },
  aiWantsToUse(state, player, ctx) {
    const near = opponentsInRange(state, player, (p) => ctx.math.v3DistanceXZ(p.pos, player.pos));
    return near.length >= 2 || near.some((p) => p.id === state.ball.holder);
  },
};
```

Create `src/content/abilities/index.ts`:

```ts
import type { AbilityDef, AbilityTable } from '../../sim/hooks';
import { blur } from './blur';
import { earthquake } from './earthquake';
import { hotHand } from './hot-hand';
import { rocketDunk } from './rocket-dunk';

/** Spec §10.1 registry: one file per signature move, keyed by the characters' `abilityId`. */
export const abilities: readonly AbilityDef[] = [rocketDunk, hotHand, blur, earthquake];

/** The table the app passes to `tick` and the AI (spec D.2). */
export const ABILITIES: AbilityTable = Object.freeze(
  Object.fromEntries(abilities.map((a) => [a.id, a])),
);

export function getAbility(id: string): AbilityDef {
  const ability = abilities.find((a) => a.id === id);
  if (!ability) throw new Error(`Unknown ability: ${id}`);
  return ability;
}
```

- [ ] **Step 4: The sim reads the flags**

In `src/sim/shooting.ts`:

1. `chooseShotType` — first lines become:

```ts
export function chooseShotType(player: PlayerState, hoop: HoopGeometry): ShotType {
  const d = v3DistanceXZ(player.pos, hoop.rimCenter);
  // Spec D.3 Rocket Dunk: any press inside the 3-point line is a dunk.
  if (player.stats.dunkFromArc && d < THREE_POINT_DISTANCE) return 'dunk';
  const approach = speedTowards(player, hoop.rimCenter);
```

(the rest unchanged).

2. `startShot` — replace the `const speed = Math.min(…);` statement inside `if (type !== 'jumpshot')` with:

```ts
    const reach = travel / (SHOT_TIMING[type].releaseTick * TICK_DT);
    // Spec D.3 Rocket Dunk: launched on a line that arrives at the release tick, whatever the speed.
    const rocket = type === 'dunk' && player.stats.dunkFromArc;
    const speed = rocket ? reach : Math.min(reach, player.stats.turboSpeed);
```

3. Add after `signedDraw`:

```ts
/** Spec D.3 Hot Hand: the player still has shots that cannot miss. */
export function hasSureShot(player: PlayerState): boolean {
  return player.ability !== null && player.ability.uses > 0;
}
```

4. `resolveShotOutcome` — update the doc comment's last sentence and the `made` line:

```ts
/**
 * Rolls the seeded RNG for the outcome (spec §4.4). Draw order is fixed and part of the
 * determinism contract: make roll; then, on a miss only, miss type, lateral jitter, vertical jitter.
 * A sure shot (Hot Hand, spec D.3) still takes the make roll and ignores it.
 */
```

```ts
  const made = nextFloat(state.rng) < quality || hasSureShot(player);
```

5. `releaseShot` becomes:

```ts
/** Decides the outcome and launches the ball (spec §4.4). A released shot spends one sure shot (D.3). */
export function releaseShot(
  state: MatchState,
  player: PlayerState,
  court: CourtDef,
  events: SimEvent[],
): void {
  if (tryBlockShot(state, player, court, events)) return;
  const outcome = resolveShotOutcome(state, player, court);
  if (player.ability && player.ability.uses > 0) player.ability.uses -= 1;
  launchShot(state, player, court, events, outcome);
}
```

6. `tryBlockShot` — after `if (!shot) return false;` add:

```ts
  // Spec D.3 Rocket Dunk: unblockable, even by a block that started first.
  if (shot.type === 'dunk' && shooter.stats.unblockableDunk) return false;
```

7. `evaluateShot` — the returned `quality` becomes:

```ts
    quality: hasSureShot(player) ? 1 : shotQuality(player, type, hoop, defenders),
```

and its doc comment gains: `A player with sure shots (Hot Hand) sees quality 1, which is what the roll will do.`

In `src/sim/defence.ts` `resolveSteal`, replace the `if (nextFloat(state.rng) < chance) {` line with:

```ts
  // Spec D.3 Blur: the draw is still taken; the result is treated as a success.
  const roll = nextFloat(state.rng);
  if (stealer.stats.stealAlwaysSucceeds || roll < chance) {
```

In `src/sim/player-movement.ts`:

```ts
  player.turboActive =
    player.turboRequested && (player.turbo > 0 || stats.unlimitedTurbo) && player.onGround;
```

and `stepTurbo` becomes:

```ts
export function stepTurbo(player: PlayerState): void {
  const { stats } = player;
  if (player.turboActive) {
    // Spec D.3 Blur: unlimited turbo never drains.
    if (!stats.unlimitedTurbo) player.turbo = Math.max(0, player.turbo - stats.turboDrainPerTick);
  } else if (!player.turboRequested) {
    player.turbo = Math.min(1, player.turbo + stats.turboRegenPerTick);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- tests/sim/ability-effects.test.ts`
Expected: PASS.

Run: `npx vitest run tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts tests/sim/shooting.test.ts tests/sim/defence.test.ts tests/sim/ai-helpers.test.ts`
Expected: PASS with **no** snapshot written (none of these runs has an ability active; all pins unchanged).

- [ ] **Step 6: Full check and commit**

Run: `npm run format && npm run check`
Expected: green (the lint confirms the ability files import only types from `src/sim`).

```bash
git add src/content/abilities src/sim/shooting.ts src/sim/defence.ts src/sim/player-movement.ts tests/sim/ability-effects.test.ts
git commit -m "feat(content): Rocket Dunk, Hot Hand, Blur and Earthquake; sim reads the ability flags"
```

---
### Task 3: The three courts — gusts, heat, slick; `?court=`; dressing data

**Files:**
- Create: `src/content/courts/rooftop.ts`, `src/content/courts/volcano.ts`, `src/content/courts/frozen.ts`, `src/sim/court-drift.ts`, `tests/sim/court-modifiers.test.ts`
- Modify: `src/sim/types.ts` (`Weather`, `CourtDressing`, `CourtDef.dressing`), `src/content/courts/gym.ts`, `src/content/courts/index.ts`, `src/sim/shooting.ts` (`shotBow`, `bowFactor`, `launchShot`, `stepFlight`), `src/sim/passing.ts` (`planPass`), `src/sim/index.ts`, `src/app/url-options.ts`, `src/app.ts`
- Test: `tests/sim/court.test.ts`, `tests/app/url-options.test.ts`, `tests/app/session.test.ts`

**Interfaces:**
- Consumes (Task 1): `CourtModifier` (incl. `ballDrift`), `HookContext` (`ctx.math.nextInt`, `nextFloat`, `TICK_DT`, `ctx.emit`), `MatchState.courtState`, `ShotFlight.bow`, `gustStart`/`gustEnd` events. (Task 2): `ABILITIES` (one test).
- Produces:
  - `src/sim/types.ts`: `type Weather = 'none' | 'rain' | 'embers'`; `interface CourtDressing { floorColor: number; lineColor: number; floorRoughness: number; weather: Weather }`; `CourtDef.dressing: CourtDressing`.
  - `src/sim/court-drift.ts`: `ballDriftOf(state, court): Vec3 | null`.
  - `src/sim/shooting.ts`: `shotBow(drift: Vec3, ticks: number): Vec3`, `bowFactor(elapsed: number, total: number): number`.
  - `src/content/courts/rooftop.ts`: `rooftop: CourtDef`, `gusts: CourtModifier`, `gustOf(state): Gust | null`, `interface Gust { ticksLeft: number; dir: Vec3 }`, constants `GUST_MIN_GAP_TICKS = 900`, `GUST_GAP_SPREAD_TICKS = 600`, `GUST_TICKS = 180`, `GUST_BALL_ACCEL = 4`, `GUST_PLAYER_ACCEL = 2`, `GUST_SHOOTING_FACTOR = 0.85`.
  - `src/content/courts/volcano.ts`: `volcano`, `heat`; `src/content/courts/frozen.ts`: `frozen`, `slick`.
  - `src/content/courts/index.ts`: `courts` (gym, rooftop, volcano, frozen), `DEFAULT_COURT_ID = 'gym'`, `getCourt`.
  - `src/app/url-options.ts`: `GameOptions.courtId: string` (`?court=`, unknown → `gym`).

- [ ] **Step 1: Write the failing tests**

Create `tests/sim/court-modifiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCharacter } from '../../src/content/characters';
import { courts, getCourt } from '../../src/content/courts';
import {
  GUST_BALL_ACCEL,
  GUST_GAP_SPREAD_TICKS,
  GUST_MIN_GAP_TICKS,
  GUST_PLAYER_ACCEL,
  GUST_TICKS,
  gustOf,
} from '../../src/content/courts/rooftop';
import { CHARGE_MAX } from '../../src/sim/abilities';
import { passLanding } from '../../src/sim/ai/brain';
import { arcPoint } from '../../src/sim/arc';
import { giveBall } from '../../src/sim/ball';
import { TICK_DT } from '../../src/sim/constants';
import { hoopGeometry } from '../../src/sim/hoop';
import { createMatch, findPlayer } from '../../src/sim/match';
import { releasePass, startPass } from '../../src/sim/passing';
import { createRng, nextInt } from '../../src/sim/rng';
import {
  bowFactor,
  launchShot,
  shotBow,
  startShot,
  stepFlight,
} from '../../src/sim/shooting';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type CourtDef, type MatchState, type PlayerState, type SimEvent } from '../../src/sim/types';

const gym = getCourt('gym');
const rooftop = getCourt('rooftop');
const volcano = getCourt('volcano');
const frozen = getCourt('frozen');
const hoop = hoopGeometry(gym, 1);

function match(court: CourtDef, seed = 1): MatchState {
  const s = createMatch(
    { durationMs: 180_000, shotClockMs: 14_000, seed, ruleIds: [], courtId: court.id, mode: 'match' },
    court,
    [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 0, characterId: 'placeholder' },
      { id: 'x', team: 1, characterId: 'placeholder' },
    ],
  );
  s.phase = 'live';
  s.ball.pos = { x: 0, y: 3, z: 0 }; // free, out of everyone's reach
  return s;
}

/** A rooftop state with a gust blowing along `dir` that will not end during the test. */
function gusty(dir = { x: 1, y: 0, z: 0 }, seed = 1): MatchState {
  const s = match(rooftop, seed);
  s.courtState = { nextGustTick: 1_000_000, gust: { ticksLeft: 1000, dir } };
  return s;
}

function player(s: MatchState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(s: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(s, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

describe('court registry (spec D.4)', () => {
  it('has the four courts on the gym’s play area and hoops, each dressed', () => {
    expect(courts.map((c) => c.id)).toEqual(['gym', 'rooftop', 'volcano', 'frozen']);
    for (const c of courts) {
      expect(c.playArea).toEqual(gym.playArea);
      expect(c.hoops).toEqual(gym.hoops);
      expect(['none', 'rain', 'embers']).toContain(c.dressing.weather);
    }
    expect(gym.modifier).toBeUndefined();
    expect(gym.dressing).toEqual({
      floorColor: 0xc9a06a,
      lineColor: 0xffffff,
      floorRoughness: 1,
      weather: 'none',
    });
    expect(rooftop.dressing.weather).toBe('rain');
    expect(volcano.dressing.weather).toBe('embers');
  });
});

describe('Rooftop Storm — gusts (spec D.4)', () => {
  it('schedules the first gust 900–1500 ticks ahead with exactly one draw', () => {
    const s = match(rooftop, 5);
    const { state } = tick(s, new Map(), rooftop);
    const rng = createRng(5);
    const gap = GUST_MIN_GAP_TICKS + nextInt(rng, GUST_GAP_SPREAD_TICKS + 1);
    expect(state.courtState).toEqual({ nextGustTick: state.tick + gap, gust: null });
    expect(gap).toBeGreaterThanOrEqual(900);
    expect(gap).toBeLessThanOrEqual(1500);
    expect(state.rng.seed).toBe(rng.seed);
  });

  it('a gust starts on schedule with a horizontal unit direction, blows 180 ticks, then the next is scheduled', () => {
    let s = match(rooftop, 9);
    s.courtState = { nextGustTick: s.tick + 1, gust: null };
    const events: SimEvent[] = [];
    let ticks = 0;
    let started = -1;
    while (!events.some((e) => e.type === 'gustEnd') && ticks < 400) {
      const r = tick(s, new Map(), rooftop);
      s = r.state;
      events.push(...r.events);
      ticks++;
      if (started < 0 && r.events.some((e) => e.type === 'gustStart')) started = s.tick;
    }
    const start = events.find((e) => e.type === 'gustStart');
    if (!start || start.type !== 'gustStart') throw new Error('no gust');
    expect(Math.hypot(start.dir.x, start.dir.z)).toBeCloseTo(1);
    expect(start.dir.y).toBe(0);
    expect(s.tick - started + 1).toBe(GUST_TICKS);
    expect(gustOf(s)).toBeNull();
    const next = (s.courtState as { nextGustTick: number }).nextGustTick;
    expect(next - s.tick).toBeGreaterThanOrEqual(900);
    expect(next - s.tick).toBeLessThanOrEqual(1500);
  });

  it('shooting ×0.85 during a gust only, and aiHint reports the drift then', () => {
    const calm = tick(match(rooftop), new Map(), rooftop).state;
    const a0 = player(calm, 'a');
    expect(a0.stats.shooting).toBeCloseTo(a0.baseStats.shooting);
    expect(rooftop.modifier?.aiHint?.(calm, a0)).toEqual({});
    const windy = tick(gusty({ x: 0, y: 0, z: -1 }), new Map(), rooftop).state;
    const a1 = player(windy, 'a');
    expect(a1.stats.shooting).toBeCloseTo(a1.baseStats.shooting * 0.85);
    expect(rooftop.modifier?.aiHint?.(windy, a1)).toEqual({
      ballDrift: { x: 0, y: 0, z: -GUST_BALL_ACCEL },
    });
  });

  it('pushes a free ball 4 m/s² and airborne players 2 m/s² along the gust; grounded players stay put', () => {
    const still = match(gym);
    const windy = gusty();
    for (const s of [still, windy]) {
      const a = player(s, 'a');
      a.onGround = false;
      a.pos.y = 1;
    }
    const g = tick(still, new Map(), gym).state;
    const w = tick(windy, new Map(), rooftop).state;
    expect(w.ball.vel.x - g.ball.vel.x).toBeCloseTo(GUST_BALL_ACCEL * TICK_DT, 4);
    expect(player(w, 'a').vel.x - player(g, 'a').vel.x).toBeCloseTo(GUST_PLAYER_ACCEL * TICK_DT, 4);
    expect(player(w, 'b').vel.x).toBe(0);
  });
});

describe('the shot bow (spec D.4)', () => {
  it('is zero at both ends and full at the middle', () => {
    expect(bowFactor(0, 90)).toBe(0);
    expect(bowFactor(90, 90)).toBe(0);
    expect(bowFactor(45, 90)).toBeCloseTo(1);
    expect(shotBow({ x: 4, y: 0, z: 0 }, 60)).toEqual({ x: 0.5, y: 0, z: 0 }); // 4 · 1² / 8
  });

  it('bends a shot released in a gust and lands it exactly where the outcome says', () => {
    const s = gusty({ x: 0, y: 0, z: 1 });
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    giveBall(s, a, []);
    startShot(s, a, rooftop);
    launchShot(s, a, rooftop, [], { quality: 1, made: true, missType: null, jitter: null });
    const flight = s.ball.flight;
    if (!flight) throw new Error('no flight');
    expect(flight.bow).toEqual(shotBow({ x: 0, y: 0, z: GUST_BALL_ACCEL }, flight.totalTicks));
    let maxOffset = 0;
    for (let k = 1; k <= flight.totalTicks; k++) {
      stepFlight(s.ball, rooftop);
      const straight = arcPoint(flight.from, flight.velocity, rooftop.physics.gravity, k * TICK_DT);
      maxOffset = Math.max(maxOffset, s.ball.pos.z - straight.z);
      if (k === flight.totalTicks) expect(s.ball.pos).toEqual(straight);
    }
    expect(maxOffset).toBeGreaterThan(0.5);
  });

  it('a made shot in a gust still scores', () => {
    let s = gusty({ x: 0, y: 0, z: 1 });
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    giveBall(s, a, []);
    startShot(s, a, rooftop);
    launchShot(s, a, rooftop, [], { quality: 1, made: true, missType: null, jitter: null });
    const events: SimEvent[] = [];
    for (let i = 0; i < 150 && !events.some((e) => e.type === 'basket'); i++) {
      const r = tick(s, new Map(), rooftop);
      s = r.state;
      events.push(...r.events);
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'basket', playerId: 'a' }));
  });

  it('shots outside a gust have no bow', () => {
    const s = match(rooftop);
    s.courtState = { nextGustTick: 1_000_000, gust: null };
    const a = place(s, 'a', hoop.rimCenter.x - 6, 0);
    giveBall(s, a, []);
    startShot(s, a, rooftop);
    launchShot(s, a, rooftop, [], { quality: 1, made: true, missType: null, jitter: null });
    expect(s.ball.flight?.bow).toBeNull();
  });
});

describe('the pass landing shift (spec D.4)', () => {
  it('shifts a pass released in a gust by 4 m/s² × T² / 2 along the gust', () => {
    const s = gusty({ x: 1, y: 0, z: 0 });
    const a = place(s, 'a', 0, 0);
    giveBall(s, a, []);
    const b = place(s, 'b', 0, 5);
    expect(startPass(s, a)).toBe(true);
    releasePass(s, a, rooftop, []);
    const flight = s.ball.flight;
    if (!flight) throw new Error('no pass');
    const t = flight.totalTicks * TICK_DT;
    const landing = passLanding(flight, rooftop);
    expect(landing.x).toBeCloseTo(b.pos.x + GUST_BALL_ACCEL * 0.5 * t * t, 5);
    expect(landing.z).toBeCloseTo(b.pos.z, 5);
    expect(flight.bow).toBeNull();
  });
});

describe('Volcano Rim — heat, and Frozen Lake — slick (spec D.4)', () => {
  it('heat: turbo drains ×1.5, shoves deal ×1.4 stun, resistance ×0.5; no RNG', () => {
    const v = tick(match(volcano), new Map(), volcano).state;
    const g = tick(match(gym), new Map(), gym).state;
    const p = player(v, 'a');
    expect(p.stats.turboDrainPerTick).toBeCloseTo(p.baseStats.turboDrainPerTick * 1.5);
    expect(p.stats.stunTicksDealt).toBeCloseTo(p.baseStats.stunTicksDealt * 1.4);
    expect(p.stats.stunResistTicks).toBeCloseTo(p.baseStats.stunResistTicks * 0.5);
    expect(v.rng.seed).toBe(g.rng.seed);
    expect(v.courtState).toEqual({});
  });

  it('heat does not scale Earthquake’s fixed 90 ticks', () => {
    const s = createMatch(
      { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: 'volcano', mode: 'match' },
      volcano,
      [
        { id: 'r', team: 0, characterId: 'rook', character: getCharacter('rook') },
        { id: 'x', team: 1, characterId: 'brick', character: getCharacter('brick') },
      ],
    );
    s.phase = 'live';
    place(s, 'r', 0, 0);
    place(s, 'x', 2, 0);
    s.ball.pos = { x: 0, y: 3, z: 6 };
    player(s, 'r').charge = CHARGE_MAX;
    const { state } = tick(s, new Map([['r', { ...NO_INTENT, special: true }]]), volcano, ABILITIES);
    expect(player(state, 'x').stunTicks).toBe(90);
  });

  it('slick: friction 0.3, acceleration ×0.4, deceleration ×0.25; no RNG', () => {
    expect(frozen.physics.friction).toBe(0.3);
    const f = tick(match(frozen), new Map(), frozen).state;
    const g = tick(match(gym), new Map(), gym).state;
    const p = player(f, 'a');
    expect(p.stats.acceleration).toBeCloseTo(p.baseStats.acceleration * 0.4);
    expect(p.stats.deceleration).toBeCloseTo(p.baseStats.deceleration * 0.25);
    expect(f.rng.seed).toBe(g.rng.seed);
  });
});
```

In `tests/app/url-options.test.ts`, add `courtId: 'gym',` to the default `toEqual` object (after `debug: false,`) and add:

```ts
  it('reads ?court= and falls back to the gym (spec D.1)', () => {
    expect(readGameOptions('?court=rooftop', 0).courtId).toBe('rooftop');
    expect(readGameOptions('?court=frozen&seed=3', 0).courtId).toBe('frozen');
    expect(readGameOptions('?court=moon', 0).courtId).toBe('gym');
    expect(readGameOptions('', 0).courtId).toBe('gym');
  });
```

In `tests/app/session.test.ts`, add `courtId: 'gym',` to `base` (after `debug: false,`). Run `grep -rn "debug: false" tests` and add `courtId: 'gym'` to every other `GameOptions` literal it finds.

In `tests/sim/court.test.ts`, change the first test to:

```ts
  it('contains the four courts', () => {
    expect(courts.map((c) => c.id)).toEqual(['gym', 'rooftop', 'volcano', 'frozen']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/sim/court-modifiers.test.ts tests/app/url-options.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/content/courts/rooftop"`, `Unknown court: rooftop`.

- [ ] **Step 3: Dressing type and the gym's dressing**

In `src/sim/types.ts`, before `export interface CourtDef` add:

```ts
export type Weather = 'none' | 'rain' | 'embers';

/** Spec D.6: placeholder look of a court until real environments arrive (phase 7). */
export interface CourtDressing {
  floorColor: number;
  lineColor: number;
  /** MeshStandardMaterial roughness of the play surface: 1 matte … 0 mirror-wet. */
  floorRoughness: number;
  weather: Weather;
}
```

and in `CourtDef`, after `lighting: {…};`:

```ts
  dressing: CourtDressing;
```

In `src/content/courts/gym.ts`, after `lighting: {…},` add (today's look, unchanged):

```ts
  dressing: { floorColor: 0xc9a06a, lineColor: 0xffffff, floorRoughness: 1, weather: 'none' },
```

- [ ] **Step 4: The drift helper, the bow and the pass shift (sim)**

Create `src/sim/court-drift.ts`:

```ts
import type { Vec3 } from './math';
import type { CourtDef, MatchState } from './types';

/** Spec D.4: the horizontal acceleration (m/s²) the court's weather puts on the ball now, or null. */
export function ballDriftOf(state: MatchState, court: CourtDef): Vec3 | null {
  return court.modifier?.ballDrift?.(state) ?? null;
}
```

In `src/sim/shooting.ts`, add the import `import { ballDriftOf } from './court-drift';`, add after `pointsFor`:

```ts
/**
 * Spec D.4: the sideways bow of a shot released in a gust. A constant acceleration `drift` on a
 * path whose ends are fixed bends it by drift · t(T − t) / 2, i.e. drift · T² / 8 at the middle;
 * the bow keeps that amplitude with a sine shape (bowFactor).
 */
export function shotBow(drift: Vec3, ticks: number): Vec3 {
  const t = ticks * TICK_DT;
  const k = (t * t) / 8;
  return { x: drift.x * k, y: 0, z: drift.z * k };
}

/** sin(π · elapsed / total), exactly zero at both ends, so the shot leaves the hand and lands unbent. */
export function bowFactor(elapsed: number, total: number): number {
  if (elapsed <= 0 || elapsed >= total) return 0;
  return Math.sin((Math.PI * elapsed) / total);
}
```

In `launchShot`, before `ball.mode = 'flight';` add:

```ts
  const drift = ballDriftOf(state, court);
```

and in the `ball.flight = { … }` literal replace `bow: null,` (from Task 1) with:

```ts
    bow: drift ? shotBow(drift, flightTicks) : null,
```

(`flightTicks` is already declared just above the `ball.flight` literal, so the bow uses the scripted length, miss handover included.)

`stepFlight` becomes:

```ts
/** Moves a ball in flight along its scripted arc (plus any gust bow); hands it to free physics at the end. */
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
  if (flight.bow) {
    // Spec D.4: the bow moves the position only; the velocity (and so the handover) is the arc's.
    const k = bowFactor(flight.elapsedTicks, flight.totalTicks);
    ball.pos.x += flight.bow.x * k;
    ball.pos.z += flight.bow.z * k;
  }
  ball.vel = { x: flight.velocity.x, y: flight.velocity.y - g * t, z: flight.velocity.z };
  if (flight.elapsedTicks >= flight.totalTicks) {
    ball.mode = 'free';
    ball.flight = null;
  }
}
```

In `src/sim/passing.ts`, add `import { ballDriftOf } from './court-drift';` and in `planPass` replace the tail (from `const totalTicks = …` to the `return`) with:

```ts
  const totalTicks = Math.max(1, Math.round(flightTime * TICK_RATE));
  const drift = lob ? null : ballDriftOf(state, court);
  if (drift) {
    // Spec D.4: a gust carries an ordinary pass drift · T² / 2 off its line; receivers run to the landing.
    const t = totalTicks * TICK_DT;
    target = { ...target, x: target.x + drift.x * 0.5 * t * t, z: target.z + drift.z * 0.5 * t * t };
  }
  const velocity = solveArcVelocity(from, target, totalTicks * TICK_DT, court.physics.gravity);
  return { from, velocity, totalTicks, lob };
```

In `src/sim/index.ts` add `export * from './court-drift';`.

- [ ] **Step 5: The three courts**

Create `src/content/courts/rooftop.ts`:

```ts
import type { CourtModifier, HookContext } from '../../sim/hooks';
import type { Vec3 } from '../../sim/math';
import type { CourtDef, MatchState } from '../../sim/types';
import { gym } from './gym';

/** Spec D.4: the next gust comes 900–1500 ticks after the last one ended (one draw). */
export const GUST_MIN_GAP_TICKS = 900;
export const GUST_GAP_SPREAD_TICKS = 600;
export const GUST_TICKS = 180;
/** m/s² along the gust: free ball, airborne players. */
export const GUST_BALL_ACCEL = 4;
export const GUST_PLAYER_ACCEL = 2;
export const GUST_SHOOTING_FACTOR = 0.85;

export interface Gust {
  ticksLeft: number;
  dir: Vec3;
}

/** The rooftop's `courtState` (spec D.4): JSON-safe, written only by this modifier. */
interface StormState {
  nextGustTick?: number;
  gust?: Gust | null;
}

function storm(state: MatchState): StormState {
  return state.courtState as unknown as StormState;
}

/** The gust blowing now, or null. */
export function gustOf(state: MatchState): Gust | null {
  return storm(state).gust ?? null;
}

function drift(state: MatchState): Vec3 | null {
  const gust = gustOf(state);
  return gust ? { x: gust.dir.x * GUST_BALL_ACCEL, y: 0, z: gust.dir.z * GUST_BALL_ACCEL } : null;
}

function scheduleNext(state: MatchState, ctx: HookContext): void {
  storm(state).nextGustTick =
    state.tick + GUST_MIN_GAP_TICKS + ctx.math.nextInt(ctx.rng, GUST_GAP_SPREAD_TICKS + 1);
}

/** Spec D.4 Gusts: every 15–25 s a 3 s gust bends shots and passes and pushes loose balls and jumpers. */
export const gusts: CourtModifier = {
  id: 'gusts',
  name: 'Gusts',
  description: 'Every 15–25 seconds a gust bends shots and passes and pushes loose balls.',
  onTick(state, ctx) {
    const s = storm(state);
    if (s.nextGustTick === undefined) {
      s.gust = null;
      scheduleNext(state, ctx);
    }
    if (!s.gust && state.tick >= (s.nextGustTick ?? Infinity)) {
      const angle = ctx.math.nextFloat(ctx.rng) * 2 * Math.PI;
      s.gust = { ticksLeft: GUST_TICKS, dir: { x: Math.cos(angle), y: 0, z: Math.sin(angle) } };
      ctx.emit({ type: 'gustStart', dir: { ...s.gust.dir } });
    }
    const gust = s.gust;
    if (!gust) return;
    const dt = ctx.math.TICK_DT;
    const { ball } = state;
    if (ball.mode === 'free') {
      ball.vel.x += gust.dir.x * GUST_BALL_ACCEL * dt;
      ball.vel.z += gust.dir.z * GUST_BALL_ACCEL * dt;
    }
    for (const team of state.teams) {
      for (const p of team.players) {
        if (p.onGround) continue;
        p.vel.x += gust.dir.x * GUST_PLAYER_ACCEL * dt;
        p.vel.z += gust.dir.z * GUST_PLAYER_ACCEL * dt;
      }
    }
    gust.ticksLeft -= 1;
    if (gust.ticksLeft <= 0) {
      s.gust = null;
      ctx.emit({ type: 'gustEnd' });
      scheduleNext(state, ctx);
    }
  },
  modifyStats: (stats, state) =>
    gustOf(state) ? { ...stats, shooting: stats.shooting * GUST_SHOOTING_FACTOR } : stats,
  ballDrift: (state) => drift(state),
  aiHint(state) {
    const d = drift(state);
    return d ? { ballDrift: d } : {};
  },
};

/** Spec §7.2: a skyscraper roof in a thunderstorm. */
export const rooftop: CourtDef = {
  ...gym,
  id: 'rooftop',
  name: 'Rooftop Storm',
  description: 'A skyscraper roof in a thunderstorm. Gusts bend shots and passes.',
  lighting: {
    skyColor: 0x2a3340,
    sunDirection: { x: -0.2, y: -1, z: -0.4 },
    sunColor: 0xaab8cc,
    ambient: 0.35,
  },
  dressing: { floorColor: 0x2b2f36, lineColor: 0xd8dde3, floorRoughness: 0.25, weather: 'rain' },
  modifier: gusts,
};
```

Create `src/content/courts/volcano.ts`:

```ts
import type { CourtModifier } from '../../sim/hooks';
import type { CourtDef } from '../../sim/types';
import { gym } from './gym';

/** Spec D.4 Heat: modifyStats only, no RNG. Earthquake's fixed 90 ticks is not scaled. */
export const heat: CourtModifier = {
  id: 'heat',
  name: 'Heat',
  description: 'Turbo drains faster, shoves hit harder and knock-downs last longer.',
  modifyStats: (stats) => ({
    ...stats,
    turboDrainPerTick: stats.turboDrainPerTick * 1.5,
    stunTicksDealt: stats.stunTicksDealt * 1.4,
    stunResistTicks: stats.stunResistTicks * 0.5,
  }),
};

/** Spec §7.2: cooled lava beside a glowing crater. */
export const volcano: CourtDef = {
  ...gym,
  id: 'volcano',
  name: 'Volcano Rim',
  description: 'Cooled lava beside a glowing crater. The heat wears you down.',
  lighting: {
    skyColor: 0x3a0d08,
    sunDirection: { x: 0.5, y: -0.8, z: -0.3 },
    sunColor: 0xff8a3d,
    ambient: 0.4,
  },
  dressing: { floorColor: 0x3a2a26, lineColor: 0xffb070, floorRoughness: 0.8, weather: 'embers' },
  modifier: heat,
};
```

Create `src/content/courts/frozen.ts`:

```ts
import type { CourtModifier } from '../../sim/hooks';
import type { CourtDef } from '../../sim/types';
import { gym } from './gym';

/** Spec D.4 Slick: slower to start and to stop (drift on direction change). No RNG. */
export const slick: CourtModifier = {
  id: 'slick',
  name: 'Slick',
  description: 'Low friction: slow to start, slower to stop.',
  modifyStats: (stats) => ({
    ...stats,
    acceleration: stats.acceleration * 0.4,
    deceleration: stats.deceleration * 0.25,
  }),
};

/** Spec §7.2: an ice sheet under the aurora. */
export const frozen: CourtDef = {
  ...gym,
  id: 'frozen',
  name: 'Frozen Lake',
  description: 'An ice sheet under the aurora. Loose balls roll for ever.',
  physics: { ...gym.physics, friction: 0.3 },
  lighting: {
    skyColor: 0x0f4d4d,
    sunDirection: { x: -0.3, y: -1, z: 0.2 },
    sunColor: 0xd8f4ff,
    ambient: 0.7,
  },
  dressing: { floorColor: 0xcfe6f5, lineColor: 0x2c6e9e, floorRoughness: 0.15, weather: 'none' },
  modifier: slick,
};
```

Replace `src/content/courts/index.ts` with:

```ts
import type { CourtDef } from '../../sim/types';
import { frozen } from './frozen';
import { gym } from './gym';
import { rooftop } from './rooftop';
import { volcano } from './volcano';

/** Spec §7.2 / D.4: the gym (balance baseline) and the three modifier courts. */
export const courts: readonly CourtDef[] = [gym, rooftop, volcano, frozen];
export const DEFAULT_COURT_ID = 'gym';

export function getCourt(id: string): CourtDef {
  const court = courts.find((c) => c.id === id);
  if (!court) throw new Error(`Unknown court: ${id}`);
  return court;
}
```

- [ ] **Step 6: `?court=` through the app**

In `src/app/url-options.ts`: add `import { courts, DEFAULT_COURT_ID } from '../content/courts';`, add `courtId: string;` to `GameOptions` (after `opponentIds`), add

```ts
function courtOr(value: string | null): string {
  return value && courts.some((c) => c.id === value) ? value : DEFAULT_COURT_ID;
}
```

and in the returned object, after `opponentIds: […],`:

```ts
    courtId: courtOr(params.get('court')),
```

In `src/app.ts`, replace `const court = getCourt('gym');` with:

```ts
  const court = getCourt(options.courtId);
```

(`buildSettings` already writes `court.id` into the settings.)

- [ ] **Step 7: Run the tests**

Run: `npm test -- tests/sim/court-modifiers.test.ts tests/sim/court.test.ts tests/app/url-options.test.ts tests/app/session.test.ts`
Expected: PASS.

Run: `npx vitest run tests/sim/determinism.test.ts tests/sim/ai-golden.test.ts tests/sim/shooting.test.ts tests/sim/passing.test.ts`
Expected: PASS, no snapshot written (the gym has no `ballDrift`, so `bow` stays `null` and passes are unshifted).

- [ ] **Step 8: Full check and commit**

Run: `npm run format && npm run check`
Expected: green.

```bash
git add src/sim src/content/courts src/app/url-options.ts src/app.ts tests
git commit -m "feat(courts): Rooftop Storm gusts, Volcano Rim heat, Frozen Lake slick; ?court= and dressing data"
```

---
### Task 4: AI uses abilities and reads the gust; app, harness and balance pass the real table

**Files:**
- Create: `tests/sim/ai-abilities.test.ts`
- Modify: `src/sim/ai/memory.ts`, `src/sim/ai/brain.ts`, `src/app/match-runner.ts`, `src/app/ai-controller.ts`, `src/app/session.ts`, `tests/sim/ai-match.ts`, `tests/sim/ai-golden.test.ts`, `tests/sim/ai-sweep.test.ts`, `tests/balance/ai.balance.ts`, `tests/app/session.test.ts`
- Generated: `docs/balance/<today>.md`

**Interfaces:**
- Consumes: (Task 1) `canActivateAbility`, `CHARGE_MAX`, `HOOK_MATH`, `NO_ABILITIES`, `AbilityTable`, `tick(…, abilities)`; (Task 2) `ABILITIES`, the four `aiWantsToUse`; (Task 3) `CourtModifier.aiHint`, `courts`, `getCourt`, `gustOf`.
- Produces:
  - `src/sim/ai/brain.ts`: `decide(state, memory, profile, court, abilities: AbilityTable = NO_ABILITIES): PlayerIntent`; `wantsAbility(state, me, court, abilities): boolean`; `chaseTarget(state, me, court): Vec3`; `CHASE_DRIFT_LEAD_SECONDS = 0.75`.
  - `src/sim/ai/memory.ts`: `AiMemory.specialLastTick: boolean`.
  - `src/app/match-runner.ts`: `new MatchRunner(court, initial, abilities = NO_ABILITIES)`, `readonly abilities`.
  - `src/app/ai-controller.ts`: `AiControllerOptions.abilities?: AbilityTable`.
  - `tests/sim/ai-match.ts`: `playAiMatch(seed, profile = AI_PROFILES.fair, options: AiMatchOptions = {})`, `interface AiMatchOptions { court?: CourtDef; abilities?: AbilityTable }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/sim/ai-abilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { CHARGE_MAX } from '../../src/sim/abilities';
import { chaseTarget, decide, wantsAbility } from '../../src/sim/ai/brain';
import { createAiMemory, type AiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { giveBall } from '../../src/sim/ball';
import { HOOK_MATH, NO_ABILITIES } from '../../src/sim/hooks';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { MatchState, PlayerState } from '../../src/sim/types';

const court = getCourt('gym');
const RIM0 = -12.425; // team 1 attacks hoop 0
const roster = [
  { id: 'home1', team: 0 as const, characterId: 'rook', character: getCharacter('rook') },
  { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
  { id: 'away1', team: 1 as const, characterId: 'brick', character: getCharacter('brick') },
  { id: 'away2', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
];

function live(): MatchState {
  const s = createMatch(
    { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: ['shotClock'], courtId: 'gym', mode: 'match' },
    court,
    roster,
  );
  s.phase = 'live';
  place(s, 'home1', -2, -6);
  place(s, 'home2', -2, 6);
  place(s, 'away1', 2, -6);
  place(s, 'away2', 2, 6);
  return s;
}

function player(s: MatchState, id: string): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new Error(`no ${id}`);
  return p;
}

function place(s: MatchState, id: string, x: number, z: number): PlayerState {
  const p = player(s, id);
  p.pos = { x, y: 0, z };
  p.vel = { x: 0, y: 0, z: 0 };
  return p;
}

const ctx = { math: HOOK_MATH, court };
function wants(s: MatchState, id: string): boolean {
  const p = player(s, id);
  return ABILITIES[p.abilityId ?? '']?.aiWantsToUse?.(s, p, ctx) ?? false;
}

describe('aiWantsToUse rules (spec D.5)', () => {
  it('Rocket Dunk: holding the ball 3.5–6.5 m from the target hoop', () => {
    const s = live();
    giveBall(s, place(s, 'away1', RIM0 + 5, 0), []);
    expect(wants(s, 'away1')).toBe(true);
    place(s, 'away1', RIM0 + 2, 0);
    expect(wants(s, 'away1')).toBe(false);
    place(s, 'away1', RIM0 + 8, 0);
    expect(wants(s, 'away1')).toBe(false);
    place(s, 'away1', RIM0 + 5, 0);
    giveBall(s, player(s, 'away2'), []);
    expect(wants(s, 'away1')).toBe(false);
  });

  it('Hot Hand: own team in possession', () => {
    const s = live();
    s.possession = 0;
    expect(wants(s, 'home2')).toBe(true);
    s.possession = 1;
    expect(wants(s, 'home2')).toBe(false);
  });

  it('Blur: defending the holder within 5 m, or holding the ball more than 10 m out', () => {
    const s = live();
    giveBall(s, place(s, 'home1', 0, 0), []);
    place(s, 'away2', 4, 0);
    expect(wants(s, 'away2')).toBe(true);
    place(s, 'away2', 6, 0);
    expect(wants(s, 'away2')).toBe(false);
    giveBall(s, place(s, 'away2', RIM0 + 12, 0), []);
    expect(wants(s, 'away2')).toBe(true);
    place(s, 'away2', RIM0 + 8, 0);
    expect(wants(s, 'away2')).toBe(false);
  });

  it('Earthquake: two opponents within 4 m, or the opposing holder within 4 m', () => {
    const s = live();
    giveBall(s, player(s, 'home2'), []);
    place(s, 'home1', 0, 0);
    place(s, 'away1', 2, 0);
    place(s, 'away2', 0, 3);
    expect(wants(s, 'home1')).toBe(true);
    place(s, 'away2', 0, 6);
    expect(wants(s, 'home1')).toBe(false);
    giveBall(s, player(s, 'away1'), []);
    expect(wants(s, 'home1')).toBe(true);
  });
});

describe('decide: one-tick SPECIAL press on decision ticks (spec D.5)', () => {
  /** Ace (home2) charged while home1 holds the ball: Hot Hand wants it; home2 plans on tick 3. */
  function ready(): { s: MatchState; m: AiMemory } {
    const s = live();
    giveBall(s, place(s, 'home1', 0, 0), []);
    player(s, 'home2').charge = CHARGE_MAX;
    const m = createAiMemory('home2', 1, 1, true);
    s.tick = m.nextDecisionTick;
    return { s, m };
  }

  it('presses SPECIAL on the decision tick, then releases it', () => {
    const { s, m } = ready();
    expect(wantsAbility(s, player(s, 'home2'), court, ABILITIES)).toBe(true);
    expect(decide(s, m, AI_PROFILES.fair, court, ABILITIES).special).toBe(true);
    s.tick += 1;
    expect(decide(s, m, AI_PROFILES.fair, court, ABILITIES).special).toBe(false);
  });

  it('never presses without a full bar, while active, or with NO_ABILITIES', () => {
    const a = ready();
    player(a.s, 'home2').charge = CHARGE_MAX - 1;
    expect(decide(a.s, a.m, AI_PROFILES.fair, court, ABILITIES).special).toBe(false);
    const b = ready();
    player(b.s, 'home2').ability = { ticksLeft: null, uses: 3 };
    expect(decide(b.s, b.m, AI_PROFILES.fair, court, ABILITIES).special).toBe(false);
    const c = ready();
    expect(decide(c.s, c.m, AI_PROFILES.fair, court, NO_ABILITIES).special).toBe(false);
    expect(decide(c.s, c.m, AI_PROFILES.fair, court).special).toBe(false);
  });

  it('the press activates the ability in the sim', () => {
    const { s, m } = ready();
    const intent = decide(s, m, AI_PROFILES.fair, court, ABILITIES);
    const r = tick(s, new Map([['home2', intent]]), court, ABILITIES);
    expect(r.events).toContainEqual({ type: 'abilityActivated', playerId: 'home2', abilityId: 'hotHand' });
  });
});

describe('loose-ball chase reads the court aiHint (spec D.5)', () => {
  it('leads the ball by where the gust carries it in 0.75 s; straight at it otherwise', () => {
    const s = live();
    s.ball.mode = 'free';
    s.ball.holder = null;
    s.ball.pos = { x: 2, y: 0.12, z: 1 };
    const me = player(s, 'home1');
    expect(chaseTarget(s, me, court)).toEqual(s.ball.pos);
    const rooftop = getCourt('rooftop');
    s.courtState = { nextGustTick: 1_000_000, gust: { ticksLeft: 100, dir: { x: 1, y: 0, z: 0 } } };
    const target = chaseTarget(s, me, rooftop);
    expect(target.x).toBeCloseTo(2 + 4 * 0.5 * 0.75 * 0.75);
    expect(target.z).toBeCloseTo(1);
  });
});
```

In `tests/app/session.test.ts`, add `import { ABILITIES } from '../../src/content/abilities';` and, in the first test, `expect(session.runner.abilities).toBe(ABILITIES);`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/sim/ai-abilities.test.ts tests/app/session.test.ts`
Expected: FAIL — `chaseTarget`/`wantsAbility` are not exported; `runner.abilities` is undefined.

- [ ] **Step 3: Memory**

In `src/sim/ai/memory.ts`: add to `AiMemory` after `passedLastTick: boolean;`

```ts
  /** One-tick SPECIAL press (spec D.5), like the action and pass buttons. */
  specialLastTick: boolean;
```

and `specialLastTick: false,` after `passedLastTick: false,` in both `createAiMemory` and `resetAiMemory` (as `memory.specialLastTick = false;` there).

- [ ] **Step 4: The brain**

In `src/sim/ai/brain.ts`:

1. Imports: add

```ts
import { canActivateAbility } from '../abilities';
import { HOOK_MATH, NO_ABILITIES, type AbilityTable } from '../hooks';
```

2. `decide` gains the parameter and the press:

```ts
export function decide(
  state: MatchState,
  memory: AiMemory,
  profile: AiProfile,
  court: CourtDef,
  abilities: AbilityTable = NO_ABILITIES,
): PlayerIntent {
```

and its last statement becomes:

```ts
  const intent = act(state, me, memory, profile, court, isDecisionTick);
  // Spec D.5: abilities are considered on decision ticks only; a yes is a one-tick SPECIAL press.
  const special = isDecisionTick && wantsAbility(state, me, court, abilities);
  return finish(memory, special ? { ...intent, special: true } : intent);
}
```

3. `finish` becomes:

```ts
/** One-tick presses: a button emitted last tick is forced off this tick (spec C.2, D.5). */
function finish(memory: AiMemory, intent: PlayerIntent): PlayerIntent {
  const out: PlayerIntent = {
    ...intent,
    action: intent.action && !memory.pressedLastTick,
    pass: intent.pass && !memory.passedLastTick,
    special: intent.special && !memory.specialLastTick,
  };
  memory.pressedLastTick = out.action;
  memory.passedLastTick = out.pass;
  memory.specialLastTick = out.special;
  return out;
}
```

4. Add after `passLanding`:

```ts
/** Spec D.5: the sim would activate my ability now and its `aiWantsToUse` says yes. */
export function wantsAbility(
  state: MatchState,
  me: PlayerState,
  court: CourtDef,
  abilities: AbilityTable,
): boolean {
  if (me.abilityId === null || !canActivateAbility(state, me, abilities)) return false;
  return abilities[me.abilityId]?.aiWantsToUse?.(state, me, { math: HOOK_MATH, court }) ?? false;
}

/** Spec D.5: a loose ball is chased where the court's drift (aiHint) carries it in this long. */
export const CHASE_DRIFT_LEAD_SECONDS = 0.75;

export function chaseTarget(state: MatchState, me: PlayerState, court: CourtDef): Vec3 {
  const drift = court.modifier?.aiHint?.(state, me).ballDrift;
  if (!drift) return state.ball.pos;
  const k = 0.5 * CHASE_DRIFT_LEAD_SECONDS * CHASE_DRIFT_LEAD_SECONDS;
  return {
    x: state.ball.pos.x + drift.x * k,
    y: state.ball.pos.y,
    z: state.ball.pos.z + drift.z * k,
  };
}
```

5. The `chase` case of `act` becomes:

```ts
    case 'chase': {
      const target = chaseTarget(state, me, court);
      const d = v3DistanceXZ(me.pos, target);
      return {
        ...NO_INTENT,
        move: steerTowards(me.pos, target, CHASE_ARRIVE_RADIUS),
        turbo: wantsTurbo(me, d, profile),
      };
    }
```

(On the gym `chaseTarget` returns `state.ball.pos` itself, so the gym AI is unchanged.)

- [ ] **Step 5: App wiring**

Replace `src/app/match-runner.ts` with:

```ts
import { NO_ABILITIES, type AbilityTable } from '../sim/hooks';
import { tick } from '../sim/tick';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, SimEvent } from '../sim/types';

/** Holds the two latest simulation states so the renderer can interpolate between them. */
export class MatchRunner {
  private prev: MatchState;
  private next: MatchState;

  constructor(
    readonly court: CourtDef,
    initial: MatchState,
    readonly abilities: AbilityTable = NO_ABILITIES,
  ) {
    this.prev = initial;
    this.next = initial;
  }

  get previous(): MatchState {
    return this.prev;
  }

  get current(): MatchState {
    return this.next;
  }

  step(intents: ReadonlyMap<PlayerId, PlayerIntent>): SimEvent[] {
    const result = tick(this.next, intents, this.court, this.abilities);
    this.prev = this.next;
    this.next = result.state;
    return result.events;
  }
}
```

In `src/app/ai-controller.ts`: add `import type { AbilityTable } from '../sim/hooks';`, add to `AiControllerOptions`

```ts
  /** The ability table the match runs with (spec D.5); none by default. */
  abilities?: AbilityTable;
```

and the controller becomes `controller: (state) => decide(state, memory, options.profile, court, options.abilities)`.

In `src/app/session.ts`: add `import { ABILITIES } from '../content/abilities';`, construct the runner as `new MatchRunner(court, state, ABILITIES)` and the AI as `createAiController(id, court, { profile, seed, slot, favourTeammate, abilities: ABILITIES })`. (Shootaround dummies never press SPECIAL; the human can use their ability there too.)

- [ ] **Step 6: Run the unit tests**

Run: `npm test -- tests/sim/ai-abilities.test.ts tests/app tests/sim/ai-defense.test.ts tests/sim/ai-offense.test.ts tests/sim/ai-foundation.test.ts`
Expected: PASS.

Run: `npx vitest run tests/sim/ai-golden.test.ts tests/sim/determinism.test.ts`
Expected: PASS, no snapshot written (the gym golden runs `NO_ABILITIES`: no SPECIAL is ever pressed and the gym has no `aiHint`).

- [ ] **Step 7: Harness — courts and abilities in the AI runner**

Replace `tests/sim/ai-match.ts` with:

```ts
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES, type AiProfile } from '../../src/sim/ai/profile';
import { NO_ABILITIES, type AbilityTable } from '../../src/sim/hooks';
import { createMatch } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type {
  CourtDef,
  MatchSettings,
  MatchState,
  PlayerIntent,
  SimEvent,
} from '../../src/sim/types';

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

/** Defaults (gym, NO_ABILITIES) are the Phase 4 golden; phase 5 runs pass a court and ABILITIES. */
export interface AiMatchOptions {
  court?: CourtDef;
  abilities?: AbilityTable;
}

/** The initial state for `seed` on `matchCourt` (shared with replays). */
export function startState(seed: number, matchCourt: CourtDef = court): MatchState {
  return createMatch({ ...settings, seed, courtId: matchCourt.id }, matchCourt, roster);
}

/** Four brains (the human slot too) play a full match; every intent is recorded for replay. */
export function playAiMatch(
  seed: number,
  profile: AiProfile = AI_PROFILES.fair,
  options: AiMatchOptions = {},
): AiRun {
  const matchCourt = options.court ?? court;
  const abilities = options.abilities ?? NO_ABILITIES;
  let state = startState(seed, matchCourt);
  const memories = roster.map((e, i) => createAiMemory(e.id, seed, i % 2, e.id === 'home2'));
  const events: SimEvent[] = [];
  const intents: Map<string, PlayerIntent>[] = [];
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    const frame = new Map(
      memories.map((m) => [m.playerId, decide(state, m, profile, matchCourt, abilities)]),
    );
    intents.push(frame);
    const r = tick(state, frame, matchCourt, abilities);
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

(`startState(seed)` on the gym equals the old `createMatch({ ...settings, seed }, court, roster)`, so the gym golden is unchanged.)

- [ ] **Step 8: One AI golden per court with abilities**

Append to `tests/sim/ai-golden.test.ts` (add the imports `import { ABILITIES } from '../../src/content/abilities';`, `import { getCourt } from '../../src/content/courts';`, `import { AI_PROFILES } from '../../src/sim/ai/profile';`, and `startState`, `type AiRun` from `./ai-match`):

```ts
describe('AI goldens with abilities, one per court (spec D.7)', () => {
  const COURT_IDS = ['gym', 'rooftop', 'volcano', 'frozen'] as const;
  let cache: Record<string, AiRun> | null = null;
  const runs = (): Record<string, AiRun> =>
    (cache ??= Object.fromEntries(
      COURT_IDS.map((id) => [
        id,
        playAiMatch(7, AI_PROFILES.fair, { court: getCourt(id), abilities: ABILITIES }),
      ]),
    ));

  it('every court finishes, scores on both sides and sees abilities used', () => {
    for (const id of COURT_IDS) {
      const run = runs()[id];
      expect(run.state.phase, id).toBe('finished');
      expect(run.state.score[0], id).toBeGreaterThan(0);
      expect(run.state.score[1], id).toBeGreaterThan(0);
      expect(run.events.some((e) => e.type === 'abilityActivated'), id).toBe(true);
    }
    expect(runs().rooftop.events.some((e) => e.type === 'gustStart')).toBe(true);
  });

  it('matches the pinned hashes — update only for an intentional simulation, AI, ability or court change', () => {
    const pins = Object.fromEntries(
      COURT_IDS.map((id) => {
        const { state } = runs()[id];
        return [id, `${fnv1a(JSON.stringify(state))} ${state.score[0]}-${state.score[1]}`];
      }),
    );
    expect(pins).toMatchInlineSnapshot();
  });

  it('replays the rooftop match from seed + recorded intents, court RNG included (spec §4.10)', () => {
    const rooftop = getCourt('rooftop');
    const run = runs().rooftop;
    let state = startState(7, rooftop);
    for (const frame of run.intents) state = tick(state, frame, rooftop, ABILITIES).state;
    expect(fnv1a(JSON.stringify(state))).toBe(fnv1a(JSON.stringify(run.state)));
  });
});
```

Pinning: run `npx vitest run tests/sim/ai-golden.test.ts` once — expected: only the new `matches the pinned hashes` test fails (empty snapshot); every older test passes, including the gym state hash and the gym event pin. Then `npx vitest run tests/sim/ai-golden.test.ts -u`, then once more without `-u` (stable). `git diff` must show only the new snapshot filled. If the first test fails (a court that does not finish, a team at 0, no ability used), that is a real finding: fix the cause (see Step 10 notes), never weaken the assertion.

- [ ] **Step 9: Sweep — + 5 seeds per court with abilities**

Replace `tests/sim/ai-sweep.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { getCourt } from '../../src/content/courts';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { TICK_MS } from '../../src/sim/constants';
import { NO_ABILITIES, type AbilityTable } from '../../src/sim/hooks';
import { allPlayers } from '../../src/sim/match';
import { LOOSE_BALL_TIMEOUT_TICKS } from '../../src/sim/phases';
import { tick } from '../../src/sim/tick';
import type { CourtDef, PlayerIntent, SimEvent } from '../../src/sim/types';
import { court, playAiMatch, startState, type AiRun } from './ai-match';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
/** Spec D.7: + 5 seeds on every court with abilities on. */
const COURT_RUNS: [string, number][] = ['gym', 'rooftop', 'volcano', 'frozen'].flatMap((id) =>
  [1, 2, 3, 4, 5].map((seed): [string, number] => [id, seed]),
);
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
function walk(
  seed: number,
  frames: Map<string, PlayerIntent>[],
  matchCourt: CourtDef = court,
  abilities: AbilityTable = NO_ABILITIES,
) {
  let state = startState(seed, matchCourt);
  let lastProgress = 0;
  let maxGap = 0;
  let liveTicks = 0;
  let idleRun = 0;
  let longestIdle = 0;
  const stunned: Record<string, number> = {};
  for (let i = 0; i < frames.length; i++) {
    // Brains emit NO_INTENT outside live play (celebration, inbound): only live frames can idle.
    if (state.phase === 'live') {
      idleRun = [...frames[i].values()].every(isIdle) ? idleRun + 1 : 0;
      longestIdle = Math.max(longestIdle, idleRun);
    } else idleRun = 0;
    const r = tick(state, frames[i], matchCourt, abilities);
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
  return { maxGap, stunned, liveTicks, longestIdle };
}

function expectLively(
  run: AiRun,
  seed: number,
  matchCourt: CourtDef = court,
  abilities: AbilityTable = NO_ABILITIES,
): void {
  expect(run.state.phase).toBe('finished');
  expect(run.state.score[0]).toBeGreaterThanOrEqual(6);
  expect(run.state.score[1]).toBeGreaterThanOrEqual(6);
  const { maxGap, stunned, liveTicks, longestIdle } = walk(seed, run.intents, matchCourt, abilities);
  expect(maxGap).toBeLessThanOrEqual(MAX_PROGRESS_GAP_TICKS);
  for (const id of Object.keys(stunned)) expect(stunned[id] / liveTicks).toBeLessThan(MAX_STUN_SHARE);
  expect(longestIdle).toBeLessThan(IDLE_STRETCH_TICKS);
}

describe('AI seed sweep: no soft locks (spec C.7)', () => {
  it.each(SEEDS)('seed %i plays a complete, lively match', (seed) => expectLively(playAiMatch(seed), seed), 120_000);
});

describe('AI seed sweep with abilities, per court (spec D.7)', () => {
  it.each(COURT_RUNS)(
    '%s seed %i plays a complete, lively match',
    (id, seed) => {
      const matchCourt = getCourt(id);
      const run = playAiMatch(seed, AI_PROFILES.fair, { court: matchCourt, abilities: ABILITIES });
      expectLively(run, seed, matchCourt, ABILITIES);
    },
    120_000,
  );
});
```

Run: `npm test -- tests/sim/ai-sweep.test.ts`
Expected: 40 tests PASS (≈ 20–25 s). Note the duration on the PR.

- [ ] **Step 10: If a court run stalls or a band fails**

These are findings, not test bugs. Diagnose with `?court=<id>&seed=<n>&debug` in the browser or by logging the events around `maxGap`. Likely causes and the fix that stays inside this plan's decisions: Frozen Lake AI overshooting its arrive radius (deceleration ×0.25) — widen the arrive radius only when `stats.deceleration` is below the base (a brain change, documented in the PR); Blur steering oscillating at 14–18 m/s — same remedy; an Earthquake stun share above 30 % — report it, do not change D.3's numbers without a controller ruling. Record every such change in the PR.

- [ ] **Step 11: Balance report — courts and ability use**

Replace `tests/balance/ai.balance.ts` with:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../../src/content/abilities';
import { characters, getCharacter } from '../../src/content/characters';
import { courts, getCourt } from '../../src/content/courts';
import { decide } from '../../src/sim/ai/brain';
import { createAiMemory } from '../../src/sim/ai/memory';
import { AI_PROFILES } from '../../src/sim/ai/profile';
import { createMatch, type RosterEntry } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import type { CourtDef, MatchSettings } from '../../src/sim/types';

const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 0,
  ruleIds: ['shotClock'],
  courtId: 'gym',
  mode: 'match',
};
/**
 * Spec C.7 / D.7 sample sizes, trimmed so the run stays near 5 minutes (≈ 864 matches): the gym
 * keeps 20 seeds for the mirrored duos (10 for the strength table); the other courts play the
 * mirrored duos only, 8 seeds each.
 */
const GYM_MIRROR_SEEDS = 20;
const GYM_STRENGTH_SEEDS = 10;
const COURT_MIRROR_SEEDS = 8;
const MAX_TICKS = 20_000;
const ABILITY_USE_TARGET = [1.5, 3] as const;
const ids = characters.map((c) => c.id);

function roster(home: [string, string], away: [string, string]): RosterEntry[] {
  return [
    { id: 'home1', team: 0, characterId: home[0], character: getCharacter(home[0]) },
    { id: 'home2', team: 0, characterId: home[1], character: getCharacter(home[1]) },
    { id: 'away1', team: 1, characterId: away[0], character: getCharacter(away[0]) },
    { id: 'away2', team: 1, characterId: away[1], character: getCharacter(away[1]) },
  ];
}

/** Ability activations per character, and how many player-matches each character played. */
const uses: Record<string, number> = {};
const slots: Record<string, number> = {};

function play(seed: number, entries: RosterEntry[], court: CourtDef): [number, number] {
  let state = createMatch({ ...settings, seed, courtId: court.id }, court, entries);
  const memories = entries.map((e, i) => createAiMemory(e.id, seed, i % 2, false));
  const characterOf = new Map(entries.map((e) => [e.id, e.characterId]));
  for (const e of entries) slots[e.characterId] = (slots[e.characterId] ?? 0) + 1;
  while (state.phase !== 'finished' && state.tick < MAX_TICKS) {
    const frame = new Map(
      memories.map((m) => [m.playerId, decide(state, m, AI_PROFILES.fair, court, ABILITIES)]),
    );
    const r = tick(state, frame, court, ABILITIES);
    state = r.state;
    for (const e of r.events) {
      if (e.type !== 'abilityActivated') continue;
      const c = characterOf.get(e.playerId) ?? '?';
      uses[c] = (uses[c] ?? 0) + 1;
    }
  }
  return [state.score[0], state.score[1]];
}

interface Row {
  label: string;
  homeWins: number;
  games: number;
  meanHome: number;
  meanAway: number;
}

function series(
  label: string,
  home: [string, string],
  away: [string, string],
  court: CourtDef,
  seeds: number,
): Row {
  let homeWins = 0;
  let sumHome = 0;
  let sumAway = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const [h, a] = play(seed, roster(home, away), court);
    if (h > a) homeWins++;
    sumHome += h;
    sumAway += a;
  }
  return { label, homeWins, games: seeds, meanHome: sumHome / seeds, meanAway: sumAway / seeds };
}

function summary(rows: Row[]): { games: number; homeRate: number; meanTotal: number } {
  const games = rows.reduce((n, r) => n + r.games, 0);
  const homeWins = rows.reduce((n, r) => n + r.homeWins, 0);
  const total = rows.reduce((n, r) => n + (r.meanHome + r.meanAway) * r.games, 0);
  return { games, homeRate: homeWins / games, meanTotal: total / games };
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

describe('balance report (spec C.7, D.7; on demand)', () => {
  it('no side bias on any court; scores in band; ability use reported', () => {
    const mirrored = new Map<string, Row[]>();
    for (const court of courts) {
      const seeds = court.id === 'gym' ? GYM_MIRROR_SEEDS : COURT_MIRROR_SEEDS;
      const rows: Row[] = [];
      for (const a of ids)
        for (const b of ids) rows.push(series(`${a}+${b} vs ${a}+${b}`, [a, b], [a, b], court, seeds));
      mirrored.set(court.id, rows);
    }
    const gym = getCourt('gym');
    const strength: Row[] = [];
    for (const a of ids)
      for (const c of ids)
        strength.push(
          series(`${a}+rook vs ${c}+rook`, [a, 'rook'], [c, 'rook'], gym, GYM_STRENGTH_SEEDS),
        );

    const perCourt = courts.map((c) => ({ id: c.id, ...summary(mirrored.get(c.id) ?? []) }));
    const all = summary([...mirrored.values()].flat());
    const perCharacter = ids.map((id) => ({ id, perMatch: (uses[id] ?? 0) / (slots[id] ?? 1) }));
    const inTarget = (x: number): string =>
      x >= ABILITY_USE_TARGET[0] && x <= ABILITY_USE_TARGET[1] ? 'yes' : '**no**';

    const date = new Date().toISOString().slice(0, 10);
    const report = [
      `# AI balance report — ${date}`,
      '',
      `Fair profile, abilities on, 3-minute matches. Mirrored duos: ${GYM_MIRROR_SEEDS} seeds on the gym, ${COURT_MIRROR_SEEDS} on each other court; strength table on the gym, ${GYM_STRENGTH_SEEDS} seeds.`,
      '',
      `**Side bias (all mirrored games, ${all.games}):** home wins ${(100 * all.homeRate).toFixed(1)} % — band 45–55 %.`,
      `**Mean total score (all mirrored):** ${all.meanTotal.toFixed(1)} — band 20–60.`,
      '',
      '## Per court (mirrored duos)',
      '',
      '| court | games | home wins | mean total |',
      '|---|---|---|---|',
      ...perCourt.map(
        (c) => `| ${c.id} | ${c.games} | ${(100 * c.homeRate).toFixed(1)} % | ${c.meanTotal.toFixed(1)} |`,
      ),
      '',
      `## Ability uses per player per match (target ${ABILITY_USE_TARGET[0]}–${ABILITY_USE_TARGET[1]})`,
      '',
      '| character | uses / match | in target |',
      '|---|---|---|',
      ...perCharacter.map((c) => `| ${c.id} | ${c.perMatch.toFixed(2)} | ${inTarget(c.perMatch)} |`),
      '',
      '## Gym — mirrored duos',
      '',
      table(mirrored.get('gym') ?? []),
      '',
      '## Gym — lead vs lead (Rook partners)',
      '',
      table(strength),
      '',
    ].join('\n');
    mkdirSync('docs/balance', { recursive: true });
    writeFileSync(`docs/balance/${date}.md`, report);
    process.stdout.write(`\n${report}\n`);

    // Spec C.7 on the gym; spec D.7's 45–55 % on the aggregate (per court the samples are small).
    const gymRow = perCourt[0];
    expect(gymRow.homeRate).toBeGreaterThanOrEqual(0.4);
    expect(gymRow.homeRate).toBeLessThanOrEqual(0.6);
    expect(all.homeRate).toBeGreaterThanOrEqual(0.45);
    expect(all.homeRate).toBeLessThanOrEqual(0.55);
    for (const c of perCourt) {
      expect(c.homeRate, c.id).toBeGreaterThanOrEqual(0.35);
      expect(c.homeRate, c.id).toBeLessThanOrEqual(0.65);
      expect(c.meanTotal, c.id).toBeGreaterThanOrEqual(20);
      expect(c.meanTotal, c.id).toBeLessThanOrEqual(60);
    }
    for (const c of perCharacter) expect(c.perMatch, c.id).toBeGreaterThan(0);
  });
});
```

Run: `npm run balance` — **this takes minutes (≈ 5 on a laptop: 864 full matches)**; run it in the foreground with a 10-minute timeout. Commit the generated `docs/balance/<today>.md` (if today is `2026-10-01`, it overwrites the Phase 4 report; that is intended — git keeps the old one).

If a band fails, that is a finding: put the report table on the PR and say which band failed. Ability uses outside 1.5–3 are reported, not failed — say so on the PR so the controller can tune `CHARGE_GAIN` (Task 1) after the playtest. Do not change thresholds or spec numbers to make it pass.

- [ ] **Step 12: Full check and commit**

Run: `npm run format && npm run check`
Expected: green (the sweep now has 40 cases; note `npm test` duration on the PR).

```bash
git add src/sim/ai src/app tests docs/balance
git commit -m "feat(ai): use abilities on decision ticks, lead loose balls in gusts; per-court goldens, sweep and balance"
```

---
### Task 5: Presentation — ability bar, banners, GUST chip, SP button, debug, court dressing, README

**Files:**
- Create: `src/render/weather-view.ts`, `tests/render/weather-view.test.ts`, `tests/render/court-view.test.ts`, `tests/ui/debug-overlay.test.ts`
- Modify: `src/ui/hud.ts`, `src/ui/hud.css`, `src/ui/debug-overlay.ts`, `src/input/touch.ts`, `src/input/touch.css`, `src/render/court-view.ts`, `src/app.ts`, `README.md`
- Test: `tests/ui/hud.test.ts`, `tests/input/touch.test.ts`

**Interfaces:**
- Consumes: (Task 1) `CHARGE_MAX`, `AbilityDef`, `AbilityTable`, `NO_ABILITIES`, `PlayerState.{abilityId, charge, ability}`, events `abilityActivated`, `gustStart`, `gustEnd`; (Task 2) `ABILITIES`; (Task 3) `CourtDef.dressing`, `Weather`, `getCourt`.
- Produces: `Hud(parent, humanTeam = 0, options: HudOptions = {})` with `HudOptions { humanId?: PlayerId; abilities?: AbilityTable }`, `Hud.handleEvents(events, state?)`, `abilityBanner(abilityId, abilities)`, `abilityBarView(player, def): AbilityBarView`, `gustArrowDegrees(dir)`; `abilityLines(state): string[]` and `DebugData.abilities: string[]`; `TouchBackend.setSpecialReady(ready: boolean)`; `buildCourtView(court)` reading `court.dressing` (meshes named `floor`, `court-line`, `glow-strip`); `WeatherView(court, random = Math.random)` with `group`, `instances`, `handleEvents(events)`, `update(dtSeconds)`, `reset()`, `tilt`; `rainVelocity(gust)`, `RAIN_COUNT = 400`, `EMBER_COUNT = 120`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/hud.test.ts` (add the imports `import { ABILITIES } from '../../src/content/abilities';`, `import { getCharacter } from '../../src/content/characters';`, `import { findPlayer } from '../../src/sim/match';`, and `abilityBanner`, `abilityBarView` to the `../../src/ui/hud` import):

```ts
describe('Hud ability bar, ability banners and the GUST chip (spec D.6)', () => {
  let parent: HTMLDivElement;
  let hud: Hud;
  const roster = [
    { id: 'home1', team: 0 as const, characterId: 'brick', character: getCharacter('brick') },
    { id: 'home2', team: 0 as const, characterId: 'ace', character: getCharacter('ace') },
    { id: 'away1', team: 1 as const, characterId: 'dash', character: getCharacter('dash') },
  ];
  const fresh = () => createMatch(settings, court, roster);
  const el = (selector: string): HTMLElement => {
    const found = parent.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`missing ${selector}`);
    return found;
  };
  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    hud = new Hud(parent, 0, { humanId: 'home1', abilities: ABILITIES });
  });
  afterEach(() => {
    hud.dispose();
    parent.remove();
  });

  it('shows the human’s ability name and fills with charge in the team colour', () => {
    const s = fresh();
    const me = findPlayer(s, 'home1');
    if (!me) throw new Error('no human');
    me.charge = 50;
    hud.update(s);
    expect(el('.hud-ability').hidden).toBe(false);
    expect(el('.hud-ability-name').textContent).toContain('Rocket Dunk');
    expect(el('.hud-ability-fill').style.width).toBe('50%');
    expect(el('.hud-ability-status').textContent).toBe('');
    expect(el('.hud-ability').classList.contains('team-0')).toBe(true);
  });

  it('pulses READY at a full bar', () => {
    const s = fresh();
    const me = findPlayer(s, 'home1');
    if (!me) throw new Error('no human');
    me.charge = 100;
    hud.update(s);
    expect(el('.hud-ability-status').textContent).toBe('READY');
    expect(el('.hud-ability').classList.contains('is-ready')).toBe(true);
  });

  it('shows the seconds left while a timed ability runs, draining the bar', () => {
    const s = fresh();
    const me = findPlayer(s, 'home1');
    if (!me) throw new Error('no human');
    me.ability = { ticksLeft: 240, uses: 0 };
    hud.update(s);
    expect(el('.hud-ability-status').textContent).toBe('4 s');
    expect(el('.hud-ability-fill').style.width).toBe('50%'); // 240 of Rocket Dunk's 480 ticks
    expect(el('.hud-ability').classList.contains('is-active')).toBe(true);
    expect(el('.hud-ability').classList.contains('is-ready')).toBe(false);
  });

  it('shows three pips for Hot Hand', () => {
    const s = fresh();
    const ace = findPlayer(s, 'home2');
    const def = ABILITIES.hotHand;
    if (!ace || !def) throw new Error('setup');
    ace.ability = { ticksLeft: null, uses: 3 };
    expect(abilityBarView(ace, def).status).toBe('●●●');
    ace.ability.uses = 1;
    expect(abilityBarView(ace, def).status).toBe('●');
  });

  it('stays hidden without a human id', () => {
    const other = document.createElement('div');
    const plain = new Hud(other);
    plain.update(fresh());
    expect(other.querySelector<HTMLElement>('.hud-ability')?.hidden).toBe(true);
    plain.dispose();
  });

  it('names every launch ability in its banner', () => {
    expect(abilityBanner('rocketDunk', ABILITIES)).toBe('ROCKET DUNK!');
    expect(abilityBanner('hotHand', ABILITIES)).toBe('HOT HAND!');
    expect(abilityBanner('blur', ABILITIES)).toBe('BLUR!');
    expect(abilityBanner('earthquake', ABILITIES)).toBe('EARTHQUAKE!');
  });

  it('announces an activation in the activating team’s colour', () => {
    hud.handleEvents([{ type: 'abilityActivated', playerId: 'away1', abilityId: 'blur' }], fresh());
    hud.tick(0);
    expect(el('.hud-banner').textContent).toBe('BLUR!');
    expect(el('.hud-banner').classList.contains('team-1')).toBe(true);
    hud.handleEvents([{ type: 'block', by: 'home1', shooter: 'away1' }]);
    hud.tick(1.3);
    expect(el('.hud-banner').textContent).toBe('BLOCKED!');
    expect(el('.hud-banner').classList.contains('team-1')).toBe(false);
  });

  it('shows a GUST chip with an arrow while a gust blows', () => {
    expect(el('.hud-gust').hidden).toBe(true);
    hud.handleEvents([{ type: 'gustStart', dir: { x: 0, y: 0, z: 1 } }]);
    expect(el('.hud-gust').hidden).toBe(false);
    expect(el('.hud-gust-arrow').style.transform).toBe('rotate(90deg)');
    hud.handleEvents([{ type: 'gustEnd' }]);
    expect(el('.hud-gust').hidden).toBe(true);
  });
});
```

Append to `tests/input/touch.test.ts`:

```ts
describe('TouchBackend SP readiness (spec D.6)', () => {
  it('dims SP until the ability bar is full, without blocking presses', () => {
    expect(button('special').classList.contains('is-dimmed')).toBe(true);
    backend.setSpecialReady(true);
    expect(button('special').classList.contains('is-dimmed')).toBe(false);
    backend.setSpecialReady(false);
    expect(button('special').classList.contains('is-dimmed')).toBe(true);
    fire(button('special'), 'pointerdown', { pointerId: 4, clientX: 900, clientY: 450 });
    expect(backend.sample().special).toBe(true);
  });
});
```

Create `tests/ui/debug-overlay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/content/characters';
import { getCourt } from '../../src/content/courts';
import { createMatch, findPlayer } from '../../src/sim/match';
import { abilityLines } from '../../src/ui/debug-overlay';

describe('abilityLines (spec D.6 ?debug)', () => {
  it('lists every player’s charge and active ability', () => {
    const s = createMatch(
      { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: 'gym', mode: 'match' },
      getCourt('gym'),
      [
        { id: 'home1', team: 0, characterId: 'brick', character: getCharacter('brick') },
        { id: 'home2', team: 0, characterId: 'ace', character: getCharacter('ace') },
        { id: 'away1', team: 1, characterId: 'dash', character: getCharacter('dash') },
      ],
    );
    const home1 = findPlayer(s, 'home1');
    const home2 = findPlayer(s, 'home2');
    const away1 = findPlayer(s, 'away1');
    if (!home1 || !home2 || !away1) throw new Error('setup');
    home1.charge = 42.4;
    home2.ability = { ticksLeft: null, uses: 2 };
    away1.ability = { ticksLeft: 120, uses: 0 };
    expect(abilityLines(s)).toEqual([
      'home1 42%',
      'home2 0% hotHand 2 left',
      'away1 0% blur 120t',
    ]);
  });
});
```

Create `tests/render/court-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { getCourt } from '../../src/content/courts';
import { buildCourtView } from '../../src/render/court-view';

function named(courtId: string, name: string): Mesh[] {
  const out: Mesh[] = [];
  buildCourtView(getCourt(courtId)).traverse((o) => {
    if (o instanceof Mesh && o.name === name) out.push(o);
  });
  return out;
}

describe('buildCourtView dressing (spec D.6)', () => {
  it('paints the floor and the lines from the court dressing', () => {
    for (const id of ['gym', 'rooftop', 'volcano', 'frozen']) {
      const { dressing } = getCourt(id);
      const [floor] = named(id, 'floor');
      const material = floor?.material as MeshStandardMaterial;
      expect(material.color.getHex()).toBe(dressing.floorColor);
      expect(material.roughness).toBeCloseTo(dressing.floorRoughness);
      const lines = named(id, 'court-line');
      expect(lines).toHaveLength(5);
      expect((lines[0]?.material as MeshBasicMaterial).color.getHex()).toBe(dressing.lineColor);
    }
  });

  it('adds a glowing strip beyond each baseline only where embers rise', () => {
    expect(named('volcano', 'glow-strip')).toHaveLength(2);
    expect(named('gym', 'glow-strip')).toHaveLength(0);
    expect(named('rooftop', 'glow-strip')).toHaveLength(0);
  });
});
```

Create `tests/render/weather-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { getCourt } from '../../src/content/courts';
import {
  EMBER_COUNT,
  RAIN_COUNT,
  rainVelocity,
  WeatherView,
} from '../../src/render/weather-view';

const half = (): number => 0.5;

function instance(view: WeatherView, i: number): { pos: Vector3; rot: Quaternion } {
  const m = new Matrix4();
  view.instances?.getMatrixAt(i, m);
  const pos = new Vector3();
  const rot = new Quaternion();
  m.decompose(pos, rot, new Vector3());
  return { pos, rot };
}

describe('rainVelocity', () => {
  it('falls straight without wind and slants along the gust', () => {
    expect(rainVelocity(null)).toEqual({ x: 0, y: -14, z: 0 });
    const v = rainVelocity({ x: 1, y: 0, z: 0 });
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBe(-14);
  });
});

describe('WeatherView (spec D.6)', () => {
  it('is empty on courts without weather', () => {
    const view = new WeatherView(getCourt('gym'), half);
    expect(view.group.children).toHaveLength(0);
    expect(view.instances).toBeNull();
    view.update(0.1); // no-op
  });

  it('rain streaks are vertical in calm weather and slant with a gust', () => {
    const view = new WeatherView(getCourt('rooftop'), half);
    expect(view.instances?.count).toBe(RAIN_COUNT);
    view.update(0.016);
    expect(Math.abs(instance(view, 0).rot.z)).toBeLessThan(1e-9);
    view.handleEvents([{ type: 'gustStart', dir: { x: 1, y: 0, z: 0 } }]);
    view.update(0.016);
    expect(view.tilt).toBeGreaterThan(0.3);
    expect(Math.abs(instance(view, 0).rot.z)).toBeGreaterThan(0.1);
    view.handleEvents([{ type: 'gustEnd' }]);
    expect(view.tilt).toBe(0);
  });

  it('embers rise', () => {
    const view = new WeatherView(getCourt('volcano'), half);
    expect(view.instances?.count).toBe(EMBER_COUNT);
    const before = instance(view, 0).pos.y;
    view.update(0.1);
    expect(instance(view, 0).pos.y).toBeGreaterThan(before);
  });

  it('reset forgets the gust (a new match starts calm)', () => {
    const view = new WeatherView(getCourt('rooftop'), half);
    view.handleEvents([{ type: 'gustStart', dir: { x: 0, y: 0, z: 1 } }]);
    view.reset();
    expect(view.tilt).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/ui tests/input/touch.test.ts tests/render`
Expected: FAIL — missing `.hud-ability`, `setSpecialReady is not a function`, missing exports `abilityLines`, `../../src/render/weather-view`, no `floor` mesh.

- [ ] **Step 3: HUD**

Replace `src/ui/hud.ts` with:

```ts
import { CHARGE_MAX } from '../sim/abilities';
import { TICK_RATE } from '../sim/constants';
import { NO_ABILITIES, type AbilityDef, type AbilityTable } from '../sim/hooks';
import { findPlayer } from '../sim/match';
import type { Vec3 } from '../sim/math';
import type { MatchState, PlayerId, PlayerState, SimEvent, TeamIndex } from '../sim/types';
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

/** Spec D.6: "ROCKET DUNK!" and friends, from the ability's name. */
export function abilityBanner(abilityId: string, abilities: AbilityTable): string {
  return `${(abilities[abilityId]?.name ?? abilityId).toUpperCase()}!`;
}

export interface AbilityBarView {
  /** 0..100: charge, or the share of the timer left while active. */
  fill: number;
  status: string;
  ready: boolean;
  active: boolean;
}

/** Spec D.6: what the human's ability bar shows — charge, READY, seconds left, or Hot Hand pips. */
export function abilityBarView(player: PlayerState, def: AbilityDef): AbilityBarView {
  const active = player.ability;
  if (active !== null) {
    if (active.ticksLeft !== null) {
      const total = typeof def.durationTicks === 'number' ? def.durationTicks : active.ticksLeft;
      return {
        fill: total > 0 ? (100 * active.ticksLeft) / total : 0,
        status: `${Math.ceil(active.ticksLeft / TICK_RATE)} s`,
        ready: false,
        active: true,
      };
    }
    return { fill: 100, status: '●'.repeat(Math.max(0, active.uses)), ready: false, active: true };
  }
  const ready = player.charge >= CHARGE_MAX;
  return { fill: Math.min(100, player.charge), status: ready ? 'READY' : '', ready, active: false };
}

/** The camera sits on +Z, looking at −Z: court X is screen right and court Z is screen down. */
export function gustArrowDegrees(dir: Vec3): number {
  return (Math.atan2(dir.z, dir.x) * 180) / Math.PI;
}

export interface HudOptions {
  /** The human's player: the ability bar follows them. */
  humanId?: PlayerId;
  /** Names for the ability bar and banners (the app passes the content table). */
  abilities?: AbilityTable;
}

interface Banner {
  text: string;
  /** Team colour of the banner; null = the default white. */
  team: TeamIndex | null;
}

/** Score, clocks, ability bar and event banners in the DOM (spec §9, D.6). Never reads input. */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly home: HTMLSpanElement;
  private readonly away: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly shotClock: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly ability: HTMLDivElement;
  private readonly abilityName: HTMLSpanElement;
  private readonly abilityFill: HTMLSpanElement;
  private readonly abilityStatus: HTMLSpanElement;
  private readonly gust: HTMLDivElement;
  private readonly gustArrow: HTMLSpanElement;
  private readonly queue: Banner[] = [];
  private readonly humanId: PlayerId | undefined;
  private readonly abilities: AbilityTable;
  private bannerLeft = 0;
  private wasOvertime = false;
  private final = false;
  /** Last text written per element, so a frame with no change writes nothing to the DOM. */
  private readonly written = new Map<HTMLElement, string>();

  constructor(
    parent: HTMLElement,
    private readonly humanTeam: TeamIndex = 0,
    options: HudOptions = {},
  ) {
    this.humanId = options.humanId;
    this.abilities = options.abilities ?? NO_ABILITIES;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML =
      '<div class="hud-score"><span class="hud-team hud-home">0</span>' +
      '<span class="hud-clock">0:00</span><span class="hud-team hud-away">0</span></div>' +
      '<div class="hud-shotclock">0</div>' +
      '<div class="hud-ability" hidden><span class="hud-ability-name"></span>' +
      '<span class="hud-ability-bar"><span class="hud-ability-fill"></span></span>' +
      '<span class="hud-ability-status"></span></div>' +
      '<div class="hud-gust" hidden><span class="hud-gust-arrow">➜</span>GUST</div>' +
      '<div class="hud-banner" hidden></div>';
    parent.appendChild(this.root);
    this.home = this.query('.hud-home');
    this.away = this.query('.hud-away');
    this.clock = this.query('.hud-clock');
    this.shotClock = this.query('.hud-shotclock');
    this.banner = this.query('.hud-banner');
    this.ability = this.query('.hud-ability');
    this.abilityName = this.query('.hud-ability-name');
    this.abilityFill = this.query('.hud-ability-fill');
    this.abilityStatus = this.query('.hud-ability-status');
    this.gust = this.query('.hud-gust');
    this.gustArrow = this.query('.hud-gust-arrow');
    this.ability.classList.add(`team-${humanTeam}`);
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
    this.updateAbility(state);

    if (state.overtime && !this.wasOvertime) this.queue.push({ text: 'OVERTIME!', team: null });
    this.wasOvertime = state.overtime;

    const final = state.phase === 'finished';
    if (final) {
      this.setText(this.banner, finalBanner(state, this.humanTeam));
      if (!this.final) {
        this.banner.classList.remove('team-0', 'team-1');
        this.banner.classList.add('is-final');
        this.banner.hidden = false;
      }
    } else if (this.final) {
      // A new match started: drop the sticky banner, any stale queue and the gust chip.
      this.banner.classList.remove('is-final');
      this.banner.hidden = true;
      this.written.delete(this.banner);
      this.queue.length = 0;
      this.bannerLeft = 0;
      this.gust.hidden = true;
    }
    this.final = final;
  }

  /** `state` (after the step) gives the activating player's team for ability banners. */
  handleEvents(events: SimEvent[], state?: MatchState): void {
    for (const event of events) {
      if (event.type === 'abilityActivated') {
        const team = state ? (findPlayer(state, event.playerId)?.team ?? null) : null;
        this.queue.push({ text: abilityBanner(event.abilityId, this.abilities), team });
      } else if (event.type === 'gustStart') {
        this.gustArrow.style.transform = `rotate(${gustArrowDegrees(event.dir).toFixed(0)}deg)`;
        this.gust.hidden = false;
      } else if (event.type === 'gustEnd') {
        this.gust.hidden = true;
      } else {
        const text = bannerFor(event);
        if (text) this.queue.push({ text, team: null });
      }
    }
  }

  tick(dtSeconds: number): void {
    if (this.final) return;
    this.bannerLeft -= dtSeconds;
    if (this.bannerLeft <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.setText(this.banner, next.text);
        this.banner.classList.toggle('team-0', next.team === 0);
        this.banner.classList.toggle('team-1', next.team === 1);
        this.banner.hidden = false;
        this.bannerLeft = BANNER_SECONDS;
      } else if (!this.banner.hidden) {
        this.banner.hidden = true;
      }
    }
  }

  private updateAbility(state: MatchState): void {
    const me = this.humanId === undefined ? undefined : findPlayer(state, this.humanId);
    const def = me?.abilityId ? this.abilities[me.abilityId] : undefined;
    const hidden = !me || !def;
    if (this.ability.hidden !== hidden) this.ability.hidden = hidden;
    if (!me || !def) return;
    const view = abilityBarView(me, def);
    this.setText(this.abilityName, `${def.icon} ${def.name}`);
    this.setText(this.abilityStatus, view.status);
    const width = `${Math.round(view.fill)}%`;
    if (this.abilityFill.style.width !== width) this.abilityFill.style.width = width;
    this.ability.classList.toggle('is-ready', view.ready);
    this.ability.classList.toggle('is-active', view.active);
  }

  dispose(): void {
    this.root.remove();
  }
}
```

Append to `src/ui/hud.css`:

```css
.hud-ability {
  position: absolute;
  top: calc(max(8px, env(safe-area-inset-top)) + 5.6em);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.45);
  font-size: clamp(12px, 2.2vmin, 16px);
  font-weight: 700;
  white-space: nowrap;
}

.hud-ability[hidden],
.hud-gust[hidden] {
  display: none;
}

.hud-ability-bar {
  display: block;
  width: clamp(90px, 18vmin, 180px);
  height: 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}

.hud-ability-fill {
  display: block;
  height: 100%;
  width: 0;
  background: #7fb2ff;
  transition: width 0.15s linear;
}

.hud-ability.team-1 .hud-ability-fill {
  background: #ff8c8c;
}

.hud-ability.is-active .hud-ability-fill {
  background: #ffd166;
}

.hud-ability-status {
  min-width: 3.5em;
  font-variant-numeric: tabular-nums;
}

.hud-ability.is-ready .hud-ability-status {
  color: #ffd166;
  animation: hud-pulse 0.8s ease-in-out infinite alternate;
}

@keyframes hud-pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 1;
  }
}

.hud-banner.team-0 {
  color: #7fb2ff;
}

.hud-banner.team-1 {
  color: #ff8c8c;
}

.hud-gust {
  position: absolute;
  top: calc(max(8px, env(safe-area-inset-top)) + 0.6em);
  right: max(16px, env(safe-area-inset-right));
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.45);
  font-size: clamp(12px, 2.2vmin, 16px);
  font-weight: 800;
  letter-spacing: 0.06em;
}

.hud-gust-arrow {
  display: inline-block;
}
```

- [ ] **Step 4: Debug overlay**

In `src/ui/debug-overlay.ts`: add `import type { MatchState } from '../sim/types';`, add `abilities: string[];` to `DebugData` (after `ai`), add the exported helper

```ts
/** Spec D.6 `?debug`: each player's charge and active ability. */
export function abilityLines(state: MatchState): string[] {
  return [...state.teams[0].players, ...state.teams[1].players].map((p) => {
    const a = p.ability;
    const active =
      a === null
        ? ''
        : ` ${p.abilityId ?? '?'} ${a.ticksLeft !== null ? `${a.ticksLeft}t` : `${a.uses} left`}`;
    return `${p.id} ${Math.round(p.charge)}%${active}`;
  });
}
```

and the line `` `abil   ${data.abilities.join(' | ') || '-'}`, `` after the `ai` line in `update`.

- [ ] **Step 5: Touch SP button**

In `src/input/touch.ts`, at the end of the constructor's button loop add the initial dim (`if (name === 'special') el.classList.add('is-dimmed');` right after `el.textContent = label;`), and add the public method after `hide()`:

```ts
  /** Spec D.6: SP is dimmed until the ability bar is full. Visual only: presses still count. */
  setSpecialReady(ready: boolean): void {
    const el = this.buttons.get('special')?.el;
    if (!el || el.classList.contains('is-dimmed') === !ready) return;
    el.classList.toggle('is-dimmed', !ready);
  }
```

Append to `src/input/touch.css`:

```css
.touch-button.is-dimmed {
  opacity: 0.35;
}
```

- [ ] **Step 6: Court dressing and weather**

Replace `src/render/court-view.ts` with:

```ts
import {
  BoxGeometry,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
} from 'three';
import { BOARD_HALF, hoopGeometry, RIM_RADIUS, type HoopGeometry } from '../sim/hoop';
import type { CourtDef } from '../sim/types';

const LINE_WIDTH = 0.05;
/** Volcano (spec D.6): the crater glow beyond each baseline. */
const GLOW_COLOR = 0xff4500;
const GLOW_BEYOND_BASELINE = 2;
const GLOW_DEPTH = 1.2;

/**
 * Placeholder court (spec §7.3, D.6): the play surface, lines, hoops and lights are generated
 * from the CourtDef so visuals always match the physics; colours and roughness come from its
 * dressing. The environment glTF arrives in phase 7.
 */
export function buildCourtView(court: CourtDef): Group {
  const group = new Group();
  const { length, width } = court.playArea;
  const { dressing } = court;

  const ground = new Mesh(
    new PlaneGeometry(length * 3, width * 4),
    new MeshStandardMaterial({ color: 0x3a3f4b }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;

  const floor = new Mesh(
    new PlaneGeometry(length, width),
    new MeshStandardMaterial({ color: dressing.floorColor, roughness: dressing.floorRoughness }),
  );
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  group.add(ground, floor);
  const lineMaterial = new MeshBasicMaterial({ color: dressing.lineColor });
  group.add(
    line(lineMaterial, length, LINE_WIDTH, 0, -width / 2),
    line(lineMaterial, length, LINE_WIDTH, 0, width / 2),
    line(lineMaterial, LINE_WIDTH, width, -length / 2, 0),
    line(lineMaterial, LINE_WIDTH, width, length / 2, 0),
    line(lineMaterial, LINE_WIDTH, width, 0, 0),
  );

  if (dressing.weather === 'embers') {
    for (const side of [-1, 1]) {
      const glow = new Mesh(
        new BoxGeometry(GLOW_DEPTH, 0.05, width + 4),
        new MeshStandardMaterial({ color: GLOW_COLOR, emissive: GLOW_COLOR, emissiveIntensity: 1.5 }),
      );
      glow.name = 'glow-strip';
      glow.position.set(side * (length / 2 + GLOW_BEYOND_BASELINE), 0.02, 0);
      group.add(glow);
    }
  }

  for (const index of [0, 1] as const) group.add(buildHoop(hoopGeometry(court, index)));

  const { lighting } = court;
  const sun = new DirectionalLight(lighting.sunColor, 2.5);
  sun.position.set(
    -lighting.sunDirection.x * 30,
    -lighting.sunDirection.y * 30,
    -lighting.sunDirection.z * 30,
  );
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // The light is oblique, so light-space axes are rotated relative to the court: use a
  // symmetric bound that covers the whole rotated play area plus tall casters (hoops).
  const shadowRadius = Math.hypot(length / 2, width / 2) + 3;
  sun.shadow.camera.left = -shadowRadius;
  sun.shadow.camera.right = shadowRadius;
  sun.shadow.camera.top = shadowRadius;
  sun.shadow.camera.bottom = -shadowRadius;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  group.add(sun, sun.target, new HemisphereLight(lighting.skyColor, 0x30302a, lighting.ambient));

  return group;
}

function line(material: MeshBasicMaterial, sizeX: number, sizeZ: number, x: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(sizeX, 0.02, sizeZ), material);
  mesh.name = 'court-line';
  mesh.position.set(x, 0.01, z);
  return mesh;
}
```

followed by the unchanged `buildHoop` function (copy it verbatim from the current file).

Create `src/render/weather-view.ts`:

```ts
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Vec3 } from '../sim/math';
import type { CourtDef, SimEvent, Weather } from '../sim/types';

export const RAIN_COUNT = 400;
export const EMBER_COUNT = 120;
const RAIN_FALL_SPEED = 14;
const RAIN_WIND_SPEED = 6;
const EMBER_RISE_SPEED = 1.2;
const EMBER_WIND_SPEED = 2;
/** Particles live in a box this high and this far beyond the play area. */
const TOP = 12;
const MARGIN = 4;
const UP = new Vector3(0, 1, 0);

/** Rain falls at 14 m/s and is blown 6 m/s along a gust (spec D.6: streaks slant with the gust). */
export function rainVelocity(gust: Vec3 | null): Vec3 {
  return gust
    ? { x: gust.x * RAIN_WIND_SPEED, y: -RAIN_FALL_SPEED, z: gust.z * RAIN_WIND_SPEED }
    : { x: 0, y: -RAIN_FALL_SPEED, z: 0 };
}

function emberVelocity(gust: Vec3 | null): Vec3 {
  return {
    x: (gust?.x ?? 0) * EMBER_WIND_SPEED,
    y: EMBER_RISE_SPEED,
    z: (gust?.z ?? 0) * EMBER_WIND_SPEED,
  };
}

/**
 * Placeholder weather (spec D.6): instanced rain streaks on the rooftop, rising embers on the
 * volcano, nothing elsewhere. Reads simulation events only (gustStart / gustEnd).
 */
export class WeatherView {
  readonly group = new Group();
  readonly kind: Weather;
  private mesh: InstancedMesh | null = null;
  private readonly particles: Vec3[] = [];
  private gust: Vec3 | null = null;
  private readonly halfX: number;
  private readonly halfZ: number;
  private readonly matrix = new Matrix4();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly axis = new Vector3();

  constructor(
    court: CourtDef,
    private readonly random: () => number = Math.random,
  ) {
    this.kind = court.dressing.weather;
    this.halfX = court.playArea.length / 2 + MARGIN;
    this.halfZ = court.playArea.width / 2 + MARGIN;
    if (this.kind === 'none') return;
    const rain = this.kind === 'rain';
    const count = rain ? RAIN_COUNT : EMBER_COUNT;
    this.mesh = new InstancedMesh(
      rain ? new BoxGeometry(0.02, 0.5, 0.02) : new SphereGeometry(0.05, 6, 4),
      rain
        ? new MeshBasicMaterial({ color: 0xa8c4e0, transparent: true, opacity: 0.5 })
        : new MeshBasicMaterial({ color: 0xff7a1a }),
      count,
    );
    for (let i = 0; i < count; i++) this.particles.push(this.spawn(this.random() * TOP));
    this.group.add(this.mesh);
    this.writeMatrices();
  }

  /** For tests: the instanced mesh, or null when the court has no weather. */
  get instances(): InstancedMesh | null {
    return this.mesh;
  }

  /** Angle of the rain streaks from vertical, radians. */
  get tilt(): number {
    const v = rainVelocity(this.gust);
    return Math.atan2(Math.hypot(v.x, v.z), -v.y);
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'gustStart') this.gust = { ...e.dir };
      else if (e.type === 'gustEnd') this.gust = null;
    }
  }

  /** A new match starts calm. */
  reset(): void {
    this.gust = null;
  }

  update(dtSeconds: number): void {
    if (!this.mesh) return;
    const rain = this.kind === 'rain';
    const v = rain ? rainVelocity(this.gust) : emberVelocity(this.gust);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p) continue;
      p.x += v.x * dtSeconds;
      p.y += v.y * dtSeconds;
      p.z += v.z * dtSeconds;
      const gone = rain ? p.y < 0 : p.y > TOP;
      if (gone || Math.abs(p.x) > this.halfX || Math.abs(p.z) > this.halfZ)
        this.particles[i] = this.spawn(rain ? TOP : 0);
    }
    this.writeMatrices();
  }

  private spawn(y: number): Vec3 {
    return {
      x: (this.random() * 2 - 1) * this.halfX,
      y,
      z: (this.random() * 2 - 1) * this.halfZ,
    };
  }

  private writeMatrices(): void {
    const mesh = this.mesh;
    if (!mesh) return;
    // Streaks lie along their velocity (pointing up the fall line); embers are round.
    const v = this.kind === 'rain' ? rainVelocity(this.gust) : emberVelocity(this.gust);
    this.axis.set(-v.x, -v.y, -v.z);
    if (v.y > 0) this.axis.negate();
    this.rotation.setFromUnitVectors(UP, this.axis.normalize());
    this.particles.forEach((p, i) => {
      this.position.set(p.x, p.y, p.z);
      this.matrix.compose(this.position, this.rotation, this.scale);
      mesh.setMatrixAt(i, this.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- tests/ui tests/input/touch.test.ts tests/render`
Expected: PASS (the existing HUD tests too: banners without a state are white, the final banner still writes once).

- [ ] **Step 8: Wire it into the app**

In `src/app.ts`:

1. Imports: add

```ts
import { ABILITIES } from './content/abilities';
import { WeatherView } from './render/weather-view';
import { CHARGE_MAX } from './sim/abilities';
```

and replace `import { DebugOverlay } from './ui/debug-overlay';` with `import { abilityLines, DebugOverlay } from './ui/debug-overlay';`.

2. After `scene.scene.add(effects.group);`:

```ts
  const weather = new WeatherView(court);
  scene.scene.add(weather.group);
```

3. Replace `const hud = new Hud(root, HUMAN_TEAM);` with:

```ts
  const hud = new Hud(root, HUMAN_TEAM, { humanId: HUMAN_ID, abilities: ABILITIES });
```

4. In `restart`, after `session = buildSession(…);` add `weather.reset();`.

5. Replace the events block in the tick callback (from `const events = runner.step(intents);` to the end of the `for` loop) with:

```ts
      const events = runner.step(intents);
      hud.handleEvents(events, runner.current);
      weather.handleEvents(events);
      for (const event of events) {
        if (event.type === 'basket') effects.spawnFlash(runner.current.ball.pos);
        if (event.type === 'abilityActivated') {
          const p = findPlayer(runner.current, event.playerId);
          if (p) effects.spawnFlash({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, TEAM_COLORS[p.team]);
        }
      }
```

6. In the render callback, after `effects.update(dt);` add `weather.update(dt);`; after `const humanState = findPlayer(next, HUMAN_ID);` add:

```ts
      touch.setSpecialReady(
        humanState !== undefined && humanState.ability === null && humanState.charge >= CHARGE_MAX,
      );
```

and add `abilities: abilityLines(next),` to the `overlay.update({ … })` object (after `ai: …`).

- [ ] **Step 9: README**

In `README.md`:

1. Replace the keyboard table's `Q` row with:

```
| Q                 | special ability (full bar)       | special ability (full bar)              |
```

2. After the touch paragraph (`**PASS** (E), **TURBO** (Shift) and **SP** (Q) buttons on the right.`) add:

```markdown
## Abilities

Every player has one signature ability. The bar under the score fills as you play (+12 for a
basket, +18 for a three, +10 for an assist, +15 for a steal or a block); when it reads **READY**,
press Q / **SP** on the ground during play (the SP button is dimmed until then). The AI uses its
abilities too.

| Character | Ability     | Effect                                                                |
| --------- | ----------- | --------------------------------------------------------------------- |
| Brick     | Rocket Dunk | 8 s: dunk from anywhere inside the 3-point line; dunks can't be blocked |
| Ace       | Hot Hand    | your next three shots can't miss                                       |
| Dash      | Blur        | 6 s: double speed, unlimited turbo, every steal succeeds              |
| Rook      | Earthquake  | every opponent within 4 m is knocked down                             |
```

3. In "URL options", after the `?ai=` bullet add:

```markdown
- `?court=gym|rooftop|volcano|frozen` — the court (default `gym`). **Rooftop Storm**: every
  15–25 s a gust (GUST chip, slanting rain) bends shots and passes and pushes loose balls.
  **Volcano Rim**: turbo drains faster, shoves hit harder, knock-downs last longer.
  **Frozen Lake**: slow to start and slower to stop; loose balls roll further.
```

and change the example line to ``Parameters combine, e.g. `?character=dash&teammate=brick&court=rooftop&ai=hard&debug`.``

4. In the paragraph starting "The match is the full game on the gym court", replace "on the gym court" with "on the chosen court".

- [ ] **Step 10: Manual check in the browser**

Run: `npm run dev` and open `http://localhost:5173/?court=rooftop&character=rook&debug`, then `?court=volcano&character=brick`, `?court=frozen&character=dash`, `?character=ace`. Check: the bar fills and pulses READY; Q fires the ability with a team-coloured banner and flash; Rocket Dunk launches from the arc; Hot Hand pips count down; Blur zips; Earthquake drops nearby opponents; the GUST chip and slanting rain appear and clear together; embers and the glow strips on the volcano; glossy pale ice on the frozen lake; the gym looks exactly as before; the SP touch button (on a touch device or emulation) is dimmed until READY; `?debug` lists charge and active abilities. Note anything odd on the PR.

- [ ] **Step 11: Full check and commit**

Run: `npm run format && npm run check`
Expected: green; golden pins untouched (`git diff main -- tests/sim` empty).

```bash
git add src/ui src/input src/render src/app.ts README.md tests
git commit -m "feat(ui): ability bar, ability banners, GUST chip, SP readiness, debug charge; court dressing and weather"
```

---

## Phase 5 acceptance checklist (final reassessment)

- [ ] `npm run check` green on `main`; CI + Pages green; the live URL starts a gym match; `?court=rooftop|volcano|frozen` load their courts (D.1).
- [ ] D.2 state and pipeline: `baseStats` + per-tick rebuild; four flags; `charge`, `ability`, `lastCatch`, `courtState`; `tick(…, abilities = NO_ABILITIES)`; steps 1/2/3/9 in order; activation gating (charge 100, live, grounded, not locked, edge-detected); timers, `onEnd`, `abilityEnded`; charge gains incl. the 180-tick assist window, none while active, cap 100, persistence across phases — all unit-tested with a fake ability (Task 1).
- [ ] D.2 RNG/content boundary: content imports only types (lint + boundary tests, `Math.random` banned in content); hooks draw only through `ctx.rng`.
- [ ] D.2/D.7 invariant: gym + `NO_ABILITIES` event pins and scores unchanged since Task 1 Step 1; only the four state hashes re-pinned (old → new recorded on the Task 1 PR).
- [ ] D.3 Rocket Dunk (480 ticks, dunk inside 6.75 m, launch arriving on the release tick, unblockable), Hot Hand (3 sure shots, draw kept, blocked shot not consumed, ends on the third), Blur (×2 speeds/acceleration, unlimited turbo, sure steal with the draw taken, reach still applies), Earthquake (4 m, 90 ticks, ignores resistance and immunity, holder drops the ball, one `knockdown` per victim, no RNG) — each tested (Task 2).
- [ ] D.4 Gusts (900–1500 scheduling with one draw, 180 ticks, direction draw, bow zero at both ends, shooting ×0.85, pass shift, free ball 4 / airborne 2 m/s², `aiHint`), Heat (×1.5 / ×1.4 / ×0.5, Earthquake unscaled), Slick (friction 0.3, ×0.4 / ×0.25), shared play area and hoops — each tested (Task 3).
- [ ] D.5 AI: the four `aiWantsToUse` rules tested; SPECIAL pressed on decision ticks only, one tick; loose-ball chase leads by `aiHint` (Task 4).
- [ ] D.6 Presentation: ability bar (name, team fill, READY pulse, time left, Hot Hand pips), team-coloured ability banners, GUST chip with arrow, SP dimmed until full, `?debug` charge/ability, dressing for the three new courts with the gym unchanged, restart press leak fixed (Tasks 1, 5).
- [ ] D.7 tests: one AI golden per court with abilities pinned and explained; replay determinism on the rooftop (court RNG); sweep 20 gym seeds + 5 per court with abilities green; `npm run balance` report committed with per-court mean totals and side bias, ability uses per character per match against 1.5–3 (Task 4).
- [ ] Tablet playtest with the first player: abilities feel charged ≈ twice a match, READY is noticed, each ability reads as its name, gusts/heat/ice are felt but light; feel notes on the epic.
- [ ] Each task has a closed issue and a merged PR with an Opus review; rulings listed on the epic.

## Deferred (recorded)

Phase 4 minors from issue #55 that stay deferred (the restart press leak is fixed in Task 1):

- Game-ending basket gets no banner — the phase 6 Results screen owns the end of the game.
- AI takes no jump shots at the fair threshold; no AI press against a driving holder; alley-oop invite rare in AI-vs-AI — playtest / feel-tuning (Hot Hand's quality-1 sure shots are the only new jump-shot incentive).
- §6 "teammate favours where the human is heading" — phase 6.
- `pickOpenSpot` rescoring a stale other-hoop spot; spot tie order favouring `leftCorner`; `scoreSpot` 4 m boundary without a unit test.
- Test-strength items: unused `rngSeeds`, seed test also changing the match seed, tip-off formation test passing with teams swapped, `evaluateShot` motion factor and `distanceToSegmentXZ` y-case untested, `perceive` one-draw claim unproven, `planDefence` stickiness, greedy marks > 3 untested; cosmetic test leftovers (`void leftWing`, a stale comment).
- Earlier leftovers: chunk split; thin 2 m shot-sweep bucket.
- New in phase 5, by design: ability tuning (`CHARGE_GAIN`, durations) waits for the balance report and the playtest; court cards and the ability description UI arrive with the phase 6 menus; real court environments (glTF, aurora) in phase 7; no audio stingers until phase 6.
