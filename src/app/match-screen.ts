import type { Object3D } from 'three';
import type { Controller } from './controller';
import { disposeObject3D } from './dispose';
import { GameLoop } from './game-loop';
import { BoxScore, type MatchResult } from './box-score';
import { buildRoster, buildSession, HUMAN_ID, PendingPrime } from './session';
import type { Settings } from './storage';
import type { GameOptions } from './url-options';
import { AudioDirector } from '../audio/director';
import type { AudioSink } from '../audio/sink';
import { courtTrack } from '../audio/tracks';
import { ABILITIES } from '../content/abilities';
import { getCharacter } from '../content/characters';
import { getCourt } from '../content/courts';
import { GamepadBackend, playRumble, rumbleFor } from '../input/gamepad';
import { InputManager } from '../input/input-manager';
import { KeyboardBackend } from '../input/keyboard';
import type { MenuCommand, MenuSource } from '../input/menu-input';
import { TouchBackend } from '../input/touch';
import { AbilityFxView, ShockwavePool } from '../render/ability-fx';
import { BallTrail } from '../render/ball-trail';
import { BallView } from '../render/ball-view';
import { BroadcastCamera } from '../render/camera';
import { buildCourtView } from '../render/court-view';
import { effectsFor, type EffectCommand } from '../render/effects-map';
import { EffectsView } from '../render/effects-view';
import { lerpVec3 } from '../render/interpolate';
import { PlayerView } from '../render/player-view';
import { GameScene } from '../render/scene';
import { WeatherView } from '../render/weather-view';
import { CHARGE_MAX } from '../sim/abilities';
import { hoopGeometry } from '../sim/hoop';
import { findPlayer } from '../sim/match';
import type { BallState, PlayerId, PlayerIntent, TeamIndex } from '../sim/types';
import { abilityLines, DebugOverlay } from '../ui/debug-overlay';
import { Hud } from '../ui/hud';
import { PauseOverlay } from '../ui/screens/pause';

const HUMAN_TEAM: TeamIndex = 0;
const TEAM_COLORS = [0x2f80ed, 0xeb5757] as const;
/** The sticky final banner is shown this long before the match hands over (spec E.1). */
const FINISH_HOLD_MS = 2500;

export interface MatchScreenDeps {
  root: HTMLElement;
  options: GameOptions;
  settings: Settings;
  onFinished(result: MatchResult): void;
  onQuit(): void;
  onSettingsChange(settings: Settings): void;
  /** The shell's current sink; it may swap from null to the real engine after the first gesture. */
  sink: () => AudioSink;
}

/**
 * During play: 'pause' (P, gamepad Start) always pauses; 'back' pauses only from the keyboard
 * (Escape), because a gamepad B is turbo and must not pause the match.
 */
export function shouldPause(command: MenuCommand, source: MenuSource): boolean {
  return command === 'pause' || (command === 'back' && source === 'keyboard');
}

/** One match on screen: sim, views, HUD, input and the pause overlay (spec E.1). */
export class MatchScreen {
  private readonly container: HTMLDivElement;
  private readonly scene: GameScene;
  private readonly input: InputManager;
  private readonly hud: Hud;
  private readonly overlay: DebugOverlay | null;
  private readonly loop: GameLoop;
  private readonly observer: ResizeObserver;
  private readonly onFirstTouch: (e: PointerEvent) => void;
  private readonly onVisibilityChange: () => void;
  private readonly broadcastCamera: BroadcastCamera;
  private pauseOverlay: PauseOverlay | null = null;
  private settings: Settings;
  private finishedAt: number | null = null;
  private done = false;
  private disposed = false;

  constructor(private readonly deps: MatchScreenDeps) {
    const { options } = deps;
    this.settings = deps.settings;
    this.container = document.createElement('div');
    this.container.className = 'match-screen';
    this.container.style.cssText = 'position:fixed;inset:0;';
    deps.root.appendChild(this.container);
    const container = this.container;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const court = getCourt(options.courtId);
    const scene = new GameScene(canvas);
    this.scene = scene;
    scene.setBackground(court.lighting.skyColor);
    const courtGroup = buildCourtView(court);
    scene.scene.add(courtGroup);
    const rims = courtGroup.userData.rims as [Object3D, Object3D];

    const touch = new TouchBackend(container);
    const gamepad = new GamepadBackend();
    const input = new InputManager([new KeyboardBackend(window), touch, gamepad]);
    this.input = input;
    input.onActiveKindChange = (kind) => (kind === 'touch' ? touch.show() : touch.hide());
    this.onFirstTouch = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') touch.show();
    };
    container.addEventListener('pointerdown', this.onFirstTouch);

    const human: Controller = () => input.sample();
    let seed = options.seed;
    let session = buildSession(options, court, seed, human);

    // Views are keyed by player id; the roster is the same on every restart, so they are built once.
    const playerViews = new Map<PlayerId, PlayerView>();
    const abilityFxViews = new Map<PlayerId, AbilityFxView>();
    for (const team of session.runner.current.teams) {
      for (const player of team.players) {
        const view = new PlayerView(TEAM_COLORS[player.team], {
          highlighted: player.id === HUMAN_ID,
        });
        scene.scene.add(view.group);
        playerViews.set(player.id, view);
        const abilityFx = new AbilityFxView();
        scene.scene.add(abilityFx.group);
        abilityFxViews.set(player.id, abilityFx);
      }
    }
    const ballView = new BallView();
    scene.scene.add(ballView.group);
    const effects = new EffectsView();
    scene.scene.add(effects.group);
    const shockwaves = new ShockwavePool();
    scene.scene.add(shockwaves.group);
    const ballTrail = new BallTrail();
    scene.scene.add(ballTrail.line);
    /** Reused every frame: the interpolated ball handed to the trail. */
    const trailBall: BallState = {
      ...session.runner.current.ball,
      pos: { x: 0, y: 0, z: 0 },
    };
    let trailGlow = false;
    const fxPos = { x: 0, y: 0, z: 0 };
    const weather = new WeatherView(court);
    scene.scene.add(weather.group);

    const broadcastCamera = new BroadcastCamera(scene.camera);
    broadcastCamera.reduceMotion = this.settings.reduceMotion;
    this.broadcastCamera = broadcastCamera;
    input.cameraYaw = broadcastCamera.yaw;

    const hud = new Hud(container, HUMAN_TEAM, {
      humanId: HUMAN_ID,
      abilities: ABILITIES,
      onPause: () => this.pause(),
    });
    this.hud = hud;

    const resize = (): void => {
      scene.resize(container.clientWidth, container.clientHeight, window.devicePixelRatio);
    };
    resize();
    this.observer = new ResizeObserver(resize);
    this.observer.observe(container);

    const overlay = options.debug ? new DebugOverlay(container) : null;
    this.overlay = overlay;
    const characterName = getCharacter(options.characterId).name;
    let lastTickNumber = session.runner.current.tick;
    let frameCount = 0;
    let statsWindowStart = performance.now();
    let fps = 0;
    let ticksPerSecond = 0;

    const intents = new Map<PlayerId, PlayerIntent>();
    const newBox = (): BoxScore =>
      new BoxScore(
        buildRoster(options).map(({ id, team, characterId }) => ({
          id,
          team,
          name: getCharacter(characterId).name,
        })),
      );
    let box = newBox();
    const director = new AudioDirector(deps.sink);

    const applyEffect = (c: EffectCommand): void => {
      const state = session.runner.current;
      switch (c.kind) {
        case 'burst':
          effects.spawnBurst(hoopGeometry(court, c.hoop).rimCenter, c.color, c.size);
          break;
        case 'rimShake':
          effects.shakeRim(rims[c.hoop]);
          break;
        case 'shake':
          broadcastCamera.shake(c.strength);
          break;
        case 'shockwave': {
          const p = findPlayer(state, c.playerId);
          if (p) shockwaves.spawn(p.pos);
          break;
        }
        case 'flash': {
          const p = findPlayer(state, c.playerId);
          if (p) effects.spawnFlash({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }, c.color);
          break;
        }
      }
    };
    /** Hot Hand / Rocket Dunk shots get an orange trail (checked on the step before too: the ability may end on the shot). */
    const glowsShot = (id: PlayerId): boolean =>
      [session.runner.previous, session.runner.current].some((s) => {
        const p = findPlayer(s, id);
        return p?.ability != null && (p.abilityId === 'hotHand' || p.abilityId === 'rocketDunk');
      });

    /** Pause → Restart: seed + 1, and the buttons held now are not presses in the new match (spec D.6). */
    this.restartMatch = (): void => {
      seed += 1;
      session = buildSession(options, court, seed, human, intents);
      weather.reset();
      effects.bursts.reset();
      shockwaves.reset();
      ballTrail.reset();
      trailGlow = false;
      broadcastCamera.resetShake();
      lastTickNumber = session.runner.current.tick;
      this.finishedAt = null;
      box = newBox();
    };

    this.primeHuman = (): void => this.prime.request();

    this.loop = new GameLoop(
      () => {
        const { runner, controllers } = session;
        this.prime.run(runner.current, human, intents);
        for (const [id, controller] of controllers) intents.set(id, controller(runner.current));
        // Always step: when finished the sim returns the same state, so previous catches up with
        // current and the render stops blending (no jitter on the final screen).
        const events = runner.step(intents);
        box.record(events, runner.current.tick);
        hud.handleEvents(events, runner.current);
        director.handleEvents(events);
        director.update(runner.previous, runner.current, performance.now() / 1000);
        weather.handleEvents(events);
        for (const event of events) {
          if (this.settings.vibration) {
            const rumble = rumbleFor(event, HUMAN_ID, HUMAN_TEAM);
            if (rumble) playRumble(gamepad.activePad(), rumble);
          }
          if (event.type === 'shotReleased') trailGlow = glowsShot(event.playerId);
          for (const c of effectsFor(event, runner.current, court, TEAM_COLORS)) applyEffect(c);
        }
      },
      (alpha, frameMs) => {
        const dt = frameMs / 1000;
        const prev = session.runner.previous;
        const next = session.runner.current;
        for (const [id, view] of playerViews) {
          const a = findPlayer(prev, id);
          const b = findPlayer(next, id);
          if (a && b) {
            view.update(a, b, alpha, next.tick);
            fxPos.x = a.pos.x + (b.pos.x - a.pos.x) * alpha;
            fxPos.y = a.pos.y + (b.pos.y - a.pos.y) * alpha;
            fxPos.z = a.pos.z + (b.pos.z - a.pos.z) * alpha;
            abilityFxViews.get(id)?.update(b, fxPos, dt, next.tick);
          }
        }
        const holder = next.ball.holder === null ? undefined : findPlayer(next, next.ball.holder);
        ballView.update(prev.ball, next.ball, alpha, dt, holder?.action === 'run', next.tick);
        trailBall.mode = next.ball.mode;
        trailBall.pos.x = prev.ball.pos.x + (next.ball.pos.x - prev.ball.pos.x) * alpha;
        trailBall.pos.y = prev.ball.pos.y + (next.ball.pos.y - prev.ball.pos.y) * alpha;
        trailBall.pos.z = prev.ball.pos.z + (next.ball.pos.z - prev.ball.pos.z) * alpha;
        if (next.ball.mode !== 'flight') trailGlow = false;
        ballTrail.update(trailBall, trailGlow, dt);
        shockwaves.update(dt);
        broadcastCamera.update(lerpVec3(prev.ball.pos, next.ball.pos, alpha), dt);
        effects.update(dt);
        weather.update(dt);
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
        touch.setSpecialReady(
          humanState !== undefined &&
            humanState.ability === null &&
            humanState.charge >= CHARGE_MAX,
        );
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
            abilities: abilityLines(next),
          });
        }

        // Spec E.1: the final banner stays up for a moment, then the shell moves on (once).
        if (next.phase === 'finished' && !this.done) {
          this.finishedAt ??= now;
          if (now - this.finishedAt >= FINISH_HOLD_MS) {
            this.done = true;
            this.loop.stop();
            deps.onFinished({
              score: [next.score[0], next.score[1]],
              humanTeam: HUMAN_TEAM,
              overtime: next.overtime,
              lines: box.lines(),
              options: { ...options, seed },
            });
          }
        }
      },
    );

    this.onVisibilityChange = (): void => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // Buttons held at tip-off (A on START/REMATCH, a repeating Space) are not presses (spec D.6).
    this.prime.request();
    this.loop.start();
  }

  private restartMatch: () => void;
  private primeHuman: () => void;
  private readonly prime = new PendingPrime();

  get paused(): boolean {
    return this.pauseOverlay !== null;
  }

  pause(): void {
    if (this.disposed || this.done || this.pauseOverlay) return;
    this.loop.stop();
    this.deps.sink().setMusic(null);
    this.pauseOverlay = new PauseOverlay(this.container, {
      settings: this.settings,
      onResume: () => this.resume(),
      onRestart: () => {
        this.restartMatch();
        this.resume();
      },
      onQuit: () => this.deps.onQuit(),
      onSettingsChange: (s) => {
        this.settings = s;
        this.broadcastCamera.reduceMotion = s.reduceMotion;
        this.deps.onSettingsChange(s);
      },
    });
  }

  resume(): void {
    if (this.disposed || this.done || !this.pauseOverlay) return;
    this.pauseOverlay.dispose();
    this.pauseOverlay = null;
    this.primeHuman();
    this.deps.sink().setMusic(courtTrack(this.deps.options.courtId));
    this.loop.start();
  }

  /** Spec E.1: while paused the overlay navigates; during play only pause/back act. */
  handleCommand(command: MenuCommand, source: MenuSource): void {
    if (this.pauseOverlay) this.pauseOverlay.handleCommand(command);
    else if (shouldPause(command, source)) this.pause();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.container.removeEventListener('pointerdown', this.onFirstTouch);
    this.observer.disconnect();
    this.pauseOverlay?.dispose();
    this.pauseOverlay = null;
    this.hud.dispose();
    this.overlay?.dispose();
    this.input.dispose();
    disposeObject3D(this.scene.scene);
    this.scene.dispose();
    this.container.remove();
  }
}
