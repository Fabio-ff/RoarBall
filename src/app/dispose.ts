import { Material, Texture, type BufferGeometry, type Mesh, type Object3D } from 'three';

/** Frees GPU resources under `root` (plan decision 28). Shared resources are disposed once. */
export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh>;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach((x) => materials.add(x));
    else if (m instanceof Material) materials.add(m);
  });
  const textures = new Set<Texture>();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
