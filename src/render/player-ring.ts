import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';

/** Mixes a 0xRRGGBB colour toward white by `amount` (0 = unchanged, 1 = white). */
export function brighten(color: number, amount: number): number {
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  const r = mix((color >> 16) & 0xff);
  const g = mix((color >> 8) & 0xff);
  const b = mix(color & 0xff);
  return (r << 16) | (g << 8) | b;
}

/** Scale of the highlight ring in [1, 1.1], driven by the simulation tick (period about 1 s). */
export function highlightPulse(tick: number): number {
  return 1 + 0.05 * (1 + Math.sin(tick / 10));
}

/** Spec F.7.7: the team-colour ring drawn under every player, flat on the floor. */
export function createRing(teamColor: number): Mesh {
  const ring = new Mesh(
    new RingGeometry(0.35, 0.45, 32),
    new MeshBasicMaterial({
      color: brighten(teamColor, 0.4),
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

/** Keeps the ring on the floor while the player jumps; it pulses only for the human (spec F.7.7). */
export function updateRing(ring: Mesh, playerY: number, pulses: boolean, tick: number): void {
  ring.position.y = -playerY + 0.01;
  ring.scale.setScalar(pulses ? highlightPulse(tick) : 1);
}
