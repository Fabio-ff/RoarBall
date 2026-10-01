import type { Controller } from './app/controller';
import { GameLoop } from './app/game-loop';
import { buildSession, HUMAN_ID } from './app/session';
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
import { buttonsOf, justPressed } from './sim/buttons';
import { findPlayer } from './sim/match';
import {
  NO_BUTTONS,
  type Buttons,
  type PlayerId,
  type PlayerIntent,
  type TeamIndex,
} from './sim/types';
import { DebugOverlay } from './ui/debug-overlay';
import { Hud } from './ui/hud';

export type { GameOptions } from './app/url-options';
export { buildRoster, buildSession, buildSettings, type Session } from './app/session';

const HUMAN_TEAM: TeamIndex = 0;
const TEAM_COLORS = [0x2f80ed, 0xeb5757] as const;
const RESTART_BUTTONS = ['action', 'pass', 'special'] as const;

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
