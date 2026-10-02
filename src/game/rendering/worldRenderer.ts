import * as THREE from 'three';
import { GameMapDefinition, MapObjectDef, MaterialSurface } from '../../shared/types';
import { detectSurfaceCapability } from './capabilities';

export interface BuiltWorld {
  root: THREE.Group;
  meshByObjectId: Map<string, THREE.Object3D[]>;
  lodGroups: { always: THREE.Group; near: THREE.Group; medium: THREE.Group; far: THREE.Group };
  portalMeshes: THREE.Object3D[];
  spawnPoints: Record<'SENTINEL' | 'VORTEX', Array<[number, number, number]>>;
  bombSites: Record<'A' | 'B', [number, number, number] | null>;
  buyZones: Array<[number, number, number]>;
  lightCount: number;
  totalTriangles: number;
  dispose: () => void;
}

function surfaceMaterialProps(surface: MaterialSurface): { roughness: number; metalness: number; emissiveIntensity: number } {
  switch (surface) {
    case 'metal':
      return { roughness: 0.38, metalness: 0.82, emissiveIntensity: 0 };
    case 'wood':
      return { roughness: 0.82, metalness: 0.05, emissiveIntensity: 0 };
    case 'tile':
      return { roughness: 0.22, metalness: 0.15, emissiveIntensity: 0 };
    case 'sand':
      return { roughness: 0.95, metalness: 0.02, emissiveIntensity: 0 };
    case 'glass':
      return { roughness: 0.08, metalness: 0.05, emissiveIntensity: 0 };
    case 'water':
      return { roughness: 0.12, metalness: 0.35, emissiveIntensity: 0.06 };
    case 'energy':
      return { roughness: 0.35, metalness: 0.2, emissiveIntensity: 0.55 };
    default:
      return { roughness: 0.86, metalness: 0.06, emissiveIntensity: 0 };
  }
}

function createGeometryForObject(obj: MapObjectDef): THREE.BufferGeometry {
  const [w, h, d] = obj.size;
  switch (obj.type) {
    case 'cylinder': {
      const radius = Math.min(w, d) / 2;
      return new THREE.CylinderGeometry(radius, radius, h, 12, 1);
    }
    case 'stairs': {
      // Real stepped geometry for believable stair traversal visuals
      const steps = 6;
      const positions: number[] = [];
      const indices: number[] = [];
      const stepH = h / steps;
      const stepD = d / steps;
      for (let i = 0; i < steps; i++) {
        const y0 = -h / 2 + i * stepH;
        const y1 = y0 + stepH;
        const z0 = -d / 2 + i * stepD;
        const z1 = z0 + stepD;
        const base = positions.length / 3;
        // Top face
        positions.push(-w / 2, y1, z0, w / 2, y1, z0, w / 2, y1, z1, -w / 2, y1, z1);
        // Front face
        positions.push(-w / 2, y0, z0, w / 2, y0, z0, w / 2, y1, z0, -w / 2, y1, z0);
        const start = i * 8;
        indices.push(
          start, start + 2, start + 1, start, start + 3, start + 2,
          start + 4, start + 5, start + 6, start + 4, start + 6, start + 7
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }
    case 'ramp': {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array([
        -w / 2, -h / 2, -d / 2, w / 2, -h / 2, -d / 2, w / 2, h / 2, d / 2, -w / 2, h / 2, d / 2,
        -w / 2, -h / 2, d / 2, w / 2, -h / 2, d / 2, w / 2, -h / 2, -d / 2, -w / 2, -h / 2, -d / 2
      ]);
      const indices = [
        0, 2, 1, 0, 3, 2,
        4, 6, 5, 4, 7, 6,
        0, 1, 5, 0, 5, 4,
        3, 7, 6, 3, 6, 2
      ];
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }
    case 'doorway': {
      // Two side jambs + lintel with a real traversable gap
      const geo = new THREE.BufferGeometry();
      const jambW = Math.min(0.6, w * 0.22);
      const boxes: Array<[number, number, number, number, number, number]> = [
        [-w / 2 + jambW / 2, 0, 0, jambW, h, d],
        [w / 2 - jambW / 2, 0, 0, jambW, h, d],
        [0, h / 2 - h * 0.12, 0, w, h * 0.24, d]
      ];
      const pos: number[] = [];
      const idx: number[] = [];
      for (const [bx, by, bz, bw, bh, bd] of boxes) {
        const start = pos.length / 3;
        const hx = bw / 2;
        const hy = bh / 2;
        const hz = bd / 2;
        const corners: Array<[number, number, number]> = [
          [bx - hx, by - hy, bz - hz], [bx + hx, by - hy, bz - hz],
          [bx + hx, by + hy, bz - hz], [bx - hx, by + hy, bz - hz],
          [bx - hx, by - hy, bz + hz], [bx + hx, by - hy, bz + hz],
          [bx + hx, by + hy, bz + hz], [bx - hx, by + hy, bz + hz]
        ];
        for (const c of corners) pos.push(c[0], c[1], c[2]);
        idx.push(
          start, start + 1, start + 2, start, start + 2, start + 3,
          start + 5, start + 4, start + 7, start + 5, start + 7, start + 6,
          start + 4, start + 0, start + 3, start + 4, start + 3, start + 7,
          start + 1, start + 5, start + 6, start + 1, start + 6, start + 2,
          start + 3, start + 2, start + 6, start + 3, start + 6, start + 7,
          start + 4, start + 5, start + 1, start + 4, start + 1, start + 0
        );
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

export function buildWorld(map: GameMapDefinition): BuiltWorld {
  const root = new THREE.Group();
  root.name = `map_${map.id}`;

  const lodGroups = {
    always: new THREE.Group(),
    near: new THREE.Group(),
    medium: new THREE.Group(),
    far: new THREE.Group()
  };
  root.add(lodGroups.always, lodGroups.near, lodGroups.medium, lodGroups.far);

  const meshByObjectId = new Map<string, THREE.Object3D[]>();
  const portalMeshes: THREE.Object3D[] = [];
  const spawnPoints: Record<'SENTINEL' | 'VORTEX', Array<[number, number, number]>> = { SENTINEL: [], VORTEX: [] };
  const bombSites: Record<'A' | 'B', [number, number, number] | null> = { A: null, B: null };
  const buyZones: Array<[number, number, number]> = [];

  const caps = detectSurfaceCapability();
  const maxAnisotropy = caps.maxAnisotropy;
  let lightCount = 0;
  let totalTriangles = 0;

  // Shared materials cache keyed by color+surface to drastically reduce draw calls
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  const getMaterial = (obj: MapObjectDef): THREE.MeshStandardMaterial => {
    const key = `${obj.color}_${obj.material}_${obj.material === 'energy' ? 'e' : 's'}`;
    const cached = materialCache.get(key);
    if (cached) return cached;
    const props = surfaceMaterialProps(obj.material);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(obj.color),
      roughness: props.roughness,
      metalness: props.metalness,
      emissive: props.emissiveIntensity > 0 ? new THREE.Color(obj.color) : new THREE.Color(0x000000),
      emissiveIntensity: props.emissiveIntensity,
      transparent: obj.type === 'water',
      opacity: obj.type === 'water' ? 0.72 : 1,
      side: THREE.FrontSide,
      flatShading: false
    });
    materialCache.set(key, material);
    return material;
  };

  const usedMaterials: THREE.Material[] = [];

  for (const obj of map.objects) {
    const [px, py, pz] = obj.position;
    const rot = obj.rotation || [0, 0, 0];

    // Non-geometry gameplay marker volumes
    if (obj.type === 'spawn_sentinel') {
      spawnPoints.SENTINEL.push([px, py, pz]);
      continue;
    }
    if (obj.type === 'spawn_vortex') {
      spawnPoints.VORTEX.push([px, py, pz]);
      continue;
    }
    if (obj.type === 'buy_zone') {
      buyZones.push([px, py, pz]);
      continue;
    }
    if (obj.type === 'bomb_site_a') {
      bombSites.A = [px, py, pz];
    } else if (obj.type === 'bomb_site_b') {
      bombSites.B = [px, py, pz];
    }
    if (obj.type === 'light') {
      const light = new THREE.PointLight(new THREE.Color(obj.color), 1.4, 26, 2);
      light.position.set(px, py, pz);
      lodGroups.always.add(light);
      lightCount++;
      continue;
    }
    if (obj.type === 'visibility_portal' || obj.type === 'sound_zone' || obj.type === 'occlusion_zone') {
      continue;
    }

    const geometry = createGeometryForObject(obj);
    const material = getMaterial(obj);
    usedMaterials.push(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.rotation.set(
      (rot[0] * Math.PI) / 180,
      (rot[1] * Math.PI) / 180,
      (rot[2] * Math.PI) / 180
    );
    mesh.castShadow = obj.occluder || obj.size[1] > 1.2;
    mesh.receiveShadow = true;
    mesh.name = obj.id;
    mesh.userData.objectId = obj.id;
    mesh.userData.mapObject = obj;

    const triCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    mesh.userData.triangles = Math.floor(triCount);
    totalTriangles += mesh.userData.triangles * 2;

    const tierGroup =
      obj.lodTier === 'near'
        ? lodGroups.near
        : obj.lodTier === 'medium'
        ? lodGroups.medium
        : obj.lodTier === 'far'
        ? lodGroups.far
        : lodGroups.always;
    tierGroup.add(mesh);

    const list = meshByObjectId.get(obj.id) || [];
    list.push(mesh);
    meshByObjectId.set(obj.id, list);

    // Objective zone visual rings
    if (obj.type === 'bomb_site_a' || obj.type === 'bomb_site_b' || obj.type === 'objective_zone') {
      const ringGeo = new THREE.RingGeometry(Math.min(obj.size[0], obj.size[2]) * 0.42, Math.min(obj.size[0], obj.size[2]) * 0.48, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(obj.color),
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(px, py + 0.06, pz);
      lodGroups.always.add(ring);
      portalMeshes.push(ring);

      const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, 5.5, 8, 1, true);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(obj.color),
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, py + 2.75, pz);
      lodGroups.always.add(pillar);
      portalMeshes.push(pillar);
    }
  }

  // Fallback spawns if the map omitted them
  if (spawnPoints.SENTINEL.length === 0) spawnPoints.SENTINEL.push([0, 0, -40]);
  if (spawnPoints.VORTEX.length === 0) spawnPoints.VORTEX.push([0, 0, 40]);

  return {
    root,
    meshByObjectId,
    lodGroups,
    portalMeshes,
    spawnPoints,
    bombSites,
    buyZones,
    lightCount,
    totalTriangles,
    dispose: () => {
      root.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      usedMaterials.forEach((m) => m.dispose());
      materialCache.clear();
    },
    _maxAnisotropy: maxAnisotropy
  } as BuiltWorld & { _maxAnisotropy: number };
}

/**
 * Applies Object Visibility Distance LOD tiers by toggling group visibility.
 * This is a graphical-only operation: gameplay collision & visibility rules
 * live in cullingSystem.ts and the authoritative server.
 */
export function applyObjectDistanceTiers(
  world: BuiltWorld,
  objectDistanceMeters: number
): void {
  world.lodGroups.near.visible = true;
  world.lodGroups.medium.visible = objectDistanceMeters >= 55;
  world.lodGroups.far.visible = objectDistanceMeters >= 95;
  world.lodGroups.always.visible = true;
}

export const TEAM_COLORS = {
  SENTINEL: { primary: 0x06b6d4, secondary: 0x0e7490, accent: 0x67e8f9 },
  VORTEX: { primary: 0xf59e0b, secondary: 0xb45309, accent: 0xfbbf24 }
};

export function buildOperatorAvatar(team: 'SENTINEL' | 'VORTEX'): { group: THREE.Group; dispose: () => void } {
  const colors = TEAM_COLORS[team];
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: colors.primary, roughness: 0.62, metalness: 0.32 });
  const gearMat = new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.78, metalness: 0.2 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: colors.accent,
    roughness: 0.1,
    metalness: 0.4,
    emissive: new THREE.Color(colors.accent).multiplyScalar(0.35)
  });

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 10), bodyMat);
  torso.position.y = 1.12;
  group.add(torso);

  // Tactical vest
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.3), gearMat);
  vest.position.y = 1.2;
  group.add(vest);

  // Head + visor
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), gearMat);
  head.position.y = 1.62;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.132, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), visorMat);
  visor.position.y = 1.63;
  visor.rotation.x = Math.PI * 0.5;
  group.add(visor);

  // Backpack / comms unit
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.16), gearMat);
  pack.position.set(0, 1.2, 0.19);
  group.add(pack);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.062, 0.32, 3, 6);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.32, 1.18, -0.04);
  armL.rotation.z = 0.22;
  armL.rotation.x = -0.4;
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.32, 1.18, -0.04);
  armR.rotation.z = -0.22;
  armR.rotation.x = -0.4;
  group.add(armR);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.082, 0.5, 3, 6);
  const legL = new THREE.Mesh(legGeo, gearMat);
  legL.position.set(-0.115, 0.42, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, gearMat);
  legR.position.set(0.115, 0.42, 0);
  group.add(legR);

  // Held rifle silhouette
  const heldGun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.62), gearMat);
  heldGun.position.set(0.2, 1.28, -0.3);
  heldGun.rotation.x = -0.06;
  group.add(heldGun);

  group.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });

  const dispose = () => {
    group.traverse((child) => {
      const m = child as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material.dispose();
      }
    });
  };

  return { group, dispose };
}
