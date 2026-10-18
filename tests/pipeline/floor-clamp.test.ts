import { describe, expect, it } from 'vitest';
import { offsetHipsY } from '../../scripts/asset-pipeline/floor-clamp.ts';
import { buildFixture, HIPS, hipsTranslation } from './fixture.ts';

describe('offsetHipsY', () => {
  it('adds the offset to every hips Y key and leaves X and Z', () => {
    const { doc, take } = buildFixture();
    offsetHipsY(doc, 'take', 0.19, HIPS);
    const t = hipsTranslation(take);
    expect(t[1]).toBeCloseTo(0.69);
    expect(t[4]).toBeCloseTo(0.79);
    expect(t[0]).toBe(1);
    expect(t[8]).toBe(6);
  });

  it('does nothing for an offset of 0, even for a clip that does not exist', () => {
    const { doc } = buildFixture();
    expect(() => offsetHipsY(doc, 'missing', 0, HIPS)).not.toThrow();
  });

  it('throws for a missing clip when an offset is requested', () => {
    const { doc } = buildFixture();
    expect(() => offsetHipsY(doc, 'missing', 0.1, HIPS)).toThrow(/clip "missing" not found/);
  });
});
