# RoarBall

Browser-based 3D arcade 2v2 basketball on spectacular courts. Runs on desktops,
tablets and phones.

## Run

    npm install
    npm run dev        # http://localhost:5173  (add ?debug for the overlay)
    npm run check      # lint + format + typecheck + build + tests

Live build (main): https://fabio-ff.github.io/RoarBall/

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
