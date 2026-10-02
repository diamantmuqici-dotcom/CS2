import * as THREE from 'three';
import { WeaponSpec, WeaponCategory } from '../../shared/types';

/**
 * Procedural first-person viewmodel rig.
 * Built entirely from primitive geometry so the game ships with 100% original assets
 * and zero binary asset downloads — the entire arsenal is code-generated.
 */

export interface ViewmodelRig {
  group: THREE.Group;
  muzzlePoint: THREE.Object3D;
  ejectionPoint: THREE.Object3D;
  weaponId: string;
  dispose: () => void;
}

function mat(color: number, metalness = 0.7, roughness = 0.42): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function accentMat(hex: string, metalness = 0.55, roughness = 0.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    metalness,
    roughness,
    emissive: new THREE.Color(hex).multiplyScalar(0.12)
  });
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addCyl(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  rotateX = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  mesh.position.set(x, y, z);
  if (rotateX) mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

export function buildViewmodel(spec: WeaponSpec, skinColorOverride?: string): ViewmodelRig {
  const group = new THREE.Group();
  const accent = accentMat(skinColorOverride || spec.accentColor);
  const gunmetal = mat(0x23262b, 0.82, 0.38);
  const polymer = mat(0x14171a, 0.18, 0.72);
  const darkSteel = mat(0x0e1114, 0.9, 0.5);

  const muzzlePoint = new THREE.Object3D();
  const ejectionPoint = new THREE.Object3D();

  const category: WeaponCategory = spec.category;
  const isLong = category === 'Rifles' || category === 'Snipers' || category === 'MachineGuns';
  const isShotgun = category === 'Shotguns';
  const isPistol = category === 'Pistols';
  const isMelee = category === 'Melee';
  const isGrenade = category === 'Grenades';

  if (isMelee) {
    // Tactical Karambit-style blade
    const handle = addCyl(group, 0.022, 0.13, 0, -0.03, 0, polymer, false);
    handle.rotation.z = Math.PI / 2;
    const guard = addBox(group, 0.02, 0.05, 0.05, 0.065, -0.03, 0, darkSteel);
    guard.rotation.z = 0.2;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.24, 4), accent);
    blade.rotation.z = -Math.PI / 2 - 0.42;
    blade.position.set(0.19, -0.038, 0);
    group.add(blade);
    blade.scale.set(1, 1, 0.28);
    muzzlePoint.position.set(0.3, -0.04, 0);
  } else if (isGrenade) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.055, 4, 10), accent);
    body.position.set(0.02, -0.02, 0);
    group.add(body);
    const top = addCyl(group, 0.014, 0.05, 0.02, 0.06, 0, darkSteel, false);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10), mat(0xb0b8c4, 0.9, 0.3));
    pin.position.set(0.055, 0.062, 0);
    pin.rotation.y = Math.PI / 2;
    group.add(pin);
    muzzlePoint.position.set(0.02, -0.02, -0.06);
  } else if (isPistol) {
    addBox(group, 0.05, 0.13, 0.055, 0, -0.06, 0.006, polymer); // grip
    addBox(group, 0.052, 0.055, 0.2, 0, 0.012, -0.06, gunmetal); // slide
    addBox(group, 0.044, 0.02, 0.05, 0, -0.006, 0.034, darkSteel); // rear
    if (spec.team === 'SENTINEL') {
      const supp = addCyl(group, 0.024, 0.16, 0, 0.012, -0.2, darkSteel);
    }
    if (spec.scopeLevels) {
      addBox(group, 0.04, 0.03, 0.09, 0, 0.05, -0.09, darkSteel);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), accentMat('#22d3ee', 0.1, 0.1));
      lens.position.set(0, 0.05, -0.135);
      group.add(lens);
    }
    ejectionPoint.position.set(0.04, 0.03, -0.02);
    muzzlePoint.position.set(0, 0.012, spec.team === 'SENTINEL' ? -0.29 : -0.17);
  } else {
    // Long gun: receiver + barrel + stock + magazine + optic
    const barrelLen = isShotgun ? 0.42 : category === 'Snipers' ? 0.56 : category === 'MachineGuns' ? 0.5 : 0.44;
    const receiverLen = isLong ? 0.34 : 0.26;

    addBox(group, 0.06, 0.075, receiverLen, 0, 0.005, -0.1, gunmetal); // receiver
    const barrel = addCyl(group, 0.014, barrelLen, 0, 0.012, -0.1 - receiverLen / 2 - barrelLen / 2 + 0.02, darkSteel);
    addCyl(group, 0.022, 0.09, 0, 0.012, -0.1 - receiverLen / 2 - barrelLen + 0.06, accent); // muzzle device

    if (isShotgun) {
      addCyl(group, 0.02, 0.3, 0, -0.012, -0.28, darkSteel); // pump tube
      addBox(group, 0.055, 0.05, 0.11, 0, -0.025, -0.3, polymer); // pump grip
      addBox(group, 0.058, 0.07, 0.2, 0, -0.01, 0.001, mat(0x3f2a15, 0.2, 0.8)); // wooden stock
      addBox(group, 0.05, 0.09, 0.05, 0, 0.03, -0.08, darkSteel); // shell carrier
    } else {
      addBox(group, 0.05, 0.145, 0.062, 0, -0.075, -0.045, polymer); // magazine
      addBox(group, 0.05, 0.115, 0.062, 0, -0.06, 0.02, polymer); // grip
      addBox(group, 0.052, 0.05, 0.06, 0, -0.065, -0.125, darkSteel); // foregrip
      // Stock
      if (category === 'Snipers') {
        addBox(group, 0.055, 0.06, 0.26, 0, -0.005, 0.19, polymer);
        addBox(group, 0.05, 0.1, 0.05, 0, -0.055, 0.28, polymer);
      } else if (isLong) {
        addBox(group, 0.05, 0.058, 0.2, 0, 0.0, 0.16, polymer);
        addBox(group, 0.052, 0.08, 0.045, 0, -0.05, 0.2, polymer);
      } else {
        addBox(group, 0.05, 0.075, 0.13, 0, -0.01, 0.11, polymer);
      }
      addBox(group, 0.03, 0.045, 0.05, 0, 0.055, -0.02, darkSteel); // charging handle area
    }

    // Optic
    if (spec.scopeLevels && spec.scopeLevels.length > 0) {
      const scopeLen = category === 'Snipers' ? 0.2 : 0.13;
      addCyl(group, 0.026, scopeLen, 0, 0.078, -0.1, darkSteel);
      const lensFront = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), accentMat('#67e8f9', 0.05, 0.05));
      lensFront.position.set(0, 0.078, -0.1 - scopeLen / 2 - 0.001);
      group.add(lensFront);
      addBox(group, 0.024, 0.03, 0.03, 0, 0.058, -0.055, darkSteel);
      addBox(group, 0.024, 0.03, 0.03, 0, 0.058, -0.15, darkSteel);
    } else if (!isShotgun) {
      // Iron sights
      addBox(group, 0.008, 0.022, 0.008, 0, 0.05, -0.23, darkSteel);
      addBox(group, 0.03, 0.018, 0.012, 0, 0.048, -0.02, darkSteel);
    }

    if (spec.suppressed) {
      addCyl(group, 0.033, 0.19, 0, 0.012, -0.1 - receiverLen / 2 - barrelLen - 0.04, darkSteel);
    }

    // Category accents for visual identity
    addBox(group, 0.062, 0.012, receiverLen * 0.55, 0, 0.045, -0.1, accent);

    ejectionPoint.position.set(0.04, 0.025, -0.06);
    muzzlePoint.position.set(0, 0.012, -0.1 - receiverLen / 2 - barrelLen - (spec.suppressed ? 0.15 : 0.02));
  }

  group.add(muzzlePoint);
  group.add(ejectionPoint);
  group.traverse((child) => {
    child.frustumCulled = false;
    child.renderOrder = 10;
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

  return { group, muzzlePoint, ejectionPoint, weaponId: spec.id, dispose };
}

export interface ViewmodelAnimatorState {
  bobPhase: number;
  swayX: number;
  swayY: number;
  recoilKick: number;
  recoilPitch: number;
  recoilYaw: number;
  reloadProgress: number;
  deployProgress: number;
  isReloading: boolean;
  isInspecting: boolean;
  inspectProgress: number;
}

export function createViewmodelAnimatorState(): ViewmodelAnimatorState {
  return {
    bobPhase: 0,
    swayX: 0,
    swayY: 0,
    recoilKick: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    reloadProgress: 0,
    deployProgress: 1,
    isReloading: false,
    isInspecting: false,
    inspectProgress: 0
  };
}

export interface ViewmodelUpdateInput {
  dt: number;
  velocityXZ: number;
  grounded: boolean;
  crouching: boolean;
  lookDeltaX: number;
  lookDeltaY: number;
  headBobEnabled: boolean;
  recoilPitch: number;
  recoilYaw: number;
  reloading: boolean;
  reloadProgress: number;
  scoped: boolean;
  inspecting: boolean;
}

export function updateViewmodelAnimation(
  rig: ViewmodelRig,
  state: ViewmodelAnimatorState,
  input: ViewmodelUpdateInput,
  baseFov: number
): void {
  const dt = Math.min(input.dt, 0.05);

  // Head bob (optional, disabled by default for competitive parity)
  const speedFactor = Math.min(1.35, input.velocityXZ / 5.6);
  if (input.headBobEnabled && input.grounded) {
    state.bobPhase += dt * (7.4 + speedFactor * 5.6);
  }
  const bobAmount = input.headBobEnabled && input.grounded ? speedFactor * 0.016 : 0;

  // Weapon sway from look input (lag behind camera)
  const swayTargetX = THREE.MathUtils.clamp(-input.lookDeltaX * 0.00085, -0.03, 0.03);
  const swayTargetY = THREE.MathUtils.clamp(-input.lookDeltaY * 0.00085, -0.03, 0.03);
  state.swayX += (swayTargetX - state.swayX) * Math.min(1, dt * 11);
  state.swayY += (swayTargetY - state.swayY) * Math.min(1, dt * 11);

  // Recoil kick decay
  state.recoilKick = Math.max(0, state.recoilKick - dt * 8.5);
  state.recoilPitch = input.recoilPitch;
  state.recoilYaw = input.recoilYaw;

  // Reload animation
  const targetReload = input.reloading ? input.reloadProgress : 1;
  state.reloadProgress += (targetReload - state.reloadProgress) * Math.min(1, dt * 13);
  state.isReloading = input.reloading;

  // Inspect animation
  const targetInspect = input.inspecting ? 1 : 0;
  state.inspectProgress += (targetInspect - state.inspectProgress) * Math.min(1, dt * 6.5);

  // Deploy animation on weapon switch
  if (state.deployProgress < 1) {
    state.deployProgress = Math.min(1, state.deployProgress + dt * 3.4);
  }

  const reloadDip = Math.sin(state.reloadProgress * Math.PI) * 0.11;
  const reloadTwist = Math.sin(state.reloadProgress * Math.PI) * 0.42;
  const deployDrop = (1 - state.deployProgress) * 0.26;

  rig.group.position.set(
    Math.sin(state.bobPhase) * bobAmount + state.swayX,
    -0.052 + Math.cos(state.bobPhase * 2) * bobAmount * 0.6 + state.swayY - reloadDip - deployDrop,
    -0.34 + state.recoilKick * 0.055 + state.deployProgress * 0.06
  );

  rig.group.rotation.set(
    -0.02 + state.recoilPitch * 0.85 + reloadTwist * 0.32 + (input.inspecting ? Math.sin(state.inspectProgress * Math.PI) * 0.5 : 0),
    0.03 + state.recoilYaw * 0.7 + reloadTwist * 0.5,
    Math.sin(state.bobPhase) * bobAmount * 1.6 + reloadTwist * 0.28
  );

  // Hide viewmodel entirely when scoped into an optic
  rig.group.visible = !input.scoped;
}

export function triggerViewmodelRecoil(state: ViewmodelAnimatorState, magnitude = 1): void {
  state.recoilKick = Math.min(1.2, state.recoilKick + magnitude);
}

export function triggerViewmodelDeploy(state: ViewmodelAnimatorState): void {
  state.deployProgress = 0;
}
