import {
  AdditiveBlending,
  CapsuleGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
} from 'three';
import type { Vec3 } from '../sim/math';
import type { PlayerState } from '../sim/types';

export const EARTHQUAKE_RADIUS = 4;
const SHOCKWAVE_S = 0.5;
const SHOCKWAVE_POOL = 4;
const HISTORY = 10;
const GHOST_LAGS = [3, 6, 9] as const;
const GHOST_OPACITY = [0.35, 0.2, 0.1] as const;
const FLOOR_Y = 0.03;
const ARC = (110 * Math.PI) / 180;

/** Signature-ability visuals for one player (plan decision 27); all parts are built once and toggled. */
export class AbilityFxView {
  readonly group = new Group();
  private readonly aura: Mesh;
  private readonly hands: Group;
  private readonly rings: Mesh[] = [];
  private readonly ghosts: Mesh[] = [];
  /** Newest first, x/z pairs; `filled` entries are valid. */
  private readonly history = new Float32Array(HISTORY * 2);
  private filled = 0;
  private time = 0;
  private lastTick: number | undefined;

  constructor() {
    this.aura = new Mesh(
      new ConeGeometry(0.5, 1.4, 16, 1, true),
      new MeshBasicMaterial({
        color: 0xff7a1a,
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.aura.name = 'rocketAura';
    this.aura.position.y = 2.1;
    this.aura.rotation.x = Math.PI; // flame trails down over the head
    this.aura.visible = false;

    this.hands = new Group();
    this.hands.name = 'hotHands';
    this.hands.visible = false;
    const handMaterial = new MeshBasicMaterial({ color: 0xffb347 });
    for (const side of [-1, 1]) {
      const hand = new Mesh(new SphereGeometry(0.12, 12, 8), handMaterial);
      hand.position.set(side * 0.42, 1.0, 0.1);
      this.hands.add(hand);
    }

    this.group.add(this.aura, this.hands);

    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(
        new RingGeometry(0.55, 0.65, 16, 1, (i * 2 * Math.PI) / 3, ARC),
        new MeshBasicMaterial({ color: 0xff8a00, side: DoubleSide, depthWrite: false }),
      );
      ring.name = `hotRing${i}`;
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = FLOOR_Y;
      ring.visible = false;
      this.rings.push(ring);
      this.group.add(ring);
    }

    for (let i = 0; i < 3; i++) {
      const ghost = new Mesh(
        new CapsuleGeometry(0.35, 1.0, 4, 12),
        new MeshBasicMaterial({
          color: 0x9ad7ff,
          transparent: true,
          opacity: GHOST_OPACITY[i] ?? 0.1,
          depthWrite: false,
        }),
      );
      ghost.name = `blurGhost${i}`;
      ghost.visible = false;
      this.ghosts.push(ghost);
      this.group.add(ghost);
    }
  }

  /** `pos` is the player's (interpolated) feet position. */
  update(player: PlayerState, pos: Vec3, dt: number, tick?: number): void {
    this.time += dt;
    this.group.position.set(pos.x, pos.y, pos.z);
    const id = player.ability ? player.abilityId : null;

    this.aura.visible = id === 'rocketDunk';
    if (this.aura.visible) {
      const flicker = 1 + 0.12 * Math.sin(this.time * 40) + 0.06 * Math.sin(this.time * 23);
      this.aura.scale.set(flicker, 1 + (flicker - 1) * 2, flicker);
    }

    this.hands.visible = id === 'hotHand';
    const uses = id === 'hotHand' ? (player.ability?.uses ?? 0) : 0;
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      if (!ring) continue;
      ring.visible = i < uses;
      // The group follows the player's jump; the floor rings stay on the floor.
      ring.position.y = FLOOR_Y - pos.y;
    }

    if (id === 'blur') {
      // History advances once per sim tick (callers pass the tick; without one, every call).
      if (tick === undefined || tick !== this.lastTick) {
        this.lastTick = tick;
        this.history.copyWithin(2, 0, (HISTORY - 1) * 2);
        this.filled = Math.min(this.filled + 1, HISTORY);
      }
      this.history[0] = pos.x;
      this.history[1] = pos.z;
      for (let i = 0; i < this.ghosts.length; i++) {
        const ghost = this.ghosts[i];
        const lag = GHOST_LAGS[i] ?? 3;
        if (!ghost) continue;
        ghost.visible = this.filled > lag;
        if (!ghost.visible) continue;
        // Ghosts are offset from the group, which already sits at the player.
        ghost.position.set(
          (this.history[lag * 2] ?? pos.x) - pos.x,
          0.85,
          (this.history[lag * 2 + 1] ?? pos.z) - pos.z,
        );
      }
    } else {
      this.filled = 0;
      for (const ghost of this.ghosts) ghost.visible = false;
    }
  }
}

/** The expanding ring of an Earthquake (plan decision 27). */
export class ShockwavePool {
  readonly group = new Group();
  private readonly ages: number[] = [];
  private next = 0;

  constructor() {
    for (let i = 0; i < SHOCKWAVE_POOL; i++) {
      const ring = new Mesh(
        new RingGeometry(0.9, 1, 48),
        new MeshBasicMaterial({
          color: 0xffe9b0,
          transparent: true,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.group.add(ring);
      this.ages.push(SHOCKWAVE_S);
    }
  }

  reset(): void {
    for (const child of this.group.children) child.visible = false;
    this.ages.fill(SHOCKWAVE_S);
  }

  spawn(pos: Vec3): void {
    const i = this.next;
    this.next = (this.next + 1) % SHOCKWAVE_POOL;
    const ring = this.group.children[i] as Mesh<RingGeometry, MeshBasicMaterial>;
    this.ages[i] = 0;
    ring.position.set(pos.x, 0.05, pos.z);
    ring.scale.setScalar(0.001);
    ring.material.opacity = 1;
    ring.visible = true;
  }

  update(dt: number): void {
    for (let i = 0; i < SHOCKWAVE_POOL; i++) {
      const ring = this.group.children[i] as Mesh<RingGeometry, MeshBasicMaterial>;
      if (!ring.visible) continue;
      const age = (this.ages[i] ?? 0) + dt;
      this.ages[i] = age;
      if (age >= SHOCKWAVE_S) {
        ring.visible = false;
        continue;
      }
      ring.scale.setScalar((EARTHQUAKE_RADIUS * age) / SHOCKWAVE_S);
      ring.material.opacity = 1 - age / SHOCKWAVE_S;
    }
  }
}
