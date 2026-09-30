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
      // No clock until phase 2 adds match phases and a results screen.
      {
        durationMs: Number.POSITIVE_INFINITY,
        shotClockMs: 14_000,
        seed: 1,
        ruleIds: [],
        mode: 'match',
        courtId: court.id,
      },
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
  let lastTickNumber = runner.current.tick;
  let frameCount = 0;
  let statsWindowStart = performance.now();
  let fps = 0;
  let ticksPerSecond = 0;

  const intents = new Map<PlayerId, PlayerIntent>();

  const loop = new GameLoop(
    () => {
      intents.set(HUMAN_ID, input.sample());
      runner.step(intents);
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
        ticksPerSecond = ((next.tick - lastTickNumber) * 1000) / (now - statsWindowStart);
        lastTickNumber = next.tick;
        frameCount = 0;
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
