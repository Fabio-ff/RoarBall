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
