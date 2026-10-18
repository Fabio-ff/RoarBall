import { Document } from '@gltf-transform/core';
import type { Animation, Node } from '@gltf-transform/core';

export const HIPS = 'mixamorig:Hips';
export const BIND_HIPS: [number, number, number] = [0.25, 0.5, -0.5];

export interface Fixture {
  doc: Document;
  hips: Node;
  spine: Node;
  /** One 1 s clip called "take": hips translation (walks in X and Z, bounces in Y) and hips rotation. */
  take: Animation;
}

/**
 * A tiny skinned character: a Hips and a Spine joint, one mesh with four vertices spanning
 * y 0..1 (so the bind-pose height is exactly 1) and one clip.
 */
export function buildFixture(): Fixture {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('scene');

  const hips = doc.createNode(HIPS).setTranslation(BIND_HIPS);
  const spine = doc.createNode('mixamorig:Spine').setTranslation([0, 0.25, 0]);
  hips.addChild(spine);
  const armature = doc.createNode('Armature').addChild(hips);

  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([-0.2, 0, 0, 0.2, 0, 0, -0.2, 1, 0, 0.2, 1, 0]))
    .setBuffer(buffer);
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]))
    .setBuffer(buffer);
  const joints = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
    .setBuffer(buffer);
  const weights = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 2, 1, 3]))
    .setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('TEXCOORD_0', uv)
    .setAttribute('JOINTS_0', joints)
    .setAttribute('WEIGHTS_0', weights)
    .setIndices(indices)
    .setMaterial(doc.createMaterial('body').setMetallicFactor(1).setRoughnessFactor(0.2));
  const mesh = doc.createMesh('body').addPrimitive(primitive);

  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const inverseBind = doc
    .createAccessor()
    .setType('MAT4')
    .setArray(new Float32Array([...identity, ...identity]))
    .setBuffer(buffer);
  const skin = doc
    .createSkin('skin')
    .addJoint(hips)
    .addJoint(spine)
    .setInverseBindMatrices(inverseBind);
  const body = doc.createNode('Body').setMesh(mesh).setSkin(skin);
  scene.addChild(armature).addChild(body);

  const take = doc.createAnimation('take');
  const times = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Float32Array([0, 0.5, 1]))
    .setBuffer(buffer);
  const translation = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([1, 0.5, 2, 2, 0.6, 4, 3, 0.5, 6]))
    .setBuffer(buffer);
  const rotation = doc
    .createAccessor()
    .setType('VEC4')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0.7071068, 0, 0.7071068, 0, 1, 0, 0]))
    .setBuffer(buffer);
  for (const [output, path] of [
    [translation, 'translation'],
    [rotation, 'rotation'],
  ] as const) {
    const sampler = doc.createAnimationSampler().setInput(times).setOutput(output);
    take
      .addSampler(sampler)
      .addChannel(
        doc.createAnimationChannel().setSampler(sampler).setTargetNode(hips).setTargetPath(path),
      );
  }
  return { doc, hips, spine, take };
}

export const hipsTranslation = (clip: Animation): Float32Array => {
  const channel = clip.listChannels().find((c) => c.getTargetPath() === 'translation');
  return channel!.getSampler()!.getOutput()!.getArray() as Float32Array;
};

export const hipsTimes = (clip: Animation): Float32Array =>
  clip.listChannels()[0].getSampler()!.getInput()!.getArray() as Float32Array;

const clip = (source: string, start: number, end: number, loop: boolean) => ({
  source,
  start,
  end,
  loop,
});

export const validManifest = () => ({
  source: 'raw.glb',
  height: 1.8,
  releaseAt: 0.6,
  materials: { metalness: 0.1, roughness: 0.7 },
  clips: {
    idle: clip('idle', 0, 4, true),
    run: clip('run', 0, 1.25, true),
    dribble: clip('dribble', 3, 4.5, true),
    jump: clip('jump', 0, 2.2, false),
    shoot: clip('shot', 2.6, 3.8, false),
    hit: clip('hit', 0, 1.2, false),
    fall: { ...clip('fall', 0, 3, false), floorOffset: 0.19 },
  },
});
