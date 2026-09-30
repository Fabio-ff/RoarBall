import type { Vec3 } from '../sim/math';

export interface DebugData {
  fps: number;
  ticksPerSecond: number;
  tick: number;
  pos: Vec3;
  speed: number;
  turbo: number;
  inputKind: string;
  phase: string;
  ballMode: string;
  shotClockMs: number;
}

/** `?debug` overlay (spec §10.3). Updates its text at most 4× per second. */
export class DebugOverlay {
  private readonly el: HTMLPreElement;
  private lastUpdate = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.style.cssText =
      'position:absolute;top:8px;left:8px;margin:0;padding:6px 8px;z-index:20;' +
      'font:12px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);' +
      'border-radius:6px;pointer-events:none;';
    parent.appendChild(this.el);
  }

  update(data: DebugData): void {
    const now = performance.now();
    if (now - this.lastUpdate < 250) return;
    this.lastUpdate = now;
    this.el.textContent = [
      `fps    ${data.fps.toFixed(0)}`,
      `ticks  ${data.ticksPerSecond.toFixed(0)}/s  (#${data.tick})`,
      `pos    ${data.pos.x.toFixed(2)}, ${data.pos.z.toFixed(2)}`,
      `speed  ${data.speed.toFixed(2)} m/s`,
      `turbo  ${(data.turbo * 100).toFixed(0)}%`,
      `input  ${data.inputKind}`,
      `phase  ${data.phase}  ball ${data.ballMode}`,
      `shot   ${(data.shotClockMs / 1000).toFixed(1)} s`,
    ].join('\n');
  }

  dispose(): void {
    this.el.remove();
  }
}
