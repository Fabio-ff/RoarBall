import { describe, expect, it } from 'vitest';
import { Mesh, type Object3D, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
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

describe('rim handles (plan decision 24)', () => {
  it('exposes one group per hoop at the rim centre, holding the rim and the net', () => {
    const court = getCourt('gym');
    const rims = buildCourtView(court).userData.rims as [Object3D, Object3D];
    expect(rims).toHaveLength(2);
    for (const i of [0, 1] as const) {
      const hoop = court.hoops[i];
      const c = { x: hoop.pos.x, y: hoop.rimHeight, z: hoop.pos.z };
      expect(rims[i].position.x).toBeCloseTo(c.x);
      expect(rims[i].position.y).toBeCloseTo(c.y);
      expect(rims[i].position.z).toBeCloseTo(c.z);
      expect(rims[i].children).toHaveLength(2);
    }
  });
});
