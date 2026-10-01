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
| Q                 | special (arrives with abilities) | special (arrives with abilities)        |

Your player has a pulsing ring under its feet in your team colour.

Touch (tablets and phones): a floating joystick where your left thumb lands, and **GO** (Space),
**PASS** (E), **TURBO** (Shift) and **SP** (Q) buttons on the right.

URL options:

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

The match is the full game on the gym court; both hoops are live and you attack the one
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
