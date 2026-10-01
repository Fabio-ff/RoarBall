import {
  BoxGeometry,
  InstancedMesh,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject3D } from '../../src/app/dispose';

describe('disposeObject3D (plan decision 28)', () => {
  it('disposes every geometry, material (arrays too) and material texture once', () => {
    const geo = new BoxGeometry();
    const map = new Texture();
    const a = new MeshStandardMaterial({ map });
    const b = new MeshBasicMaterial();
    const root = new Group();
    const child = new Group();
    root.add(new Mesh(geo, a), child);
    child.add(new Mesh(geo, [a, b]));
    const spies = [geo, map, a, b].map((o) => vi.spyOn(o, 'dispose'));
    disposeObject3D(root);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('disposes instanced meshes too', () => {
    const inst = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    const spy = vi.spyOn(inst, 'dispose');
    disposeObject3D(new Group().add(inst));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
