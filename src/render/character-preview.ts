import {
  AmbientLight,
  AnimationMixer,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  Vector3,
  WebGLRenderer,
} from 'three';
import { instantiate, loadCharacterModel, type LoadedModel } from './model-cache';

export interface PreviewHandle {
  dispose(): void;
}

type PreviewRenderer = Pick<
  WebGLRenderer,
  'render' | 'setSize' | 'setPixelRatio' | 'dispose' | 'forceContextLoss'
>;

export interface PreviewDeps {
  loadModel?: (file: string) => Promise<LoadedModel | null>;
  /** Returns null when WebGL is unavailable. Tests pass a fake. */
  createRenderer?: (canvas: HTMLCanvasElement) => PreviewRenderer | null;
}

const FOV = 30;
/** The model fills this share of the canvas height. */
const FILL = 1 / 1.15;

/** Camera distance at which an object `height` metres tall fills `FILL` of a `fov`-degree view. */
export function previewDistance(height: number, fov: number = FOV): number {
  return height / FILL / (2 * Math.tan((fov * Math.PI) / 360));
}

function defaultRenderer(canvas: HTMLCanvasElement): PreviewRenderer | null {
  try {
    return new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
}

/**
 * Spec F.9: a small canvas showing a character's model in its idle clip. It never throws and
 * never blocks the menu: with no model, no WebGL or a failed load the canvas is hidden.
 * One preview owns one WebGL context, so callers keep the number of previews small.
 */
export function createCharacterPreview(
  canvas: HTMLCanvasElement,
  file: string,
  deps: PreviewDeps = {},
): PreviewHandle {
  let disposed = false;
  let frame = 0;
  let renderer: PreviewRenderer | null = null;
  let mixer: AnimationMixer | null = null;
  let root: LoadedModel['scene'] | null = null;

  const start = async (): Promise<void> => {
    let model: LoadedModel | null;
    try {
      model = await (deps.loadModel ?? ((f: string) => loadCharacterModel(f)))(file);
    } catch {
      model = null;
    }
    if (disposed) return;
    renderer = model ? (deps.createRenderer ?? defaultRenderer)(canvas) : null;
    if (!model || !renderer) {
      canvas.hidden = true;
      return;
    }

    const instance = instantiate(model);
    root = instance.scene;
    const scene = new Scene();
    scene.add(root, new AmbientLight(0xffffff, 1.6));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);

    mixer = new AnimationMixer(root);
    const idle = instance.clips.find((c) => c.name === 'idle');
    if (idle) mixer.clipAction(idle).play();

    // Measure the posed figure: a fresh clone's skeleton is not posed yet, so its bounds are off.
    mixer.update(0);
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (object instanceof SkinnedMesh) {
        object.skeleton.update();
        object.computeBoundingBox();
      }
    });
    const box = new Box3().setFromObject(root);
    const height = Math.max(box.getSize(new Vector3()).y, 0.5);
    const middle = box.getCenter(new Vector3()).y;
    const camera = new PerspectiveCamera(FOV, canvas.width / canvas.height, 0.1, 50);
    camera.position.set(0, middle, previewDistance(height));
    camera.lookAt(0, middle, 0);
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);

    let last: number | null = null;
    const tick = (now: number): void => {
      if (disposed || !renderer) return;
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      mixer?.update(dt);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick(0);
  };
  void start();

  return {
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(frame);
      if (mixer && root) {
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
      }
      renderer?.dispose();
      renderer?.forceContextLoss();
    },
  };
}
