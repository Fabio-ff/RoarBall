import {
  BoxGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  MeshStandardMaterial,
  ConeGeometry,
  PlaneGeometry,
  TorusGeometry,
} from 'three';
import { BOARD_HALF, hoopGeometry, RIM_RADIUS, type HoopGeometry } from '../sim/hoop';
import type { CourtDef } from '../sim/types';

const LINE_WIDTH = 0.05;
/** Volcano (spec D.6): the crater glow beyond each baseline. */
const GLOW_COLOR = 0xff4500;
const GLOW_BEYOND_BASELINE = 2;
const GLOW_DEPTH = 1.2;

/**
 * Placeholder court (spec §7.3 "Presentation"): the play surface, lines, hoops and lights are
 * generated from the CourtDef so visuals always match the physics. The environment glTF
 * arrives in phase 7.
 */
export function buildCourtView(court: CourtDef): Group {
  const group = new Group();
  const { length, width } = court.playArea;
  const { dressing } = court;

  const ground = new Mesh(
    new PlaneGeometry(length * 3, width * 4),
    new MeshStandardMaterial({ color: 0x3a3f4b }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;

  const floor = new Mesh(
    new PlaneGeometry(length, width),
    new MeshStandardMaterial({ color: dressing.floorColor, roughness: dressing.floorRoughness }),
  );
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  group.add(ground, floor);
  const lineMaterial = new MeshBasicMaterial({ color: dressing.lineColor });
  group.add(
    line(lineMaterial, length, LINE_WIDTH, 0, -width / 2),
    line(lineMaterial, length, LINE_WIDTH, 0, width / 2),
    line(lineMaterial, LINE_WIDTH, width, -length / 2, 0),
    line(lineMaterial, LINE_WIDTH, width, length / 2, 0),
    line(lineMaterial, LINE_WIDTH, width, 0, 0),
  );

  if (dressing.weather === 'embers') {
    for (const side of [-1, 1]) {
      const glow = new Mesh(
        new BoxGeometry(GLOW_DEPTH, 0.05, width + 4),
        new MeshStandardMaterial({
          color: GLOW_COLOR,
          emissive: GLOW_COLOR,
          emissiveIntensity: 1.5,
        }),
      );
      glow.name = 'glow-strip';
      glow.position.set(side * (length / 2 + GLOW_BEYOND_BASELINE), 0.02, 0);
      group.add(glow);
    }
  }

  const rims: Object3D[] = [];
  for (const index of [0, 1] as const) {
    const { group: hoop, rimGroup } = buildHoop(hoopGeometry(court, index));
    group.add(hoop);
    rims.push(rimGroup);
  }
  group.userData.rims = rims as [Object3D, Object3D];

  const { lighting } = court;
  const sun = new DirectionalLight(lighting.sunColor, 2.5);
  sun.position.set(
    -lighting.sunDirection.x * 30,
    -lighting.sunDirection.y * 30,
    -lighting.sunDirection.z * 30,
  );
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // The light is oblique, so light-space axes are rotated relative to the court: use a
  // symmetric bound that covers the whole rotated play area plus tall casters (hoops).
  const shadowRadius = Math.hypot(length / 2, width / 2) + 3;
  sun.shadow.camera.left = -shadowRadius;
  sun.shadow.camera.right = shadowRadius;
  sun.shadow.camera.top = shadowRadius;
  sun.shadow.camera.bottom = -shadowRadius;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  group.add(sun, sun.target, new HemisphereLight(lighting.skyColor, 0x30302a, lighting.ambient));

  return group;
}

function line(
  material: MeshBasicMaterial,
  sizeX: number,
  sizeZ: number,
  x: number,
  z: number,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(sizeX, 0.02, sizeZ), material);
  mesh.name = 'court-line';
  mesh.position.set(x, 0.01, z);
  return mesh;
}

function buildHoop(hoop: HoopGeometry): { group: Group; rimGroup: Group } {
  const group = new Group();
  const { rimCenter, boardCenter, side } = hoop;

  const rim = new Mesh(
    new TorusGeometry(RIM_RADIUS, 0.02, 8, 24),
    new MeshStandardMaterial({ color: 0xff5a1f }),
  );
  rim.rotation.x = Math.PI / 2;
  // rim and net live in a group pivoted at the rim centre so the rim can wobble (EffectsView).
  const rimGroup = new Group();
  rimGroup.position.set(rimCenter.x, rimCenter.y, rimCenter.z);

  const net = new Mesh(
    new ConeGeometry(RIM_RADIUS, 0.45, 12, 1, true),
    new MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6 }),
  );
  net.rotation.x = Math.PI; // wide end up, under the rim
  net.position.set(0, -0.225, 0);

  const board = new Mesh(
    new BoxGeometry(BOARD_HALF.x * 2, BOARD_HALF.y * 2, BOARD_HALF.z * 2),
    new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
  );
  board.position.set(boardCenter.x, boardCenter.y, boardCenter.z);

  const poleX = boardCenter.x + side * 1.2;
  const poleHeight = rimCenter.y + 0.6;
  const pole = new Mesh(
    new BoxGeometry(0.15, poleHeight, 0.15),
    new MeshStandardMaterial({ color: 0x444444 }),
  );
  pole.position.set(poleX, poleHeight / 2, rimCenter.z);

  const arm = new Mesh(
    new BoxGeometry(1.2, 0.1, 0.1),
    new MeshStandardMaterial({ color: 0x444444 }),
  );
  arm.position.set((boardCenter.x + poleX) / 2, rimCenter.y + 0.6, rimCenter.z);

  for (const m of [rim, board, pole, arm]) m.castShadow = true;
  rimGroup.add(rim, net);
  group.add(rimGroup, board, pole, arm);
  return { group, rimGroup };
}
