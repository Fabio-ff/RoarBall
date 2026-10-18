import { Mesh, SkinnedMesh, type AnimationClip, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedModel {
  scene: Object3D;
  clips: AnimationClip[];
  /** Seconds into the `shoot` clip at which the ball leaves the hands (spec F.5.2). */
  releaseAt: number;
}

/** The part of a GLTFLoader result this module reads; tests fake it. */
export interface GltfLike {
  scene: Object3D;
  animations: AnimationClip[];
}

export interface ModelLoader {
  loadAsync(url: string): Promise<GltfLike>;
}

export interface LoadModelOptions {
  loader?: ModelLoader;
  /** Give up after this long and fall back to the placeholder (spec F.8.2). */
  timeoutMs?: number;
  /** Where `assets/` lives; Vite sets it, so Pages works under its sub-path (spec F.6.1). */
  baseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const cache = new Map<string, Promise<LoadedModel | null>>();

/** Forgets every loaded model (tests; a session never needs it). */
export function clearModelCache(): void {
  cache.clear();
}

function readReleaseAt(scene: Object3D): number | null {
  let found: number | null = null;
  scene.traverse((object) => {
    const value: unknown = object.userData.releaseAt;
    if (found === null && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      found = value;
    }
  });
  return found;
}

async function fetchModel(
  file: string,
  loader: ModelLoader,
  baseUrl: string,
  timeoutMs: number,
): Promise<LoadedModel> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    const gltf = await Promise.race([loader.loadAsync(`${baseUrl}assets/${file}`), timeout]);
    const releaseAt = readReleaseAt(gltf.scene);
    if (releaseAt === null) throw new Error('the model carries no releaseAt');
    return { scene: gltf.scene, clips: gltf.animations, releaseAt };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads `assets/<file>` once per session (spec F.8.3). Never rejects: a failed or slow load logs
 * one `[model] fallback to placeholder for <file>` warning and resolves null, so the match
 * can always start (spec F.8.2). The smoke test greps that prefix.
 */
export function loadCharacterModel(
  file: string,
  options: LoadModelOptions = {},
): Promise<LoadedModel | null> {
  const cached = cache.get(file);
  if (cached) return cached;
  const loader = options.loader ?? new GLTFLoader();
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL;
  const pending = fetchModel(file, loader, baseUrl, options.timeoutMs ?? DEFAULT_TIMEOUT_MS).catch(
    (error: unknown) => {
      console.warn('[model] fallback to placeholder for', file, error);
      return null;
    },
  );
  cache.set(file, pending);
  return pending;
}

/**
 * One instance of a loaded model for one view: the skeleton is cloned (spec F.8.3) and the meshes
 * cast shadows (F.8.4). Skinned meshes are never frustum-culled: three culls them by their
 * bind-pose bounds, which a posed character can leave.
 */
export function instantiate(model: LoadedModel): LoadedModel {
  const scene = skeletonClone(model.scene);
  scene.traverse((object) => {
    if (object instanceof Mesh || object instanceof SkinnedMesh) {
      object.castShadow = true;
      object.frustumCulled = false;
    }
  });
  return { scene, clips: model.clips, releaseAt: model.releaseAt };
}
