# RoarBall Phase 1 — Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed web page where one placeholder player can be moved around a placeholder gym court with keyboard or touch, running on a deterministic fixed-step simulation, with lint, tests, CI and GitHub Pages deploy in place.

**Architecture:** Four layers that only communicate downward (app shell → input → simulation ← presentation), with the simulation in `src/sim/` as pure TypeScript that never imports the DOM or Three.js. The game loop runs the simulation at a fixed 60 Hz and renders with interpolation. Content (the gym court) is typed data in `src/content/`.

**Tech Stack:** Vite 8, TypeScript 5.9 (strict), Three.js 0.186, Vitest 5 (+ jsdom for input tests), ESLint 10 + typescript-eslint 8, Prettier 3, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-30-roarball-design.md` — sections 3 (architecture), 4.1–4.2 (state, tick pipeline), 4.7 (turbo), 4.10 (determinism), 7.1 (court definition), 8 (input), 9 (game loop, camera, responsiveness), 10.3 (tooling). Everything else in the spec belongs to later phases.

## Global Constraints

Copied from the spec; every task's requirements include these.

- Simulation runs at a fixed **60 ticks/s**; `TICK_RATE = 60`.
- `src/sim/` must not import from `render/`, `ui/`, `input/`, `audio/` or `three` (ESLint-enforced).
- `src/content/` may import only types from `src/sim/` (ESLint-enforced).
- No `Math.random`, `Date.now` or `performance.now` inside `src/sim/`. Only the seeded RNG.
- Same seed + same intents ⇒ same `MatchState` (determinism test required).
- `PlayerIntent.move` is a unit-or-zero vector in **court space**: `x` → court X (along the length, hoop to hoop), `y` → court Z (across the width). Input backends produce **stick space** (x right, y up); `InputManager` converts it with `stickToCourt(move, cameraYaw)`. Yaw 0 is the broadcast camera on the **+Z sideline** looking towards −Z (Three.js' default orientation): stick right = +X (screen right), stick up = −Z (away from the camera). The XZ plane seen from above mirrors stick space, so the conversion is a reflection followed by a rotation, never a rotation alone.
- Player facing is a yaw in radians such that the facing direction is `(sin(facing), 0, cos(facing))`.
- Court coordinates: origin at centre court, X along the length, Z along the width, Y up; play area 28 m × 15 m.
- Pixel ratio capped at **2**; render scale adjustable independently of DOM size.
- Touch targets **≥ 56 px**; tablet-first landscape layout; safe-area insets respected.
- TypeScript `strict: true`; no `any` in `src/`.
- Node **≥ 22.12**; npm scripts: `dev`, `build`, `test`, `lint`, `format:check`, `check`.
- Every commit message ends with the attribution lines given in the executor's session.

---

## Execution process (mandatory)

This plan is executed with the workflow the project owner asked for. It replaces the default single-branch flow of subagent-driven-development; everything else in that skill (ledger, rulings, fix-round caps) still applies.

**Roles**

| Role | Model | Responsibilities |
|---|---|---|
| Controller | Fable 5.1 (this session) | GitHub setup, dispatch, rulings, merges, ledger, final reassessment |
| Implementer | Sonnet 5.5 (`model: "sonnet"`) | One task per dispatch, TDD, commits on the task branch |
| Reviewer | Opus 5.5 (`model: "opus"`) | Reviews the PR against spec + plan + quality, posts the review on GitHub |
| Fix rounds 4–5 | Opus 5.5 | Takes over implementation if Sonnet cannot close a review after 3 rounds |

**One-time setup (controller)**

```bash
gh api -X POST repos/Fabio-ff/RoarBall/pages -f build_type=workflow          # enable Pages via Actions
gh label create phase-1 --color 1d76db --description "Phase 1: skeleton"
gh label create task --color 0e8a16 --description "Implementation task"
gh api -X POST repos/Fabio-ff/RoarBall/milestones -f title="Phase 1 – Skeleton" -f description="Deployed playable skeleton per docs/superpowers/plans/2026-09-30-phase-1-skeleton.md"
# one issue per task (title "Task N: <name>", body = task summary + acceptance criteria, labels task,phase-1, milestone Phase 1)
# one epic issue "Phase 1 – Skeleton" with a checklist linking every task issue
```

**Per task**

1. Controller: `git checkout main && git pull && git checkout -b task/<N>-<slug>`.
2. Controller dispatches the **Sonnet implementer** with: the spec path, the plan path, the full text of Task N, the branch name, the issue number. Instructions: follow the steps in order (TDD), one commit per "Commit" step with `Refs #<issue>` in the body, run `npm run check` before reporting, never push, never merge, report what was built and anything that deviated from the plan.
3. Controller: `git push -u origin task/<N>-<slug>` and `gh pr create --title "Task N: <name>" --body "Closes #<issue>. <summary>" --label task,phase-1`.
4. Controller dispatches the **Opus reviewer** with the PR number, the task text, the spec path and the reviewer prompt from superpowers:subagent-driven-development (`task-reviewer-prompt.md`), plus: check out the branch, run `npm run check`, read `gh pr diff <n>`, and for tasks with visible output start `npm run dev` and verify in the browser. Post the verdict on GitHub: `gh pr review <n> --approve --body "<summary>"` or `gh pr review <n> --request-changes --body "<numbered findings>"`.
5. Changes requested → fix round: rounds 1–3 resume the Sonnet implementer with the findings; rounds 4–5 dispatch a fresh Opus implementer. Each round ends with a scoped re-review (`re-review-prompt.md`) posted as a new PR review. Cap: 5 rounds, then the controller adjudicates and records rulings in the ledger and in a PR comment.
6. Approved and CI green → controller merges: `gh pr merge <n> --merge --delete-branch` (merge commit, so task commits stay visible), then `git checkout main && git pull`. The `Closes #` line closes the task issue; the controller ticks the epic checklist.
7. Controller appends `Task <N>: complete — PR #<n>` to the ledger.

Merges to `main` are pre-authorised by the project owner for this plan.

**End of phase (controller = Fable)**

Final reassessment against the spec: run `npm run check`, open the deployed Pages URL and the local dev server in Chrome DevTools at 1024×768 (tablet), 1366×768 (laptop) and 390×844 (phone, touch emulation); walk the acceptance checklist at the end of this plan; post the report as a comment on the epic issue; close the epic and the milestone. Anything failing becomes a new issue, not a silent fix.

---

## File structure

```
.github/workflows/ci.yml          lint + format + build + test on PRs and main
.github/workflows/deploy.yml      build with BASE_PATH=/RoarBall/ and deploy to Pages on main
index.html                        single page, mounts #app, loads src/main.ts
package.json                      scripts + pinned deps
tsconfig.json                     strict TS for src/ and tests/
vite.config.ts                    base path from BASE_PATH
vitest.config.ts                  test include + jsdom opt-in per file
eslint.config.js                  flat config + sim/content import boundaries
.prettierrc / .prettierignore
README.md                         how to run, where the spec/plans live

src/main.ts                       reads ?debug, calls startGame
src/app.ts                        wiring: canvas, scene, input, runner, loop, resize
src/app/game-loop.ts              fixed-step accumulator (pure) + GameLoop (rAF)
src/app/match-runner.ts           holds prev/next MatchState, steps the sim

src/sim/constants.ts              TICK_RATE, TICK_MS, TICK_DT
src/sim/math.ts                   Vec2/Vec3 helpers, clamp, lerp, moveTowards, wrapAngle
src/sim/rng.ts                    seeded RNG (mulberry32)
src/sim/types.ts                  PlayerIntent, PlayerState, MatchState, CourtDef, SimEvent …
src/sim/stats.ts                  DEFAULT_STATS (until CharacterDef exists in phase 3)
src/sim/match.ts                  createMatch, findPlayer, allPlayers
src/sim/player-movement.ts        stepPlayer (kinematic movement, turbo, facing, bounds)
src/sim/tick.ts                   tick(state, intents, court) → { state, events }
src/sim/index.ts                  barrel

src/content/courts/gym.ts         the Gym CourtDef
src/content/courts/index.ts       courts registry + getCourt

src/input/types.ts                InputBackend, BackendKind
src/input/input-manager.ts        merge backends, camera-relative move, active kind
src/input/keyboard.ts             KeyboardBackend + DEFAULT_KEY_MAP
src/input/touch.ts                TouchBackend (floating joystick + buttons)
src/input/touch.css

src/render/scene.ts               GameScene (renderer, camera, resize, pixel ratio cap)
src/render/interpolate.ts         lerpVec3, lerpAngle (pure)
src/render/camera.ts              computeCameraPose (pure) + BroadcastCamera
src/render/court-view.ts          buildCourtView(court) → Group (floor, lines, hoops, lights)
src/render/player-view.ts         PlayerView (capsule + head + nose), interpolated update

src/ui/base.css                   full-viewport canvas, no scroll, safe areas
src/ui/debug-overlay.ts           ?debug overlay (fps, ticks/s, pos, speed, turbo, input kind)

tests/sim/rng.test.ts
tests/sim/math.test.ts
tests/sim/court.test.ts
tests/sim/match.test.ts
tests/sim/player-movement.test.ts
tests/sim/tick.test.ts
tests/app/game-loop.test.ts
tests/app/match-runner.test.ts
tests/input/keyboard.test.ts        (jsdom)
tests/input/input-manager.test.ts
tests/input/touch.test.ts           (jsdom)
tests/render/interpolate.test.ts
tests/render/camera.test.ts
```

---

### Task 1: Project scaffold, toolchain, CI and Pages deploy

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `index.html`, `README.md`
- Create: `src/main.ts`, `src/ui/base.css`
- Create: `src/sim/rng.ts`
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Test: `tests/sim/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createRng(seed: number): RngState`, `nextFloat(rng: RngState): number` (in `[0,1)`, mutates `rng`), `nextInt(rng: RngState, maxExclusive: number): number`, `interface RngState { seed: number }`. npm scripts `dev`, `build`, `test`, `lint`, `format`, `format:check`, `check`.

- [ ] **Step 1: Initialise the package and install dependencies**

```bash
cd /Users/fabio/Projects/Roarball
npm init -y
npm install three@^0.186.0
npm install -D vite@^8.3.0 typescript@~5.9.0 vitest@^5.0.0 jsdom @types/three@^0.186.0 @types/node \
  eslint@^10.0.0 @eslint/js typescript-eslint@^8.71.0 globals prettier@^3.9.0
```

- [ ] **Step 2: Write `package.json` scripts and metadata**

Replace the generated `package.json` fields so the file reads (keep the `dependencies`/`devDependencies` npm produced):

```json
{
  "name": "roarball",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Browser-based 3D arcade 2v2 basketball on spectacular courts",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run lint && npm run format:check && npm run build && npm run test"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts` and `vitest.config.ts`**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';

// BASE_PATH is set by the Pages deploy workflow (e.g. "/RoarBall/"); local dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', sourcemap: true },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Default environment is node (the simulation never touches the DOM).
// DOM tests opt in with a `// @vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Write `eslint.config.js` with the import boundaries**

```js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const presentationDirs = ['**/render/**', '**/ui/**', '**/input/**', '**/audio/**', '**/app/**', '**/app'];
const threeModules = ['three', 'three/**'];

export default defineConfig([
  { ignores: ['dist/**', 'node_modules/**', '.superpowers/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Spec §3: the simulation is pure TypeScript and never depends on presentation, input or Three.js.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: threeModules, message: 'src/sim must not depend on Three.js' },
            { group: presentationDirs, message: 'src/sim must not import render/ui/input/audio/app' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'performance'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts' },
        { object: 'Date', property: 'now', message: 'The simulation must not read the wall clock' },
      ],
    },
  },
  {
    // Spec §3: content may only import types from sim.
    files: ['src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: threeModules, message: 'src/content must not depend on Three.js' },
            { group: presentationDirs, message: 'src/content may only import from src/sim' },
          ],
        },
      ],
    },
  },
]);
```

- [ ] **Step 6: Write Prettier config**

`.prettierrc`:

```json
{ "singleQuote": true, "printWidth": 100, "trailingComma": "all" }
```

`.prettierignore`:

```
dist
node_modules
package-lock.json
.superpowers
docs
```

- [ ] **Step 7: Write `index.html`, `src/ui/base.css` and a placeholder `src/main.ts`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
    />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="theme-color" content="#101318" />
    <title>RoarBall</title>
    <link rel="stylesheet" href="/src/ui/base.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/ui/base.css`:

```css
:root {
  color-scheme: dark;
  --bg: #101318;
  --fg: #f2f4f8;
}

html,
body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, sans-serif;
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

#app {
  position: fixed;
  inset: 0;
  touch-action: none;
}

#app canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

`src/main.ts` (placeholder, replaced in Task 8):

```ts
const app = document.getElementById('app');
if (app) {
  app.innerHTML = '<h1 style="margin:16px">RoarBall</h1>';
}
```

- [ ] **Step 8: Write the failing RNG test**

`tests/sim/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt } from '../../src/sim/rng';

describe('seeded rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => nextFloat(a));
    const seqB = Array.from({ length: 10 }, () => nextFloat(b));
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(nextFloat(a)).not.toBe(nextFloat(b));
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = nextFloat(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt stays within [0, max)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = nextInt(rng, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/rng`.

- [ ] **Step 10: Implement `src/sim/rng.ts`**

```ts
/** State of the deterministic mulberry32 generator. Plain data so it lives inside MatchState. */
export interface RngState {
  seed: number;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** Advances the generator and returns a float in [0, 1). Mutates `rng`. */
export function nextFloat(rng: RngState): number {
  rng.seed = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, maxExclusive). Mutates `rng`. */
export function nextInt(rng: RngState, maxExclusive: number): number {
  return Math.floor(nextFloat(rng) * maxExclusive);
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 12: Verify the sim boundary lint fires**

```bash
printf "import { Scene } from 'three';\nexport const s = new Scene();\n" > src/sim/_boundary-probe.ts
npx eslint src/sim/_boundary-probe.ts; echo "exit=$?"
rm src/sim/_boundary-probe.ts
```

Expected: an error mentioning "src/sim must not depend on Three.js" and `exit=1`. If the rule does not fire, fix `eslint.config.js` before continuing.

- [ ] **Step 13: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run build
      - run: npm test
```

- [ ] **Step 14: Write the Pages deploy workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          BASE_PATH: /RoarBall/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 15: Write `README.md`**

```markdown
# RoarBall

Browser-based 3D arcade 2v2 basketball on spectacular courts. Runs on desktops,
tablets and phones.

## Run

    npm install
    npm run dev        # http://localhost:5173  (add ?debug for the overlay)
    npm run check      # lint + format + typecheck + build + tests

## Docs

- Design spec: `docs/superpowers/specs/2026-09-30-roarball-design.md`
- Implementation plans: `docs/superpowers/plans/`

## Layout

- `src/sim/` — deterministic simulation (no DOM, no Three.js)
- `src/input/` — keyboard / gamepad / touch → `PlayerIntent`
- `src/render/` — Three.js presentation
- `src/ui/` — DOM screens and HUD
- `src/content/` — characters, courts, abilities (data)
- `tests/` — Vitest
```

- [ ] **Step 16: Run the full check**

Run: `npm run format && npm run check`
Expected: lint clean, format clean, `tsc` clean, `vite build` produces `dist/`, 4 tests pass.

- [ ] **Step 17: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite/TS project with lint, tests, CI and Pages deploy

Refs #<issue>"
```

**Acceptance criteria:** `npm run check` passes; `npm run dev` serves a page titled RoarBall; the sim boundary lint rejects a Three.js import in `src/sim/`; CI workflow runs on PRs; deploy workflow builds with `BASE_PATH=/RoarBall/`.

---

### Task 2: Simulation math, types, constants and the Gym court

**Files:**
- Create: `src/sim/constants.ts`, `src/sim/math.ts`, `src/sim/types.ts`, `src/sim/stats.ts`
- Create: `src/content/courts/gym.ts`, `src/content/courts/index.ts`
- Test: `tests/sim/math.test.ts`, `tests/sim/court.test.ts`

**Interfaces:**
- Consumes: `RngState` from Task 1.
- Produces: everything in `src/sim/types.ts` below (used by every later task), the math helpers, `DEFAULT_STATS`, `getCourt(id)`, `courts`.

- [ ] **Step 1: Write the failing math tests**

`tests/sim/math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clamp,
  lerp,
  moveTowards,
  v2Length,
  v2Normalize,
  v2Rotate,
  wrapAngle,
} from '../../src/sim/math';

describe('math', () => {
  it('normalizes vectors and leaves zero as zero', () => {
    expect(v2Normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(v2Normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('measures length', () => {
    expect(v2Length({ x: 3, y: 4 })).toBe(5);
  });

  it('rotates counter-clockwise by radians', () => {
    const r = v2Rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it('clamps and lerps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('moves towards a target without overshooting', () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
    expect(moveTowards(9, 10, 3)).toBe(10);
    expect(moveTowards(0, -10, 3)).toBe(-3);
  });

  it('wraps angles into [-PI, PI)', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/math.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/math`.

- [ ] **Step 3: Implement `src/sim/math.ts` and `src/sim/constants.ts`**

`src/sim/constants.ts`:

```ts
/** Simulation ticks per second. Spec §3: fixed 60 Hz. */
export const TICK_RATE = 60;
/** Milliseconds per tick. */
export const TICK_MS = 1000 / TICK_RATE;
/** Seconds per tick, used for all physics integration. */
export const TICK_DT = 1 / TICK_RATE;
```

`src/sim/math.ts`:

```ts
export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function v2Length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

/** Unit vector in the same direction; a zero vector stays zero. */
export function v2Normalize(a: Vec2): Vec2 {
  const len = v2Length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

export function v2Scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function v2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function v2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Rotates counter-clockwise by `radians`. */
export function v2Rotate(a: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Moves `current` towards `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}
```

- [ ] **Step 4: Run the math tests**

Run: `npx vitest run tests/sim/math.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write `src/sim/types.ts` and `src/sim/stats.ts`**

`src/sim/types.ts` — the phase 1 subset of the spec's state (§4.1), shaped so later phases add fields rather than restructure:

```ts
import type { Vec2, Vec3 } from './math';
import type { RngState } from './rng';

export type TeamIndex = 0 | 1;
export type PlayerId = string;

/** Grows in later phases (shoot, pass, block, …). */
export type PlayerAction = 'idle' | 'run';

/**
 * One controlled player's input for one tick. Produced by input backends, AI and (later) the
 * network. `move` is a unit-or-zero vector in court space: x → court X, y → court Z.
 */
export interface PlayerIntent {
  move: Vec2;
  /** Context-sensitive: shoot / layup / dunk with the ball, block / steal / shove without. */
  action: boolean;
  pass: boolean;
  special: boolean;
  turbo: boolean;
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
  stats: ResolvedStats;
}

export interface TeamState {
  players: PlayerState[];
}

export type MatchPhase = 'tipoff' | 'live' | 'scored' | 'inbound' | 'paused' | 'finished';

export interface BallState {
  pos: Vec3;
  vel: Vec3;
  holder: PlayerId | null;
}

export interface MatchSettings {
  durationMs: number;
  shotClockMs: number;
  seed: number;
  ruleIds: string[];
  courtId: string;
}

export interface MatchState {
  tick: number;
  clockMs: number;
  shotClockMs: number;
  score: [number, number];
  phase: MatchPhase;
  ball: BallState;
  teams: [TeamState, TeamState];
  rng: RngState;
  settings: MatchSettings;
}

export type SimEvent = { type: 'phaseChange'; from: MatchPhase; to: MatchPhase };

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

`src/sim/stats.ts`:

```ts
import type { ResolvedStats } from './types';

/**
 * Stats for the placeholder player until CharacterDef arrives in phase 3.
 * Speeds in m/s, accelerations in m/s². Turbo drains fully in 3 s and refills in 6 s.
 */
export const DEFAULT_STATS: Readonly<ResolvedStats> = Object.freeze({
  runSpeed: 6,
  turboSpeed: 8,
  acceleration: 30,
  deceleration: 40,
  turboDrainPerTick: 1 / 180,
  turboRegenPerTick: 1 / 360,
});
```

- [ ] **Step 6: Write the failing court test**

`tests/sim/court.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { courts, getCourt } from '../../src/content/courts';

describe('court registry', () => {
  it('contains the gym', () => {
    expect(courts.map((c) => c.id)).toContain('gym');
  });

  it('throws for an unknown court', () => {
    expect(() => getCourt('nope')).toThrow(/unknown court/i);
  });

  it('gym hoops are symmetric and inside the play area', () => {
    const gym = getCourt('gym');
    const [left, right] = gym.hoops;
    expect(left.pos.x).toBeCloseTo(-right.pos.x);
    expect(left.pos.z).toBe(0);
    expect(right.pos.z).toBe(0);
    expect(Math.abs(left.pos.x)).toBeLessThan(gym.playArea.length / 2);
    expect(left.rimHeight).toBe(3.05);
    expect(right.rimHeight).toBe(3.05);
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run tests/sim/court.test.ts`
Expected: FAIL — cannot resolve `../../src/content/courts`.

- [ ] **Step 8: Implement the gym court and the registry**

`src/content/courts/gym.ts`:

```ts
import type { CourtDef } from '../../sim/types';

/** Plain indoor court, no modifier. Development, tutorial and balance baseline (spec §7.2). */
export const gym: CourtDef = {
  id: 'gym',
  name: 'Gym',
  description: 'A plain indoor court. No surprises.',
  playArea: { length: 28, width: 15 },
  // FIBA: rim centre 1.575 m from the baseline.
  hoops: [
    { pos: { x: -12.425, y: 0, z: 0 }, rimHeight: 3.05 },
    { pos: { x: 12.425, y: 0, z: 0 }, rimHeight: 3.05 },
  ],
  physics: { gravity: 9.81, friction: 1, restitution: 0.75, airDrag: 0.01 },
  lighting: {
    skyColor: 0x9fbfe0,
    sunDirection: { x: -0.4, y: -1, z: -0.3 },
    sunColor: 0xffffff,
    ambient: 0.6,
  },
};
```

`src/content/courts/index.ts`:

```ts
import type { CourtDef } from '../../sim/types';
import { gym } from './gym';

export const courts: readonly CourtDef[] = [gym];

export function getCourt(id: string): CourtDef {
  const court = courts.find((c) => c.id === id);
  if (!court) throw new Error(`Unknown court: ${id}`);
  return court;
}
```

- [ ] **Step 9: Run all tests and the check**

Run: `npm run check`
Expected: all green (rng, math, court tests pass; lint passes — note `gym.ts` imports only a type from sim, as the boundary requires).

- [ ] **Step 10: Commit**

```bash
git add src/sim/constants.ts src/sim/math.ts src/sim/types.ts src/sim/stats.ts src/content tests/sim/math.test.ts tests/sim/court.test.ts
git commit -m "feat(sim): add math helpers, core types, default stats and the gym court

Refs #<issue>"
```

**Acceptance criteria:** types compile under strict mode; math and court tests pass; `src/content/courts/gym.ts` uses `import type` only.

---

### Task 3: Simulation core — createMatch, player movement, tick

**Files:**
- Create: `src/sim/match.ts`, `src/sim/player-movement.ts`, `src/sim/tick.ts`, `src/sim/index.ts`
- Test: `tests/sim/match.test.ts`, `tests/sim/player-movement.test.ts`, `tests/sim/tick.test.ts`

**Interfaces:**
- Consumes: `MatchState`, `PlayerState`, `PlayerIntent`, `NO_INTENT`, `CourtDef`, `SimEvent`, `MatchSettings` (Task 2); `createRng` (Task 1); `DEFAULT_STATS`; `TICK_DT`, `TICK_MS`; `getCourt`.
- Produces:
  - `interface RosterEntry { id: PlayerId; team: TeamIndex; characterId: string }`
  - `createMatch(settings: MatchSettings, court: CourtDef, roster: readonly RosterEntry[]): MatchState`
  - `findPlayer(state: MatchState, id: PlayerId): PlayerState | undefined`, `allPlayers(state: MatchState): PlayerState[]`
  - `stepPlayer(player: PlayerState, intent: PlayerIntent, court: CourtDef, dt: number): void` (mutates `player`)
  - `interface TickResult { state: MatchState; events: SimEvent[] }`
  - `tick(state: MatchState, intents: ReadonlyMap<PlayerId, PlayerIntent>, court: CourtDef): TickResult` (never mutates `state`)

- [ ] **Step 1: Write the failing createMatch tests**

`tests/sim/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { allPlayers, createMatch, findPlayer } from '../../src/sim/match';
import type { MatchSettings } from '../../src/sim/types';

const settings: MatchSettings = {
  durationMs: 180_000,
  shotClockMs: 14_000,
  seed: 1,
  ruleIds: [],
  courtId: 'gym',
};

describe('createMatch', () => {
  it('places roster players on their own half, facing the far hoop', () => {
    const state = createMatch(settings, getCourt('gym'), [
      { id: 'home1', team: 0, characterId: 'placeholder' },
      { id: 'away1', team: 1, characterId: 'placeholder' },
    ]);
    const home = findPlayer(state, 'home1');
    const away = findPlayer(state, 'away1');
    expect(home?.pos.x).toBeLessThan(0);
    expect(away?.pos.x).toBeGreaterThan(0);
    expect(home?.facing).toBeCloseTo(Math.PI / 2); // +X
    expect(away?.facing).toBeCloseTo(-Math.PI / 2); // -X
    expect(allPlayers(state)).toHaveLength(2);
  });

  it('starts live with the full clock, zero score and the seeded rng', () => {
    const state = createMatch(settings, getCourt('gym'), []);
    expect(state.phase).toBe('live');
    expect(state.tick).toBe(0);
    expect(state.clockMs).toBe(180_000);
    expect(state.score).toEqual([0, 0]);
    expect(state.rng.seed).toBe(1);
  });

  it('spreads teammates across the width', () => {
    const state = createMatch(settings, getCourt('gym'), [
      { id: 'a', team: 0, characterId: 'placeholder' },
      { id: 'b', team: 0, characterId: 'placeholder' },
    ]);
    expect(findPlayer(state, 'a')?.pos.z).not.toBe(findPlayer(state, 'b')?.pos.z);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim/match.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/match`.

- [ ] **Step 3: Implement `src/sim/match.ts`**

```ts
import { createRng } from './rng';
import { DEFAULT_STATS } from './stats';
import type {
  CourtDef,
  MatchSettings,
  MatchState,
  PlayerId,
  PlayerState,
  TeamIndex,
} from './types';

export interface RosterEntry {
  id: PlayerId;
  team: TeamIndex;
  characterId: string;
}

/** Builds the initial state. Phase 1 starts directly in 'live' (tip-off arrives with the ball in phase 2). */
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
    phase: 'live',
    ball: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, holder: null },
    teams,
    rng: createRng(settings.seed),
    settings,
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
    stats: { ...DEFAULT_STATS },
  };
}

export function allPlayers(state: MatchState): PlayerState[] {
  return [...state.teams[0].players, ...state.teams[1].players];
}

export function findPlayer(state: MatchState, id: PlayerId): PlayerState | undefined {
  return allPlayers(state).find((p) => p.id === id);
}
```

- [ ] **Step 4: Run the match tests**

Run: `npx vitest run tests/sim/match.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing player-movement tests**

`tests/sim/player-movement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { TICK_DT } from '../../src/sim/constants';
import { createMatch, findPlayer } from '../../src/sim/match';
import { stepPlayer } from '../../src/sim/player-movement';
import { NO_INTENT, type PlayerIntent, type PlayerState } from '../../src/sim/types';

const court = getCourt('gym');

function makePlayer(): PlayerState {
  const state = createMatch(
    { durationMs: 60_000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: 'gym' },
    court,
    [{ id: 'p', team: 0, characterId: 'placeholder' }],
  );
  const player = findPlayer(state, 'p');
  if (!player) throw new Error('player missing');
  player.pos = { x: 0, y: 0, z: 0 };
  return player;
}

const intent = (partial: Partial<PlayerIntent>): PlayerIntent => ({ ...NO_INTENT, ...partial });

function run(player: PlayerState, i: PlayerIntent, ticks: number): void {
  for (let t = 0; t < ticks; t++) stepPlayer(player, i, court, TICK_DT);
}

describe('stepPlayer', () => {
  it('accelerates towards run speed in the intent direction', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    expect(p.vel.x).toBeCloseTo(p.stats.runSpeed);
    expect(p.vel.z).toBeCloseTo(0);
    expect(p.pos.x).toBeGreaterThan(4);
    expect(p.action).toBe('run');
  });

  it('maps intent y to court z', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 0, y: 1 } }), 30);
    expect(p.pos.z).toBeGreaterThan(0);
    expect(p.pos.x).toBeCloseTo(0);
  });

  it('normalizes diagonal input so diagonal speed equals straight speed', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 1 } }), 60);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(p.stats.runSpeed);
  });

  it('decelerates to idle when input stops', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    run(p, NO_INTENT, 30);
    expect(p.vel.x).toBe(0);
    expect(p.action).toBe('idle');
  });

  it('faces the movement direction', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 1);
    expect(p.facing).toBeCloseTo(Math.PI / 2);
    run(p, intent({ move: { x: 0, y: 1 } }), 1);
    expect(p.facing).toBeCloseTo(0);
  });

  it('cannot leave the play area and loses velocity on the blocked axis', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 } }), 60 * 10);
    expect(p.pos.x).toBe(court.playArea.length / 2);
    expect(p.vel.x).toBe(0);
  });

  it('turbo is faster, drains while used and regenerates when released', () => {
    const p = makePlayer();
    run(p, intent({ move: { x: 1, y: 0 }, turbo: true }), 60);
    expect(p.vel.x).toBeCloseTo(p.stats.turboSpeed);
    expect(p.turbo).toBeLessThan(1);
    const drained = p.turbo;
    run(p, intent({ move: { x: 1, y: 0 } }), 60);
    expect(p.turbo).toBeGreaterThan(drained);
    expect(p.vel.x).toBeCloseTo(p.stats.runSpeed);
  });

  it('turbo does nothing while standing still and runs out when empty', () => {
    const p = makePlayer();
    run(p, intent({ turbo: true }), 60);
    expect(p.turbo).toBe(1);
    // Start near the left wall so 3 s of turbo (~24 m) does not reach the right wall.
    p.pos.x = -court.playArea.length / 2 + 1;
    run(p, intent({ move: { x: 1, y: 0 }, turbo: true }), 60 * 3);
    expect(p.turbo).toBeCloseTo(0, 10);
    // Empty turbo: reverse (wall now far away) and confirm the speed falls back to run speed.
    run(p, intent({ move: { x: -1, y: 0 }, turbo: true }), 60);
    expect(p.turbo).toBe(0);
    expect(p.vel.x).toBeCloseTo(-p.stats.runSpeed);
  });

  it('counts ticks in the current action and resets on change', () => {
    const p = makePlayer();
    run(p, NO_INTENT, 5);
    expect(p.actionTicks).toBe(5);
    run(p, intent({ move: { x: 1, y: 0 } }), 1);
    expect(p.action).toBe('run');
    expect(p.actionTicks).toBe(0);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/sim/player-movement.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/player-movement`.

- [ ] **Step 7: Implement `src/sim/player-movement.ts`**

```ts
import { clamp, moveTowards, v2Length, v2Normalize } from './math';
import type { CourtDef, PlayerAction, PlayerIntent, PlayerState } from './types';

/** Stick magnitudes below this count as no input. */
const MOVE_DEADZONE = 0.1;
/** Below this speed (m/s) the player is idle. */
const IDLE_SPEED = 0.05;

/**
 * Advances one player by `dt` seconds according to `intent` (spec §4.2 step 4, §4.7 turbo).
 * Kinematic: velocity moves towards the intended velocity at the acceleration/deceleration
 * rate, position integrates velocity and is clamped to the play area. Mutates `player`.
 */
export function stepPlayer(
  player: PlayerState,
  intent: PlayerIntent,
  court: CourtDef,
  dt: number,
): void {
  const { stats } = player;
  const moving = v2Length(intent.move) > MOVE_DEADZONE;
  const usingTurbo = intent.turbo && moving && player.turbo > 0;
  const dir = moving ? v2Normalize(intent.move) : { x: 0, y: 0 };
  const maxSpeed = usingTurbo ? stats.turboSpeed : stats.runSpeed;
  const rate = (moving ? stats.acceleration : stats.deceleration) * dt;

  player.vel.x = moveTowards(player.vel.x, dir.x * maxSpeed, rate);
  player.vel.z = moveTowards(player.vel.z, dir.y * maxSpeed, rate);

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

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

  if (usingTurbo) {
    player.turbo = Math.max(0, player.turbo - stats.turboDrainPerTick);
  } else if (!intent.turbo || !moving) {
    player.turbo = Math.min(1, player.turbo + stats.turboRegenPerTick);
  }

  const speed = Math.hypot(player.vel.x, player.vel.z);
  const action: PlayerAction = speed > IDLE_SPEED ? 'run' : 'idle';
  if (action === player.action) {
    player.actionTicks += 1;
  } else {
    player.action = action;
    player.actionTicks = 0;
  }
}
```

- [ ] **Step 8: Run the movement tests**

Run: `npx vitest run tests/sim/player-movement.test.ts`
Expected: PASS (9 tests). If "turbo does nothing while standing still" fails because turbo regenerates from 1 to 1, that is fine — it asserts `toBe(1)`.

- [ ] **Step 9: Write the failing tick tests**

`tests/sim/tick.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCourt } from '../../src/content/courts';
import { TICK_MS } from '../../src/sim/constants';
import { createMatch, findPlayer } from '../../src/sim/match';
import { tick } from '../../src/sim/tick';
import { NO_INTENT, type MatchSettings, type MatchState, type PlayerIntent } from '../../src/sim/types';

const court = getCourt('gym');
const settings: MatchSettings = {
  durationMs: 1000,
  shotClockMs: 14_000,
  seed: 3,
  ruleIds: [],
  courtId: 'gym',
};

function fresh(): MatchState {
  return createMatch(settings, court, [{ id: 'p', team: 0, characterId: 'placeholder' }]);
}

const moveRight: PlayerIntent = { ...NO_INTENT, move: { x: 1, y: 0 } };

describe('tick', () => {
  it('advances the tick counter and the clock, and moves players by their intents', () => {
    const start = fresh();
    const { state } = tick(start, new Map([['p', moveRight]]), court);
    expect(state.tick).toBe(1);
    expect(state.clockMs).toBeCloseTo(1000 - TICK_MS);
    expect(findPlayer(state, 'p')?.vel.x).toBeGreaterThan(0);
  });

  it('never mutates the input state', () => {
    const start = fresh();
    const snapshot = structuredClone(start);
    tick(start, new Map([['p', moveRight]]), court);
    expect(start).toEqual(snapshot);
  });

  it('treats a missing intent as no input', () => {
    const start = fresh();
    const { state } = tick(start, new Map(), court);
    expect(findPlayer(state, 'p')?.vel.x).toBe(0);
  });

  it('finishes when the clock runs out and emits a phaseChange event once', () => {
    let state = fresh();
    const seen: string[] = [];
    for (let i = 0; i < 70; i++) {
      const r = tick(state, new Map(), court);
      state = r.state;
      for (const e of r.events) seen.push(`${e.from}->${e.to}`);
    }
    expect(state.phase).toBe('finished');
    expect(state.clockMs).toBe(0);
    expect(seen).toEqual(['live->finished']);
  });

  it('does not advance while paused or finished', () => {
    const start = fresh();
    const paused = { ...start, phase: 'paused' as const };
    expect(tick(paused, new Map([['p', moveRight]]), court).state).toBe(paused);
  });

  it('is deterministic: same seed and intents give identical states', () => {
    const intents = new Map([['p', moveRight]]);
    let a = fresh();
    let b = fresh();
    for (let i = 0; i < 120; i++) {
      a = tick(a, intents, court).state;
      b = tick(b, intents, court).state;
    }
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npx vitest run tests/sim/tick.test.ts`
Expected: FAIL — cannot resolve `../../src/sim/tick`.

- [ ] **Step 11: Implement `src/sim/tick.ts` and `src/sim/index.ts`**

`src/sim/tick.ts`:

```ts
import { TICK_DT, TICK_MS } from './constants';
import { stepPlayer } from './player-movement';
import { NO_INTENT } from './types';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, SimEvent } from './types';

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
 *   5. move ball           (phase 2)
 *   6. collisions          (phase 2)
 *   7. rules               (phase 2)
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

  for (const team of next.teams) {
    for (const player of team.players) {
      stepPlayer(player, intents.get(player.id) ?? NO_INTENT, court, TICK_DT);
    }
  }

  if (next.phase === 'live') {
    next.clockMs = Math.max(0, next.clockMs - TICK_MS);
    if (next.clockMs === 0) {
      events.push({ type: 'phaseChange', from: 'live', to: 'finished' });
      next.phase = 'finished';
    }
  }

  return { state: next, events };
}
```

`src/sim/index.ts`:

```ts
export * from './constants';
export * from './math';
export * from './rng';
export * from './types';
export * from './stats';
export * from './match';
export * from './player-movement';
export * from './tick';
```

- [ ] **Step 12: Run all tests and the check**

Run: `npm run check`
Expected: all green (rng, math, court, match, player-movement, tick).

- [ ] **Step 13: Commit**

```bash
git add src/sim tests/sim
git commit -m "feat(sim): add createMatch, kinematic player movement with turbo, and the tick pipeline

Refs #<issue>"
```

**Acceptance criteria:** determinism test passes; `tick` never mutates its input; players stay inside 28 × 15; turbo drains in ~3 s and refills in ~6 s; lint boundary still green.

---

### Task 4: Fixed-step game loop

**Files:**
- Create: `src/app/game-loop.ts`
- Test: `tests/app/game-loop.test.ts`

**Interfaces:**
- Consumes: `TICK_MS` (Task 2).
- Produces:
  - `interface FixedStepClock { stepMs: number; maxStepsPerFrame: number; accumulatorMs: number }`
  - `createFixedStepClock(stepMs?: number, maxStepsPerFrame?: number): FixedStepClock`
  - `advanceClock(clock: FixedStepClock, frameMs: number): { steps: number; alpha: number }`
  - `class GameLoop { constructor(onTick: () => void, onRender: (alpha: number, frameMs: number) => void, clock?: FixedStepClock); start(): void; stop(): void; readonly running: boolean }`

- [ ] **Step 1: Write the failing test**

`tests/app/game-loop.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { advanceClock, createFixedStepClock } from '../../src/app/game-loop';

describe('advanceClock', () => {
  it('runs one step per 16.67 ms and reports the leftover as alpha', () => {
    const clock = createFixedStepClock(1000 / 60, 5);
    expect(advanceClock(clock, 1000 / 60)).toEqual({ steps: 1, alpha: expect.closeTo(0, 5) });
    const r = advanceClock(clock, 8);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(8 / (1000 / 60));
  });

  it('accumulates fractional frames across calls', () => {
    const clock = createFixedStepClock(10, 5);
    expect(advanceClock(clock, 6).steps).toBe(0);
    expect(advanceClock(clock, 6).steps).toBe(1);
    expect(clock.accumulatorMs).toBeCloseTo(2);
  });

  it('caps the number of steps per frame and drops the excess (no spiral of death)', () => {
    const clock = createFixedStepClock(10, 5);
    const r = advanceClock(clock, 1000);
    expect(r.steps).toBe(5);
    expect(clock.accumulatorMs).toBeLessThan(10);
  });

  it('ignores negative frame times', () => {
    const clock = createFixedStepClock(10, 5);
    expect(advanceClock(clock, -50)).toEqual({ steps: 0, alpha: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/app/game-loop.test.ts`
Expected: FAIL — cannot resolve `../../src/app/game-loop`.

- [ ] **Step 3: Implement `src/app/game-loop.ts`**

```ts
import { TICK_MS } from '../sim/constants';

/** Accumulator for a fixed-timestep loop (spec §9 "Game loop"). Plain data so it is testable. */
export interface FixedStepClock {
  stepMs: number;
  maxStepsPerFrame: number;
  accumulatorMs: number;
}

export function createFixedStepClock(stepMs = TICK_MS, maxStepsPerFrame = 5): FixedStepClock {
  return { stepMs, maxStepsPerFrame, accumulatorMs: 0 };
}

/**
 * Adds a frame's elapsed time and returns how many fixed steps to run and the interpolation
 * factor (0..1) for rendering between the previous and current simulation states. Frame time
 * is clamped so a long stall (background tab, breakpoint) never causes a burst of catch-up.
 */
export function advanceClock(
  clock: FixedStepClock,
  frameMs: number,
): { steps: number; alpha: number } {
  const cap = clock.stepMs * clock.maxStepsPerFrame;
  clock.accumulatorMs += Math.min(Math.max(frameMs, 0), cap);
  let steps = 0;
  while (clock.accumulatorMs >= clock.stepMs && steps < clock.maxStepsPerFrame) {
    clock.accumulatorMs -= clock.stepMs;
    steps += 1;
  }
  return { steps, alpha: clock.accumulatorMs / clock.stepMs };
}

/** requestAnimationFrame driver around a FixedStepClock. */
export class GameLoop {
  private rafId = 0;
  private lastTime = 0;
  private isRunning = false;

  constructor(
    private readonly onTick: () => void,
    private readonly onRender: (alpha: number, frameMs: number) => void,
    private readonly clock: FixedStepClock = createFixedStepClock(),
  ) {}

  get running(): boolean {
    return this.isRunning;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly frame = (now: number): void => {
    if (!this.isRunning) return;
    const frameMs = now - this.lastTime;
    this.lastTime = now;
    const { steps, alpha } = advanceClock(this.clock, frameMs);
    for (let i = 0; i < steps; i++) this.onTick();
    this.onRender(alpha, frameMs);
    this.rafId = requestAnimationFrame(this.frame);
  };

  private readonly onVisibilityChange = (): void => {
    // Coming back from a hidden tab: forget the gap instead of simulating it.
    this.lastTime = performance.now();
    this.clock.accumulatorMs = 0;
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/app/game-loop.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the check and commit**

Run: `npm run check` — expected green.

```bash
git add src/app/game-loop.ts tests/app/game-loop.test.ts
git commit -m "feat(app): add fixed-step game loop with interpolation and catch-up cap

Refs #<issue>"
```

**Acceptance criteria:** `advanceClock` tests pass; `GameLoop` has no logic beyond driving `advanceClock` and rAF.

---

### Task 5: Input manager and keyboard backend

**Files:**
- Create: `src/input/types.ts`, `src/input/input-manager.ts`, `src/input/keyboard.ts`
- Test: `tests/input/input-manager.test.ts`, `tests/input/keyboard.test.ts`

**Interfaces:**
- Consumes: `PlayerIntent`, `NO_INTENT` (Task 2); `v2Length`, `v2Normalize`, `Vec2` (Task 2).
- Produces:
  - `type BackendKind = 'keyboard' | 'gamepad' | 'touch'`
  - `interface InputBackend { readonly kind: BackendKind; sample(): PlayerIntent; dispose(): void }`
  - `class InputManager { constructor(backends: readonly InputBackend[]); cameraYaw: number; readonly activeKind: BackendKind | null; onActiveKindChange: ((kind: BackendKind) => void) | null; sample(): PlayerIntent; dispose(): void }`
  - `isNeutral(intent: PlayerIntent): boolean`, `mergeIntents(a: PlayerIntent, b: PlayerIntent): PlayerIntent`, `stickToCourt(move: Vec2, yaw: number): Vec2`
  - `interface KeyMap { up: string[]; down: string[]; left: string[]; right: string[]; action: string[]; pass: string[]; special: string[]; turbo: string[] }`, `DEFAULT_KEY_MAP`
  - `class KeyboardBackend implements InputBackend { constructor(target?: Window, map?: KeyMap) }`

- [ ] **Step 1: Write the failing input-manager test**

`tests/input/input-manager.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { InputManager, isNeutral, mergeIntents, stickToCourt } from '../../src/input/input-manager';
import type { InputBackend } from '../../src/input/types';
import { NO_INTENT, type PlayerIntent } from '../../src/sim/types';

function fake(kind: InputBackend['kind'], intent: () => PlayerIntent): InputBackend {
  return { kind, sample: intent, dispose: () => {} };
}

const moveUp: PlayerIntent = { ...NO_INTENT, move: { x: 0, y: 1 } };

describe('InputManager', () => {
  it('returns a neutral intent when no backend is active', () => {
    const m = new InputManager([fake('keyboard', () => ({ ...NO_INTENT }))]);
    expect(isNeutral(m.sample())).toBe(true);
    expect(m.activeKind).toBeNull();
  });

  it('merges buttons across backends and takes the first non-zero move', () => {
    const m = new InputManager([
      fake('keyboard', () => ({ ...NO_INTENT, action: true })),
      fake('touch', () => moveUp),
    ]);
    const i = m.sample();
    expect(i.action).toBe(true);
    expect(i.move.x).toBeCloseTo(0);
    expect(i.move.y).toBeCloseTo(-1); // stick up → −Z after stickToCourt at yaw 0
  });

  it('tracks the active backend kind and notifies on change', () => {
    let current: PlayerIntent = { ...NO_INTENT };
    const seen: string[] = [];
    const m = new InputManager([
      fake('keyboard', () => ({ ...NO_INTENT })),
      fake('touch', () => current),
    ]);
    m.onActiveKindChange = (k) => seen.push(k);
    m.sample();
    current = moveUp;
    m.sample();
    m.sample();
    expect(m.activeKind).toBe('touch');
    expect(seen).toEqual(['touch']);
  });

  it('maps stick space to court space for the +Z broadcast camera (yaw 0)', () => {
    const right = new InputManager([fake('keyboard', () => ({ ...NO_INTENT, move: { x: 1, y: 0 } }))]);
    const r = right.sample().move;
    expect(r.x).toBeCloseTo(1); // stick right → +X, which is screen right for a camera on +Z
    expect(r.y).toBeCloseTo(0);
    const up = new InputManager([fake('keyboard', () => ({ ...NO_INTENT, move: { x: 0, y: 1 } }))]);
    const u = up.sample().move;
    expect(u.x).toBeCloseTo(0);
    expect(u.y).toBeCloseTo(-1); // stick up → −Z, away from the camera
  });

  it('follows the camera yaw: at yaw PI the camera is on −Z and both axes flip', () => {
    const m = new InputManager([fake('keyboard', () => ({ ...NO_INTENT, move: { x: 1, y: 1 } }))]);
    m.cameraYaw = Math.PI;
    const i = m.sample().move;
    expect(i.x).toBeCloseTo(-1);
    expect(i.y).toBeCloseTo(1);
  });
});

describe('stickToCourt', () => {
  it('is a reflection of y at yaw 0', () => {
    const c = stickToCourt({ x: 0.6, y: 0.8 }, 0);
    expect(c.x).toBeCloseTo(0.6);
    expect(c.y).toBeCloseTo(-0.8);
  });

  it('preserves length', () => {
    const c = stickToCourt({ x: 0.6, y: 0.8 }, 1.234);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(1);
  });
});

describe('mergeIntents', () => {
  it('ORs the buttons', () => {
    const r = mergeIntents({ ...NO_INTENT, pass: true }, { ...NO_INTENT, turbo: true });
    expect(r.pass).toBe(true);
    expect(r.turbo).toBe(true);
    expect(r.action).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/input/input-manager.test.ts`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Implement `src/input/types.ts` and `src/input/input-manager.ts`**

`src/input/types.ts`:

```ts
import type { PlayerIntent } from '../sim/types';

export type BackendKind = 'keyboard' | 'gamepad' | 'touch';

/** A device that can be sampled once per simulation tick. `move` is in stick space here. */
export interface InputBackend {
  readonly kind: BackendKind;
  sample(): PlayerIntent;
  dispose(): void;
}
```

`src/input/input-manager.ts`:

```ts
import { v2Length, type Vec2 } from '../sim/math';
import { NO_INTENT, type PlayerIntent } from '../sim/types';
import type { BackendKind, InputBackend } from './types';

export function isNeutral(intent: PlayerIntent): boolean {
  return (
    v2Length(intent.move) === 0 &&
    !intent.action &&
    !intent.pass &&
    !intent.special &&
    !intent.turbo
  );
}

/** Buttons are ORed; the first non-zero move wins. */
export function mergeIntents(a: PlayerIntent, b: PlayerIntent): PlayerIntent {
  return {
    move: v2Length(a.move) > 0 ? a.move : b.move,
    action: a.action || b.action,
    pass: a.pass || b.pass,
    special: a.special || b.special,
    turbo: a.turbo || b.turbo,
  };
}

/**
 * Converts a stick-space move (x right, y up) into court space (x → X, y → Z) for a camera
 * rotated `yaw` radians about Y. Yaw 0 is the broadcast camera on the +Z sideline looking
 * towards −Z (Three.js' default orientation): stick right = +X, stick up = away = −Z.
 * The XZ plane seen from above is a mirror image of stick space, so this is a reflection
 * of y followed by a rotation — a rotation alone would swap left and right.
 */
export function stickToCourt(move: Vec2, yaw: number): Vec2 {
  const x = move.x;
  const z = -move.y;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, y: -x * s + z * c };
}

/**
 * Merges all backends into one PlayerIntent per tick, converts the stick-space move into
 * court space using the camera yaw (spec §8 "Camera-relative movement") and remembers which
 * kind of device was used last so the UI can show or hide touch controls.
 */
export class InputManager {
  /** Rotation of the camera about Y; 0 = broadcast camera on the +Z sideline (see stickToCourt). */
  cameraYaw = 0;
  onActiveKindChange: ((kind: BackendKind) => void) | null = null;
  private active: BackendKind | null = null;

  constructor(private readonly backends: readonly InputBackend[]) {}

  get activeKind(): BackendKind | null {
    return this.active;
  }

  sample(): PlayerIntent {
    let merged: PlayerIntent = { ...NO_INTENT, move: { x: 0, y: 0 } };
    for (const backend of this.backends) {
      const intent = backend.sample();
      if (isNeutral(intent)) continue;
      if (this.active !== backend.kind) {
        this.active = backend.kind;
        this.onActiveKindChange?.(backend.kind);
      }
      merged = mergeIntents(merged, intent);
    }
    merged.move = stickToCourt(merged.move, this.cameraYaw);
    return merged;
  }

  dispose(): void {
    for (const backend of this.backends) backend.dispose();
  }
}
```

- [ ] **Step 4: Run the manager test**

Run: `npx vitest run tests/input/input-manager.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing keyboard test (jsdom)**

`tests/input/keyboard.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardBackend } from '../../src/input/keyboard';

function press(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
}
function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

let backend: KeyboardBackend;
afterEach(() => backend.dispose());

describe('KeyboardBackend', () => {
  it('maps WASD and arrows to a normalized move vector', () => {
    backend = new KeyboardBackend(window);
    press('KeyW');
    expect(backend.sample().move).toEqual({ x: 0, y: 1 });
    press('KeyD');
    const diag = backend.sample().move;
    expect(diag.x).toBeCloseTo(Math.SQRT1_2);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2);
    release('KeyW');
    release('KeyD');
    press('ArrowLeft');
    expect(backend.sample().move).toEqual({ x: -1, y: 0 });
  });

  it('maps buttons', () => {
    backend = new KeyboardBackend(window);
    press('Space');
    press('KeyE');
    press('KeyQ');
    press('ShiftLeft');
    const i = backend.sample();
    expect(i).toMatchObject({ action: true, pass: true, special: true, turbo: true });
    release('Space');
    expect(backend.sample().action).toBe(false);
  });

  it('prevents the default action of mapped keys so Space does not scroll', () => {
    backend = new KeyboardBackend(window);
    const e = new KeyboardEvent('keydown', { code: 'Space', cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const other = new KeyboardEvent('keydown', { code: 'KeyZ', cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('clears all keys on window blur', () => {
    backend = new KeyboardBackend(window);
    press('KeyW');
    window.dispatchEvent(new Event('blur'));
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
  });

  it('stops listening after dispose', () => {
    backend = new KeyboardBackend(window);
    backend.dispose();
    press('KeyW');
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/input/keyboard.test.ts`
Expected: FAIL — cannot resolve `../../src/input/keyboard`.

- [ ] **Step 7: Implement `src/input/keyboard.ts`**

```ts
import { v2Normalize } from '../sim/math';
import type { PlayerIntent } from '../sim/types';
import type { InputBackend } from './types';

export interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  action: string[];
  pass: string[];
  special: string[];
  turbo: string[];
}

/** Spec §8: WASD/arrows, Space action, E pass, Q special, Shift turbo. Uses KeyboardEvent.code. */
export const DEFAULT_KEY_MAP: KeyMap = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  action: ['Space'],
  pass: ['KeyE'],
  special: ['KeyQ'],
  turbo: ['ShiftLeft', 'ShiftRight'],
};

export class KeyboardBackend implements InputBackend {
  readonly kind = 'keyboard' as const;
  private readonly down = new Set<string>();
  private readonly mapped: Set<string>;

  constructor(
    private readonly target: Window = window,
    private readonly map: KeyMap = DEFAULT_KEY_MAP,
  ) {
    this.mapped = new Set(Object.values(map).flat());
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  sample(): PlayerIntent {
    const x = (this.any(this.map.right) ? 1 : 0) - (this.any(this.map.left) ? 1 : 0);
    const y = (this.any(this.map.up) ? 1 : 0) - (this.any(this.map.down) ? 1 : 0);
    return {
      move: v2Normalize({ x, y }),
      action: this.any(this.map.action),
      pass: this.any(this.map.pass),
      special: this.any(this.map.special),
      turbo: this.any(this.map.turbo),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.mapped.has(e.code)) return;
    e.preventDefault();
    this.down.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
  };
}
```

- [ ] **Step 8: Run the keyboard test, then the check**

Run: `npx vitest run tests/input/keyboard.test.ts` — expected PASS (5 tests).
Run: `npm run check` — expected green.

- [ ] **Step 9: Commit**

```bash
git add src/input/types.ts src/input/input-manager.ts src/input/keyboard.ts tests/input
git commit -m "feat(input): add InputManager with camera-relative merge and KeyboardBackend

Refs #<issue>"
```

**Acceptance criteria:** keyboard produces normalized moves; Space's default is prevented; blur clears state; manager reports the active backend kind; stick right maps to +X and stick up to −Z at yaw 0 (screen right / away for the +Z broadcast camera).

---

### Task 6: Touch backend — floating joystick and buttons

**Files:**
- Create: `src/input/touch.ts`, `src/input/touch.css`
- Test: `tests/input/touch.test.ts`

**Interfaces:**
- Consumes: `InputBackend` (Task 5); `PlayerIntent` (Task 2).
- Produces: `class TouchBackend implements InputBackend { constructor(parent: HTMLElement, options?: { joystickRadius?: number }); readonly element: HTMLDivElement; show(): void; hide(): void; readonly visible: boolean }`. DOM: `.touch-controls` root containing `.touch-joystick > .touch-joystick-knob` and `.touch-buttons > .touch-button[data-button=special|pass|action|turbo]`.

- [ ] **Step 1: Write the failing test (jsdom)**

`tests/input/touch.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TouchBackend } from '../../src/input/touch';

const WIDTH = 1000;
const HEIGHT = 600;

interface PointerInit {
  pointerId: number;
  clientX: number;
  clientY: number;
}

// jsdom has no layout and (depending on version) no PointerEvent; build a MouseEvent and
// graft pointerId onto it so the backend sees the fields it reads.
function fire(target: EventTarget, type: string, init: PointerInit): void {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(e, 'pointerId', { value: init.pointerId });
  Object.defineProperty(e, 'pointerType', { value: 'touch' });
  target.dispatchEvent(e);
}

let parent: HTMLDivElement;
let backend: TouchBackend;

beforeEach(() => {
  parent = document.createElement('div');
  document.body.appendChild(parent);
  backend = new TouchBackend(parent, { joystickRadius: 50 });
  backend.element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});

afterEach(() => {
  backend.dispose();
  parent.remove();
});

const joystick = () => backend.element.querySelector<HTMLElement>('.touch-joystick')!;
const button = (name: string) =>
  backend.element.querySelector<HTMLElement>(`.touch-button[data-button="${name}"]`)!;

describe('TouchBackend joystick', () => {
  it('appears where the left-half touch starts and reports a stick vector', () => {
    expect(joystick().hidden).toBe(true);
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    expect(joystick().hidden).toBe(false);
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 225, clientY: 400 });
    expect(backend.sample().move.x).toBeCloseTo(0.5);
    expect(backend.sample().move.y).toBeCloseTo(0);
  });

  it('maps screen-up to positive y and clamps to unit length', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 200, clientY: 100 });
    const m = backend.sample().move;
    expect(m.x).toBeCloseTo(0);
    expect(m.y).toBeCloseTo(1);
  });

  it('resets and hides on release', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 250, clientY: 400 });
    fire(window, 'pointerup', { pointerId: 1, clientX: 250, clientY: 400 });
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
    expect(joystick().hidden).toBe(true);
  });

  it('ignores touches that start in the right half', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 800, clientY: 400 });
    expect(joystick().hidden).toBe(true);
  });

  it('ignores a second pointer while the joystick is held', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointerdown', { pointerId: 2, clientX: 300, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 2, clientX: 400, clientY: 400 });
    expect(backend.sample().move).toEqual({ x: 0, y: 0 });
  });
});

describe('TouchBackend buttons', () => {
  it('reports a button while it is pressed', () => {
    fire(button('action'), 'pointerdown', { pointerId: 3, clientX: 900, clientY: 550 });
    expect(backend.sample().action).toBe(true);
    expect(button('action').classList.contains('is-pressed')).toBe(true);
    fire(window, 'pointerup', { pointerId: 3, clientX: 900, clientY: 550 });
    expect(backend.sample().action).toBe(false);
    expect(button('action').classList.contains('is-pressed')).toBe(false);
  });

  it('supports the joystick and a button at the same time', () => {
    fire(backend.element, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 400 });
    fire(backend.element, 'pointermove', { pointerId: 1, clientX: 250, clientY: 400 });
    fire(button('turbo'), 'pointerdown', { pointerId: 2, clientX: 850, clientY: 550 });
    const i = backend.sample();
    expect(i.move.x).toBeCloseTo(1);
    expect(i.turbo).toBe(true);
    fire(window, 'pointercancel', { pointerId: 2, clientX: 850, clientY: 550 });
    expect(backend.sample().turbo).toBe(false);
    expect(backend.sample().move.x).toBeCloseTo(1);
  });

  it('has all four buttons', () => {
    for (const name of ['special', 'pass', 'action', 'turbo']) expect(button(name)).toBeTruthy();
  });
});

describe('TouchBackend visibility', () => {
  it('starts hidden and toggles', () => {
    expect(backend.visible).toBe(false);
    backend.show();
    expect(backend.element.hidden).toBe(false);
    backend.hide();
    expect(backend.element.hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/input/touch.test.ts`
Expected: FAIL — cannot resolve `../../src/input/touch`.

- [ ] **Step 3: Implement `src/input/touch.ts`**

```ts
import type { PlayerIntent } from '../sim/types';
import type { InputBackend } from './types';
import './touch.css';

export interface TouchBackendOptions {
  /** Fallback joystick radius in px when the element has no layout (tests). */
  joystickRadius?: number;
}

type ButtonName = 'special' | 'pass' | 'action' | 'turbo';
const BUTTONS: { name: ButtonName; label: string }[] = [
  { name: 'special', label: 'SP' },
  { name: 'pass', label: 'PASS' },
  { name: 'turbo', label: 'TURBO' },
  { name: 'action', label: 'GO' },
];

/**
 * Spec §8 touch layout: a floating joystick that appears where the left thumb lands, and
 * DOM buttons on the right. Pointer Events tracked by pointerId so a joystick drag and a
 * button press coexist. Starts hidden; the app shows it on first touch.
 */
export class TouchBackend implements InputBackend {
  readonly kind = 'touch' as const;
  readonly element: HTMLDivElement;

  private readonly joystick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly buttons = new Map<ButtonName, { el: HTMLDivElement; pointers: Set<number> }>();
  private joystickPointer: number | null = null;
  private origin = { x: 0, y: 0 };
  private move = { x: 0, y: 0 };
  private radius: number;

  constructor(
    parent: HTMLElement,
    private readonly options: TouchBackendOptions = {},
  ) {
    this.radius = options.joystickRadius ?? 60;

    this.element = document.createElement('div');
    this.element.className = 'touch-controls';
    this.element.hidden = true;

    this.joystick = document.createElement('div');
    this.joystick.className = 'touch-joystick';
    this.joystick.hidden = true;
    this.knob = document.createElement('div');
    this.knob.className = 'touch-joystick-knob';
    this.joystick.appendChild(this.knob);

    const buttonBar = document.createElement('div');
    buttonBar.className = 'touch-buttons';
    for (const { name, label } of BUTTONS) {
      const el = document.createElement('div');
      el.className = 'touch-button';
      el.dataset.button = name;
      el.setAttribute('role', 'button');
      el.textContent = label;
      buttonBar.appendChild(el);
      this.buttons.set(name, { el, pointers: new Set() });
    }

    this.element.append(this.joystick, buttonBar);
    parent.appendChild(this.element);

    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerEnd);
    window.addEventListener('pointercancel', this.onPointerEnd);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  show(): void {
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
    this.resetJoystick();
    for (const b of this.buttons.values()) {
      b.pointers.clear();
      b.el.classList.remove('is-pressed');
    }
  }

  sample(): PlayerIntent {
    return {
      move: { ...this.move },
      action: this.pressed('action'),
      pass: this.pressed('pass'),
      special: this.pressed('special'),
      turbo: this.pressed('turbo'),
    };
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerEnd);
    window.removeEventListener('pointercancel', this.onPointerEnd);
    this.element.remove();
  }

  private pressed(name: ButtonName): boolean {
    return (this.buttons.get(name)?.pointers.size ?? 0) > 0;
  }

  private buttonFromTarget(target: EventTarget | null): ButtonName | null {
    if (!(target instanceof HTMLElement)) return null;
    const el = target.closest<HTMLElement>('.touch-button');
    return (el?.dataset.button as ButtonName | undefined) ?? null;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const name = this.buttonFromTarget(e.target);
    if (name) {
      const button = this.buttons.get(name);
      if (!button) return;
      button.pointers.add(e.pointerId);
      button.el.classList.add('is-pressed');
      e.preventDefault();
      return;
    }
    if (this.joystickPointer !== null) return;
    const rect = this.element.getBoundingClientRect();
    if (e.clientX - rect.left >= rect.width / 2) return;

    this.joystickPointer = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.move = { x: 0, y: 0 };
    this.radius = this.joystick.offsetWidth / 2 || (this.options.joystickRadius ?? 60);
    this.joystick.style.left = `${e.clientX - rect.left}px`;
    this.joystick.style.top = `${e.clientY - rect.top}px`;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.joystick.hidden = false;
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.joystickPointer) return;
    const dx = (e.clientX - this.origin.x) / this.radius;
    const dy = (e.clientY - this.origin.y) / this.radius;
    const len = Math.hypot(dx, dy);
    const scale = len > 1 ? 1 / len : 1;
    // Screen Y grows downwards; stick "up" is +y.
    this.move = { x: dx * scale, y: -dy * scale };
    this.knob.style.transform = `translate(${dx * scale * this.radius}px, ${dy * scale * this.radius}px)`;
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId === this.joystickPointer) this.resetJoystick();
    for (const b of this.buttons.values()) {
      if (b.pointers.delete(e.pointerId) && b.pointers.size === 0) {
        b.el.classList.remove('is-pressed');
      }
    }
  };

  private resetJoystick(): void {
    this.joystickPointer = null;
    this.move = { x: 0, y: 0 };
    this.joystick.hidden = true;
  }
}
```

- [ ] **Step 4: Write `src/input/touch.css`**

```css
.touch-controls {
  --joy: clamp(96px, 20vmin, 160px);
  position: absolute;
  inset: 0;
  z-index: 10;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
}

.touch-controls[hidden] {
  display: none;
}

.touch-joystick {
  position: absolute;
  width: var(--joy);
  height: var(--joy);
  margin: calc(var(--joy) / -2) 0 0 calc(var(--joy) / -2);
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.12);
  pointer-events: none;
}

.touch-joystick[hidden] {
  display: none;
}

.touch-joystick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 40%;
  height: 40%;
  margin: -20% 0 0 -20%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
}

.touch-buttons {
  position: absolute;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  display: grid;
  grid-template-areas:
    'special pass'
    'turbo action';
  gap: 12px;
  align-items: end;
  justify-items: end;
}

.touch-button {
  --size: clamp(56px, 12vmin, 96px);
  width: var(--size);
  height: var(--size);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font: 600 14px system-ui, sans-serif;
  touch-action: none;
}

.touch-button[data-button='special'] {
  grid-area: special;
}
.touch-button[data-button='pass'] {
  grid-area: pass;
}
.touch-button[data-button='turbo'] {
  grid-area: turbo;
}
.touch-button[data-button='action'] {
  grid-area: action;
  --size: clamp(72px, 16vmin, 120px);
}

.touch-button.is-pressed {
  background: rgba(255, 255, 255, 0.45);
}

@media (max-width: 600px) {
  .touch-buttons {
    gap: 8px;
  }
}
```

- [ ] **Step 5: Run the touch test**

Run: `npx vitest run tests/input/touch.test.ts`
Expected: PASS (9 tests). Vitest treats the `./touch.css` import as an empty module by default; if it errors instead, add `css: false` under `test` in `vitest.config.ts`.

- [ ] **Step 6: Run the check and commit**

Run: `npm run check` — expected green.

```bash
git add src/input/touch.ts src/input/touch.css tests/input/touch.test.ts vitest.config.ts
git commit -m "feat(input): add TouchBackend with floating joystick and multi-touch buttons

Refs #<issue>"
```

**Acceptance criteria:** joystick only in the left half, unit-clamped, screen-up = +y; buttons tracked per pointer; joystick and button simultaneously; min button size 56 px in CSS; safe-area insets used.

---

### Task 7: Rendering — scene, court view, player view, camera

**Files:**
- Create: `src/render/scene.ts`, `src/render/interpolate.ts`, `src/render/camera.ts`, `src/render/court-view.ts`, `src/render/player-view.ts`
- Test: `tests/render/interpolate.test.ts`, `tests/render/camera.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `lerp`, `wrapAngle` (Task 2); `PlayerState`, `CourtDef` (Task 2).
- Produces:
  - `lerpVec3(a: Vec3, b: Vec3, t: number): Vec3`, `lerpAngle(a: number, b: number, t: number): number`
  - `interface CameraPose { position: Vec3; lookAt: Vec3 }`, `computeCameraPose(target: Vec3, aspect: number): CameraPose`
  - `class BroadcastCamera { constructor(camera: PerspectiveCamera); readonly yaw: number; update(target: Vec3, dtSeconds: number): void }`
  - `class GameScene { constructor(canvas: HTMLCanvasElement); readonly scene: Scene; readonly camera: PerspectiveCamera; renderScale: number; resize(width: number, height: number, devicePixelRatio: number): void; setBackground(color: number): void; render(): void; dispose(): void }`
  - `buildCourtView(court: CourtDef): Group`
  - `class PlayerView { constructor(color: number); readonly group: Group; update(prev: PlayerState, next: PlayerState, alpha: number): void }`

- [ ] **Step 1: Write the failing interpolation and camera tests**

`tests/render/interpolate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerpAngle, lerpVec3 } from '../../src/render/interpolate';

describe('interpolate', () => {
  it('lerps vectors component-wise', () => {
    expect(lerpVec3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: -2 }, 0.5)).toEqual({ x: 1, y: 2, z: -1 });
  });

  it('lerps angles along the shortest arc across the -PI/PI seam', () => {
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    const mid = lerpAngle(a, b, 0.5);
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(1e-9);
  });

  it('returns the endpoints at t = 0 and t = 1', () => {
    expect(lerpAngle(0.3, 1.2, 0)).toBeCloseTo(0.3);
    expect(lerpAngle(0.3, 1.2, 1)).toBeCloseTo(1.2);
  });
});
```

`tests/render/camera.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeCameraPose } from '../../src/render/camera';

describe('computeCameraPose', () => {
  it('sits on the +Z sideline, elevated, looking at the court', () => {
    const pose = computeCameraPose({ x: 0, y: 0, z: 0 }, 16 / 9);
    expect(pose.position.z).toBeGreaterThan(0);
    expect(pose.position.y).toBeGreaterThan(5);
    expect(pose.lookAt.z).toBe(0);
  });

  it('follows the target along X with damping', () => {
    const left = computeCameraPose({ x: -10, y: 0, z: 0 }, 16 / 9);
    const right = computeCameraPose({ x: 10, y: 0, z: 0 }, 16 / 9);
    expect(left.position.x).toBeLessThan(0);
    expect(right.position.x).toBeGreaterThan(0);
    expect(Math.abs(left.position.x)).toBeLessThan(10);
    expect(left.lookAt.x).toBe(left.position.x);
  });

  it('pulls back and rises in portrait so the court still fits', () => {
    const landscape = computeCameraPose({ x: 0, y: 0, z: 0 }, 16 / 9);
    const portrait = computeCameraPose({ x: 0, y: 0, z: 0 }, 9 / 16);
    expect(portrait.position.z).toBeGreaterThan(landscape.position.z);
    expect(portrait.position.y).toBeGreaterThan(landscape.position.y);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/render`
Expected: FAIL — cannot resolve modules.

- [ ] **Step 3: Implement `src/render/interpolate.ts` and `src/render/camera.ts`**

`src/render/interpolate.ts`:

```ts
import { lerp, wrapAngle, type Vec3 } from '../sim/math';

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Interpolates along the shortest arc so a facing flip never spins the long way round. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
```

`src/render/camera.ts`:

```ts
import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '../sim/math';

export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
}

const HEIGHT = 12;
const DISTANCE = 20;
/** How much of the target's X the camera follows (1 = rigidly, 0 = fixed at centre court). */
const FOLLOW = 0.5;

/**
 * Broadcast-style side camera (spec §9 "Camera"): on the +Z sideline, elevated, fixed
 * orientation, looking towards −Z (Three.js' default orientation, so screen right is +X).
 * In portrait the distance and height grow with 1/aspect so the court fits.
 */
export function computeCameraPose(target: Vec3, aspect: number): CameraPose {
  const portraitFactor = Math.max(1, 1 / aspect);
  const x = target.x * FOLLOW;
  return {
    position: { x, y: HEIGHT * portraitFactor, z: DISTANCE * portraitFactor },
    lookAt: { x, y: 1, z: 0 },
  };
}

export class BroadcastCamera {
  /** Yaw 0 = camera on the +Z sideline; InputManager.stickToCourt maps stick space accordingly. */
  readonly yaw = 0;
  private position: Vec3 | null = null;

  constructor(private readonly camera: PerspectiveCamera) {}

  update(target: Vec3, dtSeconds: number): void {
    const pose = computeCameraPose(target, this.camera.aspect);
    if (!this.position) {
      this.position = { ...pose.position };
    } else {
      const k = 1 - Math.exp(-dtSeconds * 4);
      this.position.x += (pose.position.x - this.position.x) * k;
      this.position.y += (pose.position.y - this.position.y) * k;
      this.position.z += (pose.position.z - this.position.z) * k;
    }
    this.camera.position.set(this.position.x, this.position.y, this.position.z);
    this.camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  }
}
```

- [ ] **Step 4: Run the render tests**

Run: `npx vitest run tests/render`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement `src/render/scene.ts`**

```ts
import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

const MAX_PIXEL_RATIO = 2;

/** Owns the renderer and camera. Spec §9: pixel ratio capped at 2, render scale independent of DOM size. */
export class GameScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** 1 = native; lower it on slow devices to render fewer pixels without changing the layout. */
  renderScale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.camera = new PerspectiveCamera(50, 1, 0.1, 200);
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO) * this.renderScale);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  setBackground(color: number): void {
    this.scene.background = new Color(color);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
```

- [ ] **Step 6: Implement `src/render/court-view.ts`**

```ts
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  TorusGeometry,
} from 'three';
import type { CourtDef, HoopDef } from '../sim/types';

const RIM_RADIUS = 0.225;
const LINE_WIDTH = 0.05;

/**
 * Placeholder court (spec §7.3 "Presentation"): the play surface, lines, hoops and lights are
 * generated from the CourtDef so visuals always match the physics. The environment glTF
 * arrives in phase 7.
 */
export function buildCourtView(court: CourtDef): Group {
  const group = new Group();
  const { length, width } = court.playArea;

  const ground = new Mesh(
    new PlaneGeometry(length * 3, width * 4),
    new MeshStandardMaterial({ color: 0x3a3f4b }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;

  const floor = new Mesh(
    new PlaneGeometry(length, width),
    new MeshStandardMaterial({ color: 0xc9a06a }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  group.add(ground, floor);
  group.add(
    line(length, LINE_WIDTH, 0, -width / 2),
    line(length, LINE_WIDTH, 0, width / 2),
    line(LINE_WIDTH, width, -length / 2, 0),
    line(LINE_WIDTH, width, length / 2, 0),
    line(LINE_WIDTH, width, 0, 0),
  );

  for (const hoop of court.hoops) group.add(buildHoop(hoop, Math.sign(hoop.pos.x) || 1));

  const { lighting } = court;
  const sun = new DirectionalLight(lighting.sunColor, 2.5);
  sun.position.set(-lighting.sunDirection.x * 30, -lighting.sunDirection.y * 30, -lighting.sunDirection.z * 30);
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

const lineMaterial = new MeshBasicMaterial({ color: 0xffffff });

function line(sizeX: number, sizeZ: number, x: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(sizeX, 0.02, sizeZ), lineMaterial);
  mesh.position.set(x, 0.01, z);
  return mesh;
}

/** `side` is +1 for the hoop at +X and -1 for the hoop at -X; the backboard sits behind the rim. */
function buildHoop(hoop: HoopDef, side: number): Group {
  const group = new Group();
  const { x, z } = hoop.pos;
  const y = hoop.rimHeight;

  const rim = new Mesh(
    new TorusGeometry(RIM_RADIUS, 0.02, 8, 24),
    new MeshStandardMaterial({ color: 0xff5a1f }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y, z);

  const boardX = x + side * (RIM_RADIUS + 0.15);
  const board = new Mesh(
    new BoxGeometry(0.05, 1.05, 1.8),
    new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
  );
  board.position.set(boardX, y + 0.3, z);

  const poleX = boardX + side * 1.2;
  const poleHeight = y + 0.6;
  const pole = new Mesh(
    new BoxGeometry(0.15, poleHeight, 0.15),
    new MeshStandardMaterial({ color: 0x444444 }),
  );
  pole.position.set(poleX, poleHeight / 2, z);

  const arm = new Mesh(new BoxGeometry(1.2, 0.1, 0.1), new MeshStandardMaterial({ color: 0x444444 }));
  arm.position.set((boardX + poleX) / 2, y + 0.6, z);

  for (const m of [rim, board, pole, arm]) m.castShadow = true;
  group.add(rim, board, pole, arm);
  return group;
}
```

- [ ] **Step 7: Implement `src/render/player-view.ts`**

```ts
import { BoxGeometry, CapsuleGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { PlayerState } from '../sim/types';
import { lerpAngle, lerpVec3 } from './interpolate';

/**
 * Placeholder player (spec §5.5): capsule body, box head, and a cone on the front so the facing
 * direction is visible. Position and facing are interpolated between two simulation states.
 */
export class PlayerView {
  readonly group = new Group();

  constructor(color: number) {
    const body = new Mesh(new CapsuleGeometry(0.35, 1.0, 4, 12), new MeshStandardMaterial({ color }));
    body.position.y = 0.85;
    body.castShadow = true;

    const head = new Mesh(new BoxGeometry(0.3, 0.3, 0.3), new MeshStandardMaterial({ color: 0xf1c27d }));
    head.position.y = 1.75;
    head.castShadow = true;

    // ConeGeometry points +Y; rotate so it points +Z, which is the facing direction at yaw 0.
    const nose = new Mesh(new ConeGeometry(0.12, 0.3, 8), new MeshStandardMaterial({ color: 0xffffff }));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.2, 0.45);

    this.group.add(body, head, nose);
  }

  update(prev: PlayerState, next: PlayerState, alpha: number): void {
    const p = lerpVec3(prev.pos, next.pos, alpha);
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.y = lerpAngle(prev.facing, next.facing, alpha);
  }
}
```

- [ ] **Step 8: Run the check**

Run: `npm run check`
Expected: green. `tsc` must accept the Three.js types; if `CapsuleGeometry` or `ConeGeometry` signatures differ in `@types/three@0.186`, adjust the arguments to match the installed types rather than loosening `tsconfig`.

- [ ] **Step 9: Commit**

```bash
git add src/render tests/render
git commit -m "feat(render): add GameScene, placeholder court and player views, broadcast camera

Refs #<issue>"
```

**Acceptance criteria:** pure helpers tested; `render/` imports only from `three` and `sim/`; pixel ratio capped at 2; camera pose pulls back in portrait.

---

### Task 8: App wiring, debug overlay, and playable deploy

**Files:**
- Create: `src/app/match-runner.ts`, `src/app.ts`, `src/ui/debug-overlay.ts`
- Modify: `src/main.ts` (replace the Task 1 placeholder)
- Test: `tests/app/match-runner.test.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 2–7.
- Produces:
  - `class MatchRunner { constructor(court: CourtDef, initial: MatchState); readonly court: CourtDef; readonly previous: MatchState; readonly current: MatchState; step(intents: ReadonlyMap<PlayerId, PlayerIntent>): SimEvent[] }`
  - `startGame(root: HTMLElement, options: { debug: boolean }): { stop(): void }`
  - `class DebugOverlay { constructor(parent: HTMLElement); update(data: DebugData): void; dispose(): void }`, `interface DebugData { fps: number; ticksPerSecond: number; pos: Vec3; speed: number; turbo: number; inputKind: string; tick: number }`

- [ ] **Step 1: Write the failing MatchRunner test**

`tests/app/match-runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MatchRunner } from '../../src/app/match-runner';
import { getCourt } from '../../src/content/courts';
import { createMatch, findPlayer } from '../../src/sim/match';
import { NO_INTENT } from '../../src/sim/types';

function runner(): MatchRunner {
  const court = getCourt('gym');
  const state = createMatch(
    { durationMs: 60_000, shotClockMs: 14_000, seed: 5, ruleIds: [], courtId: 'gym' },
    court,
    [{ id: 'p', team: 0, characterId: 'placeholder' }],
  );
  return new MatchRunner(court, state);
}

describe('MatchRunner', () => {
  it('starts with previous and current equal to the initial state', () => {
    const r = runner();
    expect(r.previous).toBe(r.current);
    expect(r.current.tick).toBe(0);
  });

  it('keeps the previous state one tick behind after stepping', () => {
    const r = runner();
    r.step(new Map([['p', { ...NO_INTENT, move: { x: 1, y: 0 } }]]));
    r.step(new Map([['p', { ...NO_INTENT, move: { x: 1, y: 0 } }]]));
    expect(r.current.tick).toBe(2);
    expect(r.previous.tick).toBe(1);
    expect(findPlayer(r.current, 'p')?.pos.x).toBeGreaterThan(findPlayer(r.previous, 'p')?.pos.x ?? 0);
  });

  it('returns the events of the step', () => {
    const r = runner();
    expect(r.step(new Map())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/app/match-runner.test.ts`
Expected: FAIL — cannot resolve `../../src/app/match-runner`.

- [ ] **Step 3: Implement `src/app/match-runner.ts`**

```ts
import { tick } from '../sim/tick';
import type { CourtDef, MatchState, PlayerId, PlayerIntent, SimEvent } from '../sim/types';

/** Holds the two latest simulation states so the renderer can interpolate between them. */
export class MatchRunner {
  private prev: MatchState;
  private next: MatchState;

  constructor(
    readonly court: CourtDef,
    initial: MatchState,
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
    const result = tick(this.next, intents, this.court);
    this.prev = this.next;
    this.next = result.state;
    return result.events;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/app/match-runner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `src/ui/debug-overlay.ts`**

```ts
import type { Vec3 } from '../sim/math';

export interface DebugData {
  fps: number;
  ticksPerSecond: number;
  tick: number;
  pos: Vec3;
  speed: number;
  turbo: number;
  inputKind: string;
}

/** `?debug` overlay (spec §10.3). Updates its text at most 4× per second. */
export class DebugOverlay {
  private readonly el: HTMLPreElement;
  private lastUpdate = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.style.cssText =
      'position:absolute;top:8px;left:8px;margin:0;padding:6px 8px;z-index:20;' +
      'font:12px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);' +
      'border-radius:6px;pointer-events:none;';
    parent.appendChild(this.el);
  }

  update(data: DebugData): void {
    const now = performance.now();
    if (now - this.lastUpdate < 250) return;
    this.lastUpdate = now;
    this.el.textContent = [
      `fps    ${data.fps.toFixed(0)}`,
      `ticks  ${data.ticksPerSecond.toFixed(0)}/s  (#${data.tick})`,
      `pos    ${data.pos.x.toFixed(2)}, ${data.pos.z.toFixed(2)}`,
      `speed  ${data.speed.toFixed(2)} m/s`,
      `turbo  ${(data.turbo * 100).toFixed(0)}%`,
      `input  ${data.inputKind}`,
    ].join('\n');
  }

  dispose(): void {
    this.el.remove();
  }
}
```

- [ ] **Step 6: Implement `src/app.ts`**

```ts
import { GameLoop } from './app/game-loop';
import { MatchRunner } from './app/match-runner';
import { getCourt } from './content/courts';
import { InputManager } from './input/input-manager';
import { KeyboardBackend } from './input/keyboard';
import { TouchBackend } from './input/touch';
import { BroadcastCamera } from './render/camera';
import { buildCourtView } from './render/court-view';
import { PlayerView } from './render/player-view';
import { GameScene } from './render/scene';
import { createMatch, findPlayer } from './sim/match';
import type { PlayerId, PlayerIntent } from './sim/types';
import { DebugOverlay } from './ui/debug-overlay';

export interface GameOptions {
  debug: boolean;
}

const HUMAN_ID: PlayerId = 'home1';
const TEAM_COLORS = [0x2f80ed, 0xeb5757] as const;

/** Phase 1 entry point: one human-controlled placeholder on the gym court, no menus yet. */
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
      { durationMs: 180_000, shotClockMs: 14_000, seed: 1, ruleIds: [], courtId: court.id },
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

  const touch = new TouchBackend(root);
  const input = new InputManager([new KeyboardBackend(window), touch]);
  input.onActiveKindChange = (kind) => (kind === 'touch' ? touch.show() : touch.hide());
  // Show the touch controls on the very first touch, before any joystick movement exists.
  const onFirstTouch = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') touch.show();
  };
  root.addEventListener('pointerdown', onFirstTouch);

  const broadcastCamera = new BroadcastCamera(scene.camera);
  input.cameraYaw = broadcastCamera.yaw;

  const resize = (): void => {
    scene.resize(root.clientWidth, root.clientHeight, window.devicePixelRatio);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(root);

  const overlay = options.debug ? new DebugOverlay(root) : null;
  let tickCount = 0;
  let frameCount = 0;
  let statsWindowStart = performance.now();
  let fps = 0;
  let ticksPerSecond = 0;

  const intents = new Map<PlayerId, PlayerIntent>();

  const loop = new GameLoop(
    () => {
      intents.set(HUMAN_ID, input.sample());
      runner.step(intents);
      tickCount += 1;
    },
    (alpha, frameMs) => {
      const prev = runner.previous;
      const next = runner.current;
      for (const [id, view] of playerViews) {
        const a = findPlayer(prev, id);
        const b = findPlayer(next, id);
        if (a && b) view.update(a, b, alpha);
      }
      const human = findPlayer(next, HUMAN_ID);
      if (human) broadcastCamera.update(human.pos, frameMs / 1000);
      scene.render();

      frameCount += 1;
      const now = performance.now();
      if (now - statsWindowStart >= 1000) {
        fps = (frameCount * 1000) / (now - statsWindowStart);
        ticksPerSecond = (tickCount * 1000) / (now - statsWindowStart);
        frameCount = 0;
        tickCount = 0;
        statsWindowStart = now;
      }
      if (overlay && human) {
        overlay.update({
          fps,
          ticksPerSecond,
          tick: next.tick,
          pos: human.pos,
          speed: Math.hypot(human.vel.x, human.vel.z),
          turbo: human.turbo,
          inputKind: input.activeKind ?? '-',
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
      overlay?.dispose();
      scene.dispose();
      canvas.remove();
    },
  };
}
```

- [ ] **Step 7: Replace `src/main.ts`**

```ts
import { startGame } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const debug = new URLSearchParams(window.location.search).has('debug');
startGame(root, { debug });
```

- [ ] **Step 8: Run the check and the dev server, verify in the browser**

Run: `npm run check` — expected green.
Run: `npm run dev` and open `http://localhost:5173/?debug`. Verify with Chrome DevTools (the reviewer repeats this):

1. Desktop 1366×768: the gym court with two hoops is visible from a raised sideline camera; the blue capsule starts on the left half facing right; WASD/arrows move it, Shift makes it faster and the turbo % in the overlay drops then refills; the player cannot leave the court; overlay shows ~60 ticks/s.
2. Tablet 1024×768 with touch emulation: touching the left half shows the joystick where the finger landed and moves the player; the four buttons on the right are visible and at least 56 px; the joystick and TURBO work at the same time; no page scroll or zoom.
3. Phone 390×844 portrait: the half court around the player fits (camera pulled back and raised, spec §9); controls remain reachable.
4. Console has no errors or warnings.
5. Resize the window: the canvas follows without stretching.

- [ ] **Step 9: Commit**

```bash
git add src/app.ts src/app/match-runner.ts src/ui/debug-overlay.ts src/main.ts tests/app/match-runner.test.ts
git commit -m "feat(app): wire simulation, input, renderer and debug overlay into a playable skeleton

Refs #<issue>"
```

**Acceptance criteria:** the browser checklist in Step 8 passes on desktop, tablet and phone sizes; `npm run check` green; after merge, the Pages deploy workflow succeeds and the same page is playable at `https://fabio-ff.github.io/RoarBall/`.

---

## Phase 1 acceptance checklist (final reassessment by Fable)

- [ ] `npm run check` passes on `main`; CI green on the last merge; Pages deploy green and the URL loads.
- [ ] Spec §3 boundaries: `src/sim/` has no import from `three`, `render/`, `ui/`, `input/`, `audio/`, `app/` (confirm with `grep -rn "from '" src/sim | grep -v "from './"`), and the lint probe from Task 1 Step 12 still fails as intended.
- [ ] Spec §4.10 determinism: the tick determinism test exists and passes; no `Math.random`/`Date.now` in `src/sim/`.
- [ ] Spec §8 input: keyboard, touch joystick (left half, floating), four buttons (≥ 56 px), multi-touch, camera-relative move with yaw 0, touch controls hidden until first touch and hidden again on keyboard use.
- [ ] Spec §9: fixed-step loop with interpolation and catch-up cap; broadcast camera; portrait fallback; pixel ratio ≤ 2; resize handled.
- [ ] Spec §7.1: the gym is a `CourtDef` in `src/content/courts/` importing only types from sim; hoops and lines are generated from it.
- [ ] Spec §10.3: `?debug` overlay shows tick rate, frame time/fps, position, speed, turbo, input kind.
- [ ] Manual feel check on a real tablet if available: movement is responsive, turbo is noticeably faster, no scroll/zoom/selection artefacts.
- [ ] Each task has a closed issue and a merged PR with an Opus review recorded on GitHub.
- [ ] Deviations and rulings from the ledger are listed in the reassessment comment on the epic issue.

## Deferred from the spec to later phases (recorded, not forgotten)

- Tip-off / scored / inbound phases (phase 2, with the ball).
- Gamepad backend (phase 6).
- Headless Chrome smoke test in CI (phase 6, with the menu flow).
- Asset pipeline script and `docs/adding-content.md` (phase 7, when the first real asset lands).
- `CharacterDef` and the stat tuning table (phase 3); until then `DEFAULT_STATS`.
