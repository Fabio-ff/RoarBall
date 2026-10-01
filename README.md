# RoarBall

Browser-based 3D arcade 2v2 basketball on spectacular courts. Runs on desktops,
tablets and phones.

## Run

    npm install
    npm run dev        # http://localhost:5173  (add ?debug for the overlay)
    npm run check      # lint + format + typecheck + build + tests
    npm run balance    # AI-vs-AI balance report → docs/balance/<date>.md (minutes)

Live build (main): https://fabio-ff.github.io/RoarBall/

## Controls

Keyboard:

| Key               | With the ball                    | Without the ball                        |
| ----------------- | -------------------------------- | --------------------------------------- |
| WASD / arrow keys | move                             | move                                    |
| Space             | shoot (jump shot, layup or dunk) | defend: block, steal or shove (or jump) |
| E                 | pass to your teammate            | call for the ball                       |
| Shift (hold)      | turbo                            | turbo                                   |
| Q                 | special ability (full bar)       | special ability (full bar)              |

Your player has a pulsing ring under its feet in your team colour.

Touch (tablets and phones): a floating joystick where your left thumb lands, and **GO** (Space),
**PASS** (E), **TURBO** (Shift) and **SP** (Q) buttons on the right.

## Abilities

Every player has one signature ability. The bar under the score fills as you play (+12 for a
basket, +18 for a three, +10 for an assist, +15 for a steal or a block); when it reads **READY**,
press Q / **SP** on the ground during play (the SP button is dimmed until then). The AI uses its
abilities too.

| Character | Ability     | Effect                                                                  |
| --------- | ----------- | ----------------------------------------------------------------------- |
| Brick     | Rocket Dunk | 8 s: dunk from anywhere inside the 3-point line; dunks can't be blocked |
| Ace       | Hot Hand    | your next three shots can't miss                                        |
| Dash      | Blur        | 6 s: double speed, unlimited turbo, every steal succeeds                |
| Rook      | Earthquake  | every opponent within 4 m is knocked down                               |

URL options:

- The page starts a **2v2 match** (3 minutes, 14 s shot clock, sudden-death overtime): you and an
  AI teammate against two AI opponents. After the final, press ACTION/PASS/SPECIAL (or tap a
  button) to play again.
- `?mode=shootaround` — the practice build with the training dummies instead of the AI.
- `?character=brick|ace|dash|rook` picks your player (default `rook`);
  `?teammate=<id>` (default `ace`) and `?opponents=<id>,<id>` (default `brick,dash`) pick the rest.
- `?ai=easy|fair|hard` — the AI profile for all three AI players (default `fair`).
- `?court=gym|rooftop|volcano|frozen` — the court (default `gym`). **Rooftop Storm**: every
  15–25 s a gust (GUST chip, slanting rain) bends shots and passes and pushes loose balls.
  **Volcano Rim**: turbo drains faster, shoves hit harder, knock-downs last longer.
  **Frozen Lake**: slow to start and slower to stop; loose balls roll further.
- `?seed=<n>` — reproduce a match (the default seed is the clock, so every game differs).
- `?debug` shows the debug overlay (now with each AI's current goal).

Parameters combine, e.g. `?character=dash&teammate=brick&court=rooftop&ai=hard&debug`.

The match is the full game on the chosen court; both hoops are live and you attack the one
your team is aimed at. The practice build (`?mode=shootaround`) is a **shootaround** instead:
you, a teammate dummy and a defender dummy. Both hoops score; you attack whichever hoop is
nearer. The teammate waits on the wing, passes back a second after catching (at once if you
call for the ball) and lobs an alley-oop when you jump near the rim. The defender stands in
the key, jumps to block when you come close or shoot near it, picks up rebounds and walks
them back to its spot, where you can steal the ball or shove it off. After a shot-clock
violation or a loose-ball timeout the ball comes back to your team.

## Docs

- Design spec: `docs/superpowers/specs/2026-09-30-roarball-design.md`
- Implementation plans: `docs/superpowers/plans/`

## Layout

- `src/sim/` — deterministic simulation (no DOM, no Three.js)
- `src/input/` — keyboard / touch (gamepad later) → `PlayerIntent`
- `src/render/` — Three.js presentation
- `src/ui/` — DOM screens and HUD
- `src/content/` — characters, courts, abilities (data)
- `tests/` — Vitest
