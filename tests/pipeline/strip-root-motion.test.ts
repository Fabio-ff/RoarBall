import { describe, expect, it } from 'vitest';
import { stripRootMotion } from '../../scripts/asset-pipeline/strip-root-motion.ts';
import { BIND_HIPS, buildFixture, HIPS, hipsTranslation } from './fixture.ts';

describe('stripRootMotion', () => {
  it('sets hips X and Z to the bind pose and keeps Y', () => {
    const { doc, take } = buildFixture();
    stripRootMotion(doc, HIPS);
    const values = Array.from(hipsTranslation(take));
    expect(values).toEqual([
      BIND_HIPS[0],
      0.5,
      BIND_HIPS[2],
      BIND_HIPS[0],
      expect.closeTo(0.6, 5),
      BIND_HIPS[2],
      BIND_HIPS[0],
      0.5,
      BIND_HIPS[2],
    ]);
  });

  it('leaves rotation keyframes alone', () => {
    const { doc, take } = buildFixture();
    stripRootMotion(doc, HIPS);
    const rotation = take.listChannels().find((c) => c.getTargetPath() === 'rotation');
    expect(Array.from(rotation!.getSampler()!.getOutput()!.getArray()!)).toHaveLength(12);
    expect(rotation!.getSampler()!.getOutput()!.getArray()![5]).toBeCloseTo(0.7071068, 5);
  });

  it('works on any node name', () => {
    const { doc, hips, take } = buildFixture();
    hips.setName('Pelvis');
    stripRootMotion(doc, 'Pelvis');
    expect(hipsTranslation(take)[0]).toBe(BIND_HIPS[0]);
  });

  it('throws a readable error when the node does not exist', () => {
    const { doc } = buildFixture();
    expect(() => stripRootMotion(doc, 'nope')).toThrow(/node "nope" not found/);
  });
});
