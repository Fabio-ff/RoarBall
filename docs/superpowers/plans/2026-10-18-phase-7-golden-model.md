# RoarBall Phase 7, Part 1 — First Real Character (Golden) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ace becomes Golden, the first character drawn from a real rigged and animated glTF model: an asset pipeline that turns a raw Tripo export into a small committed GLB with seven canonical clips, and a renderer (`CharacterView`, model cache, loading screen) that plays the right clip for every sim state, with the shot animation released on the sim's release tick. Brick, Dash and Rook stay placeholders, and not one line of the simulation's behaviour changes.

**Architecture:** `scripts/asset-pipeline/` (TypeScript, run by Node's type stripping, built on gltf-transform) reads `sources/characters/<id>.json` plus the raw export in `sources/raw/` and writes `public/assets/characters/<id>.glb`. In the game, `CharacterDef.model` names the file; `model-cache.ts` loads and caches it (never failing the match: a failure falls back to the placeholder), `CharacterView` runs one `AnimationMixer` per player and picks a clip with the pure `clipFor`/`resolveClip`, and `MatchScreen` loads the models of the selected characters behind a "Loading" line before it builds the views. `PlayerView` and `CharacterView` share the `PlayerRenderable` interface.

**Tech Stack:** unchanged (Vite 8, TypeScript 5.9 strict, Three.js 0.186, Vitest 5 + jsdom, ESLint 10 boundaries, Playwright for the smoke test). New dev dependencies in Task 1 only: `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/extensions`, `sharp`. No new runtime dependency (`GLTFLoader` and `SkeletonUtils` ship with three).

**Spec:** `docs/superpowers/specs/2026-09-30-roarball-design.md` — **Appendix F (Phase 7 decisions, part 1)** first, then §5.5 (placeholders), §9 (rendering) and §10.2 (testing); Appendix E (E.5 ring, E.7 testing) for the conventions this phase builds on.

## Plan decisions

Details the spec leaves open, or that measuring the real asset and the existing code forced, decided here (one line each, with the reason). Where a number came from running the pipeline on the real export, it was measured while writing this plan.

1. **One `tsconfig.json` covers the pipeline**: `scripts/asset-pipeline` joins `include` and `allowImportingTsExtensions` is turned on (`noEmit` is already set). Reason: the pipeline's imports end in `.ts` (Node's type stripping needs them) and the pipeline tests import it, so a second config would need the same flag anyway; `npm run build` already runs `tsc -p tsconfig.json`, so the pipeline is type-checked for free. `tsconfig.sim.json` is untouched.
2. **The pipeline is plain, erasable TypeScript**: run with `node --experimental-strip-types` (Node 24 in CI; `engines` says >= 22.12, where the flag is required). So no enums, no namespaces, no constructor parameter properties anywhere in `scripts/asset-pipeline/`. (F.4.1 says `.mjs`; TypeScript was chosen so the pipeline is type-checked and unit-tested like the rest. Checked in review on Node 24.14: `npm run assets` runs with the flag, which Node 24 still accepts although stripping is on by default there; on 22.12 the flag is required and supported. Spec F.4.1 must be amended to "TypeScript run by Node type stripping".)
3. **A fourth dev dependency, `@gltf-transform/extensions`**: `textureCompress` to WebP writes the required `EXT_texture_webp` extension, and a `NodeIO` must have it registered both to write the file and to read it back (the content test does). It is already a dependency of `@gltf-transform/functions`, so this adds no new code; listing it makes the import legal. Spec F.4.1 lists three dev dependencies: amend it to four.
4. **The hips node is `mixamorig:Hips` (with the colon) in the pipeline**, because gltf-transform keeps the glTF name; GLTFLoader strips colons at runtime (`mixamorigHips`), which only matters to the preview script and to the test fixtures' track names. The manifest can override it with `hipsNode`.
5. **`loop` lives in the manifest but the game decides looping by canonical name** (`LOOPING_CLIPS` in `clip-for.ts`: idle, run, dribble). `parseManifest` rejects a `loop` that disagrees, so the two can never drift. GLTFLoader gives clips no extras, so there is nothing to read at runtime anyway.
6. **`floorOffset` is per clip, in source-model metres, applied before the height bake**: it is added to the Y keyframes of the hips translation of that clip, scaled per key by how far the hips have descended from the bind pose towards the clip's lowest key (standing 0, lying full; default 0; Golden `fall` 0.19, measured in the spike as the hem's depth below the floor). The spec's "lowest vertex stays at or above y = 0" is met by this rule, not by posing the mesh in the pipeline.
7. **Metalness and roughness are glTF factors, which multiply the metallic-roughness texture.** If the hair still looks metallic after the 0.1 / 0.7 factors, the optional manifest field `materials.flatten: true` also drops that texture so the factors are final. Default false.
8. **Two additions to the spec's operation list, both measured**: `resample()` (drops redundant keyframes) and running `prune()` last, with the raw clips' channels and samplers disposed explicitly. Without them the committed GLB was 3.5 MB (0.9 MB of orphaned keyframe data from the dropped raw clips); with them it is **2.6 MB**. That is not the spec's "about 1 MB" (the spike's figure counted textures only: textures 0.67 MB, geometry 1.45 MB, animation 0.23 MB, JSON 0.25 MB). The < 3 MB assertion holds. **Quantization stays out of part 1** (measured in review): `quantize()` on the committed file gives 2.0 MB, but it moves the vertex positions into a normalized integer space with a compensating node transform, and `getBounds` then reports a 3.68 m model, so the height bake and the 1.6–2.0 m content check would both have to be reworked, plus `KHR_mesh_quantization` and a skinned-mesh visual check; 0.6 MB is not worth that in part 1. Revisit with the courts (part 2). Spec F.4 ("about 0.9–1 MB per character") must be amended to about 2.6 MB.
9. **Clips are cut from the raw clip objects, then all raw clips are disposed**: a raw clip may share a canonical name (`idle`), so cutting by name after renaming would be ambiguous.
10. **The bind height is the bind-pose bounding box of the source scene** (`getBounds`, which reads vertex positions; the spike found no node scale), measured before the root wrapper is added. The wrapper node is named `model-root`, scaled by `height / bindHeight`, and holds `extras: { releaseAt }`.
11. **`releaseAt` is read at runtime from `userData.releaseAt` of any object in the loaded scene** (GLTFLoader copies node extras to `userData`). A model without it is a failed load (placeholder fallback), because without it the shot cannot be synchronised.
12. **`scripts/asset-pipeline` never imports `src`** (an ESLint rule and a test enforce it). The canonical clip list is therefore written twice (`scripts/asset-pipeline/manifest.ts`, `src/render/clip-for.ts`) and a test in Task 3 keeps the two equal.
13. **`src/render` may import `src/sim`** (`interpolate.ts` already does), so `release-timing.ts` imports `SHOT_TIMING`, `PASS_TIMING` and `TICK_RATE` directly. No sim export changes.
14. **The shoot clip time comes from the sim's `actionTicks`, not from "when the view noticed"**: `shootClipTime(action, actionTicks, releaseAt)`. An alley-oop puts the receiver in `dunk` at `releaseTick - 1`, and a view that first sees an action late must still land on the right frame.
15. **The run clip's `timeScale` is `speed / next.stats.runSpeed` clamped to [0.4, 2]** (`runTimeScale`). `runSpeed` is the `ResolvedStats` field, already multiplied by court and ability; the clamp keeps a 0.5 m/s drift from looking like slow motion and turbo from looking like a blur. The clamp is an addition to F.7.5; the spec should record it.
16. **`PlayerRenderable.update` has a sixth parameter, `dt` (seconds)**: the spec's interface (F.7.1) has five, but a mixer needs wall time and the sim state carries none. Kept over the alternative of each view reading `performance.now()`: `MatchScreen`'s render callback already computes `const dt = frameMs / 1000` once per frame and hands it to `BallView`, `AbilityFxView`, `BallTrail`, `EffectsView` and the camera, so passing it to the player views is the house pattern; a view-owned clock would need its own first-frame and pause handling (the `GameLoop` stops while paused, so the next `performance.now()` delta would be the whole pause) and would make the `CharacterView` tests depend on mocked time. `PlayerView` ignores it. Spec F.7.1 must be amended to `update(prev, next, alpha, tick, hasBall, dt)`.
17. **The fall clip plays whole at speed 1** (spec F.5). A stun lasts at least 20 ticks and getup crossfades to idle, so the fall can be cut short; that is judged in the playtest (Task 6), not coded around.
18. **`MatchScreen`'s constructor stays synchronous**: it mounts the container and a "Loading…" line, then `start()` loads the models and calls `build()` (the old constructor body). Fields that `build()` assigns become definite-assignment (`!`), `ready: Promise<void>` resolves when the match is on screen (tests and the smoke test await it), and `pause()` and `dispose()` are guarded by a `built` flag. A screen disposed while loading never builds.
19. **Tests fake the loader at two levels**: `loadCharacterModel` takes an injectable `loader` (a fake `GltfLike` built from a `SkinnedMesh`, one `Bone` and `AnimationClip`s, in `tests/render/model-fixtures.ts`), and `MatchScreenDeps.loadModel` replaces the whole function. `AnimationMixer` needs no WebGL, so the `CharacterView` tests run in plain Node (no jsdom).
20. **The model cache is keyed by file, not by character id** (the spec says id): the id-to-file map is one-to-one and keying below `content` keeps `render` free of it. Failures are cached too, so the warning is logged once per file. Spec F.8.3 ("cached per session by character id") must be amended to "by file".
21. **`TEAM_COLORS` stays in `match-screen.ts`** and is passed to the views as a colour argument; no view imports it.
22. **The ring lives in `src/render/player-ring.ts`**, shared by both views (`createRing`, `updateRing`, plus `brighten` and `highlightPulse`, re-exported from `player-view.ts` so existing imports and tests keep working). `PlayerViewOptions.highlighted` now means "the ring pulses"; every player gets a ring (F.7.7).
23. **Skinned meshes get `frustumCulled = false`** in `instantiate`: three culls them by their bind-pose bounds, which a posed (and, in the preview script, moving) character can leave.
24. **The smoke test reads console warnings of type `warning` for the prefix `[model] fallback`**, checks that `assets/characters/ace.glb` is served as real GLB bytes (`vite preview` falls back to `index.html` with status 200 for unknown paths, so a status check proves nothing), and drives Golden with the keyboard (run, shoot) so the animation code runs in a real browser.
25. **`chunkSizeWarningLimit` goes from 600 to 700** in `vite.config.ts`: `GLTFLoader` and `SkeletonUtils` take the three chunk to about 630 kB.
26. **The content test is split across Tasks 2 and 3** because `src/render/clip-for.ts` and `CharacterDef.model` do not exist yet in Task 2: Task 2 checks every committed GLB in `public/assets/characters/`; Task 3 appends the checks that tie characters to files.
27. **Previews (Task 7) exist only on the YOU row** and are injected into `SetupScreen` (`createPreview`), because each preview owns a WebGL context, browsers cap live contexts, and `ui/` must not import `render/` or `content/`.
28. **The shot clip is shared by jump shots, layups and dunks** (spec F.5.3), so a layup (release at 15 ticks = 0.25 s) plays the clip about 2.8x faster than a jump shot's 1.3x when `releaseAt` is around 0.7. Tune `releaseAt` toward 0.45 (a jump shot at speed 1) when picking the window; dedicated layup and dunk clips are part 2.
29. **`sources/raw/` is gitignored, so Task 2's `npm run assets` only works on Fabio's machine.** CI, the smoke test and Pages use the committed GLB. The raw export used here is `sources/raw/fantasy+girl+3d+model_animate.glb`.
30. **`MatchScreen.loadModels` catches a rejecting loader** and logs the same `[model] fallback to placeholder for` warning: `loadCharacterModel` never rejects, but `MatchScreenDeps.loadModel` is injectable, and a rejection would otherwise leave the screen on "Loading…" forever (F.8.2: the game can never fail to start). Pinned by a `match-screen.test.ts` case.
31. **The shoot window and `releaseAt` start at 1.5–2.7 s and 0.7** (not the spec spike's guesses) and the dribble loop at 4.4–5.9 s: the raw frames show walking after 3.0 s in `basketball_shot`, and `dribble` turns on the spot (hips yaw, which the root-motion strip does not remove). Task 2 tunes them by eye and stops as BLOCKED if no steady 1.5 s dribble exists. Spec F.5.1 gives only lengths (about 1.5 s, about 1.2 s), so it needs no amendment beyond noting the turn.

## Global Constraints

Everything from the Phase 1–6 plans still applies (60 Hz fixed tick, `src/sim` purity enforced by ESLint + `tsconfig.sim.json` + `tests/lint/boundaries.test.ts`, team 0 on −X attacking +X, camera on +Z, strict TS, `npm run format && npm run check` green per commit, CI green before every merge). In addition, from Appendix F:

- **Part 1 does not change `src/sim/`**: goldens, pinned scores and determinism tests pass unchanged. The only sim-folder change is the optional `model?: { file: string }` type on `CharacterDef` (F.6.1). Every PR's review starts with `git diff origin/main --stat -- src/sim`.
- **No runtime dependency beyond `three`**; `@gltf-transform/*` and `sharp` are dev dependencies used by `scripts/`, tests and `npm run assets` only (F.4.1).
- **ESLint boundaries hold**: `src/sim` imports no `render/ui/input/audio/app`, no Three.js, no DOM globals; `src/content` imports only types from `sim`; `scripts/asset-pipeline` imports nothing from `src`.
- **TypeScript strict** everywhere, pipeline included.
- **Pages sub-path**: a model is fetched at `import.meta.env.BASE_URL + 'assets/' + file` (F.6.1); never an absolute `/assets/...`.
- **A GLB is smaller than 3 MB** and is in metres: the pipeline bakes the height (Golden 1.8 m), the renderer never scales a model (F.4.4).
- **60 ticks per second**: the shot's visible release must coincide with the sim's release tick (`SHOT_TIMING` jumpshot 48 / 27, layup 36 / 15, dunk 42 / 24; `PASS_TIMING` 12 / 4) (F.5.3).
- **The character id stays `ace`**; only `name`, `description` and `model` change, stats, `abilityId` (`hotHand`) and `appearance` do not (F.2).
- **Seven canonical clips**: `idle, run, dribble, jump, shoot, hit, fall`. Looping: idle, run, dribble. One-shot with the last frame held: the rest. Crossfade 0.15 s (F.5, F.7).
- **A failed or slow (> 10 s) model load falls back to the placeholder with one `console.warn('[model] fallback to placeholder for', file)`**; the game can never fail to start (F.8.2).
- **No Draco, no KTX2** in part 1 (F.4.5). Brick, Dash, Rook, the courts and the Phase 6 deferred effects stay as they are (F.1).
- Testing per F.10: Vitest for `clipFor`, release `timeScale`, strip and subclip helpers on a tiny fixture built in code; the content check of F.6.2; the smoke test; a manual tablet frame-rate check by Fabio.

## Review Focus

The input classes the spec implies but a happy-path test would miss, most likely first. Each has a test in the task that owns the code:

1. **The model fails to load, times out, or carries no `releaseAt`** (or an injected loader rejects): the match still starts, with placeholders, and exactly one warning is logged. Tests: Task 4 (`model-cache.test.ts`), Task 5 (`match-screen.test.ts`, the two fallback cases).
2. **The model lacks a clip, or has none at all**: the view falls back to idle, then to the bind pose, and never throws (including NaN or negative frame times and a zero `runSpeed`). Tests: Task 3 (`resolveClip`), Task 5 (`character-view.test.ts`, fallbacks).
3. **The player quits, restarts or the screen is disposed while the models are still loading**: nothing is built, no loop starts, nothing leaks, and `pause()` is a no-op. Test: Task 5 (`match-screen.test.ts`, "disposed while loading").
4. **The same character four times** (all four players Golden): one load, four independent skeletons, one clip state each. Tests: Task 4 (`instantiate`), Task 5 (`MatchScreen` loads once).
5. **An action seen late or repeated**: an alley-oop enters `dunk` one tick before its release; a second shot starts with `actionTicks` back at 0; a looping clip must not restart when only the action name changes; a pass must not play the wind-up. Tests: Task 3 (`shootClipTime`), Task 5 (`CharacterView` timing).

Also pinned: a manifest that names a missing clip or a window outside the clip fails with a readable message (Task 1), and a committed GLB with root motion, a missing clip or a wrong height fails the content check (Task 2).

---

## Execution process

As Phases 1–6: one GitHub issue per task, Sonnet 5.5 implements on `task/<N>-<slug>`, one PR per task, Opus 5.5 reviews on the PR (comment review, first line `VERDICT: …`), merge only after approval **and** green `gh pr checks`, final whole-phase Opus review, Fable reassessment on the epic. Milestone **"Phase 7 – Real models, part 1"**, labels `task`, `phase-7`, `epic`. Tasks run in order 1 → 6 (7 is optional and last); each needs the previous one merged. Branches: `task/1-asset-pipeline`, `task/2-golden-asset`, `task/3-clip-logic`, `task/4-model-cache`, `task/5-character-view`, `task/6-smoke-ci`, `task/7-setup-preview`.

Each implementer runs `npx vitest run <file>` while iterating and `npm run format && npm run check` before every commit. Commit messages end with:

```
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E7xMr5vF68QkwPAcxtUubs
```

(The `git commit -m` lines below show only the subject; add a blank line and the two trailer lines.)

**Browser check.** Tasks 2, 5 and 7 change what the player sees. After the PR is opened, the controller (main session) runs `npm run dev`, opens `http://localhost:5173/?character=ace&seed=2` in Chrome via the chrome-devtools MCP and attaches screenshots to the PR (Golden standing, running, mid-shot; the Loading line is too brief to catch, take it with network throttling).

**DOM tests** start with `// @vitest-environment jsdom` (see `vitest.config.ts`). Tests that only touch Three.js objects (`AnimationMixer`, `SkinnedMesh`) run in the default Node environment.

## File map

| File | Task | Responsibility |
|---|---|---|
| `scripts/asset-pipeline/hips.ts` | 1 | `DEFAULT_HIPS`, `findNode` |
| `scripts/asset-pipeline/strip-root-motion.ts` | 1 | Hips X/Z keyframes to the bind pose |
| `scripts/asset-pipeline/subclip.ts` | 1 | `subclip`, `dropClips` |
| `scripts/asset-pipeline/floor-clamp.ts` | 1 | `offsetHipsY` (per-clip `floorOffset`) |
| `scripts/asset-pipeline/materials.ts` | 1 | Metalness and roughness overrides |
| `scripts/asset-pipeline/bake-height.ts` | 1 | `sceneHeight`, `bakeHeight` (root wrapper + `releaseAt` extras) |
| `scripts/asset-pipeline/manifest.ts` | 1 | `Manifest` type, `parseManifest`, `loadManifest`, canonical clip list |
| `scripts/asset-pipeline/transform.ts` | 1 | `transformCharacter`: the F.4.3 operations in order |
| `scripts/asset-pipeline/run.ts` | 1 | `buildCharacter`, `main` (`npm run assets`) |
| `sources/characters/ace.json` | 2 | Golden's manifest |
| `public/assets/characters/ace.glb` | 2 | Golden's model (committed output) |
| `tests/content/models.test.ts` | 2 (+3) | Content check of F.6.2 |
| `src/render/clip-for.ts` | 3 | `CANONICAL_CLIPS`, `clipFor`, `resolveClip`, `runTimeScale`, `LOOPING_CLIPS` |
| `src/render/release-timing.ts` | 3 | `shotTimeScale`, `passStartTime`, `shootClipTime` |
| `src/sim/types.ts`, `src/content/characters/ace.ts` | 3 | `CharacterDef.model`, Golden |
| `src/render/model-cache.ts` | 4 | `loadCharacterModel`, `instantiate`, `LoadedModel` |
| `src/render/player-ring.ts` | 5 | Shared ring (`createRing`, `updateRing`, `brighten`, `highlightPulse`) |
| `src/render/player-renderable.ts` | 5 | `PlayerRenderable` interface |
| `src/render/character-view.ts` | 5 | `CharacterView` |
| `src/render/player-view.ts`, `src/app/match-screen.ts` | 5 | Ring for everyone; loading state and view choice |
| `scripts/smoke.mjs` | 6 | Golden checks |
| `src/render/character-preview.ts`, `src/ui/screens/setup.ts` | 7 | Card preview |

---

## Task 1: Pipeline library and repo plumbing

**Files:**
- Create: `scripts/asset-pipeline/hips.ts`, `strip-root-motion.ts`, `subclip.ts`, `floor-clamp.ts`, `materials.ts`, `bake-height.ts`, `manifest.ts`, `transform.ts`, `run.ts`
- Modify: `package.json` (dev dependencies, `assets` script), `.gitignore`, `tsconfig.json`, `eslint.config.js`, `tests/lint/boundaries.test.ts`
- Test: `tests/pipeline/fixture.ts` (shared builder, not a test file), `tests/pipeline/strip-root-motion.test.ts`, `subclip.test.ts`, `floor-clamp.test.ts`, `materials.test.ts`, `bake-height.test.ts`, `manifest.test.ts`, `transform.test.ts`, `run.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first).
- Produces (later tasks rely on these exact names):
  - `scripts/asset-pipeline/manifest.ts`: `CANONICAL_CLIPS` (`readonly ['idle','run','dribble','jump','shoot','hit','fall']`), `type CanonicalClipName`, `LOOPING: ReadonlySet<string>`, `interface ClipSpec { source: string; start: number; end: number; loop: boolean; floorOffset: number }`, `interface Manifest { id: string; source: string; height: number; releaseAt: number; hipsNode: string; materials: { metalness: number; roughness: number; flatten: boolean }; clips: Record<CanonicalClipName, ClipSpec> }`, `parseManifest(raw: unknown, id: string): Manifest`, `loadManifest(path: string): Manifest`.
  - `scripts/asset-pipeline/run.ts`: `buildCharacter(manifest: Manifest, rawDir: string, outDir: string): Promise<{ file: string; bytes: number }>`, `main(root?: string): Promise<void>`; `npm run assets` runs `main()`.
  - Output GLB shape (Tasks 2–4 rely on it): one scene whose single child is a node `model-root` (scale = height / bindHeight, `extras: { releaseAt }`) holding the armature and the skinned mesh; animations named exactly `idle, run, dribble, jump, shoot, hit, fall`; WebP textures of at most 1024 px (`EXT_texture_webp`, required).

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Phase 7.1: asset pipeline library" --label task,phase-7 --milestone "Phase 7 – Real models, part 1" --body "Plan: docs/superpowers/plans/2026-10-18-phase-7-golden-model.md, Task 1"
git checkout main && git pull && git checkout -b task/1-asset-pipeline
```

- [ ] **Step 2: Dependencies, script, gitignore, tsconfig**

```bash
npm install --save-dev @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp
```

In `package.json` add to `scripts` (after `"smoke"`):

```json
    "smoke": "node scripts/smoke.mjs",
    "assets": "node --experimental-strip-types scripts/asset-pipeline/run.ts"
```

`.gitignore`: replace the line `sources/raw/env-vars` with `sources/raw/` (keep `*.env`). The tail becomes:

```
# Secrets and raw asset exports (never shipped; see docs)
sources/raw/
*.env
```

`tsconfig.json` (plan decision 1): add `allowImportingTsExtensions` and the pipeline to `include`.

```diff
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -11,7 +11,8 @@
     "esModuleInterop": true,
     "skipLibCheck": true,
     "noEmit": true,
+    "allowImportingTsExtensions": true,
     "types": ["vite/client", "node"]
   },
-  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
+  "include": ["src", "tests", "scripts/asset-pipeline", "vite.config.ts", "vitest.config.ts"]
 }
```

- [ ] **Step 3: ESLint boundary for the pipeline — failing test first**

Apply this diff to `tests/lint/boundaries.test.ts` (a new `describe` at the end):

```diff
--- a/tests/lint/boundaries.test.ts
+++ b/tests/lint/boundaries.test.ts
@@ -94,3 +94,17 @@
     ).not.toHaveLength(0);
   });
 });
+
+describe('scripts/asset-pipeline boundary', () => {
+  it.each([
+    ['sim', "import { lerp } from '../../src/sim/math'; export const f = lerp;"],
+    ['render', "import { clipFor } from '../../src/render/clip-for'; export const f = clipFor;"],
+  ])('rejects an import from src/%s', async (_name, code) => {
+    expect(await errorsFor('scripts/asset-pipeline/probe.ts', code)).not.toHaveLength(0);
+  });
+
+  it('allows node and package imports', async () => {
+    const code = "import { join } from 'node:path'; export const f = join;";
+    expect(await errorsFor('scripts/asset-pipeline/probe.ts', code)).toHaveLength(0);
+  });
+});
```

Run: `npx vitest run tests/lint/boundaries.test.ts` — Expected: FAIL (the two "rejects" cases; the pipeline may import `src`).

Apply this diff to `eslint.config.js` (a new config block before the `content` one):

```diff
--- a/eslint.config.js
+++ b/eslint.config.js
@@ -82,6 +82,23 @@
     },
   },
   {
+    // Spec F.4: the asset pipeline is a standalone Node tool and never imports the game.
+    files: ['scripts/asset-pipeline/**/*.ts'],
+    rules: {
+      'no-restricted-imports': [
+        'error',
+        {
+          patterns: [
+            {
+              group: ['**/src', '**/src/**'],
+              message: 'scripts/asset-pipeline must not import src',
+            },
+          ],
+        },
+      ],
+    },
+  },
+  {
     // Spec §3: content may only import types from sim.
     files: ['src/content/**/*.ts'],
     rules: {
```

Run the test again — Expected: PASS. Then `npx eslint .` — Expected: no errors.

- [ ] **Step 4: Shared test fixture**

`tests/pipeline/fixture.ts` builds, in code, a character with a Hips and a Spine joint, one skinned mesh (four vertices spanning y 0 to 1, so the bind height is exactly 1), a material and one 1 s clip `take` with Hips translation (walks in X and Z, bounces in Y) and rotation. It also holds `validManifest()`.

```ts
import { Document } from '@gltf-transform/core';
import type { Animation, Node } from '@gltf-transform/core';

export const HIPS = 'mixamorig:Hips';
export const BIND_HIPS: [number, number, number] = [0.25, 0.5, -0.5];

export interface Fixture {
  doc: Document;
  hips: Node;
  spine: Node;
  /** One 1 s clip called "take": hips translation (walks in X and Z, bounces in Y) and hips rotation. */
  take: Animation;
}

/**
 * A tiny skinned character: a Hips and a Spine joint, one mesh with four vertices spanning
 * y 0..1 (so the bind-pose height is exactly 1) and one clip.
 */
export function buildFixture(): Fixture {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');

  const hips = doc.createNode(HIPS).setTranslation(BIND_HIPS);
  const spine = doc.createNode('mixamorig:Spine').setTranslation([0, 0.25, 0]);
  hips.addChild(spine);
  const armature = doc.createNode('Armature').addChild(hips);

  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([-0.2, 0, 0, 0.2, 0, 0, -0.2, 1, 0, 0.2, 1, 0]))
    .setBuffer(buffer);
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]))
    .setBuffer(buffer);
  const joints = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
    .setBuffer(buffer);
  const weights = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 2, 1, 3]))
    .setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('TEXCOORD_0', uv)
    .setAttribute('JOINTS_0', joints)
    .setAttribute('WEIGHTS_0', weights)
    .setIndices(indices)
    .setMaterial(doc.createMaterial('body').setMetallicFactor(1).setRoughnessFactor(0.2));
  const mesh = doc.createMesh('body').addPrimitive(primitive);

  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const inverseBind = doc
    .createAccessor()
    .setType('MAT4')
    .setArray(new Float32Array([...identity, ...identity]))
    .setBuffer(buffer);
  const skin = doc
    .createSkin('skin')
    .addJoint(hips)
    .addJoint(spine)
    .setInverseBindMatrices(inverseBind);
  const body = doc.createNode('Body').setMesh(mesh).setSkin(skin);
  scene.addChild(armature).addChild(body);

  const take = doc.createAnimation('take');
  const times = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Float32Array([0, 0.5, 1]))
    .setBuffer(buffer);
  const translation = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([1, 0.5, 2, 2, 0.6, 4, 3, 0.5, 6]))
    .setBuffer(buffer);
  const rotation = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068, 0, 1, 0, 0]))
    .setBuffer(buffer);
  for (const [output, path] of [
    [translation, 'translation'],
    [rotation, 'rotation'],
  ] as const) {
    const sampler = doc.createAnimationSampler().setInput(times).setOutput(output);
    take
      .addSampler(sampler)
      .addChannel(
        doc.createAnimationChannel().setSampler(sampler).setTargetNode(hips).setTargetPath(path),
      );
  }
  return { doc, hips, spine, take };
}

export const hipsTranslation = (clip: Animation): Float32Array => {
  const channel = clip.listChannels().find((c) => c.getTargetPath() === 'translation');
  return channel!.getSampler()!.getOutput()!.getArray() as Float32Array;
};

export const hipsTimes = (clip: Animation): Float32Array =>
  clip.listChannels()[0].getSampler()!.getInput()!.getArray() as Float32Array;

const clip = (source: string, start: number, end: number, loop: boolean) => ({
  source,
  start,
  end,
  loop,
});

export const validManifest = () => ({
  source: 'raw.glb',
  height: 1.8,
  releaseAt: 0.6,
  materials: { metalness: 0.1, roughness: 0.7 },
  clips: {
    idle: clip('idle', 0, 4, true),
    run: clip('run', 0, 1.25, true),
    dribble: clip('dribble', 3, 4.5, true),
    jump: clip('jump', 0, 2.2, false),
    shoot: clip('shot', 2.6, 3.8, false),
    hit: clip('hit', 0, 1.2, false),
    fall: { ...clip('fall', 0, 3, false), floorOffset: 0.19 },
  },
});
```

- [ ] **Step 5: Hips helper and strip-root-motion — failing test**

`tests/pipeline/strip-root-motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stripRootMotion } from '../../scripts/asset-pipeline/strip-root-motion.ts';
import { BIND_HIPS, buildFixture, HIPS, hipsTranslation } from './fixture.ts';

describe('stripRootMotion', () => {
  it('sets hips X and Z to the bind pose and keeps Y', () => {
    const { doc, take } = buildFixture();
    stripRootMotion(doc, HIPS);
    const values = Array.from(hipsTranslation(take));
    expect(values).toEqual([
      BIND_HIPS[0],
      0.5,
      BIND_HIPS[2],
      BIND_HIPS[0],
      expect.closeTo(0.6, 5),
      BIND_HIPS[2],
      BIND_HIPS[0],
      0.5,
      BIND_HIPS[2],
    ]);
  });

  it('leaves rotation keyframes alone', () => {
    const { doc, take } = buildFixture();
    stripRootMotion(doc, HIPS);
    const rotation = take.listChannels().find((c) => c.getTargetPath() === 'rotation');
    expect(Array.from(rotation!.getSampler()!.getOutput()!.getArray()!)).toHaveLength(12);
    expect(rotation!.getSampler()!.getOutput()!.getArray()![5]).toBeCloseTo(0.7071068, 5);
  });

  it('works on any node name', () => {
    const { doc, hips, take } = buildFixture();
    hips.setName('Pelvis');
    stripRootMotion(doc, 'Pelvis');
    expect(hipsTranslation(take)[0]).toBe(BIND_HIPS[0]);
  });

  it('throws a readable error when the node does not exist', () => {
    const { doc } = buildFixture();
    expect(() => stripRootMotion(doc, 'nope')).toThrow(/node "nope" not found/);
  });
});
```

- [ ] **Step 6: Run** `npx vitest run tests/pipeline/strip-root-motion.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 7: Implement `hips.ts` and `strip-root-motion.ts`**

```ts
import type { Document, Node } from '@gltf-transform/core';

export const DEFAULT_HIPS = 'mixamorig:Hips';

/** The node called `name`; throws with the node names that do exist when it is missing. */
export function findNode(doc: Document, name: string): Node {
  const nodes = doc.getRoot().listNodes();
  const node = nodes.find((n) => n.getName() === name);
  if (!node) {
    const known = nodes.slice(0, 8).map((n) => n.getName());
    throw new Error(`node "${name}" not found (first nodes: ${known.join(', ')})`);
  }
  return node;
}
```

```ts
import type { Document } from '@gltf-transform/core';
import { DEFAULT_HIPS, findNode } from './hips.ts';

/**
 * Removes root motion: in every clip the X and Z of the hips translation keyframes are set to the
 * bind-pose X and Z, Y (the bounce of the hips) is kept. `hipsName` is the glTF node name,
 * with the colon (GLTFLoader only strips it at runtime).
 */
export function stripRootMotion(doc: Document, hipsName: string = DEFAULT_HIPS): void {
  const hips = findNode(doc, hipsName);
  const [bindX, , bindZ] = hips.getTranslation();
  for (const clip of doc.getRoot().listAnimations()) {
    for (const channel of clip.listChannels()) {
      if (channel.getTargetNode() !== hips || channel.getTargetPath() !== 'translation') continue;
      const output = channel.getSampler()?.getOutput();
      if (!output) continue;
      const values = output.getArray() as Float32Array;
      for (let i = 0; i + 2 < values.length; i += 3) {
        values[i] = bindX;
        values[i + 2] = bindZ;
      }
    }
  }
}
```

- [ ] **Step 8: Run** the test — Expected: PASS. **Commit** `feat(pipeline): strip root motion from the hips`.

- [ ] **Step 9: Subclip — failing test**

`tests/pipeline/subclip.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dropClips, subclip } from '../../scripts/asset-pipeline/subclip.ts';
import { buildFixture, hipsTimes, hipsTranslation } from './fixture.ts';

describe('subclip', () => {
  it('cuts a window, shifts times to 0 and interpolates the edges', () => {
    const { doc, take } = buildFixture();
    const cut = subclip(doc, take, 'shoot', 0.25, 0.75);
    expect(cut.getName()).toBe('shoot');
    expect(Array.from(hipsTimes(cut))).toEqual([0, 0.25, 0.5]);
    const t = hipsTranslation(cut);
    expect(t[0]).toBeCloseTo(1.5); // x halfway between keys 0 and 1
    expect(t[3]).toBeCloseTo(2); // the key at 0.5 s
    expect(t[6]).toBeCloseTo(2.5); // x halfway between keys 1 and 2
    expect(t[7]).toBeCloseTo(0.55);
  });

  it('slerps rotations and keeps them unit length', () => {
    const { doc, take } = buildFixture();
    const cut = subclip(doc, take, 'c', 0.25, 0.75);
    const channel = cut.listChannels().find((c) => c.getTargetPath() === 'rotation')!;
    const q = Array.from(channel.getSampler()!.getOutput()!.getArray()!).slice(0, 4);
    expect(Math.hypot(...q)).toBeCloseTo(1, 5);
    expect(q[1]).toBeGreaterThan(0.3); // a quarter of the way to the 90 degree turn about Y: sin(22.5°) ≈ 0.38
    expect(q[1]).toBeLessThan(0.4);
  });

  it('truncates a window past the end of the clip', () => {
    const { doc, take } = buildFixture();
    const cut = subclip(doc, take, 'c', 0.5, 5);
    const times = hipsTimes(cut);
    expect(times[times.length - 1]).toBeCloseTo(0.5);
  });

  it('rejects an empty window', () => {
    const { doc, take } = buildFixture();
    expect(() => subclip(doc, take, 'c', 2, 3)).toThrow(/empty window/);
  });

  it('dropClips removes the source clip and its keyframe data once pruned', () => {
    const { doc, take } = buildFixture();
    subclip(doc, take, 'shoot', 0, 1);
    dropClips([take]);
    expect(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual(['shoot']);
    expect(doc.getRoot().listAnimations()[0].listChannels()).toHaveLength(2);
  });
});
```

- [ ] **Step 10: Run** `npx vitest run tests/pipeline/subclip.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 11: Implement `subclip.ts`**

The window is copied key by key, with the two edges interpolated (linear; slerp for rotations; the previous key for STEP) so the new clip lasts exactly `end - start`.

```ts
import type { Animation, Document } from '@gltf-transform/core';

/** Spherical interpolation of two unit quaternions stored at `a` and `b` of `values`. */
function slerp(values: Float32Array, a: number, b: number, t: number, out: number[]): void {
  let [ax, ay, az, aw] = [values[a], values[a + 1], values[a + 2], values[a + 3]];
  const [bx, by, bz, bw] = [values[b], values[b + 1], values[b + 2], values[b + 3]];
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    dot = -dot;
    ax = -ax;
    ay = -ay;
    az = -az;
    aw = -aw;
  }
  let ka = 1 - t;
  let kb = t;
  if (dot < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    ka = Math.sin((1 - t) * theta) / sin;
    kb = Math.sin(t * theta) / sin;
  }
  const q = [ka * ax + kb * bx, ka * ay + kb * by, ka * az + kb * bz, ka * aw + kb * bw];
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  for (const c of q) out.push(c / length);
}

/** The value of a track at `time`: linear (slerp for rotations), or the previous key for STEP. */
function sampleAt(
  times: Float32Array,
  values: Float32Array,
  itemSize: number,
  rotation: boolean,
  step: boolean,
  time: number,
  out: number[],
): void {
  const last = times.length - 1;
  if (time <= times[0]) return void out.push(...values.slice(0, itemSize));
  if (time >= times[last])
    return void out.push(...values.slice(last * itemSize, (last + 1) * itemSize));
  let i = 0;
  while (times[i + 1] < time) i++;
  const a = i * itemSize;
  if (step) return void out.push(...values.slice(a, a + itemSize));
  const t = (time - times[i]) / (times[i + 1] - times[i]);
  const b = (i + 1) * itemSize;
  if (rotation) return slerp(values, a, b, t, out);
  for (let k = 0; k < itemSize; k++) out.push(values[a + k] + (values[b + k] - values[a + k]) * t);
}

/**
 * Copies the window [start, end] seconds of `clip` into a new clip called `name`, keys
 * shifted so the window starts at 0. The edges are interpolated, so the new clip lasts exactly
 * end - start (end is clamped to the source length). Throws on cubic-spline tracks and on an
 * empty window.
 */
export function subclip(
  doc: Document,
  clip: Animation,
  name: string,
  start: number,
  end: number,
): Animation {
  const source = clip.getName();
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const out = doc.createAnimation(name);
  let duration = 0;
  for (const channel of clip.listChannels()) {
    const sampler = channel.getSampler();
    const input = sampler?.getInput();
    const times = input?.getArray();
    if (times && times.length > 0) duration = Math.max(duration, times[times.length - 1]);
  }
  const to = Math.min(end, duration);
  if (!(to > start)) throw new Error(`clip "${source}": empty window [${start}, ${end}]`);

  for (const channel of clip.listChannels()) {
    const sampler = channel.getSampler();
    const input = sampler?.getInput();
    const output = sampler?.getOutput();
    if (!sampler || !input || !output) continue;
    if (sampler.getInterpolation() === 'CUBICSPLINE') {
      throw new Error(`clip "${source}": CUBICSPLINE is not supported`);
    }
    const times = input.getArray() as Float32Array;
    const values = output.getArray() as Float32Array;
    const itemSize = values.length / times.length;
    const path = channel.getTargetPath();
    if (!path) continue;
    const rotation = path === 'rotation';
    const step = sampler.getInterpolation() === 'STEP';

    const newTimes: number[] = [0];
    const newValues: number[] = [];
    sampleAt(times, values, itemSize, rotation, step, start, newValues);
    for (let i = 0; i < times.length; i++) {
      if (times[i] <= start || times[i] >= to) continue;
      newTimes.push(times[i] - start);
      newValues.push(...values.slice(i * itemSize, (i + 1) * itemSize));
    }
    newTimes.push(to - start);
    sampleAt(times, values, itemSize, rotation, step, to, newValues);

    const newInput = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Float32Array(newTimes))
      .setBuffer(buffer);
    const newOutput = doc
      .createAccessor()
      .setType(output.getType())
      .setArray(new Float32Array(newValues))
      .setBuffer(buffer);
    const newSampler = doc
      .createAnimationSampler()
      .setInput(newInput)
      .setOutput(newOutput)
      .setInterpolation(sampler.getInterpolation());
    out.addSampler(newSampler);
    out.addChannel(
      doc
        .createAnimationChannel()
        .setSampler(newSampler)
        .setTargetNode(channel.getTargetNode())
        .setTargetPath(path),
    );
  }
  return out;
}

/** Disposes the given clips (the raw source clips once the canonical ones are cut). */
export function dropClips(clips: readonly Animation[]): void {
  for (const clip of clips) {
    // Channels and samplers are separate properties: dispose them too, or their keyframe
    // accessors stay referenced and are written into the file.
    for (const channel of clip.listChannels()) channel.dispose();
    for (const sampler of clip.listSamplers()) sampler.dispose();
    clip.dispose();
  }
}
```

- [ ] **Step 12: Run** the test — Expected: PASS. **Commit** `feat(pipeline): cut and rename a clip window`.

- [ ] **Step 13: Floor offset and materials — failing tests**

`tests/pipeline/floor-clamp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { offsetHipsY } from '../../scripts/asset-pipeline/floor-clamp.ts';
import { buildFixture, HIPS, hipsTranslation } from './fixture.ts';

describe('offsetHipsY', () => {
  it('adds the offset to every hips Y key and leaves X and Z', () => {
    const { doc, take } = buildFixture();
    offsetHipsY(doc, 'take', 0.19, HIPS);
    const t = hipsTranslation(take);
    expect(t[1]).toBeCloseTo(0.69);
    expect(t[4]).toBeCloseTo(0.79);
    expect(t[0]).toBe(1);
    expect(t[8]).toBe(6);
  });

  it('does nothing for an offset of 0, even for a clip that does not exist', () => {
    const { doc } = buildFixture();
    expect(() => offsetHipsY(doc, 'missing', 0, HIPS)).not.toThrow();
  });

  it('throws for a missing clip when an offset is requested', () => {
    const { doc } = buildFixture();
    expect(() => offsetHipsY(doc, 'missing', 0.1, HIPS)).toThrow(/clip "missing" not found/);
  });
});
```

`tests/pipeline/materials.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyMaterialOverrides } from '../../scripts/asset-pipeline/materials.ts';
import { buildFixture } from './fixture.ts';

describe('applyMaterialOverrides', () => {
  it('sets metalness and roughness on every material', () => {
    const { doc } = buildFixture();
    doc.createMaterial('second');
    applyMaterialOverrides(doc, { metalness: 0.1, roughness: 0.7 });
    for (const m of doc.getRoot().listMaterials()) {
      expect(m.getMetallicFactor()).toBe(0.1);
      expect(m.getRoughnessFactor()).toBe(0.7);
    }
  });

  it('drops the metallic-roughness texture only when asked to flatten', () => {
    const { doc } = buildFixture();
    const texture = doc
      .createTexture('mr')
      .setImage(new Uint8Array([1]))
      .setMimeType('image/png');
    const material = doc.getRoot().listMaterials()[0].setMetallicRoughnessTexture(texture);
    applyMaterialOverrides(doc, { metalness: 0.1, roughness: 0.7 });
    expect(material.getMetallicRoughnessTexture()).toBe(texture);
    applyMaterialOverrides(doc, { metalness: 0.1, roughness: 0.7, flatten: true });
    expect(material.getMetallicRoughnessTexture()).toBeNull();
  });
});
```

- [ ] **Step 14: Run** `npx vitest run tests/pipeline/floor-clamp.test.ts tests/pipeline/materials.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 15: Implement**

```ts
import type { Document } from '@gltf-transform/core';
import { DEFAULT_HIPS, findNode } from './hips.ts';

/** Adds `offset` (source-model metres) to the Y of the hips translation keys of clip `clipName`. */
export function offsetHipsY(
  doc: Document,
  clipName: string,
  offset: number,
  hipsName: string = DEFAULT_HIPS,
): void {
  if (offset === 0) return;
  const clip = doc
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === clipName);
  if (!clip) throw new Error(`clip "${clipName}" not found`);
  const hips = findNode(doc, hipsName);
  for (const channel of clip.listChannels()) {
    if (channel.getTargetNode() !== hips || channel.getTargetPath() !== 'translation') continue;
    const output = channel.getSampler()?.getOutput();
    if (!output) continue;
    const values = output.getArray() as Float32Array;
    for (let i = 1; i < values.length; i += 3) values[i] += offset;
  }
}
```

```ts
import type { Document } from '@gltf-transform/core';

export interface MaterialOverrides {
  metalness: number;
  roughness: number;
  /** Also drop the metallic-roughness texture, so the two factors are the final values. */
  flatten?: boolean;
}

export function applyMaterialOverrides(doc: Document, overrides: MaterialOverrides): void {
  for (const material of doc.getRoot().listMaterials()) {
    material.setMetallicFactor(overrides.metalness).setRoughnessFactor(overrides.roughness);
    if (overrides.flatten) material.setMetallicRoughnessTexture(null);
  }
}
```

- [ ] **Step 16: Run** the two tests — Expected: PASS. **Commit** `feat(pipeline): per-clip floor offset and material overrides`.

- [ ] **Step 17: Height bake — failing test**

`tests/pipeline/bake-height.test.ts`:

```ts
import { getBounds } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { bakeHeight, sceneHeight } from '../../scripts/asset-pipeline/bake-height.ts';
import { buildFixture } from './fixture.ts';

describe('bakeHeight', () => {
  it('measures the bind-pose height of the fixture as 1', () => {
    expect(sceneHeight(buildFixture().doc)).toBeCloseTo(1, 5);
  });

  it('wraps the scene in a root node scaled to the requested height', () => {
    const { doc } = buildFixture();
    const root = bakeHeight(doc, 1.8, 0.6);
    const scene = doc.getRoot().listScenes()[0];
    expect(scene.listChildren()).toEqual([root]);
    expect(root.getScale()).toEqual([1.8, 1.8, 1.8]);
    const { min, max } = getBounds(scene);
    expect(max[1] - min[1]).toBeCloseTo(1.8, 5);
  });

  it('writes releaseAt into the root node extras', () => {
    const { doc } = buildFixture();
    expect(bakeHeight(doc, 1.8, 0.6).getExtras()).toEqual({ releaseAt: 0.6 });
  });

  it('keeps the skeleton and the mesh under the wrapper', () => {
    const { doc, hips } = buildFixture();
    const root = bakeHeight(doc, 2, 0.5);
    expect(
      root
        .listChildren()
        .map((c) => c.getName())
        .sort(),
    ).toEqual(['Armature', 'Body']);
    expect(hips.getParentNode()?.getName()).toBe('Armature');
  });
});
```

- [ ] **Step 18: Run** it — Expected: FAIL. **Implement `bake-height.ts`**:

```ts
import { getBounds, type Document, type Node } from '@gltf-transform/core';

/** Height (Y extent) of the first scene's bounding box, in the file's own units. */
export function sceneHeight(doc: Document): number {
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) throw new Error('no scene');
  const { min, max } = getBounds(scene);
  return max[1] - min[1];
}

/**
 * Wraps the scene's children in a root node scaled by `height / bindHeight` whose extras hold
 * `{ releaseAt }`; returns that node. `bindHeight` is measured before wrapping.
 */
export function bakeHeight(doc: Document, height: number, releaseAt: number): Node {
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) throw new Error('no scene');
  const bindHeight = sceneHeight(doc);
  if (!(bindHeight > 0)) throw new Error('the model has no height');
  const factor = height / bindHeight;
  const root = doc
    .createNode('model-root')
    .setScale([factor, factor, factor])
    .setExtras({ releaseAt });
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  scene.addChild(root);
  return root;
}
```

- [ ] **Step 19: Run** the test — Expected: PASS. **Commit** `feat(pipeline): bake the model height into a root node`.

- [ ] **Step 20: Manifest — failing test**

`tests/pipeline/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../scripts/asset-pipeline/manifest.ts';
import { validManifest } from './fixture.ts';

describe('parseManifest', () => {
  it('accepts a full manifest and fills the defaults', () => {
    const m = parseManifest(validManifest(), 'ace');
    expect(m.id).toBe('ace');
    expect(m.hipsNode).toBe('mixamorig:Hips');
    expect(m.clips.idle.floorOffset).toBe(0);
    expect(m.clips.fall.floorOffset).toBe(0.19);
    expect(m.materials.flatten).toBe(false);
  });

  it('rejects a missing canonical clip', () => {
    const raw = validManifest();
    const clips = Object.fromEntries(Object.entries(raw.clips).filter(([name]) => name !== 'hit'));
    expect(() => parseManifest({ ...raw, clips }, 'ace')).toThrow(/missing clip "hit"/);
  });

  it('rejects an empty or negative window', () => {
    const raw = validManifest();
    raw.clips.run.end = 0;
    expect(() => parseManifest(raw, 'ace')).toThrow(/clip "run": need 0 <= start < end/);
  });

  it('rejects a loop flag that disagrees with the canonical name', () => {
    const raw = validManifest();
    raw.clips.jump.loop = true;
    expect(() => parseManifest(raw, 'ace')).toThrow(/clip "jump": loop must be false/);
  });

  it('rejects a releaseAt outside the shoot clip', () => {
    const raw = validManifest();
    raw.releaseAt = 5;
    expect(() => parseManifest(raw, 'ace')).toThrow(/releaseAt/);
  });

  it('rejects a non-object and a bad height', () => {
    expect(() => parseManifest(null, 'ace')).toThrow(/must be an object/);
    const raw = validManifest();
    raw.height = 0;
    expect(() => parseManifest(raw, 'ace')).toThrow(/height/);
  });
});
```

- [ ] **Step 21: Run** it — Expected: FAIL. **Implement `manifest.ts`**:

```ts
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { DEFAULT_HIPS } from './hips.ts';

/** Same list as `CANONICAL_CLIPS` in src/render/clip-for.ts (scripts never import src; a test keeps them equal). */
export const CANONICAL_CLIPS = ['idle', 'run', 'dribble', 'jump', 'shoot', 'hit', 'fall'] as const;
export type CanonicalClipName = (typeof CANONICAL_CLIPS)[number];
/** Looping is decided by the canonical name at runtime (clip-for.ts), so the manifest must agree. */
export const LOOPING: ReadonlySet<string> = new Set(['idle', 'run', 'dribble']);

export interface ClipSpec {
  /** Name of the clip in the raw export. */
  source: string;
  start: number;
  end: number;
  loop: boolean;
  /** Metres (source-model units) added to the hips Y of this clip so the body stays above the floor. */
  floorOffset: number;
}

export interface Manifest {
  /** The file name without `.json`; also the name of the output GLB. */
  id: string;
  /** File name inside sources/raw/. */
  source: string;
  height: number;
  releaseAt: number;
  hipsNode: string;
  materials: { metalness: number; roughness: number; flatten: boolean };
  clips: Record<CanonicalClipName, ClipSpec>;
}

function fail(id: string, message: string): never {
  throw new Error(`manifest ${id}: ${message}`);
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates parsed JSON and fills the defaults (hips name, floorOffset 0, flatten false). */
export function parseManifest(raw: unknown, id: string): Manifest {
  if (!isRecord(raw)) return fail(id, 'must be an object');
  if (typeof raw.source !== 'string' || raw.source === '') fail(id, '"source" must be a file name');
  if (!isNumber(raw.height) || raw.height <= 0) fail(id, '"height" must be a positive number');
  if (!isNumber(raw.releaseAt) || raw.releaseAt <= 0) fail(id, '"releaseAt" must be > 0');
  const hipsNode = raw.hipsNode === undefined ? DEFAULT_HIPS : raw.hipsNode;
  if (typeof hipsNode !== 'string') return fail(id, '"hipsNode" must be a string');
  const m = raw.materials;
  if (!isRecord(m) || !isNumber(m.metalness) || !isNumber(m.roughness)) {
    return fail(id, '"materials" needs numeric "metalness" and "roughness"');
  }
  if (!isRecord(raw.clips)) return fail(id, '"clips" must be an object');
  const clips = {} as Record<CanonicalClipName, ClipSpec>;
  for (const name of CANONICAL_CLIPS) {
    const c = raw.clips[name];
    if (!isRecord(c)) return fail(id, `missing clip "${name}"`);
    if (typeof c.source !== 'string') fail(id, `clip "${name}": "source" must be a string`);
    if (!isNumber(c.start) || !isNumber(c.end) || c.start < 0 || c.end <= c.start) {
      fail(id, `clip "${name}": need 0 <= start < end`);
    }
    if (typeof c.loop !== 'boolean') fail(id, `clip "${name}": "loop" must be a boolean`);
    if (c.loop !== LOOPING.has(name)) fail(id, `clip "${name}": loop must be ${LOOPING.has(name)}`);
    const floorOffset = c.floorOffset === undefined ? 0 : c.floorOffset;
    if (!isNumber(floorOffset)) fail(id, `clip "${name}": "floorOffset" must be a number`);
    clips[name] = { source: c.source, start: c.start, end: c.end, loop: c.loop, floorOffset };
  }
  const shoot = clips.shoot;
  if (raw.releaseAt >= shoot.end - shoot.start)
    fail(id, '"releaseAt" must fall inside the shoot clip');
  return {
    id,
    source: raw.source,
    height: raw.height,
    releaseAt: raw.releaseAt,
    hipsNode,
    materials: { metalness: m.metalness, roughness: m.roughness, flatten: m.flatten === true },
    clips,
  };
}

export function loadManifest(path: string): Manifest {
  return parseManifest(JSON.parse(readFileSync(path, 'utf8')), basename(path, '.json'));
}
```

- [ ] **Step 22: Run** the test — Expected: PASS. **Commit** `feat(pipeline): character manifest type and validation`.

- [ ] **Step 23: The transform — failing tests**

`tests/pipeline/transform.test.ts` runs the whole F.4.3 chain on the fixture:

```ts
import { getBounds } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { CANONICAL_CLIPS, parseManifest } from '../../scripts/asset-pipeline/manifest.ts';
import { transformCharacter } from '../../scripts/asset-pipeline/transform.ts';
import { BIND_HIPS, buildFixture, hipsTimes, hipsTranslation, validManifest } from './fixture.ts';

/** Every canonical clip is cut from the fixture's single "take" clip. */
function fixtureManifest() {
  const raw = validManifest();
  const clips = Object.fromEntries(
    CANONICAL_CLIPS.map((name) => [
      name,
      {
        ...raw.clips[name],
        source: 'take',
        start: 0,
        end: 1,
        floorOffset: name === 'fall' ? 0.19 : 0,
      },
    ]),
  );
  return parseManifest({ ...raw, releaseAt: 0.4, clips }, 'fixture');
}

describe('transformCharacter', () => {
  it('produces exactly the canonical clips, drops the raw ones and strips root motion', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const clips = doc.getRoot().listAnimations();
    expect(clips.map((c) => c.getName())).toEqual([...CANONICAL_CLIPS]);
    const idle = clips.find((c) => c.getName() === 'idle')!;
    const t = hipsTranslation(idle);
    expect(t[0]).toBe(BIND_HIPS[0]);
    expect(t[2]).toBe(BIND_HIPS[2]);
    expect(hipsTimes(idle)[0]).toBe(0);
  });

  it('lifts only the fall clip by the floor offset', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const by = (name: string) =>
      doc
        .getRoot()
        .listAnimations()
        .find((c) => c.getName() === name)!;
    expect(hipsTranslation(by('fall'))[1]).toBeCloseTo(0.69);
    expect(hipsTranslation(by('idle'))[1]).toBeCloseTo(0.5);
  });

  it('bakes the height and writes releaseAt', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const scene = doc.getRoot().listScenes()[0];
    const { min, max } = getBounds(scene);
    expect(max[1] - min[1]).toBeCloseTo(1.8, 4);
    expect(scene.listChildren()[0].getExtras()).toEqual({ releaseAt: 0.4 });
  });

  it('writes no orphan keyframe data', async () => {
    const { doc } = buildFixture();
    await transformCharacter(doc, fixtureManifest());
    const orphans = doc
      .getRoot()
      .listAccessors()
      .filter((a) => a.listParents().every((p) => p.propertyType === 'Root'));
    expect(orphans).toHaveLength(0);
  });

  it('fails clearly when the manifest names a clip the source does not have', async () => {
    const { doc } = buildFixture();
    const m = fixtureManifest();
    m.clips.hit.source = 'nope';
    await expect(transformCharacter(doc, m)).rejects.toThrow(/clip "nope" not in the source/);
  });
});
```

- [ ] **Step 24: Run** it — Expected: FAIL (module not found). **Implement `transform.ts`**:

```ts
import type { Document } from '@gltf-transform/core';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { bakeHeight } from './bake-height.ts';
import { offsetHipsY } from './floor-clamp.ts';
import { applyMaterialOverrides } from './materials.ts';
import { CANONICAL_CLIPS, type Manifest } from './manifest.ts';
import { dropClips, subclip } from './subclip.ts';
import { stripRootMotion } from './strip-root-motion.ts';

export const TEXTURE_SIZE = 1024;

/**
 * Spec F.4.3 in order: strip root motion, subclip and rename (dropping unlisted clips), floor
 * offset, material overrides, textures to 1024 px WebP, drop redundant keyframes, prune and dedup, bake the height.
 */
export async function transformCharacter(doc: Document, manifest: Manifest): Promise<void> {
  stripRootMotion(doc, manifest.hipsNode);
  // Cut every canonical clip from the raw clips (a raw clip may share a canonical name, e.g.
  // "idle"), then drop all the raw clips, listed or not.
  const sources = doc.getRoot().listAnimations();
  for (const name of CANONICAL_CLIPS) {
    const spec = manifest.clips[name];
    const source = sources.find((a) => a.getName() === spec.source);
    if (!source)
      throw new Error(`manifest ${manifest.id}: clip "${spec.source}" not in the source`);
    subclip(doc, source, name, spec.start, spec.end);
  }
  dropClips(sources);
  for (const name of CANONICAL_CLIPS) {
    offsetHipsY(doc, name, manifest.clips[name].floorOffset, manifest.hipsNode);
  }
  applyMaterialOverrides(doc, manifest.materials);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_SIZE, TEXTURE_SIZE] }),
    resample(),
    dedup(),
    prune(),
  );
  bakeHeight(doc, manifest.height, manifest.releaseAt);
}
```

- [ ] **Step 25: Run** `npx vitest run tests/pipeline/transform.test.ts` — Expected: PASS.

- [ ] **Step 26: `run.ts` — failing test**

`tests/pipeline/run.test.ts` builds a raw GLB with a 2048 px texture in a temp folder and checks the written file: WebP, at most 1024 px, canonical clips, `releaseAt`.

```ts
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { CANONICAL_CLIPS, parseManifest } from '../../scripts/asset-pipeline/manifest.ts';
import { buildCharacter, main } from '../../scripts/asset-pipeline/run.ts';
import { buildFixture, validManifest } from './fixture.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A repo-shaped temp folder holding a raw GLB (with a 2048 px texture) and its manifest. */
async function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'roarball-assets-'));
  dirs.push(root);
  mkdirSync(join(root, 'sources/raw'), { recursive: true });
  mkdirSync(join(root, 'sources/characters'), { recursive: true });
  const { doc } = buildFixture();
  // Not a solid colour: prune() would replace a flat texture by a material factor.
  const size = 2048;
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7) % 251;
  const png = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
  const texture = doc.createTexture('base').setImage(new Uint8Array(png)).setMimeType('image/png');
  doc.getRoot().listMaterials()[0].setBaseColorTexture(texture);
  await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .write(join(root, 'sources/raw/raw.glb'), doc);
  return root;
}

const manifestFor = () => {
  const raw = validManifest();
  const clips = Object.fromEntries(
    CANONICAL_CLIPS.map((name) => [name, { ...raw.clips[name], source: 'take', start: 0, end: 1 }]),
  );
  return { ...raw, releaseAt: 0.4, clips };
};

describe('buildCharacter and main', () => {
  it('writes a GLB with 1024 px WebP textures, the canonical clips and the baked height', async () => {
    const root = await workspace();
    const manifest = parseManifest(manifestFor(), 'golden');
    const { file, bytes } = await buildCharacter(
      manifest,
      join(root, 'sources/raw'),
      join(root, 'out'),
    );
    expect(file).toBe(join(root, 'out/golden.glb'));
    expect(bytes).toBeGreaterThan(0);

    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
    const [texture] = doc.getRoot().listTextures();
    expect(texture.getMimeType()).toBe('image/webp');
    expect(Math.max(...texture.getSize()!)).toBeLessThanOrEqual(1024);
    expect(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => a.getName()),
    ).toEqual([...CANONICAL_CLIPS]);
    expect(doc.getRoot().listScenes()[0].listChildren()[0].getExtras()).toEqual({ releaseAt: 0.4 });
  });

  it('main processes every manifest in sources/characters into public/assets/characters', async () => {
    const root = await workspace();
    const raw = manifestFor();
    writeFileSync(
      join(root, 'sources/characters/golden.json'),
      JSON.stringify({ ...raw, source: 'raw.glb' }),
    );
    await main(root);
    expect(existsSync(join(root, 'public/assets/characters/golden.glb'))).toBe(true);
  });

  it('main does nothing, and does not fail, when there are no manifests', async () => {
    const root = mkdtempSync(join(tmpdir(), 'roarball-assets-'));
    dirs.push(root);
    await expect(main(root)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 27: Run** it — Expected: FAIL. **Implement `run.ts`**:

```ts
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { loadManifest, type Manifest } from './manifest.ts';
import { transformCharacter } from './transform.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Reads sources/raw/<manifest.source>, runs the pipeline and writes <outDir>/<id>.glb. */
export async function buildCharacter(
  manifest: Manifest,
  rawDir: string,
  outDir: string,
): Promise<{ file: string; bytes: number }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(join(rawDir, manifest.source));
  await transformCharacter(doc, manifest);
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${manifest.id}.glb`);
  await io.write(file, doc);
  return { file, bytes: statSync(file).size };
}

/** `npm run assets`: every sources/characters/*.json becomes public/assets/characters/<id>.glb. */
export async function main(root: string = REPO): Promise<void> {
  const manifestDir = join(root, 'sources/characters');
  const names = existsSync(manifestDir)
    ? readdirSync(manifestDir).filter((f) => f.endsWith('.json'))
    : [];
  if (names.length === 0) {
    console.log('assets: no manifests in sources/characters');
    return;
  }
  for (const name of names) {
    const manifest = loadManifest(join(manifestDir, name));
    const { file, bytes } = await buildCharacter(
      manifest,
      join(root, 'sources/raw'),
      join(root, 'public/assets/characters'),
    );
    console.log(`assets: ${manifest.id} -> ${file} (${(bytes / 1e6).toFixed(2)} MB)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [ ] **Step 28: Run** `npx vitest run tests/pipeline` — Expected: all PASS. Then `npm run assets` — Expected: prints `assets: no manifests in sources/characters` and exits 0.

- [ ] **Step 29: Full check and commit**

```bash
npm run format && npm run check
git add -A
git commit -m "feat(pipeline): asset pipeline (strip, subclip, floor, materials, height, WebP) and npm run assets"
git push -u origin task/1-asset-pipeline
gh pr create --title "Phase 7.1: asset pipeline library" --body "Task 1 of the Phase 7 part 1 plan. Closes #<issue>."
```

Expected: `npm run check` green (lint, format, build with the pipeline type-checked, all tests). Then the PR waits for the Opus review and green `gh pr checks`.

---

## Task 2: Golden asset

**Files:**
- Create: `sources/characters/ace.json`, `public/assets/characters/ace.glb` (generated), `tests/content/models.test.ts`
- Modify: `README.md` (credits, `npm run assets`)

**Interfaces:**
- Consumes: Task 1's `npm run assets`, the `Manifest` shape, and the raw export `sources/raw/fantasy+girl+3d+model_animate.glb` (gitignored; it is on Fabio's machine, see plan decision 29).
- Produces: `public/assets/characters/ace.glb` in the shape Task 1 documents (seven canonical clips, `model-root` with `extras.releaseAt`, 1.8 m tall, no root motion, under 3 MB); `sources/characters/ace.json` with the tuned windows. Tasks 3–6 load this file by the path `characters/ace.glb`.

The windows and `releaseAt` are tuned by eye. The raw export was inspected while writing this plan; what it showed:

- `basketball_shot` (6.58 s): crouch around 1.4–1.7 s, the jump with arms extended around 2.0–2.3 s, landing near 2.4 s, then **walking from about 3.0 s to 6 s**. The useful part is roughly **1.4–2.6 s**, not later.
- `dribble` (9.29 s): the character walks and **turns on the spot** throughout; the hips' yaw is not root *translation*, so the strip does not remove it. A loop must start and end facing the same way. Look for a steady stretch (around 4.0–5.7 s looked steadiest).
- `idle` is 15.33 s; the first 4 s are used. `run` (1.25 s), `jump` (2.21 s), `hit_to_body_01` (1.29 s) and `fall` (3.0 s) are used whole.

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Phase 7.2: Golden model asset" --label task,phase-7 --milestone "Phase 7 – Real models, part 1" --body "Plan: docs/superpowers/plans/2026-10-18-phase-7-golden-model.md, Task 2"
git checkout main && git pull && git checkout -b task/2-golden-asset
```

- [ ] **Step 2: Write the preview script (outside the repo)**

The script renders a contact sheet of a clip: a GLB (raw or processed), a clip name, a time range and a frame count go in; one PNG comes out. It serves three.js and the GLB from a throwaway HTTP server, uses the repo's Playwright and Chromium, and makes the camera follow the hips so raw clips with root motion stay in frame. Save it as `frames.mjs` in a temp folder **outside the repo** (for example `FRAMES=$(mktemp -d)`; do not commit it) and always run it from the repo root.

```js
// Contact sheet of one clip: node frames.mjs <file.glb> <clip> <t0> <t1> [frames=12] [out=sheet.png] [view=front|side]
// Run from the repo root (it reads node_modules/three and node_modules/playwright from there).
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, clip, t0, t1, count = '12', out = 'sheet.png', view = 'front'] = process.argv.slice(2);
if (!file || !clip || t0 === undefined || t1 === undefined) {
  console.error('usage: node frames.mjs <file.glb> <clip> <t0> <t1> [frames] [out.png] [front|side]');
  process.exit(2);
}
const repo = process.cwd();
const { chromium } = await import(pathToFileURL(join(repo, 'node_modules/playwright/index.mjs')).href);

const PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#ccc">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/three/examples/jsm/loaders/GLTFLoader.js';
const CELL_W = 240, CELL_H = 320;
window.sheet = async (clipName, times, view) => {
  const gltf = await new GLTFLoader().loadAsync('/model.glb');
  const clip = gltf.animations.find((c) => c.name === clipName);
  if (!clip) throw new Error('clip ' + clipName + ' not in ' + gltf.animations.map((c) => c.name));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfc8d6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 4, 3); scene.add(sun);
  scene.add(new THREE.GridHelper(4, 8));
  // Skinned meshes are culled by their bind-pose bounds: off, or a raw clip with root motion vanishes.
  gltf.scene.traverse((o) => { o.frustumCulled = false; });
  scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const h = Math.max(box.max.y - box.min.y, 0.1);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip); action.play();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(CELL_W, CELL_H);
  const camera = new THREE.PerspectiveCamera(35, CELL_W / CELL_H, 0.05, 100);
  const hips = gltf.scene.getObjectByName('mixamorigHips');
  const cols = Math.min(times.length, 6);
  const rows = Math.ceil(times.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W; canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d');
  times.forEach((t, i) => {
    mixer.setTime(t);
    gltf.scene.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    (hips ?? gltf.scene).getWorldPosition(p);
    const d = h * 2.6;
    // The camera follows the hips in X and Z so raw clips with root motion stay in frame.
    camera.position.set(p.x + (view === 'side' ? d : d * 0.55), h * 0.55, p.z + (view === 'side' ? 0 : d));
    camera.lookAt(p.x, h * 0.5, p.z);
    renderer.render(scene, camera);
    const x = (i % cols) * CELL_W, y = Math.floor(i / cols) * CELL_H;
    ctx.drawImage(renderer.domElement, x, y);
    ctx.fillStyle = '#000'; ctx.font = '16px sans-serif'; ctx.fillText(t.toFixed(2) + ' s', x + 8, y + 20);
  });
  return canvas.toDataURL('image/png');
};
</script>`;

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    const path = url === '/model.glb' ? resolve(repo, file) : join(repo, 'node_modules', url.replace(/^\/three\//, 'three/'));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e));
  await page.goto(`http://localhost:${server.address().port}/`);
  const n = Number(count);
  const from = Number(t0), to = Number(t1);
  const times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(n - 1, 1));
  const dataUrl = await page.evaluate(([c, t, v]) => window.sheet(c, t, v), [clip, times, view]);
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', out, 'times', times.map((t) => t.toFixed(2)).join(' '));
} finally {
  await browser.close();
  server.close();
}
```

Smoke-test it on the raw file (this shows the raw `dribble` clip over its whole length):

```bash
node "$FRAMES/frames.mjs" "sources/raw/fantasy+girl+3d+model_animate.glb" dribble 0 9.29 24 "$FRAMES/raw-dribble.png" front
```

Expected: prints `wrote …/raw-dribble.png times 0.00 0.40 …`. Open the PNG with the Read tool: a 6-column contact sheet of the character with the time on each cell. If Chromium fails to start, run `npx playwright install chromium`.

- [ ] **Step 3: Write the manifest**

`sources/characters/ace.json` (the starting numbers; Steps 5–7 tune the three marked ones):

```json
{
  "source": "fantasy+girl+3d+model_animate.glb",
  "height": 1.8,
  "releaseAt": 0.7,
  "materials": { "metalness": 0.1, "roughness": 0.7 },
  "clips": {
    "idle": { "source": "idle", "start": 0, "end": 4, "loop": true },
    "run": { "source": "run", "start": 0, "end": 1.25, "loop": true },
    "dribble": { "source": "dribble", "start": 4.4, "end": 5.9, "loop": true },
    "jump": { "source": "jump", "start": 0, "end": 2.21, "loop": false },
    "shoot": { "source": "basketball_shot", "start": 1.5, "end": 2.7, "loop": false },
    "hit": { "source": "hit_to_body_01", "start": 0, "end": 1.29, "loop": false },
    "fall": { "source": "fall", "start": 0, "end": 3, "loop": false, "floorOffset": 0.19 }
  }
}
```

(`dribble.start/end`, `shoot.start/end` and `releaseAt` are the tuned numbers. The lead's earlier guesses, dribble `[3.0, 4.5]` and shoot `[2.6, 3.8]`, were checked against the raw frames and land in the turning and walking parts, so they were replaced.)

- [ ] **Step 4: Content check — failing test first**

`tests/content/models.test.ts` (Task 3 appends the checks that tie characters to files; this version needs nothing from `src`):

```ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getBounds, NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { beforeAll, describe, expect, it } from 'vitest';

const CANONICAL_CLIPS = ['idle', 'run', 'dribble', 'jump', 'shoot', 'hit', 'fall'] as const;

/** Spec F.6.2: every shipped model has the canonical clips, a releaseAt and a sane height. */
const MODELS_DIR = join(process.cwd(), 'public/assets/characters');
const MAX_BYTES = 3 * 1024 * 1024;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = existsSync(MODELS_DIR)
  ? readdirSync(MODELS_DIR).filter((f) => f.endsWith('.glb'))
  : [];

function hipsTranslations(doc: Document) {
  return doc
    .getRoot()
    .listAnimations()
    .map((clip) => {
      const channel = clip
        .listChannels()
        .find(
          (c) =>
            c.getTargetPath() === 'translation' &&
            c.getTargetNode()?.getName() === 'mixamorig:Hips',
        );
      return { clip: clip.getName(), values: channel?.getSampler()?.getOutput()?.getArray() };
    });
}

describe('public/assets/characters', () => {
  it('has at least one model', () => {
    expect(files.length).toBeGreaterThan(0);
  });
});

describe.each(files)('model %s', (file) => {
  let doc: Document;
  beforeAll(async () => {
    doc = await io.read(join(MODELS_DIR, file));
  });

  it('is smaller than 3 MB', () => {
    expect(statSync(join(MODELS_DIR, file)).size).toBeLessThan(MAX_BYTES);
  });

  it('contains every canonical clip, and only those', () => {
    const names = doc
      .getRoot()
      .listAnimations()
      .map((a) => a.getName());
    expect([...names].sort()).toEqual([...CANONICAL_CLIPS].sort());
    for (const clip of doc.getRoot().listAnimations()) {
      const times = clip.listChannels()[0]?.getSampler()?.getInput()?.getArray();
      expect(times?.[times.length - 1] ?? 0, `${clip.getName()} has a duration`).toBeGreaterThan(0);
    }
  });

  it('carries releaseAt, inside the shoot clip', () => {
    const root = doc.getRoot().listScenes()[0]?.listChildren()[0];
    const releaseAt: unknown = root?.getExtras().releaseAt;
    expect(typeof releaseAt).toBe('number');
    const shoot = doc
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === 'shoot');
    const times = shoot?.listChannels()[0]?.getSampler()?.getInput()?.getArray();
    expect(releaseAt as number).toBeGreaterThan(0);
    expect(releaseAt as number).toBeLessThan(times?.[times.length - 1] ?? 0);
  });

  it('is 1.6 to 2.0 m tall in the bind pose', () => {
    const { min, max } = getBounds(doc.getRoot().listScenes()[0]!);
    expect(max[1] - min[1]).toBeGreaterThanOrEqual(1.6);
    expect(max[1] - min[1]).toBeLessThanOrEqual(2.0);
  });

  it('has no root motion: the hips stay at their X and Z in every clip', () => {
    for (const { clip, values } of hipsTranslations(doc)) {
      expect(values, `${clip} animates the hips`).toBeDefined();
      for (let i = 0; i + 2 < values!.length; i += 3) {
        expect(values![i], `${clip} x`).toBeCloseTo(values![0], 5);
        expect(values![i + 2], `${clip} z`).toBeCloseTo(values![2], 5);
      }
    }
  });
});
```

Run: `npx vitest run tests/content/models.test.ts` — Expected: FAIL ("has at least one model": there is no GLB yet). It passes after Step 7.

- [ ] **Step 5: Tune the shoot window and `releaseAt`**

Look at the raw clip across the useful part, from the side:

```bash
node "$FRAMES/frames.mjs" "sources/raw/fantasy+girl+3d+model_animate.glb" basketball_shot 1.2 2.8 24 "$FRAMES/raw-shot.png" side
```

Pick `start` just before the crouch and `end` shortly after the landing. `releaseAt` is the time **inside the window** (frame time minus `start`) of the frame where the ball would leave the hands: arms fully extended up, wrists flicking. Prefer a window where that release falls near **0.45 s** after `start`: the game plays the clip at `releaseAt / 0.45` speed for a jump shot (decision 28), so 0.45 means natural speed, and anything above 0.8 looks rushed. Put the numbers into `ace.json` (`releaseAt` must be inside the window: the manifest validator checks it).

- [ ] **Step 6: Tune the dribble loop**

```bash
node "$FRAMES/frames.mjs" "sources/raw/fantasy+girl+3d+model_animate.glb" dribble 3.6 6.4 24 "$FRAMES/raw-dribble-zoom.png" front
```

Choose about 1.5 s where the body faces the same direction at the first and last frame and the pose at the end is close to the pose at the start (so the loop does not pop). If no 1.5 s window of `dribble` is steady enough, stop and report it as BLOCKED rather than shipping a spinning dribble: the fallback chain (idle) would hide it, but the content check requires the clip.

- [ ] **Step 7: Run the pipeline and check the result**

```bash
npm run assets
```

Expected: `assets: ace -> …/public/assets/characters/ace.glb (≈2.6 MB)` (anything under 3.0 MB passes). Then look at the **processed** file, the same way the game will see it (root motion stripped, height baked, so one frame size fits all clips):

```bash
GLB=public/assets/characters/ace.glb
node "$FRAMES/frames.mjs" $GLB idle 0 4 12 "$FRAMES/idle.png" side
node "$FRAMES/frames.mjs" $GLB run 0 1.25 12 "$FRAMES/run.png" side
node "$FRAMES/frames.mjs" $GLB dribble 0 1.5 12 "$FRAMES/dribble.png" front
node "$FRAMES/frames.mjs" $GLB shoot 0 1.2 12 "$FRAMES/shoot.png" side
node "$FRAMES/frames.mjs" $GLB fall 0 3 12 "$FRAMES/fall.png" side
```

(Use the real window lengths from `ace.json` if you changed them.) Check with the Read tool:

1. `fall`: the body is lying down and no part of it is below the grid floor at the last frames. If the hem or hair is still under the floor, raise `floorOffset` (0.19 is the spike's measurement, in source metres); if the body hovers, lower it. Re-run `npm run assets` and look again.
2. `shoot`: the release pose is at `releaseAt` seconds.
3. `dribble`: no turning; first and last frames match.
4. Hair and dress: not mirror-shiny. If they still look metallic, add `"flatten": true` to `materials` in `ace.json` (decision 7) and re-run.
5. In every clip the feet stay near the grid (no sliding away: root motion is stripped).

When the frames look right, run `npx vitest run tests/content/models.test.ts` — Expected: PASS (size under 3 MB, seven clips, `releaseAt` inside `shoot`, 1.6–2.0 m, no root motion).

- [ ] **Step 8: README credits and the new command**

In `README.md`, in the **Run** block, add after the `npm run balance` line:

```
    npm run assets     # rebuild public/assets/characters/*.glb from sources/ (needs the raw exports, which are not in git)
```

and add a section before `## Docs`:

```markdown
## Credits

Golden is generated with Tripo (Pro plan, commercial licence), rigged and animated in Tripo Studio, then
reduced by `npm run assets`.
```

- [ ] **Step 9: Check, commit, PR**

```bash
npm run format && npm run check
git add sources/characters/ace.json public/assets/characters/ace.glb tests/content/models.test.ts README.md
git commit -m "chore(assets): Golden model and manifest (7 canonical clips, 1.8 m, WebP)"
git push -u origin task/2-golden-asset
gh pr create --title "Phase 7.2: Golden model asset" --body "Task 2 of the Phase 7 part 1 plan. Contact sheets of the tuned clips attached. Closes #<issue>."
```

Expected: `npm run check` green. Attach the contact sheets (`shoot.png`, `dribble.png`, `fall.png`) to the PR comment so the reviewer can see the tuned windows.

---

## Task 3: Content and pure render helpers

**Files:**
- Create: `src/render/clip-for.ts`, `src/render/release-timing.ts`, `tests/render/clip-for.test.ts`, `tests/render/release-timing.test.ts`
- Modify: `src/sim/types.ts` (`CharacterDef.model`), `src/content/characters/ace.ts`, `tests/content/models.test.ts` (append), `README.md` (ability table row)

**Interfaces:**
- Consumes: `CANONICAL_CLIPS` from `scripts/asset-pipeline/manifest.ts` (only in a test that keeps the two lists equal); `SHOT_TIMING` (`src/sim/shooting.ts`), `PASS_TIMING` (`src/sim/passing.ts`), `TICK_RATE` (`src/sim/constants.ts`) — all already exported; `PlayerAction`, `ShotType` (`src/sim/types.ts`).
- Produces (Tasks 4–7 rely on these exact names):
  - `src/sim/types.ts`: `CharacterDef.model?: { file: string }`.
  - `src/render/clip-for.ts`: `CANONICAL_CLIPS`, `type CanonicalClip = 'idle' | 'run' | 'dribble' | 'jump' | 'shoot' | 'hit' | 'fall'`, `LOOPING_CLIPS: ReadonlySet<CanonicalClip>`, `MOVING_SPEED = 0.5`, `clipFor(action: PlayerAction, moving: boolean, hasBall: boolean): CanonicalClip`, `resolveClip(wanted: CanonicalClip, available: ReadonlySet<string>): CanonicalClip | null`, `runTimeScale(speed: number, runSpeed: number): number`.
  - `src/render/release-timing.ts`: `shotTimeScale(action: PlayerAction, releaseAt: number): number`, `passStartTime(releaseAt: number): number`, `shootClipTime(action: PlayerAction, actionTicks: number, releaseAt: number): number`.

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Phase 7.3: clip choice, release timing, Golden content" --label task,phase-7 --milestone "Phase 7 – Real models, part 1" --body "Plan: docs/superpowers/plans/2026-10-18-phase-7-golden-model.md, Task 3"
git checkout main && git pull && git checkout -b task/3-clip-logic
```

- [ ] **Step 2: `clipFor`, `resolveClip`, `runTimeScale` — failing test**

`tests/render/clip-for.test.ts` (it also pins that the pipeline's clip list and the renderer's are equal, plan decision 12):

```ts
import { describe, expect, it } from 'vitest';
import { CANONICAL_CLIPS as PIPELINE_CLIPS } from '../../scripts/asset-pipeline/manifest.ts';
import {
  CANONICAL_CLIPS,
  clipFor,
  LOOPING_CLIPS,
  resolveClip,
  runTimeScale,
  type CanonicalClip,
} from '../../src/render/clip-for';
import type { PlayerAction } from '../../src/sim/types';

describe('clipFor (spec F.7.3)', () => {
  const rows: [PlayerAction, boolean, boolean, CanonicalClip][] = [
    ['idle', false, false, 'idle'],
    ['idle', false, true, 'dribble'],
    ['idle', true, false, 'run'],
    ['idle', true, true, 'run'],
    ['run', true, false, 'run'],
    ['run', true, true, 'run'],
    ['run', false, true, 'dribble'],
    ['run', false, false, 'idle'],
    ['jump', false, false, 'jump'],
    ['jump', true, true, 'jump'],
    ['block', true, false, 'jump'],
    ['shoot', false, true, 'shoot'],
    ['layup', true, true, 'shoot'],
    ['dunk', false, true, 'shoot'],
    ['pass', true, true, 'shoot'],
    ['steal', true, false, 'hit'],
    ['shove', false, false, 'hit'],
    ['stunned', true, true, 'fall'],
    ['getup', false, false, 'idle'],
    ['getup', true, true, 'idle'],
  ];
  it.each(rows)('%s moving=%s hasBall=%s -> %s', (action, moving, hasBall, expected) => {
    expect(clipFor(action, moving, hasBall)).toBe(expected);
  });

  it('returns a canonical clip for every action', () => {
    const actions: PlayerAction[] = [
      'idle',
      'run',
      'jump',
      'shoot',
      'layup',
      'dunk',
      'pass',
      'block',
      'steal',
      'shove',
      'stunned',
      'getup',
    ];
    for (const action of actions) {
      expect(CANONICAL_CLIPS).toContain(clipFor(action, false, false));
    }
  });
});

describe('resolveClip (spec F.7.4)', () => {
  it('returns the wanted clip when the model has it', () => {
    expect(resolveClip('shoot', new Set(['idle', 'shoot']))).toBe('shoot');
  });
  it('falls back to idle when the wanted clip is missing', () => {
    expect(resolveClip('fall', new Set(['idle', 'run']))).toBe('idle');
  });
  it('returns null (bind pose) when idle is missing too', () => {
    expect(resolveClip('run', new Set(['shoot']))).toBeNull();
    expect(resolveClip('idle', new Set())).toBeNull();
  });
});

describe('looping and run speed', () => {
  it('only idle, run and dribble loop', () => {
    expect([...LOOPING_CLIPS].sort()).toEqual(['dribble', 'idle', 'run']);
  });
  it('the pipeline and the renderer list the same canonical clips', () => {
    expect([...PIPELINE_CLIPS]).toEqual([...CANONICAL_CLIPS]);
  });
  it('runTimeScale is speed over run speed, kept within 0.4..2', () => {
    expect(runTimeScale(5, 5)).toBe(1);
    expect(runTimeScale(7.5, 5)).toBe(1.5);
    expect(runTimeScale(0.5, 5)).toBe(0.4);
    expect(runTimeScale(50, 5)).toBe(2);
  });
  it('runTimeScale ignores a non-positive run speed', () => {
    expect(runTimeScale(3, 0)).toBe(1);
    expect(runTimeScale(3, Number.NaN)).toBe(1);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run tests/render/clip-for.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/render/clip-for.ts`**

```ts
import type { PlayerAction } from '../sim/types';

/** The seven clips every model ships (spec F.5). Same list as scripts/asset-pipeline/manifest.ts. */
export const CANONICAL_CLIPS = ['idle', 'run', 'dribble', 'jump', 'shoot', 'hit', 'fall'] as const;
export type CanonicalClip = (typeof CANONICAL_CLIPS)[number];

/** Clips that repeat; every other clip plays once and holds its last frame (spec F.7.5). */
export const LOOPING_CLIPS: ReadonlySet<CanonicalClip> = new Set<CanonicalClip>([
  'idle',
  'run',
  'dribble',
]);

/** Horizontal speed above which a player counts as moving (spec F.7.3), m/s. */
export const MOVING_SPEED = 0.5;

/** Spec F.7.3: which canonical clip shows `action`. */
export function clipFor(action: PlayerAction, moving: boolean, hasBall: boolean): CanonicalClip {
  switch (action) {
    case 'idle':
    case 'run':
      if (moving) return 'run';
      return hasBall ? 'dribble' : 'idle';
    case 'jump':
    case 'block':
      return 'jump';
    case 'shoot':
    case 'layup':
    case 'dunk':
    case 'pass':
      return 'shoot';
    case 'steal':
    case 'shove':
      return 'hit';
    case 'stunned':
      return 'fall';
    case 'getup':
      return 'idle';
  }
}

/** Spec F.7.4: the wanted clip, else idle, else null (bind pose). Never throws. */
export function resolveClip(
  wanted: CanonicalClip,
  available: ReadonlySet<string>,
): CanonicalClip | null {
  if (available.has(wanted)) return wanted;
  return available.has('idle') ? 'idle' : null;
}

/** Playback speed of the run clip: horizontal speed over the player's run speed, kept in a sane band. */
export function runTimeScale(speed: number, runSpeed: number): number {
  if (!(runSpeed > 0)) return 1;
  return Math.min(2, Math.max(0.4, speed / runSpeed));
}
```

- [ ] **Step 5: Run** the test — Expected: PASS. **Commit** `feat(render): clipFor, resolveClip and runTimeScale`.

- [ ] **Step 6: Release timing — failing test**

`tests/render/release-timing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { passStartTime, shootClipTime, shotTimeScale } from '../../src/render/release-timing';
import { PASS_TIMING } from '../../src/sim/passing';
import { SHOT_TIMING } from '../../src/sim/shooting';

describe('shotTimeScale (spec F.5.3)', () => {
  it('maps releaseAt onto the sim release tick for each shot', () => {
    expect(shotTimeScale('shoot', 0.45)).toBeCloseTo(1); // jumpshot releases at 27 / 60 = 0.45 s
    expect(shotTimeScale('shoot', 0.6)).toBeCloseTo(0.6 / (SHOT_TIMING.jumpshot.releaseTick / 60));
    expect(shotTimeScale('layup', 0.6)).toBeCloseTo(2.4); // 15 / 60 = 0.25 s
    expect(shotTimeScale('dunk', 0.6)).toBeCloseTo(1.5); // 24 / 60 = 0.4 s
  });
  it('is 1 for actions that are not shots and for a bad releaseAt', () => {
    expect(shotTimeScale('pass', 0.6)).toBe(1);
    expect(shotTimeScale('idle', 0.6)).toBe(1);
    expect(shotTimeScale('shoot', 0)).toBe(1);
    expect(shotTimeScale('shoot', Number.NaN)).toBe(1);
  });
  it('plays the visible release on the sim release tick', () => {
    for (const [action, type] of [
      ['shoot', 'jumpshot'],
      ['layup', 'layup'],
      ['dunk', 'dunk'],
    ] as const) {
      const releaseTick = SHOT_TIMING[type].releaseTick;
      expect(shootClipTime(action, releaseTick, 0.6)).toBeCloseTo(0.6);
    }
  });
});

describe('passStartTime and shootClipTime for a pass (spec F.5.3)', () => {
  it('starts releaseAt minus the pass release time into the clip', () => {
    expect(passStartTime(0.6)).toBeCloseTo(0.6 - PASS_TIMING.releaseTick / 60);
  });
  it('never starts before 0 when releaseAt is shorter than the pass release time', () => {
    expect(passStartTime(0.02)).toBe(0);
  });
  it('a pass reaches the release pose on the pass release tick', () => {
    expect(shootClipTime('pass', PASS_TIMING.releaseTick, 0.6)).toBeCloseTo(0.6);
    expect(shootClipTime('pass', 0, 0.6)).toBeCloseTo(passStartTime(0.6));
  });
  it('a view that first sees an action late still lands on the right frame (alley-oop)', () => {
    const late = SHOT_TIMING.dunk.releaseTick - 1;
    expect(shootClipTime('dunk', late, 0.6)).toBeLessThan(0.6);
    expect(shootClipTime('dunk', late, 0.6)).toBeGreaterThan(0.5);
  });
  it('treats negative ticks as 0', () => {
    expect(shootClipTime('shoot', -3, 0.6)).toBe(0);
  });
});
```

- [ ] **Step 7: Run** `npx vitest run tests/render/release-timing.test.ts` — Expected: FAIL. **Implement `src/render/release-timing.ts`**:

```ts
import { TICK_RATE } from '../sim/constants';
import { PASS_TIMING } from '../sim/passing';
import { SHOT_TIMING } from '../sim/shooting';
import type { PlayerAction, ShotType } from '../sim/types';

const SHOT_TYPE: Partial<Record<PlayerAction, ShotType>> = {
  shoot: 'jumpshot',
  layup: 'layup',
  dunk: 'dunk',
};

/**
 * Spec F.5.3: playback speed of the `shoot` clip so the ball leaves the hands (`releaseAt`
 * seconds into the clip) on the sim's release tick. 1 for any action that is not a shot.
 */
export function shotTimeScale(action: PlayerAction, releaseAt: number): number {
  const type = SHOT_TYPE[action];
  if (!type || !(releaseAt > 0)) return 1;
  return releaseAt / (SHOT_TIMING[type].releaseTick / TICK_RATE);
}

/** Spec F.5.3: a pass releases after 4 ticks, so the clip starts that long before its release. */
export function passStartTime(releaseAt: number): number {
  return Math.max(0, releaseAt - PASS_TIMING.releaseTick / TICK_RATE);
}

/**
 * Where in the `shoot` clip the view should be `actionTicks` ticks into `action`. Reading the sim's
 * tick count (not the time since the view noticed the action) keeps an alley-oop, which enters
 * `dunk` a tick before its release, in sync too.
 */
export function shootClipTime(
  action: PlayerAction,
  actionTicks: number,
  releaseAt: number,
): number {
  const elapsed = Math.max(0, actionTicks) / TICK_RATE;
  if (action === 'pass') return passStartTime(releaseAt) + elapsed;
  return elapsed * shotTimeScale(action, releaseAt);
}
```

- [ ] **Step 8: Run** the test — Expected: PASS. **Commit** `feat(render): sync the shoot clip with the sim release tick`.

- [ ] **Step 9: Character content — failing test**

Append to `tests/content/models.test.ts` (add the two imports at the top with the others, then the block at the end):

```ts
// add these two imports with the others at the top of the file:
import { characters } from '../../src/content/characters';
import { CANONICAL_CLIPS } from '../../src/render/clip-for';
// and remove the local `const CANONICAL_CLIPS = [...] as const;` line.

describe('characters with a model (spec F.6.1)', () => {
  const withModel = characters.filter((c) => c.model);

  it('Golden is the character `ace` and has a model', () => {
    const ace = characters.find((c) => c.id === 'ace');
    expect(ace?.name).toBe('Golden');
    expect(ace?.model).toEqual({ file: 'characters/ace.glb' });
  });

  it.each(withModel.map((c) => [c.id, c.model!.file] as const))(
    '%s points at a model that exists and was checked above',
    (_id, file) => {
      expect(existsSync(join(process.cwd(), 'public/assets', file))).toBe(true);
      expect(files).toContain(file.replace('characters/', ''));
    },
  );

  it('a character without a model stays a placeholder', () => {
    expect(characters.filter((c) => !c.model).map((c) => c.id)).toEqual(['brick', 'dash', 'rook']);
  });
});
```

Run: `npx vitest run tests/content/models.test.ts` — Expected: FAIL (name is still "Ace"; no `model`; and a TypeScript error is not raised by Vitest, so `tsc` in Step 11 is where the missing field shows).

- [ ] **Step 10: Implement the content change**

In `src/sim/types.ts`, in `CharacterDef`, after `appearance`:

```diff
--- a/src/sim/types.ts
+++ b/src/sim/types.ts
@@ -95,6 +95,11 @@
   /** Signature ability, implemented in phase 5. */
   abilityId: string;
   appearance: { primaryColor: number; secondaryColor: number };
+  /**
+   * The character's 3D model, `file` relative to `public/assets` (spec F.6.1). Without it the
+   * character is drawn as a placeholder (spec §5.5).
+   */
+  model?: { file: string };
 }
 
 /** Character stats × court modifier × ability, resolved to simulation units (metres, seconds). */
```

`src/content/characters/ace.ts` (id, stats, ability and appearance are unchanged: F.2):

```ts
import type { CharacterDef } from '../../sim/types';

/** Golden, the shooter (id `ace` is kept, spec F.2): deadly from range, soft everywhere else. */
export const ace: CharacterDef = {
  id: 'ace',
  name: 'Golden',
  description: 'A golden-haired sharpshooter: deadly from range, soft everywhere else.',
  stats: { speed: 5, jump: 5, shooting: 10, dunking: 3, defense: 4, power: 3, stamina: 6 },
  abilityId: 'hotHand',
  appearance: { primaryColor: 0x8e44ad, secondaryColor: 0xf1c40f },
  model: { file: 'characters/ace.glb' },
};
```

In `README.md`, in the abilities table, rename the row `| Ace       | Hot Hand …` to `| Golden    | Hot Hand …` (keep the column widths: `Golden` is 6 characters, pad to the same width as `Brick`'s cell).

- [ ] **Step 11: Check that no test asserts the old display name**

```bash
grep -rn "'Ace'" tests src
```

Expected: two hits, `tests/app/box-score.test.ts` and `tests/ui/screens/results.test.ts` (the old hit in `ace.ts` is the line you just changed). Both are roster lines the test builds itself and neither reads the name from `getCharacter`, so neither changes. (`tests/app/setup-model.test.ts` and some sim tests mention Ace only in a test title or comment; leave them.) (If a hit reads `getCharacter('ace').name`, change its expectation to `'Golden'`.) Run `npx tsc -p tsconfig.json --noEmit` — Expected: no output.

- [ ] **Step 12: Run everything and commit**

```bash
npx vitest run tests/content tests/render
npm run format && npm run check
git diff origin/main --stat -- src/sim src/content
```

Expected: `src/sim/types.ts` only (+5 lines, a type), `src/content/characters/ace.ts`; every sim test, golden and balance-pinned score unchanged and green.

```bash
git add -A
git commit -m "feat(render): clip choice and release timing; Golden replaces Ace (model field)"
git push -u origin task/3-clip-logic
gh pr create --title "Phase 7.3: clip choice, release timing, Golden content" --body "Task 3 of the Phase 7 part 1 plan. Closes #<issue>."
```

---

## Task 4: Model loading

**Files:**
- Create: `src/render/model-cache.ts`, `tests/render/model-fixtures.ts` (shared fake GLTF builder, not a test file), `tests/render/model-cache.test.ts`
- Modify: `vite.config.ts` (chunk size warning limit)

**Interfaces:**
- Consumes: `public/assets/characters/ace.glb` shape from Task 2 (clips by canonical name, `userData.releaseAt` on `model-root`); `CharacterDef.model` (Task 3, used by Task 5, not here).
- Produces (Tasks 5 and 7 rely on these exact names):
  - `src/render/model-cache.ts`: `interface LoadedModel { scene: Object3D; clips: AnimationClip[]; releaseAt: number }`, `interface GltfLike { scene: Object3D; animations: AnimationClip[] }`, `interface ModelLoader { loadAsync(url: string): Promise<GltfLike> }`, `interface LoadModelOptions { loader?: ModelLoader; timeoutMs?: number; baseUrl?: string }`, `loadCharacterModel(file: string, options?: LoadModelOptions): Promise<LoadedModel | null>` (never rejects; caches per file; on failure or timeout logs `console.warn('[model] fallback to placeholder for', file, error)` once and resolves `null`), `clearModelCache(): void`, `instantiate(model: LoadedModel): LoadedModel` (cloned skeleton, shadows on, frustum culling off).
  - `tests/render/model-fixtures.ts`: `ALL_CLIPS`, `fakeGltf(clipNames?: readonly string[], releaseAt?: number | null): GltfLike`.

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Phase 7.4: model loading and cache" --label task,phase-7 --milestone "Phase 7 – Real models, part 1" --body "Plan: docs/superpowers/plans/2026-10-18-phase-7-golden-model.md, Task 4"
git checkout main && git pull && git checkout -b task/4-model-cache
```

- [ ] **Step 2: The fake GLTF and the failing tests**

`tests/render/model-fixtures.ts` builds what `GLTFLoader` would return for a real model: a `Group` whose child `model-root` carries `userData.releaseAt`, holding a `SkinnedMesh` with one `Bone` named `mixamorigHips` (the name GLTFLoader gives `mixamorig:Hips`), plus one 1 s `AnimationClip` per requested name animating that bone.

```ts
import {
  AnimationClip,
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  VectorKeyframeTrack,
} from 'three';
import type { GltfLike } from '../../src/render/model-cache';

export const ALL_CLIPS = ['idle', 'run', 'dribble', 'jump', 'shoot', 'hit', 'fall'] as const;

/** A one-bone skinned character with clips called `clipNames`, each 1 s, like a loaded GLB. */
export function fakeGltf(
  clipNames: readonly string[] = ALL_CLIPS,
  releaseAt: number | null = 0.6,
): GltfLike {
  const hips = new Bone();
  hips.name = 'mixamorigHips';
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.add(hips);
  mesh.bind(new Skeleton([hips]));

  const root = new Group();
  root.name = 'model-root';
  if (releaseAt !== null) root.userData = { releaseAt };
  root.add(mesh);
  const scene = new Group();
  scene.add(root);

  const animations = clipNames.map(
    (name) =>
      new AnimationClip(name, 1, [
        new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 0, 0, 0, 1, 0]),
      ]),
  );
  return { scene, animations };
}
```

`tests/render/model-cache.test.ts`:

```ts
import { SkinnedMesh } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearModelCache,
  instantiate,
  loadCharacterModel,
  type ModelLoader,
} from '../../src/render/model-cache';
import { fakeGltf } from './model-fixtures';

const FILE = 'characters/ace.glb';

beforeEach(() => {
  clearModelCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadCharacterModel', () => {
  it('loads from BASE_URL + assets/ + file and reads releaseAt', async () => {
    const loadAsync = vi.fn(async () => fakeGltf());
    const model = await loadCharacterModel(FILE, { loader: { loadAsync }, baseUrl: '/RoarBall/' });
    expect(loadAsync).toHaveBeenCalledWith('/RoarBall/assets/characters/ace.glb');
    expect(model?.releaseAt).toBe(0.6);
    expect(model?.clips.map((c) => c.name)).toContain('shoot');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('caches per file: two calls, one load', async () => {
    const loadAsync = vi.fn(async () => fakeGltf());
    const loader: ModelLoader = { loadAsync };
    const [a, b] = await Promise.all([
      loadCharacterModel(FILE, { loader }),
      loadCharacterModel(FILE, { loader }),
    ]);
    expect(a).toBe(b);
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it('resolves null and warns once with the grep-able prefix when the load fails', async () => {
    const loader: ModelLoader = { loadAsync: async () => Promise.reject(new Error('404')) };
    expect(await loadCharacterModel(FILE, { loader })).toBeNull();
    expect(await loadCharacterModel(FILE, { loader })).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0]?.slice(0, 2)).toEqual([
      '[model] fallback to placeholder for',
      FILE,
    ]);
  });

  it('resolves null when the loader hangs past the timeout', async () => {
    vi.useFakeTimers();
    const loader: ModelLoader = { loadAsync: () => new Promise(() => {}) };
    const result = loadCharacterModel(FILE, { loader, timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await result).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('resolves null when the model carries no releaseAt', async () => {
    const loader: ModelLoader = { loadAsync: async () => fakeGltf(undefined, null) };
    expect(await loadCharacterModel(FILE, { loader })).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe('instantiate', () => {
  it('gives each view its own skeleton, shadows on, culling off', async () => {
    const model = (await loadCharacterModel(FILE, {
      loader: { loadAsync: async () => fakeGltf() },
    }))!;
    const a = instantiate(model);
    const b = instantiate(model);
    const skinned = (g: typeof a): SkinnedMesh => {
      let found: SkinnedMesh | undefined;
      g.scene.traverse((o) => {
        if (o instanceof SkinnedMesh) found = o;
      });
      return found!;
    };
    expect(a.scene).not.toBe(b.scene);
    expect(skinned(a).skeleton).not.toBe(skinned(b).skeleton);
    expect(skinned(a).castShadow).toBe(true);
    expect(skinned(a).frustumCulled).toBe(false);
    expect(a.releaseAt).toBe(0.6);
    expect(a.clips).toBe(model.clips);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run tests/render/model-cache.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/render/model-cache.ts`**

```ts
import { Mesh, SkinnedMesh, type AnimationClip, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedModel {
  scene: Object3D;
  clips: AnimationClip[];
  /** Seconds into the `shoot` clip at which the ball leaves the hands (spec F.5.2). */
  releaseAt: number;
}

/** The part of a GLTFLoader result this module reads; tests fake it. */
export interface GltfLike {
  scene: Object3D;
  animations: AnimationClip[];
}

export interface ModelLoader {
  loadAsync(url: string): Promise<GltfLike>;
}

export interface LoadModelOptions {
  loader?: ModelLoader;
  /** Give up after this long and fall back to the placeholder (spec F.8.2). */
  timeoutMs?: number;
  /** Where `assets/` lives; Vite sets it, so Pages works under its sub-path (spec F.6.1). */
  baseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const cache = new Map<string, Promise<LoadedModel | null>>();

/** Forgets every loaded model (tests; a session never needs it). */
export function clearModelCache(): void {
  cache.clear();
}

function readReleaseAt(scene: Object3D): number | null {
  let found: number | null = null;
  scene.traverse((object) => {
    const value: unknown = object.userData.releaseAt;
    if (found === null && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      found = value;
    }
  });
  return found;
}

async function fetchModel(
  file: string,
  loader: ModelLoader,
  baseUrl: string,
  timeoutMs: number,
): Promise<LoadedModel> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    const gltf = await Promise.race([loader.loadAsync(`${baseUrl}assets/${file}`), timeout]);
    const releaseAt = readReleaseAt(gltf.scene);
    if (releaseAt === null) throw new Error('the model carries no releaseAt');
    return { scene: gltf.scene, clips: gltf.animations, releaseAt };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads `assets/<file>` once per session (spec F.8.3). Never rejects: a failed or slow load logs
 * one `[model] fallback to placeholder for <file>` warning and resolves null, so the match
 * can always start (spec F.8.2). The smoke test greps that prefix.
 */
export function loadCharacterModel(
  file: string,
  options: LoadModelOptions = {},
): Promise<LoadedModel | null> {
  const cached = cache.get(file);
  if (cached) return cached;
  const loader = options.loader ?? new GLTFLoader();
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
  const pending = fetchModel(file, loader, baseUrl, options.timeoutMs ?? DEFAULT_TIMEOUT_MS).catch(
    (error: unknown) => {
      console.warn('[model] fallback to placeholder for', file, error);
      return null;
    },
  );
  cache.set(file, pending);
  return pending;
}

/**
 * One instance of a loaded model for one view: the skeleton is cloned (spec F.8.3) and the meshes
 * cast shadows (F.8.4). Skinned meshes are never frustum-culled: three culls them by their
 * bind-pose bounds, which a posed character can leave.
 */
export function instantiate(model: LoadedModel): LoadedModel {
  const scene = skeletonClone(model.scene);
  scene.traverse((object) => {
    if (object instanceof Mesh || object instanceof SkinnedMesh) {
      object.castShadow = true;
      object.frustumCulled = false;
    }
  });
  return { scene, clips: model.clips, releaseAt: model.releaseAt };
}
```

- [ ] **Step 5: Run** the test — Expected: PASS (6 tests).

- [ ] **Step 6: Chunk size limit (plan decision 25)**

`GLTFLoader` and `SkeletonUtils` take the three chunk to about 630 kB, which trips the 600 kB warning in `npm run build`.

```diff
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -6,8 +6,8 @@
   build: {
     target: 'es2022',
     sourcemap: 'hidden',
-    // Three.js alone is ~540 kB minified; the app chunk stays far below this.
-    chunkSizeWarningLimit: 600,
+    // Three.js with GLTFLoader and SkeletonUtils is ~630 kB minified; the app chunk stays far below this.
+    chunkSizeWarningLimit: 700,
     rolldownOptions: {
       output: {
         // Vite 8 bundles with Rolldown: Three.js gets its own long-cacheable chunk.
```

- [ ] **Step 7: Check and commit**

```bash
npm run format && npm run check
git add -A
git commit -m "feat(render): load and cache character models with a placeholder fallback"
git push -u origin task/4-model-cache
gh pr create --title "Phase 7.4: model loading and cache" --body "Task 4 of the Phase 7 part 1 plan. Closes #<issue>."
```

Expected: `npm run check` green and no chunk-size warning in the build output.

---

## Task 5: CharacterView and MatchScreen

**Files:**
- Create: `src/render/player-ring.ts`, `src/render/player-renderable.ts`, `src/render/character-view.ts`, `tests/render/character-view.test.ts`
- Modify: `src/render/player-view.ts`, `src/app/match-screen.ts`, `tests/render/player-view.test.ts`, `tests/app/match-screen.test.ts`, `README.md` (ring sentence)

**Interfaces:**
- Consumes: `clipFor`, `resolveClip`, `runTimeScale`, `LOOPING_CLIPS`, `MOVING_SPEED`, `CANONICAL_CLIPS`, `CanonicalClip` (Task 3); `shotTimeScale`, `shootClipTime` (Task 3); `LoadedModel`, `instantiate`, `loadCharacterModel` (Task 4); `fakeGltf`, `ALL_CLIPS` (Task 4 fixtures); `CharacterDef.model` and Golden's `model` (Task 3); `PlayerState.stats.runSpeed`, `.vel`, `.action`, `.actionTicks` (`src/sim/types.ts`).
- Produces:
  - `src/render/player-ring.ts`: `brighten`, `highlightPulse`, `createRing(teamColor: number): Mesh`, `updateRing(ring: Mesh, playerY: number, pulses: boolean, tick: number): void`.
  - `src/render/player-renderable.ts`: `interface PlayerRenderable { readonly group: Group; update(prev: PlayerState, next: PlayerState, alpha: number, tick: number, hasBall: boolean, dt: number): void; dispose?(): void }`.
  - `src/render/character-view.ts`: `class CharacterView implements PlayerRenderable { constructor(model: LoadedModel, teamColor: number, pulses: boolean); readonly mixer: AnimationMixer; get currentClip(): CanonicalClip | null; get currentTimeScale(): number; actionFor(clip: CanonicalClip): AnimationAction | undefined; dispose(): void }`, `CROSSFADE_SECONDS = 0.15`.
  - `PlayerView implements PlayerRenderable`; its option `highlighted` now means "the ring pulses".
  - `MatchScreenDeps.loadModel?: (file: string) => Promise<LoadedModel | null>`; `MatchScreen.ready: Promise<void>`.

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Phase 7.5: CharacterView and MatchScreen loading" --label task,phase-7 --milestone "Phase 7 – Real models, part 1" --body "Plan: docs/superpowers/plans/2026-10-18-phase-7-golden-model.md, Task 5"
git checkout main && git pull && git checkout -b task/5-character-view
```

- [ ] **Step 2: The ring for every player — failing test**

In `tests/render/player-view.test.ts` replace the `describe('PlayerView highlight ring', …)` block (the last one) with:

```ts
describe('PlayerView ring (spec F.7.7)', () => {
  it('every player has a ring, highlighted or not', () => {
    expect(ringOf(new PlayerView(0x2f80ed, { highlighted: true }))).toBeDefined();
    expect(ringOf(new PlayerView(0x2f80ed))).toBeDefined();
  });

  it('only the highlighted player pulses; the others keep scale 1', () => {
    const human = new PlayerView(0x2f80ed, { highlighted: true });
    const other = new PlayerView(0x2f80ed);
    human.update(state(0), state(0), 1, 15);
    other.update(state(0), state(0), 1, 15);
    expect(ringOf(human)!.scale.x).toBeGreaterThan(1);
    expect(ringOf(other)!.scale.x).toBe(1);
  });

  it('keeps the ring on the floor while the player is airborne', () => {
    const view = new PlayerView(0x2f80ed);
    view.update(state(0.8), state(0.8), 1, 5);
    const ring = ringOf(view)!;
    expect(view.group.position.y).toBeCloseTo(0.8);
    expect(ring.getWorldPosition(new Vector3()).y).toBeCloseTo(0.01);
  });
});
```

Run: `npx vitest run tests/render/player-view.test.ts` — Expected: FAIL (a plain `PlayerView` has no ring yet).

- [ ] **Step 3: Extract the ring and give it to every player**

`src/render/player-ring.ts` (moves `brighten` and `highlightPulse` out of `player-view.ts`, adds the shared ring):

```ts
import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';

/** Mixes a 0xRRGGBB colour toward white by `amount` (0 = unchanged, 1 = white). */
export function brighten(color: number, amount: number): number {
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  const r = mix((color >> 16) & 0xff);
  const g = mix((color >> 8) & 0xff);
  const b = mix(color & 0xff);
  return (r << 16) | (g << 8) | b;
}

/** Scale of the highlight ring in [1, 1.1], driven by the simulation tick (period about 1 s). */
export function highlightPulse(tick: number): number {
  return 1 + 0.05 * (1 + Math.sin(tick / 10));
}

/** Spec F.7.7: the team-colour ring drawn under every player, flat on the floor. */
export function createRing(teamColor: number): Mesh {
  const ring = new Mesh(
    new RingGeometry(0.35, 0.45, 32),
    new MeshBasicMaterial({
      color: brighten(teamColor, 0.4),
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

/** Keeps the ring on the floor while the player jumps; it pulses only for the human (spec F.7.7). */
export function updateRing(ring: Mesh, playerY: number, pulses: boolean, tick: number): void {
  ring.position.y = -playerY + 0.01;
  ring.scale.setScalar(pulses ? highlightPulse(tick) : 1);
}
```

`src/render/player-renderable.ts`:

```ts
import type { Group } from 'three';
import type { PlayerState } from '../sim/types';

/** What `MatchScreen` needs from a player on screen: the placeholder and the real model share it (spec F.7.1). */
export interface PlayerRenderable {
  readonly group: Group;
  /**
   * `hasBall` is `next.ball.holder === id`; `dt` is the frame time in seconds (animation mixers
   * run on wall time, the sim state does not carry it).
   */
  update(
    prev: PlayerState,
    next: PlayerState,
    alpha: number,
    tick: number,
    hasBall: boolean,
    dt: number,
  ): void;
  /** Releases mixers and other per-view state; geometry and materials are freed with the scene. */
  dispose?(): void;
}
```

`src/render/player-view.ts` becomes (the head moves, the ring is always built, `update` is unchanged otherwise):

```ts
import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { PlayerState } from '../sim/types';
import { lerpAngle, lerpVec3 } from './interpolate';
import type { PlayerRenderable } from './player-renderable';
import { createRing, updateRing } from './player-ring';

const ARMS_UP = new Set<PlayerState['action']>(['jump', 'block', 'shoot', 'layup', 'dunk']);
const ARMS_FORWARD = new Set<PlayerState['action']>(['pass', 'steal', 'shove']);

export { brighten, highlightPulse } from './player-ring';

export interface PlayerViewOptions {
  /** The ring under the feet pulses (the human's player); every player has a ring (spec F.7.7). */
  highlighted?: boolean;
}

/**
 * Placeholder player (spec §5.5): capsule body, box head, and a cone on the front so the facing
 * direction is visible. Position and facing are interpolated between two simulation states.
 */
export class PlayerView implements PlayerRenderable {
  readonly group = new Group();
  private readonly arms: Group;
  /** Body, head, nose and arms, pivoted at the feet so the stun tilt lays the whole figure down. */
  private readonly figure = new Group();
  private readonly ring: Mesh;
  private readonly pulses: boolean;
  private tilt = 0;

  constructor(color: number, options: PlayerViewOptions = {}) {
    const body = new Mesh(
      new CapsuleGeometry(0.35, 1.0, 4, 12),
      new MeshStandardMaterial({ color }),
    );
    body.position.y = 0.85;
    body.castShadow = true;

    const head = new Mesh(
      new BoxGeometry(0.3, 0.3, 0.3),
      new MeshStandardMaterial({ color: 0xf1c27d }),
    );
    head.position.y = 1.75;
    head.castShadow = true;

    // ConeGeometry points +Y; rotate so it points +Z, which is the facing direction at yaw 0.
    const nose = new Mesh(
      new ConeGeometry(0.12, 0.3, 8),
      new MeshStandardMaterial({ color: 0xffffff }),
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.2, 0.45);

    this.arms = new Group();
    this.arms.position.y = 1.45;
    for (const side of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(0.12, 0.6, 0.12), new MeshStandardMaterial({ color }));
      arm.position.set(side * 0.42, -0.3, 0);
      arm.castShadow = true;
      this.arms.add(arm);
    }

    this.figure.add(body, head, nose, this.arms);
    this.group.add(this.figure);

    this.pulses = options.highlighted === true;
    // Child of the group, not the figure, so the stun tilt does not move it.
    this.ring = createRing(color);
    this.group.add(this.ring);
  }

  /** `hasBall` and `dt` are part of the shared interface; the placeholder ignores both. */
  update(prev: PlayerState, next: PlayerState, alpha: number, tick = 0): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = lerpAngle(prev.facing, next.facing, alpha);
    updateRing(this.ring, p.y, this.pulses, tick);
    // Negative x rotation swings the arms forward (+Z) and up.
    const target = ARMS_UP.has(next.action)
      ? -Math.PI
      : ARMS_FORWARD.has(next.action)
        ? -Math.PI / 2
        : 0;
    this.arms.rotation.x += (target - this.arms.rotation.x) * 0.25;
    const tiltTarget = next.action === 'stunned' ? 1 : next.action === 'getup' ? 0.5 : 0;
    this.tilt += (tiltTarget - this.tilt) * 0.25;
    this.figure.rotation.x = -this.tilt * (Math.PI / 2);
    this.figure.position.z = this.tilt * 0.9;
    // Lying down, the body's half-thickness would sink into the floor: lift it by about the radius.
    this.figure.position.y = this.tilt * 0.35;
  }
}
```

- [ ] **Step 4: Run** `npx vitest run tests/render/player-view.test.ts` — Expected: PASS. **Commit** `refactor(render): a team-colour ring under every player`.

- [ ] **Step 5: CharacterView — failing tests**

`tests/render/character-view.test.ts` builds states by hand and calls `update` the way `MatchScreen` does (`prev = next`, alpha 1). It runs in Node: `AnimationMixer` needs no WebGL.

```ts
import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { CharacterView } from '../../src/render/character-view';
import { instantiate, type LoadedModel } from '../../src/render/model-cache';
import { SHOT_TIMING } from '../../src/sim/shooting';
import type { PlayerAction, PlayerState } from '../../src/sim/types';
import { ALL_CLIPS, fakeGltf } from './model-fixtures';

const RELEASE_AT = 0.6;

function model(clipNames: readonly string[] = ALL_CLIPS): LoadedModel {
  const gltf = fakeGltf(clipNames, RELEASE_AT);
  return instantiate({ scene: gltf.scene, clips: gltf.animations, releaseAt: RELEASE_AT });
}

function state(over: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 'home1',
    team: 0,
    characterId: 'ace',
    pos: { x: 0, y: 0, z: 0 },
    facing: 0,
    vel: { x: 0, y: 0, z: 0 },
    action: 'idle',
    actionTicks: 0,
    stats: { runSpeed: 5 },
    ...over,
  } as unknown as PlayerState;
}

const running = (speed: number): PlayerState =>
  state({ action: 'run', vel: { x: speed, y: 0, z: 0 } });

/** One render frame at alpha 1: the view sees `next`. */
function frame(view: CharacterView, next: PlayerState, hasBall = false, dt = 0): void {
  view.update(next, next, 1, 0, hasBall, dt);
}

const ringOf = (view: CharacterView): Mesh =>
  view.group.children.find(
    (c): c is Mesh => c instanceof Mesh && c.geometry.type === 'RingGeometry',
  )!;

describe('CharacterView clip choice (spec F.7.3)', () => {
  it('idle without the ball shows idle, with the ball dribble', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state());
    expect(view.currentClip).toBe('idle');
    frame(view, state(), true);
    expect(view.currentClip).toBe('dribble');
  });

  it('moving shows run whether or not the player holds the ball', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, running(4), true);
    expect(view.currentClip).toBe('run');
    frame(view, running(4), false);
    expect(view.currentClip).toBe('run');
  });

  it.each<[PlayerAction, string]>([
    ['jump', 'jump'],
    ['block', 'jump'],
    ['shoot', 'shoot'],
    ['layup', 'shoot'],
    ['dunk', 'shoot'],
    ['pass', 'shoot'],
    ['steal', 'hit'],
    ['shove', 'hit'],
    ['stunned', 'fall'],
    ['getup', 'idle'],
  ])('action %s shows %s', (action, clip) => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action }));
    expect(view.currentClip).toBe(clip);
  });
});

describe('CharacterView timing (spec F.5.3, F.7.5)', () => {
  it('run plays at horizontal speed over runSpeed', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, running(5));
    expect(view.currentTimeScale).toBeCloseTo(1);
    frame(view, running(7.5));
    expect(view.currentTimeScale).toBeCloseTo(1.5);
  });

  it('a jump shot, layup and dunk stretch the shoot clip so it releases on the sim tick', () => {
    const scales: [PlayerAction, number][] = [
      ['shoot', RELEASE_AT / (SHOT_TIMING.jumpshot.releaseTick / 60)],
      ['layup', RELEASE_AT / (SHOT_TIMING.layup.releaseTick / 60)],
      ['dunk', RELEASE_AT / (SHOT_TIMING.dunk.releaseTick / 60)],
    ];
    for (const [action, scale] of scales) {
      const view = new CharacterView(model(), 0x2f80ed, false);
      frame(view, state({ action }), true);
      expect(view.currentClip).toBe('shoot');
      expect(view.currentTimeScale).toBeCloseTo(scale);
      expect(view.actionFor('shoot')!.time).toBe(0);
    }
  });

  it('a pass plays shoot at speed 1, starting 4 ticks before the release pose', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action: 'pass', actionTicks: 0 }), true);
    expect(view.currentClip).toBe('shoot');
    expect(view.currentTimeScale).toBe(1);
    expect(view.actionFor('shoot')!.time).toBeCloseTo(RELEASE_AT - 4 / 60);
  });

  it('an alley-oop dunk seen one tick before its release starts near the release pose', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action: 'dunk', actionTicks: SHOT_TIMING.dunk.releaseTick - 1 }), true);
    expect(view.actionFor('shoot')!.time).toBeGreaterThan(0.5);
    expect(view.actionFor('shoot')!.time).toBeLessThan(RELEASE_AT);
  });

  it('one-shot clips hold their last frame instead of looping', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    const jump = state({ action: 'jump' });
    frame(view, jump, false, 0.5);
    frame(view, jump, false, 2);
    const action = view.actionFor('jump')!;
    expect(action.time).toBeCloseTo(1);
    expect(action.clampWhenFinished).toBe(true);
    expect(action.loop).toBe(2200); // LoopOnce
  });

  it('a shot that starts again (tick counter back to 0) restarts the clip', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state({ action: 'shoot', actionTicks: 30 }), true);
    const late = view.actionFor('shoot')!.time;
    expect(late).toBeGreaterThan(0.5);
    frame(view, state({ action: 'shoot', actionTicks: 0 }), true);
    expect(view.actionFor('shoot')!.time).toBe(0);
  });

  it('looping clips are not restarted when only the action changes (run to idle while moving)', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, running(5), false, 0.3);
    const before = view.actionFor('run')!.time;
    frame(view, state({ action: 'idle', vel: { x: 5, y: 0, z: 0 } }), false, 0);
    expect(view.currentClip).toBe('run');
    expect(view.actionFor('run')!.time).toBeCloseTo(before);
  });

  it('crossfades over 0.15 s: halfway, both clips carry about half the weight', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    frame(view, state(), false, 0.016);
    frame(view, state({ action: 'stunned' }), false, 0.075);
    expect(view.currentClip).toBe('fall');
    expect(view.actionFor('fall')!.getEffectiveWeight()).toBeCloseTo(0.5, 1);
    expect(view.actionFor('idle')!.getEffectiveWeight()).toBeCloseTo(0.5, 1);
  });
});

describe('CharacterView fallbacks (spec F.7.4)', () => {
  it('a missing clip falls back to idle', () => {
    const view = new CharacterView(model(['idle', 'run']), 0x2f80ed, false);
    frame(view, state({ action: 'stunned' }));
    expect(view.currentClip).toBe('idle');
  });

  it('with no idle either the bind pose shows and nothing throws', () => {
    const view = new CharacterView(model(['run']), 0x2f80ed, false);
    expect(() => frame(view, state({ action: 'shoot' }), true, 0.016)).not.toThrow();
    expect(view.currentClip).toBeNull();
    expect(view.currentTimeScale).toBe(1);
  });

  it('a model with no clips at all and bad inputs never throw', () => {
    const view = new CharacterView(model([]), 0x2f80ed, false);
    expect(() => {
      frame(view, state(), false, Number.NaN);
      frame(view, state({ action: 'dunk' }), true, -1);
      frame(view, state({ stats: { runSpeed: 0 } as PlayerState['stats'] }), false, 0.016);
      view.dispose();
    }).not.toThrow();
  });

  it('ignores clips that are not canonical', () => {
    const view = new CharacterView(model(['idle', 'tpose']), 0x2f80ed, false);
    frame(view, state());
    expect(view.actionFor('idle')).toBeDefined();
  });
});

describe('CharacterView placement and ring (spec F.7.7)', () => {
  it('interpolates position and facing like PlayerView', () => {
    const view = new CharacterView(model(), 0x2f80ed, false);
    view.update(
      state({ pos: { x: 0, y: 0, z: 0 }, facing: 0 }),
      state({ pos: { x: 2, y: 1, z: 4 }, facing: 1 }),
      0.5,
      0,
      false,
      0,
    );
    expect(view.group.position.x).toBeCloseTo(1);
    expect(view.group.position.z).toBeCloseTo(2);
    expect(view.group.rotation.y).toBeCloseTo(0.5);
  });

  it('every view has a ring on the floor, static unless it is the human', () => {
    const other = new CharacterView(model(), 0x2f80ed, false);
    const human = new CharacterView(model(), 0x2f80ed, true);
    const airborne = state({ pos: { x: 0, y: 0.8, z: 0 } });
    for (const tick of [0, 15, 31]) {
      other.update(airborne, airborne, 1, tick, false, 0);
      human.update(airborne, airborne, 1, tick, false, 0);
    }
    expect(ringOf(other).scale.x).toBe(1);
    expect(ringOf(other).getWorldPosition(ringOf(other).position.clone()).y).toBeCloseTo(0.01);
    human.update(airborne, airborne, 1, 15, false, 0);
    expect(ringOf(human).scale.x).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 6: Run** `npx vitest run tests/render/character-view.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 7: Implement `src/render/character-view.ts`**

`select()` is the whole state machine: a looping clip is kept across action changes (idle and run actions share the clip while the player moves); a one-shot restarts when its action changes or the sim's `actionTicks` went back; a started one-shot gets its time from `shootClipTime` (so late-seen actions land right) and its speed from `shotTimeScale`; a different clip crossfades over `CROSSFADE_SECONDS`.

```ts
import {
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  SkinnedMesh,
  type AnimationAction,
  type Mesh,
  type Object3D,
} from 'three';
import type { PlayerState } from '../sim/types';
import {
  CANONICAL_CLIPS,
  clipFor,
  LOOPING_CLIPS,
  MOVING_SPEED,
  resolveClip,
  runTimeScale,
  type CanonicalClip,
} from './clip-for';
import { lerpAngle, lerpVec3 } from './interpolate';
import type { LoadedModel } from './model-cache';
import type { PlayerRenderable } from './player-renderable';
import { createRing, updateRing } from './player-ring';
import { shootClipTime, shotTimeScale } from './release-timing';

/** Spec F.7.2. */
export const CROSSFADE_SECONDS = 0.15;

/**
 * A player drawn with a real model (spec F.7): an `AnimationMixer`, one clip per state chosen by
 * `clipFor`, a team-colour ring. `model` must be its own instance (`instantiate`).
 */
export class CharacterView implements PlayerRenderable {
  readonly group = new Group();
  readonly mixer: AnimationMixer;
  private readonly ring: Mesh;
  private readonly actions = new Map<CanonicalClip, AnimationAction>();
  private readonly releaseAt: number;
  private readonly root: Object3D;
  private readonly skinned: SkinnedMesh[] = [];
  private active: { clip: CanonicalClip; key: string; ticks: number } | null = null;

  constructor(
    model: LoadedModel,
    teamColor: number,
    private readonly pulses: boolean,
  ) {
    this.releaseAt = model.releaseAt;
    this.root = model.scene;
    this.group.add(this.root);
    this.root.traverse((o) => {
      if (o instanceof SkinnedMesh) this.skinned.push(o);
    });
    this.mixer = new AnimationMixer(this.root);
    for (const clip of model.clips) {
      const name = CANONICAL_CLIPS.find((c) => c === clip.name);
      if (name) this.actions.set(name, this.mixer.clipAction(clip));
    }
    // Child of the group, beside the model, so the ring never plays an animation.
    this.ring = createRing(teamColor);
    this.group.add(this.ring);
  }

  /** The canonical clip showing now, or null in the bind pose. */
  get currentClip(): CanonicalClip | null {
    return this.active?.clip ?? null;
  }

  /** The action of a canonical clip, or undefined when the model lacks it. */
  actionFor(clip: CanonicalClip): AnimationAction | undefined {
    return this.actions.get(clip);
  }

  /** Playback speed of the clip showing now (1 in the bind pose). */
  get currentTimeScale(): number {
    return this.active ? (this.actions.get(this.active.clip)?.timeScale ?? 1) : 1;
  }

  update(
    prev: PlayerState,
    next: PlayerState,
    alpha: number,
    tick: number,
    hasBall: boolean,
    dt: number,
  ): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = lerpAngle(prev.facing, next.facing, alpha);
    updateRing(this.ring, p.y, this.pulses, tick);

    const speed = Math.hypot(next.vel.x, next.vel.z);
    const wanted = clipFor(next.action, speed > MOVING_SPEED, hasBall);
    this.select(resolveClip(wanted, new Set(this.actions.keys())), next);
    const action = this.active ? this.actions.get(this.active.clip) : undefined;
    if (action && this.active?.clip === 'run')
      action.timeScale = runTimeScale(speed, next.stats.runSpeed);
    this.mixer.update(Number.isFinite(dt) && dt > 0 ? dt : 0);
  }

  /** Starts `clip` (crossfading from the one showing) when the state changed; leaves it running otherwise. */
  private select(clip: CanonicalClip | null, next: PlayerState): void {
    if (clip === null) {
      if (this.active) this.mixer.stopAllAction();
      this.active = null;
      return;
    }
    const looping = LOOPING_CLIPS.has(clip);
    // A looping clip keeps going across action changes (idle <-> run action, same clip); a
    // one-shot restarts whenever the action changes or its tick counter went back to the start.
    const key = looping ? clip : `${clip}|${next.action}`;
    const previous = this.active;
    const restarted = previous !== null && !looping && next.actionTicks < previous.ticks;
    if (previous?.key === key && !restarted) {
      previous.ticks = next.actionTicks;
      return;
    }
    const to = this.actions.get(clip);
    if (!to) return;
    const from = previous ? this.actions.get(previous.clip) : undefined;
    to.reset();
    to.enabled = true;
    to.setEffectiveWeight(1);
    if (looping) {
      to.setLoop(LoopRepeat, Infinity);
      to.timeScale = 1;
    } else {
      to.setLoop(LoopOnce, 1);
      to.clampWhenFinished = true;
      to.timeScale = clip === 'shoot' ? shotTimeScale(next.action, this.releaseAt) : 1;
      if (clip === 'shoot') to.time = shootClipTime(next.action, next.actionTicks, this.releaseAt);
    }
    if (from && from !== to) {
      to.fadeIn(CROSSFADE_SECONDS);
      from.fadeOut(CROSSFADE_SECONDS);
    }
    to.play();
    this.active = { clip, key, ticks: next.actionTicks };
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const mesh of this.skinned) mesh.skeleton.dispose();
  }
}
```

- [ ] **Step 8: Run** the test — Expected: PASS (26 tests). **Commit** `feat(render): CharacterView plays the clip for each sim state`.

- [ ] **Step 9: MatchScreen — update the existing tests and add the new ones (failing)**

The constructor is now asynchronous in effect, so the existing tests `await screen.ready`, and a fake `loadModel` replaces the real loader (without it, a default match would try to fetch Golden's GLB, which is a teammate by default). Apply this diff to `tests/app/match-screen.test.ts`:

```diff
--- a/tests/app/match-screen.test.ts
+++ b/tests/app/match-screen.test.ts
@@ -1,8 +1,11 @@
 // @vitest-environment jsdom
+import { SkinnedMesh, type Object3D } from 'three';
 import { afterEach, describe, expect, it, vi } from 'vitest';
 import { MatchRunner } from '../../src/app/match-runner';
 import { readGameOptions } from '../../src/app/url-options';
+import type { LoadedModel } from '../../src/render/model-cache';
 import { findPlayer } from '../../src/sim/match';
+import { fakeGltf } from '../render/model-fixtures';
 
 /** The loop callbacks the MatchScreen registered, so a test can drive ticks by hand. */
 const loops: { onTick(): void; onRender(alpha: number, frameMs: number): void }[] = [];
@@ -23,12 +26,17 @@
     }
   },
 }));
+/** The scenes the MatchScreen created, so a test can look at what was added to them. */
+const scenes = vi.hoisted(() => [] as { scene: Object3D }[]);
 vi.mock('../../src/render/scene', async () => {
   const { Scene, PerspectiveCamera } = await import('three');
   return {
     GameScene: class {
       scene = new Scene();
       camera = new PerspectiveCamera();
+      constructor() {
+        scenes.push(this);
+      }
       setBackground(): void {}
       resize(): void {}
       render(): void {}
@@ -42,9 +50,14 @@
 const sink = { playSfx() {}, setMusic() {}, duck() {}, setEnabled() {} };
 const settings = { sound: true, music: true, vibration: false, reduceMotion: false };
 
-function mount(
+/** Mounts a MatchScreen; by default no model loads, so every player is a placeholder. */
+async function mount(
   options = readGameOptions('?seed=5', 0),
-  extra: { onFinished?: (r: unknown) => void } = {},
+  extra: {
+    onFinished?: (r: unknown) => void;
+    loadModel?: (file: string) => Promise<LoadedModel | null>;
+    wait?: boolean;
+  } = {},
 ) {
   const root = document.createElement('div');
   document.body.append(root);
@@ -56,10 +69,24 @@
     onQuit: vi.fn(),
     onSettingsChange: vi.fn(),
     sink: () => sink,
+    loadModel: extra.loadModel ?? (async () => null),
   });
+  if (extra.wait !== false) await screen.ready;
   return { root, screen, loop: loops.at(-1)! };
 }
 
+const fakeModel = (): LoadedModel => {
+  const gltf = fakeGltf();
+  return { scene: gltf.scene, clips: gltf.animations, releaseAt: 0.6 };
+};
+const skinnedMeshes = (): number => {
+  let n = 0;
+  scenes.at(-1)!.scene.traverse((o) => {
+    if (o instanceof SkinnedMesh) n += 1;
+  });
+  return n;
+};
+
 afterEach(() => {
   vi.restoreAllMocks();
   document.body.replaceChildren();
@@ -74,7 +101,7 @@
     },
   );
 
-  it('a button held when the match starts is not a press on the first tick (spec D.6)', () => {
+  it('a button held when the match starts is not a press on the first tick (spec D.6)', async () => {
     const buttons = Array.from({ length: 17 }, (_, i) => ({
       pressed: i === 0,
       touched: false,
@@ -89,14 +116,14 @@
       heldBeforeFirstStep ??= findPlayer(this.current, 'home1')?.prevButtons.action;
       return step.call(this, i);
     });
-    const { screen, loop } = mount();
+    const { screen, loop } = await mount();
     loop.onTick();
     expect(heldBeforeFirstStep).toBe(true);
     screen.dispose();
     vi.unstubAllGlobals();
   });
 
-  it('after Pause → Restart the finished result carries the restarted seed (M1)', () => {
+  it('after Pause → Restart the finished result carries the restarted seed (M1)', async () => {
     vi.stubGlobal(
       'ResizeObserver',
       class {
@@ -108,7 +135,7 @@
     vi.spyOn(performance, 'now').mockImplementation(() => now);
     const onFinished = vi.fn();
     const options = { ...readGameOptions('?seed=5', 0), durationMs: 500 };
-    const { root, screen, loop } = mount(options, { onFinished });
+    const { root, screen, loop } = await mount(options, { onFinished });
     screen.pause();
     root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.click();
     for (let i = 0; i < 5000 && !onFinished.mock.calls.length; i++) {
@@ -120,4 +147,87 @@
     expect(onFinished.mock.calls[0]?.[0].options.seed).toBe(6);
     screen.dispose();
   });
+
+  describe('loading (spec F.8)', () => {
+    it('shows a Loading line at once and replaces it with the match when the models are in', async () => {
+      let release!: (m: LoadedModel | null) => void;
+      const loadModel = () => new Promise<LoadedModel | null>((resolve) => (release = resolve));
+      const { root, screen } = await mount(readGameOptions('?seed=5&teammate=ace', 0), {
+        loadModel,
+        wait: false,
+      });
+      expect(root.textContent).toContain('Loading');
+      expect(root.querySelector('canvas')).toBeNull();
+      release(fakeModel());
+      await screen.ready;
+      expect(root.textContent).not.toContain('Loading');
+      expect(root.querySelector('canvas')).not.toBeNull();
+      screen.dispose();
+    });
+
+    it('asks for each distinct model once, even when the character is picked four times', async () => {
+      const loadModel = vi.fn(async () => fakeModel());
+      const options = readGameOptions('?seed=5&character=ace&teammate=ace&opponents=ace,ace', 0);
+      const { screen } = await mount(options, { loadModel });
+      expect(loadModel).toHaveBeenCalledTimes(1);
+      expect(loadModel).toHaveBeenCalledWith('characters/ace.glb');
+      screen.dispose();
+    });
+
+    it('builds a CharacterView per player of a character whose model loaded, placeholders for the rest', async () => {
+      const options = readGameOptions('?seed=5&character=ace&teammate=rook&opponents=ace,brick', 0);
+      const { screen } = await mount(options, { loadModel: async () => fakeModel() });
+      expect(skinnedMeshes()).toBe(2); // home1 and away1 are Golden; rook and brick have no model
+      screen.dispose();
+    });
+
+    it('falls back to placeholders and still starts when the model fails to load', async () => {
+      const options = readGameOptions('?seed=5&character=ace', 0);
+      const { screen, loop } = await mount(options, { loadModel: async () => null });
+      expect(skinnedMeshes()).toBe(0);
+      expect(() => {
+        loop.onTick();
+        loop.onRender(0.5, 16);
+      }).not.toThrow();
+      screen.dispose();
+    });
+
+    it('falls back to placeholders, with one warning, when an injected loader rejects', async () => {
+      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
+      const options = readGameOptions('?seed=5&character=ace', 0);
+      const { screen } = await mount(options, {
+        loadModel: () => Promise.reject(new Error('404')),
+      });
+      expect(skinnedMeshes()).toBe(0);
+      expect(warn).toHaveBeenCalledTimes(1);
+      expect(warn.mock.calls[0]?.[0]).toBe('[model] fallback to placeholder for');
+      screen.dispose();
+    });
+
+    it('renders model players for a few ticks without throwing, then disposes cleanly', async () => {
+      const options = readGameOptions('?seed=5&character=ace&teammate=ace', 0);
+      const { screen, loop } = await mount(options, { loadModel: async () => fakeModel() });
+      for (let i = 0; i < 30; i++) {
+        loop.onTick();
+        loop.onRender(0.5, 16);
+      }
+      expect(() => screen.dispose()).not.toThrow();
+    });
+
+    it('a screen disposed while loading never builds', async () => {
+      let release!: (m: LoadedModel | null) => void;
+      const loadModel = () => new Promise<LoadedModel | null>((resolve) => (release = resolve));
+      const before = loops.length;
+      const { root, screen } = await mount(readGameOptions('?seed=5&character=ace', 0), {
+        loadModel,
+        wait: false,
+      });
+      screen.dispose();
+      release(fakeModel());
+      await screen.ready;
+      expect(loops.length).toBe(before);
+      expect(root.querySelector('.match-screen')).toBeNull();
+      expect(() => screen.pause()).not.toThrow();
+    });
+  });
 });
```

Run: `npx vitest run tests/app/match-screen.test.ts` — Expected: FAIL (`ready` and `loadModel` do not exist; no Loading line).

- [ ] **Step 10: Implement the MatchScreen change**

Apply this diff to `src/app/match-screen.ts`. What it does, in order: new imports; `loadModel` dep; fields that `build()` assigns become definite-assignment; the constructor mounts the container and the Loading line and starts `start()`; `loadModels()` asks for each distinct character's model once (a rejecting loader counts as a failed load, plan decision 30); `build()` is the old constructor body, choosing `CharacterView` or `PlayerView` per player and passing `hasBall` and `dt`; `pause()` and `dispose()` are guarded by `built`; `dispose()` disposes the views' mixers.

```diff
--- a/src/app/match-screen.ts
+++ b/src/app/match-screen.ts
@@ -25,6 +25,9 @@
 import { effectsFor, type EffectCommand } from '../render/effects-map';
 import { EffectsView } from '../render/effects-view';
 import { lerpVec3 } from '../render/interpolate';
+import { CharacterView } from '../render/character-view';
+import { instantiate, loadCharacterModel, type LoadedModel } from '../render/model-cache';
+import type { PlayerRenderable } from '../render/player-renderable';
 import { PlayerView } from '../render/player-view';
 import { GameScene } from '../render/scene';
 import { WeatherView } from '../render/weather-view';
@@ -50,6 +53,8 @@
   onSettingsChange(settings: Settings): void;
   /** The shell's current sink; it may swap from null to the real engine after the first gesture. */
   sink: () => AudioSink;
+  /** Loads a character model; the default is the cached GLTF loader. Tests pass a fake (spec F.8). */
+  loadModel?: (file: string) => Promise<LoadedModel | null>;
 }
 
 /**
@@ -63,28 +68,77 @@
 /** One match on screen: sim, views, HUD, input and the pause overlay (spec E.1). */
 export class MatchScreen {
   private readonly container: HTMLDivElement;
-  private readonly scene: GameScene;
-  private readonly input: InputManager;
-  private readonly hud: Hud;
-  private readonly overlay: DebugOverlay | null;
-  private readonly loop: GameLoop;
-  private readonly observer: ResizeObserver;
-  private readonly onFirstTouch: (e: PointerEvent) => void;
-  private readonly onVisibilityChange: () => void;
-  private readonly broadcastCamera: BroadcastCamera;
+  private readonly loadingLine: HTMLDivElement;
+  // Everything below is created by build() once the models are in; `built` guards the public methods.
+  private scene!: GameScene;
+  private input!: InputManager;
+  private hud!: Hud;
+  private overlay: DebugOverlay | null = null;
+  private loop!: GameLoop;
+  private observer!: ResizeObserver;
+  private onFirstTouch!: (e: PointerEvent) => void;
+  private onVisibilityChange!: () => void;
+  private broadcastCamera!: BroadcastCamera;
+  private views = new Map<PlayerId, PlayerRenderable>();
+  private built = false;
+  /** Resolves when the match is on screen (models loaded, loop started) or the screen was disposed first. */
+  readonly ready: Promise<void>;
   private pauseOverlay: PauseOverlay | null = null;
   private settings: Settings;
   private finishedAt: number | null = null;
   private done = false;
   private disposed = false;
 
+  /** Synchronous (spec F.8.1): shows a Loading line, then `build()` runs when the models are in. */
   constructor(private readonly deps: MatchScreenDeps) {
-    const { options } = deps;
     this.settings = deps.settings;
     this.container = document.createElement('div');
     this.container.className = 'match-screen';
     this.container.style.cssText = 'position:fixed;inset:0;';
     deps.root.appendChild(this.container);
+    this.loadingLine = document.createElement('div');
+    this.loadingLine.className = 'match-loading';
+    this.loadingLine.textContent = 'Loading…';
+    this.loadingLine.style.cssText =
+      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
+      'background:#0b1020;color:#fff;font:600 20px system-ui,sans-serif;letter-spacing:0.1em;';
+    this.container.appendChild(this.loadingLine);
+    this.ready = this.start();
+    // The shell does not await `ready`: report a failed start instead of losing it.
+    this.ready.catch((error: unknown) => console.error('[match] failed to start', error));
+  }
+
+  private async start(): Promise<void> {
+    const models = await this.loadModels();
+    this.loadingLine.remove();
+    if (!this.disposed) this.build(models);
+  }
+
+  /** One load per distinct character with a model (spec F.8.1); a failed load is a missing entry. */
+  private async loadModels(): Promise<Map<string, LoadedModel>> {
+    const load = this.deps.loadModel ?? ((file: string) => loadCharacterModel(file));
+    const ids = new Set(buildRoster(this.deps.options).map((entry) => entry.characterId));
+    const loaded = await Promise.all(
+      [...ids].map(async (id) => {
+        const file = getCharacter(id).model?.file;
+        if (!file) return [id, null] as const;
+        // loadCharacterModel never rejects, but an injected loader may: the match must still start.
+        const model = await load(file).catch((error: unknown) => {
+          console.warn('[model] fallback to placeholder for', file, error);
+          return null;
+        });
+        return [id, model] as const;
+      }),
+    );
+    const models = new Map<string, LoadedModel>();
+    for (const [id, model] of loaded) if (model) models.set(id, model);
+    return models;
+  }
+
+  /** The old constructor body: scene, views, HUD, input and loop. */
+  private build(models: ReadonlyMap<string, LoadedModel>): void {
+    const { deps } = this;
+    const { options } = deps;
     const container = this.container;
 
     const canvas = document.createElement('canvas');
@@ -113,13 +167,15 @@
     let session = buildSession(options, court, seed, human);
 
     // Views are keyed by player id; the roster is the same on every restart, so they are built once.
-    const playerViews = new Map<PlayerId, PlayerView>();
+    const playerViews = this.views;
     const abilityFxViews = new Map<PlayerId, AbilityFxView>();
     for (const team of session.runner.current.teams) {
       for (const player of team.players) {
-        const view = new PlayerView(TEAM_COLORS[player.team], {
-          highlighted: player.id === HUMAN_ID,
-        });
+        const isHuman = player.id === HUMAN_ID;
+        const model = models.get(player.characterId);
+        const view: PlayerRenderable = model
+          ? new CharacterView(instantiate(model), TEAM_COLORS[player.team], isHuman)
+          : new PlayerView(TEAM_COLORS[player.team], { highlighted: isHuman });
         scene.scene.add(view.group);
         playerViews.set(player.id, view);
         const abilityFx = new AbilityFxView();
@@ -263,7 +319,7 @@
           const a = findPlayer(prev, id);
           const b = findPlayer(next, id);
           if (a && b) {
-            view.update(a, b, alpha, next.tick);
+            view.update(a, b, alpha, next.tick, next.ball.holder === id, dt);
             fxPos.x = a.pos.x + (b.pos.x - a.pos.x) * alpha;
             fxPos.y = a.pos.y + (b.pos.y - a.pos.y) * alpha;
             fxPos.z = a.pos.z + (b.pos.z - a.pos.z) * alpha;
@@ -344,11 +400,12 @@
     document.addEventListener('visibilitychange', this.onVisibilityChange);
     // Buttons held at tip-off (A on START/REMATCH, a repeating Space) are not presses (spec D.6).
     this.prime.request();
+    this.built = true;
     this.loop.start();
   }
 
-  private restartMatch: () => void;
-  private primeHuman: () => void;
+  private restartMatch!: () => void;
+  private primeHuman!: () => void;
   private readonly prime = new PendingPrime();
 
   get paused(): boolean {
@@ -356,7 +413,7 @@
   }
 
   pause(): void {
-    if (this.disposed || this.done || this.pauseOverlay) return;
+    if (!this.built || this.disposed || this.done || this.pauseOverlay) return;
     this.loop.stop();
     this.deps.sink().setMusic(null);
     this.pauseOverlay = new PauseOverlay(this.container, {
@@ -393,6 +450,10 @@
   dispose(): void {
     if (this.disposed) return;
     this.disposed = true;
+    if (!this.built) {
+      this.container.remove();
+      return;
+    }
     this.loop.stop();
     document.removeEventListener('visibilitychange', this.onVisibilityChange);
     this.container.removeEventListener('pointerdown', this.onFirstTouch);
@@ -402,6 +463,7 @@
     this.hud.dispose();
     this.overlay?.dispose();
     this.input.dispose();
+    for (const view of this.views.values()) view.dispose?.();
     disposeObject3D(this.scene.scene);
     this.scene.dispose();
     this.container.remove();
```

- [ ] **Step 11: Run** `npx vitest run tests/app tests/render tests/ui` — Expected: PASS. Then `npx tsc -p tsconfig.json --noEmit` — Expected: no output.

- [ ] **Step 12: README**

In `README.md` replace `Your player has a pulsing ring under its feet in your team colour.` with:

```
Every player has a ring under the feet in their team colour; yours pulses.
```

- [ ] **Step 13: Whole check and the browser check**

```bash
npm run format && npm run check
npm run build && npm run smoke
git diff origin/main --stat -- src/sim src/content
```

Expected: all green; `src/sim` and `src/content` absent from the stat (they changed in Task 3). The controller runs the browser check described in "Execution process" (Golden visible with the blue pulsing ring when it is your player, static rings on the others, no placeholder capsule for Golden, capsules for the rest).

- [ ] **Step 14: Commit and PR**

```bash
git add -A
git commit -m "feat(render): CharacterView, loading state and model views in MatchScreen"
git push -u origin task/5-character-view
gh pr create --title "Phase 7.5: CharacterView and MatchScreen loading" --body "Task 5 of the Phase 7 part 1 plan. Closes #<issue>."
```

---

## Task 6: Smoke test and CI

**Files:**
- Modify: `scripts/smoke.mjs`
- (No change to `.github/workflows/ci.yml`: it already runs `npm run build`, then `npm run smoke`, then `npm test`; `vite build` copies `public/assets` into `dist`, and `vite preview` serves `dist`.)

**Interfaces:**
- Consumes: Golden's committed GLB (Task 2), the model loading and `.hud` appearing only after the models are in (Tasks 4–5), the `[model] fallback to placeholder for` warning prefix (Task 4), the `?character=ace` URL parameter (existing).
- Produces: a smoke test that fails when Golden's model is not served, is fetched with a non-200 status, falls back to the placeholder, or when the console has errors while Golden runs and shoots.

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Phase 7.6: smoke test for the model" --label task,phase-7 --milestone "Phase 7 – Real models, part 1" --body "Plan: docs/superpowers/plans/2026-10-18-phase-7-golden-model.md, Task 6"
git checkout main && git pull && git checkout -b task/6-smoke-ci
```

- [ ] **Step 2: See the current smoke test pass on the built app**

```bash
npm run build && npm run smoke
```

Expected: `smoke: ok` (the default match already has Golden as the teammate, so it loads the model without asserting anything about it).

- [ ] **Step 3: Make it fail, then pass: edit `scripts/smoke.mjs`**

Apply this diff. It adds, in order: a `warnings` list and a `models` list (every `.glb` response); `checkModelIsServed()` (real GLB bytes, because `vite preview` answers unknown paths with `index.html` and status 200); a Golden step (`?character=ace`, wait for `.hud`, which only exists after the models loaded, run right, shoot) and the assertions that the GLB came back 200, that no `[model] fallback` warning was logged and, as before, that no console error was.

```diff
--- a/scripts/smoke.mjs
+++ b/scripts/smoke.mjs
@@ -10,6 +10,9 @@
   { stdio: 'pipe' },
 );
 const errors = [];
+const warnings = [];
+/** Every .glb the page fetched, with its status (spec F.10.3). */
+const models = [];
 let browser;
 
 // Whole-run watchdog: nothing may hang CI. unref'd, so it never keeps a finished run alive.
@@ -31,8 +34,20 @@
   throw new Error('vite preview did not start');
 }
 
+/** vite preview falls back to index.html for unknown paths, so check the bytes, not the status. */
+async function checkModelIsServed() {
+  const response = await fetch(`${BASE}assets/characters/ace.glb`);
+  const bytes = Buffer.from(await response.arrayBuffer());
+  if (!response.ok || bytes.length < 100_000 || bytes.subarray(0, 4).toString() !== 'glTF') {
+    throw new Error(
+      `assets/characters/ace.glb is not served as a GLB (status ${response.status}, ${bytes.length} bytes)`,
+    );
+  }
+}
+
 async function run() {
   await waitForServer();
+  await checkModelIsServed();
   browser = await chromium.launch({
     args: [
       '--use-gl=swiftshader',
@@ -41,7 +56,14 @@
     ],
   });
   const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
-  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
+  page.on('console', (m) => {
+    if (m.type() === 'error') errors.push(m.text());
+    if (m.type() === 'warning') warnings.push(m.text());
+  });
+  page.on(
+    'response',
+    (r) => r.url().endsWith('.glb') && models.push({ url: r.url(), status: r.status() }),
+  );
   page.on('pageerror', (e) => errors.push(String(e)));
 
   // Menus path: Title → Setup → START by keyboard → match → pause/resume → Results.
@@ -69,6 +91,22 @@
   await page.click('[data-action="rematch"]', { force: true });
   await page.waitForSelector('.hud');
 
+  // Golden (id ace) is a real model: it must load, animate under input (run right, then the action
+  // button: a shot if Golden has the ball, a jump otherwise), and never fall back (spec F.8.2).
+  await page.goto(`${BASE}?character=ace&seed=2`);
+  await page.waitForSelector('.hud');
+  await page.keyboard.down('d');
+  await page.waitForTimeout(800);
+  await page.keyboard.up('d');
+  await page.keyboard.press('Space');
+  await page.waitForTimeout(1500);
+  if (!models.some((m) => m.url.endsWith('/assets/characters/ace.glb') && m.status === 200)) {
+    throw new Error(`Golden's model was not fetched: ${JSON.stringify(models)}`);
+  }
+  const fallbacks = warnings.filter((w) => w.includes('[model] fallback'));
+  if (fallbacks.length)
+    throw new Error(`model fell back to a placeholder:\n${fallbacks.join('\n')}`);
+
   if (errors.length) throw new Error(`console errors:\n${errors.join('\n')}`);
   console.log('smoke: ok');
 }
```

To see the new assertions bite, temporarily rename the file and run the smoke test:

```bash
mv dist/assets/characters/ace.glb dist/assets/characters/ace.glb.off && npm run smoke; mv dist/assets/characters/ace.glb.off dist/assets/characters/ace.glb
```

Expected: FAIL with `assets/characters/ace.glb is not served as a GLB`. Then `npm run build && npm run smoke` — Expected: `smoke: ok`.

- [ ] **Step 4: Full check**

```bash
npm run format && npm run check
```

Expected: green. (`npm run check` is browser-free by design, E.7; the smoke test runs in CI as its own step.)

- [ ] **Step 5: Commit and PR**

```bash
git add scripts/smoke.mjs
git commit -m "test(smoke): Golden's model is served, loads without fallback and animates without errors"
git push -u origin task/6-smoke-ci
gh pr create --title "Phase 7.6: smoke test for the model" --body "Task 6 of the Phase 7 part 1 plan. Closes #<issue>."
```

- [ ] **Step 6: Manual step for Fabio (not for the implementer)**

On the tablet, open the preview URL with `?character=ace` and play a full match: check the frame rate (the match must hold 60 fps; a drop is the cue to lower `GameScene.renderScale`, spec §7.3), the Loading line, and by eye: Golden idles, dribbles, runs at a speed that matches her feet, the shot's ball leaves her hands when she lets go, the fall does not sink into the floor, and a layup does not look rushed (decision 28). Findings go to the epic as part 2 input.

---

## Task 7 (optional, last): Setup card preview

> **May be moved to part 2 by the lead** (F.9: "if the phase runs long the lead may move it to part 2, and the cards stay DOM-only until then"). Everything above works without it.

**Files:**
- Create: `src/render/character-preview.ts`, `tests/render/character-preview.test.ts`
- Modify: `src/ui/screens/setup.ts`, `src/ui/screens/setup.css`, `src/app/setup-model.ts`, `src/app.ts`, `tests/ui/screens/setup.test.ts`

**Interfaces:**
- Consumes: `loadCharacterModel`, `instantiate`, `LoadedModel` (Task 4), `fakeGltf` (Task 4 fixtures), `CharacterDef.model` (Task 3).
- Produces: `createCharacterPreview(canvas: HTMLCanvasElement, file: string, deps?: PreviewDeps): PreviewHandle` and `previewDistance(height: number, fov?: number): number` in `src/render/character-preview.ts`; `SetupCatalog.characters[].modelFile?: string`; `SetupOptions.createPreview?: (canvas: HTMLCanvasElement, modelFile: string) => PreviewHandle` (`PreviewHandle = { dispose(): void }`).

- [ ] **Step 1: Issue and branch**

```bash
gh issue create --title "Phase 7.7: setup card preview" --label task,phase-7 --milestone "Phase 7 – Real models, part 1" --body "Plan: docs/superpowers/plans/2026-10-18-phase-7-golden-model.md, Task 7 (optional)"
git checkout main && git pull && git checkout -b task/7-setup-preview
```

- [ ] **Step 2: The preview — failing test**

`tests/render/character-preview.test.ts` (jsdom; the renderer and the loader are injected, so no WebGL is needed; `requestAnimationFrame` is stubbed):

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharacterPreview, previewDistance } from '../../src/render/character-preview';
import type { LoadedModel } from '../../src/render/model-cache';
import { fakeGltf } from './model-fixtures';

const fakeModel = (): LoadedModel => {
  const gltf = fakeGltf();
  return { scene: gltf.scene, clips: gltf.animations, releaseAt: 0.6 };
};

function fakeRenderer() {
  return {
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
let canvas: HTMLCanvasElement;

beforeEach(() => {
  canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 128;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 7),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('previewDistance', () => {
  it('puts the model at 1/1.1 of the view height', () => {
    const d = previewDistance(1.8, 30);
    const visible = 2 * d * Math.tan((30 * Math.PI) / 360);
    expect(1.8 / visible).toBeCloseTo(1 / 1.1, 5);
  });
});

describe('createCharacterPreview (spec F.9)', () => {
  it('renders the model and keeps drawing frames', async () => {
    const renderer = fakeRenderer();
    createCharacterPreview(canvas, 'characters/ace.glb', {
      loadModel: async () => fakeModel(),
      createRenderer: () => renderer,
    });
    await flush();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.setSize).toHaveBeenCalledWith(96, 128, false);
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(canvas.hidden).toBe(false);
  });

  it('hides the canvas when the model is missing, without creating a renderer', async () => {
    const createRenderer = vi.fn(() => fakeRenderer());
    createCharacterPreview(canvas, 'characters/ace.glb', {
      loadModel: async () => null,
      createRenderer,
    });
    await flush();
    expect(canvas.hidden).toBe(true);
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it('hides the canvas when the load throws or WebGL is unavailable', async () => {
    createCharacterPreview(canvas, 'a', {
      loadModel: async () => Promise.reject(new Error('boom')),
    });
    await flush();
    expect(canvas.hidden).toBe(true);

    const second = document.createElement('canvas');
    createCharacterPreview(second, 'a', {
      loadModel: async () => fakeModel(),
      createRenderer: () => null,
    });
    await flush();
    expect(second.hidden).toBe(true);
  });

  it('a preview disposed while loading never renders', async () => {
    const renderer = fakeRenderer();
    const createRenderer = vi.fn(() => renderer);
    const handle = createCharacterPreview(canvas, 'a', {
      loadModel: async () => fakeModel(),
      createRenderer,
    });
    handle.dispose();
    await flush();
    expect(createRenderer).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('dispose stops the loop and frees the context', async () => {
    const renderer = fakeRenderer();
    const handle = createCharacterPreview(canvas, 'a', {
      loadModel: async () => fakeModel(),
      createRenderer: () => renderer,
    });
    await flush();
    handle.dispose();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(renderer.dispose).toHaveBeenCalled();
    expect(renderer.forceContextLoss).toHaveBeenCalled();
    expect(() => handle.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run tests/render/character-preview.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/render/character-preview.ts`**

It loads the model through the shared cache, draws it on the given canvas in its idle clip, and hides the canvas (never throws) when there is no model, no WebGL, or the load fails.

```ts
import {
  AmbientLight,
  AnimationMixer,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { instantiate, loadCharacterModel, type LoadedModel } from './model-cache';

export interface PreviewHandle {
  dispose(): void;
}

type PreviewRenderer = Pick<
  WebGLRenderer,
  'render' | 'setSize' | 'setPixelRatio' | 'dispose' | 'forceContextLoss'
>;

export interface PreviewDeps {
  loadModel?: (file: string) => Promise<LoadedModel | null>;
  /** Returns null when WebGL is unavailable. Tests pass a fake. */
  createRenderer?: (canvas: HTMLCanvasElement) => PreviewRenderer | null;
}

const FOV = 30;
/** The model fills this share of the canvas height. */
const FILL = 1 / 1.1;

/** Camera distance at which an object `height` metres tall fills `FILL` of a `fov`-degree view. */
export function previewDistance(height: number, fov: number = FOV): number {
  return height / FILL / (2 * Math.tan((fov * Math.PI) / 360));
}

function defaultRenderer(canvas: HTMLCanvasElement): PreviewRenderer | null {
  try {
    return new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
}

/**
 * Spec F.9: a small canvas showing a character's model in its idle clip. It never throws and
 * never blocks the menu: with no model, no WebGL or a failed load the canvas is hidden.
 * One preview owns one WebGL context, so callers keep the number of previews small.
 */
export function createCharacterPreview(
  canvas: HTMLCanvasElement,
  file: string,
  deps: PreviewDeps = {},
): PreviewHandle {
  let disposed = false;
  let frame = 0;
  let renderer: PreviewRenderer | null = null;
  let mixer: AnimationMixer | null = null;
  let root: LoadedModel['scene'] | null = null;

  const start = async (): Promise<void> => {
    let model: LoadedModel | null;
    try {
      model = await (deps.loadModel ?? ((f: string) => loadCharacterModel(f)))(file);
    } catch {
      model = null;
    }
    if (disposed) return;
    renderer = model ? (deps.createRenderer ?? defaultRenderer)(canvas) : null;
    if (!model || !renderer) {
      canvas.hidden = true;
      return;
    }

    const instance = instantiate(model);
    root = instance.scene;
    const scene = new Scene();
    scene.add(root, new AmbientLight(0xffffff, 1.6));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);

    const height = Math.max(new Box3().setFromObject(root).getSize(new Vector3()).y, 0.5);
    const camera = new PerspectiveCamera(FOV, canvas.width / canvas.height, 0.1, 50);
    camera.position.set(0, height / 2, previewDistance(height));
    camera.lookAt(0, height / 2, 0);
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);

    mixer = new AnimationMixer(root);
    const idle = instance.clips.find((c) => c.name === 'idle');
    if (idle) mixer.clipAction(idle).play();

    let last: number | null = null;
    const tick = (now: number): void => {
      if (disposed || !renderer) return;
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      mixer?.update(dt);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick(0);
  };
  void start();

  return {
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(frame);
      if (mixer && root) {
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
      }
      renderer?.dispose();
      renderer?.forceContextLoss();
    },
  };
}
```

- [ ] **Step 5: Run** the test — Expected: PASS (6 tests). **Commit** `feat(render): character preview canvas`.

- [ ] **Step 6: Setup screen — failing tests**

Append to `tests/ui/screens/setup.test.ts` (a new `describe` at the end of the file):

```ts
describe('SetupScreen character previews (spec F.9)', () => {
  function makeWithPreview() {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const handle = { dispose: vi.fn() };
    const createPreview = vi.fn(() => handle);
    const screen = new SetupScreen(root, {
      setup: { ...DEFAULT_SETUP },
      catalog: buildSetupCatalog(),
      createPreview,
      onStart: vi.fn(),
      onBack: vi.fn(),
    });
    return { root, screen, createPreview, handle };
  }

  it('gives a canvas to the YOU card of a character with a model, and to no other card', () => {
    const { root, createPreview } = makeWithPreview();
    const canvases = root.querySelectorAll('canvas.setup-preview');
    expect(canvases).toHaveLength(1);
    expect(root.querySelector('[data-field="characterId"][data-value="ace"] canvas')).toBe(
      canvases[0],
    );
    expect(root.querySelector('[data-field="teammateId"] canvas')).toBeNull();
    expect(createPreview).toHaveBeenCalledOnce();
    expect(createPreview).toHaveBeenCalledWith(canvases[0], 'characters/ace.glb');
  });

  it('disposes the previews with the screen', () => {
    const { screen, handle } = makeWithPreview();
    screen.dispose();
    expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it('stays DOM-only without a createPreview option', () => {
    const { root } = make();
    expect(root.querySelector('canvas')).toBeNull();
  });
});
```

Run: `npx vitest run tests/ui/screens/setup.test.ts` — Expected: FAIL.

- [ ] **Step 7: Implement the setup change**

`ui/` may not import `render/` or `content/`, so the screen takes a `createPreview` callback and the catalog carries `modelFile`; `app.ts` wires the real preview in. Previews are only on the YOU row (plan decision 27).

```diff
--- a/src/ui/screens/setup.ts
+++ b/src/ui/screens/setup.ts
@@ -25,6 +25,8 @@
     color: number;
     abilityName: string;
     abilityIcon: string;
+    /** `file` of the character's model, relative to public/assets; set when the card can show a preview. */
+    modelFile?: string;
     stats: Record<(typeof STAT_ORDER)[number], number>;
   }[];
   courts: {
@@ -38,9 +40,15 @@
   profiles: { id: AiProfileId; label: string }[];
 }
 
+export interface PreviewHandle {
+  dispose(): void;
+}
+
 export interface SetupOptions {
   setup: SetupChoice;
   catalog: SetupCatalog;
+  /** Draws a model on a card's canvas (spec F.9). Absent: the cards stay DOM-only. */
+  createPreview?: (canvas: HTMLCanvasElement, modelFile: string) => PreviewHandle;
   onStart(setup: SetupChoice): void;
   onBack(): void;
 }
@@ -63,6 +71,7 @@
   private readonly el: HTMLDivElement;
   private readonly nav: MenuNav;
   private readonly choice: SetupChoice;
+  private readonly previews: PreviewHandle[] = [];
 
   constructor(parent: HTMLElement, options: SetupOptions) {
     this.choice = { ...options.setup, opponentIds: [...options.setup.opponentIds] };
@@ -72,8 +81,14 @@
     ROWS.forEach(([label, field], navRow) => {
       const section = document.createElement('section');
       section.className = 'setup-row';
-      section.innerHTML = `<h3 data-row-label>${label}</h3><div class="setup-cards">${this.cards(field, navRow, options.catalog)}</div>`;
+      section.innerHTML = `<h3 data-row-label>${label}</h3><div class="setup-cards">${this.cards(field, navRow, options.catalog, options.createPreview !== undefined)}</div>`;
       this.el.appendChild(section);
+      // Only the YOU row: each preview owns a WebGL context, and browsers cap how many may live.
+      if (field === 'characterId' && options.createPreview) {
+        for (const canvas of section.querySelectorAll<HTMLCanvasElement>('canvas[data-model]')) {
+          this.previews.push(options.createPreview(canvas, canvas.dataset.model ?? ''));
+        }
+      }
     });
 
     const actions = document.createElement('div');
@@ -128,7 +143,7 @@
     }
   }
 
-  private cards(field: Field, navRow: number, catalog: SetupCatalog): string {
+  private cards(field: Field, navRow: number, catalog: SetupCatalog, previews: boolean): string {
     const current = this.value(field);
     const attrs = (id: string): string =>
       `data-field="${field}" data-value="${esc(id)}" aria-pressed="${id === current}" data-nav-row="${navRow}"`;
@@ -155,8 +170,13 @@
         (s) =>
           `<span class="stat-col" title="${s} ${c.stats[s]}"><span class="stat-bar"><span style="height:${c.stats[s] * 10}%"></span></span><span class="stat-label">${STAT_LABELS[s]}</span></span>`,
       ).join('');
+      const preview =
+        previews && field === 'characterId' && c.modelFile
+          ? `<canvas class="setup-preview" data-model="${esc(c.modelFile)}" width="192" height="256" aria-hidden="true"></canvas>`
+          : '';
       return (
         `<button class="setup-card" ${attrs(c.id)} style="--card-color:${hex(c.color)}">` +
+        preview +
         `<strong>${esc(c.name)}</strong>` +
         `<span class="setup-ability">${esc(c.abilityIcon)} ${esc(c.abilityName)}</span>` +
         `<span class="setup-stats">${bars}</span></button>`
@@ -175,6 +195,8 @@
   }
 
   dispose(): void {
+    for (const preview of this.previews) preview.dispose();
+    this.previews.length = 0;
     this.el.remove();
   }
 }
```

```diff
--- a/src/app/setup-model.ts
+++ b/src/app/setup-model.ts
@@ -90,6 +90,7 @@
       color: c.appearance.primaryColor,
       abilityName: ABILITIES[c.abilityId]?.name ?? c.abilityId,
       abilityIcon: ABILITIES[c.abilityId]?.icon ?? '',
+      modelFile: c.model?.file,
       stats: { ...c.stats },
     })),
     courts: courts.map((c) => ({
```

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -19,6 +19,7 @@
 import { HUMAN_ID } from './app/session';
 import { HowToPlayScreen } from './ui/screens/how-to-play';
 import { ResultsScreen, resultHeadline } from './ui/screens/results';
+import { createCharacterPreview } from './render/character-preview';
 import { SetupScreen } from './ui/screens/setup';
 import { TitleScreen } from './ui/screens/title';
 
@@ -115,6 +116,7 @@
         this.handle = new SetupScreen(this.root, {
           setup: this.setup,
           catalog: buildSetupCatalog(),
+          createPreview: (canvas, file) => createCharacterPreview(canvas, file),
           onStart: (s) => this.startMatch(s),
           onBack: () => this.dispatch({ type: 'back' }),
         });
```

```diff
--- a/src/ui/screens/setup.css
+++ b/src/ui/screens/setup.css
@@ -112,3 +112,12 @@
 .setup-card.is-court {
   text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
 }
+
+.setup-preview {
+  align-self: center;
+  width: 4.5rem;
+  height: 6rem;
+}
+.setup-preview[hidden] {
+  display: none;
+}
```

- [ ] **Step 8: Run** `npx vitest run tests/ui tests/app tests/render` — Expected: PASS. Then `npm run format && npm run check` — Expected: green.

- [ ] **Step 9: Commit and PR**

```bash
git add -A
git commit -m "feat(ui): idle model preview on the Setup character card"
git push -u origin task/7-setup-preview
gh pr create --title "Phase 7.7: setup card preview" --body "Task 7 of the Phase 7 part 1 plan (optional). Closes #<issue>."
```

The controller's browser check: open the Setup screen; Golden's card shows the model idling; the other cards are unchanged; selecting another character and coming back leaves no console errors; with the GLB renamed the card shows no canvas and the screen still works.

---

## Self-review (spec coverage)

| Spec point | Where |
|---|---|
| F.1 scope: one character, others stay | Tasks 3 (only `ace` gets `model`), 5 (placeholders for the rest) |
| F.2 Golden replaces Ace, id `ace`, only name/description/model change | Task 3 |
| F.3 workflow: `sources/raw/` ignored, manifests committed, output committed | Tasks 1 (`.gitignore`), 2 |
| F.4 pipeline, manifest, operations in order, height baked, no Draco/KTX2 | Task 1 (`transform.ts` is the F.4.3 list; extras on `model-root`) |
| F.5 canonical clips, Golden's table, `releaseAt`, release sync, pass offset | Tasks 2 (windows), 3 (`release-timing.ts`), 5 (`CharacterView`) |
| F.6 `model` field, BASE_URL fetch, content check | Tasks 3, 4, 2 (+3) |
| F.7 renderer: interface, mixer, crossfade, `clipFor`, fallback, LoopOnce, run speed, fall replaces tilt, ring for everyone | Tasks 3 and 5 |
| F.8 loading: sync constructor + Loading line, 10 s timeout, one warn, cache, `SkeletonUtils.clone`, shadows | Tasks 4 and 5 |
| F.9 setup preview | Task 7 (optional) |
| F.10 validation: Vitest helpers, content check, smoke, manual tablet check | Tasks 1, 2, 3, 6 |
| F.11 credits line | Task 2 (README) |
| F.12 deferred | not planned, by design |

**Verified in review (2026-10-18):** every code block and diff of Tasks 1–7 was applied, in order, to a scratch copy of `main` with the real raw export: `tsc`, ESLint, Vitest (91 files, 818 tests) and `npm run smoke` all green; `npm run assets` wrote a 2.61 MB `ace.glb` that passes the content check; the three chunk is 630 kB; renaming the GLB in `dist` makes the smoke test fail with the "not served as a GLB" message. Prettier reflowed nothing in the plan's code.
