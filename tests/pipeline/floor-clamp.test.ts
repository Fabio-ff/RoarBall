import { describe, expect, it } from 'vitest';
import { offsetHipsY } from '../../scripts/asset-pipeline/floor-clamp.ts';
import { buildFixture, HIPS, hipsTranslation } from './fixture.ts';

/** Bind hips Y is 0.5; the keys go 0.5 (standing), 0.3 (half way down), 0.1 (lying). */
function descendingFixture() {
  const fixture = buildFixture();
  hipsTranslation(fixture.take).set([1, 0.5, 2, 2, 0.3, 4, 3, 0.1, 6]);
  return fixture;
}

describe('offsetHipsY', () => {
  it('scales the offset by how far the hips have descended: standing 0, half way half, lowest full', () => {
    const { doc, take } = descendingFixture();
    offsetHipsY(doc, 'take', 0.2, HIPS);
    const t = hipsTranslation(take);
    expect(t[1]).toBeCloseTo(0.5);
    expect(t[4]).toBeCloseTo(0.4);
    expect(t[7]).toBeCloseTo(0.3);
    expect(t[0]).toBe(1);
    expect(t[8]).toBe(6);
  });

  it('gives no offset to keys above the bind pose', () => {
    const { doc, take } = descendingFixture();
    hipsTranslation(take)[1] = 0.6;
    offsetHipsY(doc, 'take', 0.2, HIPS);
    expect(hipsTranslation(take)[1]).toBeCloseTo(0.6);
  });

  it('applies nothing when the hips never descend', () => {
    const { doc, take } = buildFixture();
    hipsTranslation(take).set([1, 0.5, 2, 2, 0.5, 4, 3, 0.5, 6]);
    offsetHipsY(doc, 'take', 0.19, HIPS);
    expect(Array.from(hipsTranslation(take)).filter((_, i) => i % 3 === 1)).toEqual([
      0.5, 0.5, 0.5,
    ]);
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
