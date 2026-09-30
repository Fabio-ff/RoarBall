import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

const MAX_PIXEL_RATIO = 2;

/** Owns the renderer and camera. Spec §9: pixel ratio capped at 2, render scale independent of DOM size. */
export class GameScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  /** 1 = native; lower it on slow devices to render fewer pixels without changing the layout. */
  renderScale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.camera = new PerspectiveCamera(50, 1, 0.1, 200);
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO) * this.renderScale);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  setBackground(color: number): void {
    this.scene.background = new Color(color);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
