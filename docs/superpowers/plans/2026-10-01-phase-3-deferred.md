# Phase 3 deferred minors (from per-task reviews; triaged in the final review on #42)

- Task 1: minor (deferred): all-fives shooting 0.65 vs placeholder 0.75 (cast shoots 0.57–0.85; revisit at balancing); monotonic test moves all stats together (one-at-a-time would catch cross-wiring); appearance unused until phase 7.
- Task 2: minor (deferred): held ball positioned before separation moves its holder (≤ few cm, one tick); a bounce-in after the buzzer never counts (documented); players overlap slightly at a wall (clamp after push).
- Task 3: minor (deferred): lead uses velocity at release (an accelerating cutter is undershot ~2 m — consider leading by intent later); catch only at arrival; lob catch teleports the ball up to ~2.6 m; catch/intercept double up with pickup events; test gaps (off-line opponent, stunned receiver, landed lob).
- Task 4: minor (deferred): tryBlockShot's shotCooldownTicks is dead (lastShot nulled); `void court`; defender test tolerance loose; dunk block window ≈ 3 ticks (design note for playtesting).
- Task 5: minor (deferred, feel → final review): blocks land only on drives (standing shots never blocked; apex margin tiny); extra test magic numbers; humanHoop unused param; per-tick allocations.
- Task 5: minor (deferred, final-wave candidates): defender holding a rebound within 3 m of the rim → press is a block, not a steal (walk back to the spot while holding); stunned figure sinks into the floor (figure.position.y = tilt*0.35); chase radius from the defender (follows a ball far out); blocks only on drive-in shots with a tiny timing margin (feel).
- Task 6: minor (deferred): golden assertions use OR; head-catch exclusion checks any shotCooldownTicks; docstring nit.
