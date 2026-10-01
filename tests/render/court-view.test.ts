import { describe, expect, it } from 'vitest';
import { Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { getCourt } from '../../src/content/courts';
import { buildCourtView } from '../../src/render/court-view';

function named(courtId: string, name: string): Mesh[] {
  const out: Mesh[] = [];
  buildCourtView(getCourt(courtId)).traverse((o) => {
    if (o instanceof Mesh && o.name === name) out.push(o);
  });
  return out;
}

describe('buildCourtView dressing (spec D.6)', () => {
  it('paints the floor and the lines from the court dressing', () => {
    for (const id of ['gym', 'rooftop', 'volcano', 'frozen']) {
      const { dressing } = getCourt(id);
      const [floor] = named(id, 'floor');
      const material = floor?.material as MeshStandardMaterial;
      expect(material.color.getHex()).toBe(dressing.floorColor);
      expect(material.roughness).toBeCloseTo(dressing.floorRoughness);
      const lines = named(id, 'court-line');
      expect(lines).toHaveLength(5);
      expect((lines[0]?.material as MeshBasicMaterial).color.getHex()).toBe(dressing.lineColor);
    }
  });

  it('adds a glowing strip beyond each baseline only where embers rise', () => {
    expect(named('volcano', 'glow-strip')).toHaveLength(2);
    expect(named('gym', 'glow-strip')).toHaveLength(0);
    expect(named('rooftop', 'glow-strip')).toHaveLength(0);
  });
});
