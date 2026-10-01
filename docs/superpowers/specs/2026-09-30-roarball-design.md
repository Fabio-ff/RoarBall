# RoarBall — Design Spec

Date: 2026-09-30
Status: approved design, pre-implementation

## 1. Summary

RoarBall is a browser-based 3D arcade basketball game in the spirit of NBA Jam:
2v2 matches on spectacular courts, over-the-top moves, one signature ability per
character, and no real-world rules to get in the way. It runs as a static web
app, responsive across desktops, tablets and phones, with tablets and desktops
as the primary targets.

The first release is a **quick match against AI**. The simulation is designed
from day one so that online multiplayer, tournaments, difficulty levels and new
content (characters, courts, abilities) can be added without restructuring.

The game is built primarily for the author and his son; design directions are
validated with him before being extended.

## 2. Decisions

| Topic | Decision | Deferred / future |
|---|---|---|
| Core game | Arcade 2v2 with passing, alley-oops, dunks, blocks, steals, shoves | — |
| Opponents | AI teammate and AI opponents | Online multiplayer (sim is deterministic and input-driven) |
| Courts | Spectacular locations; each has one *light* gameplay modifier | Active hazards/events |
| Theme | Human athletes at launch | Beast characters as a content pack |
| Special moves | One signature ability per character, charged by play | Court pickups on the same ability system |
| Controls | Keyboard, gamepad, context-sensitive touch (tablet-first) | Player switching, remapping UI |
| Rules | Pure arcade: shot clock + invisible boundary only | Difficulty levels that enable more rules (out of bounds, goaltending, travelling) |
| Art | Low-poly stylized, placeholders first, per-asset upgrades | Detailed toon style |
| Modes | Quick match only, nothing persisted | Tournament ladder, unlocks |
| Physics | Custom lightweight physics; shot outcome decided at release | — |

### Stack

| Layer | Choice | Reason |
|---|---|---|
| Rendering | Three.js (WebGL) | Small bundle, best mobile coverage, huge ecosystem; WebGPU opt-in later |
| Physics | Custom (sphere vs plane/box/torus/capsule; kinematic players) | Deterministic, no WASM, ~300 lines we own; arcade shooting is outcome-based anyway |
| Language / build | TypeScript (strict) + Vite | Fast iteration, static deploy |
| UI / HUD | Plain DOM + CSS overlaid on the canvas | Free responsiveness, crisp at any DPI |
| Input | Pointer Events, Gamepad API, keyboard → one `PlayerIntent` type | Device-agnostic simulation |
| Audio | Howler.js | Mobile audio unlock, sprites |
| Assets | glTF + Draco meshes + KTX2 textures via gltf-transform | Small downloads |
| Tests | Vitest (headless simulation), headless Chrome smoke test | — |
| Hosting | GitHub Pages via GitHub Actions on push to `main` | Free, sufficient without a server |

Rejected: Babylon.js (heavier, we'd use a fraction), React Three Fiber (render
cycle indirection in a physics loop), Unity/Godot web export (download size,
startup, mobile browser behaviour), PlayCanvas (editor-centric), Rapier (full
rigid-body physics makes arcade shooting hard to tune; determinism needs a
specific build), ECS frameworks (five moving entities don't justify the
indirection).

## 3. Architecture

Four layers that only communicate downward or through plain data:

```
┌──────────────────────────────────────────────────────────┐
│ App shell  (DOM/CSS): menus, character/court select, HUD │
├──────────────────────────────────────────────────────────┤
│ Input layer: keyboard · gamepad · touch  →  PlayerIntent │
├──────────────────────────────────────────────────────────┤
│ Simulation (pure TS, no DOM, no Three.js)                │
│   fixed 60 Hz tick(intents[]) → MatchState               │
│   physics · rules · abilities · AI · court modifiers     │
├──────────────────────────────────────────────────────────┤
│ Presentation: Three.js scene, animation, audio, VFX      │
│   reads MatchState, interpolates, never writes it        │
└──────────────────────────────────────────────────────────┘
          Content (data + assets): characters · courts · abilities
```

- **Simulation** runs at a fixed 60 ticks/s independent of frame rate. It takes
  one `PlayerIntent` per player per tick and produces a new `MatchState`. No
  DOM, no Three.js, no timers, no `Math.random`, no `Date.now`. AI players
  produce intents of the same type, so the simulation cannot distinguish
  human, AI or (later) remote players. Same seed + same intents = same match.
- **Presentation** owns the Three.js scene. Each frame it interpolates between
  the two latest states and updates meshes, animations, camera, audio and
  effects. It reacts to simulation events for one-off effects. It never writes
  game state.
- **Input layer** turns device events into `PlayerIntent`. Three backends
  (keyboard, gamepad, touch) implement one interface; the touch backend also
  renders its on-screen controls in the DOM.
- **App shell** is DOM/CSS: title, quick-match setup, pause, results, HUD.
- **Content** is typed data plus assets. Court modifiers and ability effects
  are the only content that includes code, through small fixed interfaces.

### Folder layout

```
src/
  sim/            state, physics, rules, abilities, ai, match
  input/          intent types + keyboard / gamepad / touch backends
  render/         Three.js scene, views, camera, vfx
  audio/
  ui/             DOM screens and HUD
  content/
    characters/   one folder per character (definition + model + clips)
    courts/       one folder per court (definition + modifier + assets)
    abilities/    one file per signature move
  app.ts          wiring: game loop, screen flow
tests/            headless simulation tests (Vitest)
assets-src/       raw model/texture/sound exports (not shipped)
public/assets/    compressed glTF, KTX2, audio
scripts/          asset pipeline, balance harness
docs/
```

### Boundary rules (enforced by ESLint import rules)

- `sim/` must not import from `render/`, `ui/`, `input/`, `audio/`.
- `content/` may import only types from `sim/`.
- The single piece of data flowing from presentation to input is the camera
  yaw, used for camera-relative movement.

## 4. Simulation

### 4.1 State

`MatchState` is a plain, cloneable, serialisable object.

```
MatchState
  tick, clockMs, shotClockMs
  score: [home, away]
  phase: 'tipoff' | 'live' | 'scored' | 'inbound' | 'paused' | 'finished'
  ball: { pos, vel, holder: playerId | null, flight: ShotFlight | null }
  teams: [ { players: PlayerState[] }, { players: PlayerState[] } ]
  rng: seeded RNG state
  settings: MatchSettings

PlayerState
  id, team, characterId
  pos, facing, vel, onGround
  action: 'idle' | 'run' | 'dribble' | 'shoot' | 'layup' | 'dunk' | 'pass'
        | 'jump' | 'block' | 'steal' | 'shove' | 'stunned' | 'getup' | 'celebrate'
  actionTicks            ticks elapsed in the current action
  turbo                  0..1 stamina bar
  abilityCharge          0..1
  abilityActive: { abilityId, ticksLeft, data } | null
  stats: ResolvedStats   character stats × court modifier × active ability
  cooldowns: { steal, shove, block }

MatchSettings
  durationMs (default 3 min), targetScore?: number, shotClockMs (default 14 s),
  seed, ruleIds: string[]
```

Teams are lists of players; team size is never hard-coded.

### 4.2 Tick pipeline (fixed order)

1. Apply court modifier `onTick` and `modifyStats` → `ResolvedStats`.
2. Apply active ability `onTick` / `modifyStats`.
3. Resolve each player's intent into an action, respecting what the current
   action allows (e.g. no input during `stunned`, `dunk` is animation-locked).
4. Move players (kinematic: velocity from stats and intent, gravity when
   airborne, clamped to the play area).
5. Move ball: held → follows holder's hand offset; `flight` → along the
   computed arc; free → gravity, drag, integration.
6. Collisions: ball vs floor/backboard/rim/net/players; player vs player
   (shove resolution, soft separation).
7. Rules: run every enabled `Rule.check(state)`; apply violations.
8. Scoring and phase transitions.
9. Cooldowns, ability timers, turbo regen/drain, charge gains.
10. Emit events for this tick.

### 4.3 Match phases

- `tipoff`: ball awarded to a random team (seeded); presentation plays a jump
  ball animation.
- `live`: normal play.
- `scored`: short celebration pause, then `inbound`.
- `inbound`: scored-on team receives the ball at their baseline; shot clock
  resets.
- `finished`: clock reaches zero (or target score reached). Tied at zero →
  sudden-death overtime (next basket wins).
- `paused`: UI-only; the tick is not advanced.

### 4.4 Shooting (outcome-based)

Pressing action with the ball starts a `shoot` action (or `layup`/`dunk` when
close to the hoop; see below). At release:

```
quality = shotQuality(state, shooter)   // 0..1
  inputs: distance to hoop, shooter.stats.shooting, nearest defender distance
          and whether that defender is jumping/blocking, shooter speed at
          release, court modifier, active ability flags (e.g. "cannot miss")
make = rng.next() < quality
```

- **Make**: `ShotFlight` is an arc ending at the hoop centre. The basket counts
  when the ball crosses the rim plane inside the ring. 2 points inside the
  arc, 3 outside.
- **Miss**: arc targets a point on the rim or backboard chosen from a miss type
  (front rim, back rim, side, board). On impact the ball is released into free
  physics for a live rebound.
- **Dunk**: shot started close to the hoop while jumping towards it.
  Animation-locked, cannot miss, only stoppable by a block that begins before
  the dunk begins.
- **Layup**: close, non-jumping variant; high quality but blockable.
- **Block**: if the ball is released within reach of a rising blocker, the
  shot is deflected into free physics instead of following its arc.

`shotQuality` is the single source of truth, shared by the simulation and the
AI.

### 4.5 Passing

- Pass: fast low arc to the teammate. Intercepted if a defender's capsule
  crosses the path.
- Alley-oop: if the teammate is airborne near the hoop, the pass is a lob;
  catching it converts into a `dunk`.
- Pressing pass without the ball asks the AI teammate to pass to you.

### 4.6 Defence

| Move | Effect | Cost |
|---|---|---|
| Block | Jump with arms up; deflects a shot released within reach while rising | Airborne, can be faked |
| Steal | Short reach; takes the ball if holder in range and not protected | Cooldown + failure animation |
| Shove | Knocks opponent down (`stunned` → `getup`); loose ball if they held it | Cooldown, stronger with turbo |

### 4.7 Turbo

Holding turbo drains a stamina bar and increases speed, jump height and shove
power. It regenerates when released. This is the pacing resource.

### 4.8 Rules

A `Rule` is `{ id, check(state) → Violation | null }`. `MatchSettings.ruleIds`
selects the enabled set. Launch set: `shotClock`, `boundary` (invisible walls).
Implemented later but designed for: `outOfBounds`, `goaltending`,
`travelling`. Difficulty levels will be presets of rule sets + AI profiles.

### 4.9 Events

Per tick the simulation emits `SimEvent[]`: `shotReleased`, `basket`, `miss`,
`rimHit`, `boardHit`, `bounce`, `block`, `steal`, `shove`, `pass`,
`intercept`, `abilityStart`, `abilityEnd`, `phaseChange`, `violation`.
Presentation, audio and HUD consume them; the simulation never waits on them.

### 4.10 Determinism

Seeded RNG only; no wall-clock; fixed pipeline order; no dependence on frame
timing. A match is fully replayable from `seed + intents[]`. This is the basis
for both replay tests and future networking.

## 5. Characters and abilities

### 5.1 Character definition

```
CharacterDef
  id, name, description
  stats: { speed, jump, shooting, dunking, defense, power, stamina }  // 1..10
  abilityId
  model: { file, scale, animationSet }
  appearance: { primaryColor, secondaryColor }
```

A single tuning table maps 1–10 stats to simulation values (e.g. speed 5 →
6 m/s, speed 10 → 8 m/s). Rebalancing the cast means editing that table.

### 5.2 Launch cast (4 characters, human athletes)

| Archetype | Strengths | Weakness | Ability |
|---|---|---|---|
| Dunker | dunking, power | speed, shooting | Rocket Dunk |
| Sniper | shooting | defense, power | Hot Hand |
| Speedster | speed, defense (steals) | power, dunking | Blur |
| All-rounder | balanced | no standout | Earthquake |

Names and looks are decided during content creation.

### 5.3 Ability system

```
AbilityDef
  id, name, description, icon
  chargeCost (full bar)
  durationTicks | 'instant'
  effect: AbilityEffect
  aiWantsToUse?(state, player) → boolean

AbilityEffect
  onActivate(state, player)
  onTick?(state, player)
  onEnd?(state, player)
  modifyStats?(stats) → stats
```

Charge is earned by play: basket (+ by points), assist, steal, block. A full
bar + special button activates. Launch abilities, chosen to exercise different
hooks:

- **Rocket Dunk** (8 s): dunks can start from anywhere inside the 3-point
  line and cannot be blocked. `modifyStats` + flag read by dunk logic.
- **Hot Hand**: next three shots cannot miss. `onActivate` sets a counter
  consumed by the shot outcome.
- **Blur** (6 s): doubled speed, unlimited turbo, steals always succeed.
  `modifyStats` + steal flag.
- **Earthquake** (instant): all opponents within a radius are knocked down.
  `onActivate` only.

Future court pickups reuse `AbilityDef`, activated on touch.

### 5.4 Animation

All humanoids share one skeleton and one animation set: idle, run, sprint,
dribble idle, dribble run, jump shot, layup, dunk, pass, catch, block, steal,
shove, knocked down, get up, celebrate. `model.animationSet` names the set so
differently proportioned characters (beasts) can bring their own clips.
Presentation maps `action` + velocity to clips and blends; the simulation only
knows action names and durations.

### 5.5 Placeholders

Until models exist a character is a coloured capsule, a box head and a cone
for facing, with the current action shown as floating debug text. Gameplay is
tuned in this state.

## 6. AI

Lives in `sim/ai/`; produces `PlayerIntent` like any input backend.

- **Cadence**: decision tree evaluated every 6 ticks (10 Hz) with a per-player
  offset; steering towards the chosen goal every tick.
- **Branches**:
  - *Has ball*: drive if the lane is open; shoot if `shotQuality` ≥ threshold;
    pass if the teammate has a better shot; use ability if charged and
    `aiWantsToUse`; reset if defence is tight and the shot clock allows.
  - *Teammate has ball*: move to an open named spot (corners, wings, top of
    key, under basket); cut when a lane opens; jump near the rim to invite an
    alley-oop.
  - *Defending*: mark assigned opponent between them and the hoop; steal when
    in range and unprotected; block when the mark starts a shot nearby; shove
    a driving opponent when turbo allows; chase loose balls if closest.
- **Shared judgement**: uses the same `shotQuality` function as the simulation.
- **Profiles**: thresholds, reaction delay (ticks), steal attempt rate and
  perception noise come from an `AiProfile`. One profile at launch; difficulty
  levels and a slightly weaker teammate later.
- **Teammate influence**: pass button asks for the ball; teammate favours
  spots near where the human is heading.
- **Court awareness**: reads `ResolvedStats` (already includes modifiers) and
  `CourtModifier.aiHint` (e.g. `ballDrift` under gusts).
- **No player switching** at launch.

## 7. Courts

### 7.1 Definition

```
CourtDef
  id, name, description
  scene: { file, scale }                 environment glTF (outside play area)
  playArea: { length, width }            identical on all courts at launch
  hoops: [ { pos, rimHeight } × 2 ]
  physics: { gravity, friction, restitution, airDrag }
  lighting: { skyColor, sunDirection, sunColor, ambient, fog? }
  modifier?: CourtModifier

CourtModifier
  id, name, description
  onTick?(state)
  modifyStats?(stats) → stats
  aiHint?(state, player) → { ballDrift?: Vec3 }
```

The play surface, lines, hoops, backboards and nets are generated from the
definition so visuals always match physics. The environment never needs
collision.

### 7.2 Launch courts

| Court | Setting | Modifier | Hooks used |
|---|---|---|---|
| Gym | plain indoor court | none (dev / tutorial / balance baseline) | — |
| Rooftop Storm | skyscraper roof in a thunderstorm | **Gusts**: every 15–25 s a gust pushes the ball in flight and nudges airborne players for a few seconds; shown by rain and flags | `onTick`, `aiHint` |
| Volcano Rim | cooled lava beside a glowing crater | **Heat**: turbo drains faster; shoves stronger; knock-downs last longer | `modifyStats` |
| Frozen Lake | ice sheet under aurora | **Slick**: low friction; slower acceleration/stopping, drift on direction change | `physics.friction` + stat multiplier |

### 7.3 Performance budget (per court, mid-range tablet, 60 fps)

< 100 k triangles in view, < 30 environment draw calls, KTX2 textures, one
directional shadow light limited to the play area, pixel ratio ≤ 2, render
scale adjustable independently of DOM size.

## 8. Input

```
PlayerIntent
  move: { x, y }      unit vector or zero, camera-relative court space
  action: boolean     shoot / layup / dunk with ball; block / steal / shove without
  pass: boolean       pass, or call for pass
  special: boolean
  turbo: boolean
```

Buttons are reported as held; the simulation detects edges, so one-tick
presses are never lost.

- **Context-sensitive action** is resolved in the simulation (same on every
  device and for AI): with ball → shoot/layup/dunk; without → block if mark is
  shooting or near hoop, else steal if handler in reach, else shove nearest.
- **Keyboard**: WASD/arrows, Space action, E pass, Q special, Shift turbo.
  Remappable via settings object (no UI at launch).
- **Gamepad**: left stick, A action, X pass, Y special, RT/B turbo; standard
  mapping; hot-plug.
- **Touch** (tablet-first, landscape):

```
┌──────────────────────────────────────────────┐
│ score   ⏱ 2:41   ⚡ ability charge     ⏸     │
│                  (3D court)                  │
│   ╭───╮                              (SP)    │
│   │ ◯ │  floating joystick       (PASS)      │
│   ╰───╯                          (ACTION)    │
│                                  (TURBO)     │
└──────────────────────────────────────────────┘
```

  Floating joystick appears where the left thumb touches (left half). Right
  side: three DOM buttons, action largest and lowest, min 56 px targets,
  sized relative to viewport, tighter layout on phone widths. Turbo: start
  with a separate button; long-press-while-moving is the alternative to test.
  Multi-touch via Pointer Events tracked by pointer id.
- **Camera-relative movement**: stick "up" = across the court away from the
  camera; camera yaw is the only value flowing from render to input.
- **Device detection**: touch controls appear on first touch, hide on
  keyboard/gamepad use.

## 9. Rendering, UI, audio

- **Game loop**: accumulator; simulation ticks as many fixed steps as needed
  (capped per frame), render once with the remainder as interpolation factor.
- **Views**: `PlayerView` (mesh, mixer, clip selection, tint), `BallView`,
  `CourtView` (environment + generated court geometry), `EffectsView`
  (event-driven particles/flashes). Views map state → visuals only.
- **Camera**: broadcast-style side view, elevated, follows the ball with
  smoothing, zooms out as players spread; fixed orientation. Portrait: pulls
  back and rises so the half court fits.
- **Responsiveness**: canvas fills viewport; handles resize/orientation;
  landscape intended, rotate hint in portrait on menus; safe-area insets.
- **UI screens** (DOM, one module each, flow as a state machine in `app.ts`):
  Title → Quick Match setup (character / teammate / opponents / court cards
  with a small 3D preview) → Match (HUD + touch controls) → Pause → Results.
  HUD: scores in team colours, clock, shot clock, ability bar per human, event
  banners ("3 POINTS!", "BLOCKED!", "ROCKET DUNK!").
- **Audio**: Howler.js; event-driven SFX (bounce scaled by impact, swish, rim,
  squeaks, crowd, ability stingers); one music loop per court, menu loop,
  results stinger; volume in `localStorage`.
- **Loading**: per-match progress screen for selected characters, court and
  shared sounds; Draco + KTX2 decoders shipped; placeholders load instantly.

## 10. Content pipeline, testing, tooling

### 10.1 Content

Registries: `content/characters/index.ts`, `content/courts/index.ts`,
`content/abilities/index.ts`. A build-time validator checks every definition
(stat ranges, referenced ids and asset files exist). `scripts/asset-pipeline`
compresses `assets-src/` → `public/assets/` with gltf-transform. Raw exports
are never shipped. `docs/adding-content.md` explains how to add a character,
court or ability (one page each).

Asset sourcing plan: placeholders → CC0 low-poly packs (Quaternius, Kenney)
with Mixamo animation → custom or AI-generated (Meshy/Tripo/Luma, cleaned in
Blender) or Blender-Python-scripted courts and props.

### 10.2 Testing (Vitest)

- **Unit**: collision routines, `shotQuality`, arc solver (arc passes through
  rim), each rule, each ability effect, each court modifier.
- **Simulation** (headless scenarios): make-rate over 1000 seeded shots;
  interception geometry; shove → loose ball; phase transitions; replay
  determinism (seed + intents reproduces final state).
- **Balance** (on demand): AI vs AI across characters and courts; assert
  win-rate bands (no side > 60 % with equal characters) and score ranges;
  produce a report.
- **Smoke**: headless Chrome boots the app on placeholders, starts a match,
  asserts frames render without console errors.

### 10.3 Tooling

Vite, TypeScript strict, ESLint (import boundaries), Prettier, Vitest.
`?debug` overlay: tick rate, frame time, AI decision per player, controlled
player's current `shotQuality`. GitHub Actions: build + deploy to GitHub Pages
on push to `main`.

## 11. Implementation phases

Each phase ends with something playable.

1. Skeleton: Vite/TS project, game loop, placeholder gym court, one
   controllable capsule, keyboard + touch, deploy workflow.
2. Ball: dribbling, outcome-based shooting with arcs, scoring, match phases,
   HUD.
3. Passing, defence (block/steal/shove), turbo, the four characters on
   placeholders.
4. AI for teammate and opponents; balance harness.
5. Abilities and the three court modifiers.
6. Menus, gamepad, audio, effects, polish.
7. Real models and animations replace placeholders, court by court.

## 12. Out of scope for the first release

Online multiplayer, tournament/unlocks/persistence, difficulty levels and
extra rules, court hazards, pickups, player switching, beast characters,
control remapping UI, WebGPU renderer.

## Appendix A — Phase 2 decisions (2026-09-30)

Decisions taken when planning Phase 2 (ball, shooting, scoring, match phases, HUD)
that the main text leaves open. They refine, never contradict, §4.

### A.1 Solo play: shootaround mode

Until AI opponents exist (phase 4), the playable build runs in **shootaround**:
`MatchSettings.mode = 'shootaround' | 'match'`. In shootaround there is no clock,
either hoop scores, and after a basket or a shot-clock reset the ball is handed
straight back to the human at their baseline. The full phase machine of §4.3 is
implemented and tested headless regardless of mode; `match` mode is what phase 4
switches to by changing settings, not code.

### A.2 Ball

`BallState` gains `radius` (0.12 m) and `mode: 'held' | 'flight' | 'free'`.
Held: follows the holder's hand offset (dribbling is presentation only).
Flight: follows a solved ballistic arc exactly (§A.4). Free: gravity, air drag
and restitution from `CourtDef.physics`, colliding with floor, backboard (box),
rim (torus: closest point on the ring circle, then sphere test) and players
(capsules). Balls are clamped to the play area like players.

### A.3 Loose-ball pickup

A free ball below shoulder height is picked up by any player whose capsule
overlaps it, except the last shooter during a short post-release cooldown
(0.5 s). Steals and interceptions (phase 3) reuse this hook.

### A.4 Shooting details

- Shot type is chosen at the press: **dunk** within 2 m of the hoop while moving
  towards it; **layup** within 2.5 m otherwise; else **jump shot**. The shooter
  is animation-locked; the ball leaves at a fixed tick of the animation.
- `shotQuality(state, shooter)` in phase 2 uses distance, `stats.shooting` and
  movement speed at release; defender terms are added in phase 3 to the same
  function. No timing mechanic: a press is a shot (a release-timing bonus at the
  top of the jump is a **future enhancement**, see §12).
- Target hoop: the team's attacking hoop; in shootaround, the nearer hoop.
- Points: 3 beyond the FIBA 6.75 m arc (measured from the rim centre at release),
  otherwise 2. Dunks always score.
- Miss: the arc targets a rim or backboard point from a small table of miss
  types (front rim, back rim, side rim, board), then the ball goes free.
- Arc solver: given release point, target point and a flight time derived from
  distance (longer shots arc higher and take longer), solve the initial velocity
  under the court's gravity. Pure function; the arc must pass within 1 mm of the
  target in tests.

### A.5 Match flow defaults

`durationMs` 180 000, `shotClockMs` 14 000, `scored` pause 1.5 s, sudden-death
overtime on a tie. Shot clock resets on possession change and on a rim hit.
Tip-off awards the ball to a seeded random team and, until a jump-ball
animation exists, transitions to `live` immediately.

### A.6 Input edges and controllers

`PlayerState.prevButtons` stores last tick's buttons so the simulation detects
presses (§8). Backends latch a press that began and ended between two samples so
one-tick taps are never lost. The app holds a `controllers` map
(`PlayerId → () => PlayerIntent`) instead of a single human id; the camera
follows the ball.

### A.7 Content and the RNG

§3 says content may import only types from `sim/`. Court modifiers (§7.1) and
abilities (§5.3) that need randomness or math must receive them through their
hook context (`{ rng, math }` passed by the simulation), not by importing values.
Phase 5 implements this; the boundary lint stays as is.

### A.8 Future enhancements (not scheduled)

- Release-timing bonus: a small quality bonus when the shot button is released at
  the top of the jump.

## Appendix B — Phase 3 decisions (2026-10-01)

Decisions taken when planning Phase 3 (passing, defence, characters). They refine §4.5,
§4.6 and §5.

### B.1 Playable build: training dummies

AI arrives in phase 4. Phase 3's shootaround adds two scripted placeholders through the
same `controllers` map the AI will use (`(state) => PlayerIntent`): a **teammate dummy**
that walks to the wing of the hoop the human attacks, passes back one second after
catching or at once when the human calls for the ball, and lobs an alley-oop when the
human is airborne near the rim; and a **defender dummy** that walks to the key of that
hoop, raises for a block whenever the ball handler comes within 2.5 m, and can be stolen
from and shoved. Dummies never decide anything else.

### B.2 Characters

`CharacterDef` per §5.1. Launch cast: **Brick** (dunker), **Ace** (sniper), **Dash**
(speedster), **Rook** (all-rounder). One tuning table in `sim/stats.ts` resolves 1–10
stats to simulation units; `createMatch` receives `CharacterDef`s and resolves them.
Until menus exist (phase 6) the human's character is chosen with `?character=<id>`
(default `rook`).

### B.3 Passing details

- A pass is a `flight` of kind `pass` with a receiver id; flight time grows with distance
  (0.35 s + 0.05 s/m), low arc. At arrival the receiver takes the ball if within reach
  (0.9 m); otherwise it is loose.
- Interception: during a pass flight any **opponent** whose capsule overlaps the ball takes
  it (`intercept` event, possession change), except opponents within 1 m of the passer
  (the ball is leaving the hands past them; such a defender can only reach the first
  ~1.6 m of the flight, which a short pass needs up to 15 ticks to clear, so the shield
  is not limited to a number of ticks). Teammates other than the receiver do not.
- Alley-oop: PASS while the teammate is airborne within 3 m of the attacking hoop makes a
  lob (higher, slower arc to a point above the rim); if the receiver is still airborne
  near the rim at arrival, the catch starts a dunk immediately.
- PASS without the ball sets `callingForPass` on the player for 1 s; controllers read it.

### B.4 Defence details

- Context-sensitive action without the ball, in this order: **block** if the opponent
  holder is mid-shot; else **steal** if the holder is on the ground within reach; else
  **block** if the holder is within 3 m of the hoop; else **shove** the nearest opponent
  within reach in front; else jump. (Steal before the near-hoop block, so a holder in the
  paint can still be stolen from.)
- Block: a jump with arms up. A shot released within 1.2 m horizontally while the blocker
  is rising and whose hand (feet + 2.6 m) is at or above the release height is deflected
  (about a 330 ms window after the shooter's press for a jump shot):
  the flight is cancelled and the ball goes free, knocked down and away. Dunks are blocked
  only by a block that started before the dunk did.
- Defender term in `shotQuality`: for each opponent at distance `d` (m) compute
  `clamp(0.45 + 0.25·d, 0.45, 1)`, times 0.6 if that opponent is airborne within 1.5 m;
  the quality is multiplied by the **minimum** over opponents (the most threatening one).
  The no-defender sweep contract is unchanged.
- Steal: 18-tick reach, 45-tick cooldown; at tick 6, if the holder is within reach
  (0.9 m + defense bonus) the seeded roll succeeds with
  `clamp(0.2 + 0.05·defense − 0.03·holderPower, 0.1, 0.7)`, halved if the holder is moving
  away. Failure just costs the animation and cooldown.
- Shove: 20-tick lunge, 60-tick cooldown; at tick 5 the nearest opponent within 1.2 m in
  front is `stunned` for `30 + 6·power` ticks (×1.5 with turbo), minus `3·victimPower`,
  min 20; the ball pops loose; a shot in progress is cancelled; `getup` (20 ticks) follows,
  then 30 ticks of immunity. Players who are stunned, getting up or immune cannot be shoved.
- Player–player soft separation (§4.2 step 6) and ball-vs-player deflection for free
  balls above pickup height (A.2) arrive with this phase.

### B.5 Buzzer-beaters

When the match clock reaches zero while a shot is in flight, the finish waits for the
flight to resolve; a make counts, then the match finishes or goes to overtime.

## Appendix C — Phase 4 decisions (2026-10-01)

Decisions taken when planning Phase 4 (AI teammate and opponents, match mode, balance
harness). They refine §6, §4.3, §9 and §10.2.

### C.1 Playable build: match by default

Opening the page starts a **2v2 match**: the human (`home1`) with an AI teammate (`home2`)
against two AI opponents (`away1`, `away2`), on the gym court, with the A.5 defaults
(3 minutes, 14 s shot clock, sudden-death overtime). Until menus exist (phase 6) everything is
chosen by URL: `?mode=match|shootaround` (default `match`; shootaround keeps the Phase 3
dummies unchanged), `?character=` (exists), `?teammate=<id>` (default `ace`),
`?opponents=<id>,<id>` (default `brick,dash`), `?ai=easy|fair|hard` (default `fair`),
`?seed=<n>` (default: the current time in a match, `1` in shootaround). The camera keeps
following the ball (§9); from 20 m back the whole court is in frame.

### C.2 Brain contract

The AI lives in `sim/ai/` and imports only from `sim/`. Its single entry point is

```
decide(state, memory, profile, court) → PlayerIntent
```

- **Memory** (`AiMemory`) is a plain, serialisable object: its own RNG, the next decision
  tick, the current goal (a tagged union: `moveTo`, `drive`, `shoot`, `pass`, `chase`,
  `mark`, `idle`), the assigned mark, whether a button was pressed last tick. No closure
  state. It is reset on the `phaseChange` to `inbound` or `tipoff`.
- **RNG**: seeded from `hash(settings.seed, playerId)` and kept in the memory; the AI never
  reads or advances `state.rng`, so a match remains replayable from seed + intents (§4.10)
  and AI-vs-AI runs are deterministic.
- **Cadence** (§6): re-plan when `tick ≥ memory.nextDecisionTick` (every 6 ticks, offset by
  the player's index in the roster); steer towards the goal every tick. Button presses are
  one tick of `true` followed by a forced `false` (the simulation detects edges).
- **App wrapper**: `app/ai-controller.ts` holds the memory and exposes a `Controller`
  (`(state) => PlayerIntent`, type moved from `dummies.ts` to `app/controller.ts`). The
  `?debug` overlay shows each AI's `goal.kind` (§10.3).

### C.3 Profiles

One `AiProfile` type, three presets selected with `?ai=` (all three AI players share it):

| Field | easy | fair | hard | Meaning |
|---|---|---|---|---|
| `reactionTicks` | 24 | 15 | 8 | ticks a mark's shot or drive must be visible before reacting (jump-shot block window ≈ 20 ticks) |
| `shootThreshold` | 0.65 | 0.55 | 0.45 | minimum perceived quality to shoot |
| `passBias` | 0.15 | 0.10 | 0.00 | how much better the teammate's shot must be to pass |
| `perceptionNoise` | 0.15 | 0.08 | 0.03 | ± seeded jitter on perceived `shotQuality` |
| `stealRate` | 0.2 | 0.4 | 0.6 | chance per decision tick to press when a steal is on |
| `shoveRate` | 0.1 | 0.3 | 0.5 | chance per decision tick to shove a driving mark |
| `turboThreshold` | 0.6 | 0.4 | 0.2 | minimum turbo bar before using turbo |

`fair` is the launch profile of §6; `easy` and `hard` are tuning presets, not difficulty
levels with menus (still §12). The teammate brain uses `passBias − 0.15` towards the human, so
the human sees the ball often.

### C.4 Shared helpers (pure, in `sim/`)

- `evaluateShot(state, player, court) → { type, quality }`: the type `chooseShotType` would
  pick and the `shotQuality` a shot released now would have against the current opponents,
  without cloning the player. Also usable for a hypothetical shot by a teammate.
- `resolveDefensivePress(state, player, court) → DefensiveChoice | null`: what pressing
  action without the ball would do, or `null` when nothing would happen (cooldown,
  airborne, action-locked). The AI presses only when the result is the move it intends.
- `passLaneOpen` (B.3) and `targetHoopIndex` are reused as they are.

### C.5 Branches

**Has ball**, in order at each decision tick:

1. Shot clock under 3 s: shoot if perceived quality > 0.15, else pass if the lane is open,
   else shoot anyway.
2. Teammate airborne within `ALLEY_OOP_RANGE` of the hoop and lane open → pass (the
   simulation makes it a lob).
3. Teammate `callingForPassTicks > 0` and lane open → pass.
4. Perceived quality (`evaluateShot` + noise) ≥ `shootThreshold` → shoot. A dunk or layup is
   taken at once when no opponent is airborne within 1.5 m.
5. Teammate's hypothetical quality ≥ mine + `passBias` and lane open → pass.
6. Drive to the hoop. The lane is closed when an opponent is within 1.2 m of the segment
   me→rim and nearer the rim than I am; then steer to a point 2 m perpendicular to that
   segment on the side of the farther defender and re-test next decision tick. Turbo while
   the lane is open and `turbo ≥ turboThreshold`.
7. Lane closed three decision ticks running and shot clock > 6 s → move to the open named
   spot farthest from the defenders, then re-plan.

**Teammate has ball**: choose a named spot of the attacking hoop (left/right corner,
left/right wing, top of the key, under the basket) by score: distance to the nearest
opponent, minus a penalty within 2.5 m of the handler→rim line (keeps the drive and the
alley-oop lane clear), minus a penalty within 3 m of the handler; switch only when another
spot wins by 1.5. At the under-basket spot, with the handler within 6 m and no opponent
within 1.5 m, jump to invite the alley-oop (at most once per 90 ticks). Chase a loose ball
when closest on my team to it or when it is within 3 m.

**Defending**:

- `assignMarks(state, team)` is a deterministic function of the state (ids sorted; minimum
  total distance over permutations up to three players, greedy beyond), so both brains agree
  without communicating. Recomputed on possession change only.
- Stand on the segment mark→our hoop at `clamp(0.4·d, 0.8, 2.5)` m from the mark (0.8 m when
  the mark holds the ball); turbo to recover from more than 4 m away.
- Press only when `resolveDefensivePress` returns the intended move: `block` once the mark's
  shot has been visible for `reactionTicks`; `steal` with probability `stealRate` per
  decision tick; `shove` with probability `shoveRate` when the mark is driving (moving
  towards the hoop faster than 3 m/s) and turbo allows. Never press on `jump` or `null`.
- Loose ball: the nearest defender chases, the other stays home in the key.

Dunks stay effectively unblockable by the AI (a block must start before the dunk and the
fastest reaction is 8 ticks): getting inside is the human's reward. Recorded design decision.

### C.6 Match flow in the app

- **Inbound formation** (match mode only; shootaround unchanged): `inbound()` places all
  players, not just the receiver — receiver at the own baseline with the ball, their
  teammate at the own-half wing, both defenders at the top of the key of the hoop they
  defend. Tip-off places everyone the same way on their own halves before awarding the ball.
- **Finish**: on `phaseChange → finished` the HUD shows a sticky banner (`FINAL 21–18 ·
  YOU WIN!` / `YOU LOSE`; `OVERTIME!` when sudden death starts). While finished, an
  ACTION, PASS or SPECIAL press from the human (edge-detected in the app) rebuilds the
  `MatchRunner` with `seed + 1`, the same roster and fresh AI memories. The real Results
  screen arrives with menus (phase 6).

### C.7 Testing and balance

- **Unit**: `evaluateShot` ≡ real shot type/quality; `resolveDefensivePress` ≡
  `chooseDefensiveAction` or `null`; `assignMarks` symmetric and minimal; spot scoring and
  hysteresis; offense order (threshold, pass, call, panic, one-tick presses); defence
  reaction window per profile (fair blocks a shot pressed at tick 0, easy misses the window);
  steal rate within tolerance over 1000 seeded decisions; memory reset on inbound; `state.rng`
  untouched by `decide`.
- **Simulation**: a 2v2 AI-vs-AI **golden** (fair, real cast, full match, pinned hash of the
  final state and score; re-pinned only with a stated reason); a **no-soft-lock sweep** over
  20 seeds (every possession ends within shot clock + loose-ball timeout, the match finishes,
  both teams score ≥ 6, no player stunned more than 30 % of ticks, no live tick where every
  intent is `NO_INTENT`); replay determinism from seed + AI-produced intents.
- **Balance** (on demand, `npm run balance`, not in CI): all 4×4 pairings as mirrored 2v2,
  20 seeds each, fair profile; reports win rate and mean score per pairing to stdout and
  `docs/balance/<date>.md`; asserts no side above 60 % with equal characters and mean totals
  within 20–60. The plan records the first report.
- **Feel**: tablet playtest with the first player before the phase closes — the teammate
  gives up the ball when asked, a drive beats the opponents, a fair game lands near 20–30
  points, no stuck-in-the-corner moments.

Cheap leftovers folded into this phase: favicon, `sourcemap: 'hidden'`, HUD per-frame DOM
writes (the final banner touches the HUD anyway). Still deferred: chunk split, 2 m sweep
bucket.
