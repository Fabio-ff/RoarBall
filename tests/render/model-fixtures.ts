import {
  AnimationClip,
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  VectorKeyframeTrack,
} from 'three';
import type { GltfLike } from '../../src/render/model-cache';

export const ALL_CLIPS = ['idle', 'run', 'dribble', 'jump', 'shoot', 'hit', 'fall'] as const;

/** A one-bone skinned character with clips called `clipNames`, each 1 s, like a loaded GLB. */
export function fakeGltf(
  clipNames: readonly string[] = ALL_CLIPS,
  releaseAt: number | null = 0.6,
): GltfLike {
  const hips = new Bone();
  hips.name = 'mixamorigHips';
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.add(hips);
  mesh.bind(new Skeleton([hips]));

  const root = new Group();
  root.name = 'model-root';
  if (releaseAt !== null) root.userData = { releaseAt };
  root.add(mesh);
  const scene = new Group();
  scene.add(root);

  const animations = clipNames.map(
    (name) =>
      new AnimationClip(name, 1, [
        new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 0, 0, 0, 1, 0]),
      ]),
  );
  return { scene, animations };
}
