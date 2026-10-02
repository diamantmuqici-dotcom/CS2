import { WeaponSpec, Vector3D } from '../../shared/types';
import { WEAPON_SPECS } from '../../shared/weapons';

export interface WeaponRuntimeState {
  weaponId: string;
  ammoInMag: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadTimerSec: number;
  lastFireTimeSec: number;
  shotIndex: number; // For recoil pattern progression
  recoilPitch: number;
  recoilYaw: number;
  recoilRecoveryDelay: number;
  isScoped: boolean;
  scopeLevel: number;
  isDeploying: boolean;
  deployTimerSec: number;
  nextFireAllowedAtSec: number;
  shotsFiredThisBurst: number;
}

export interface SpreadInputs {
  velocityXZ: number;
  grounded: boolean;
  crouching: boolean;
  weaponSpeedMultiplier: number;
}

export function createWeaponRuntime(weaponId: string, prepopulated = false): WeaponRuntimeState {
  const spec = WEAPON_SPECS[weaponId] || WEAPON_SPECS.vp9_tactical;
  return {
    weaponId,
    ammoInMag: spec.magazineSize,
    reserveAmmo: spec.reserveAmmo,
    isReloading: false,
    reloadTimerSec: 0,
    lastFireTimeSec: -10,
    shotIndex: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    recoilRecoveryDelay: 0,
    isScoped: false,
    scopeLevel: 0,
    isDeploying: !prepopulated,
    deployTimerSec: prepopulated ? 0 : 0.5,
    nextFireAllowedAtSec: 0,
    shotsFiredThisBurst: 0
  };
}

export function computeCurrentSpread(
  spec: WeaponSpec,
  state: WeaponRuntimeState,
  inputs: SpreadInputs,
  inaccuracyPenalty = 0
): number {
  let spread: number;

  if (state.isScoped && spec.accuracyScoped !== undefined) {
    spread = spec.accuracyScoped;
  } else if (!inputs.grounded) {
    spread = spec.accuracyJumping;
  } else if (inputs.velocityXZ > 1.2) {
    spread = spec.accuracyMoving;
  } else if (inputs.crouching) {
    spread = spec.accuracyCrouching;
  } else {
    spread = spec.accuracyStanding;
  }

  // Movement speed scaling even at low velocities
  if (inputs.grounded && inputs.velocityXZ > 0.1) {
    const moveFactor = Math.min(1, inputs.velocityXZ / 6.0);
    spread += (spec.accuracyMoving - spread) * moveFactor * 0.85;
  }

  spread += inaccuracyPenalty;
  return spread;
}

export interface FireResult {
  fired: boolean;
  shotDirectionPitchOffset: number;
  shotDirectionYawOffset: number;
  recoilAppliedPitch: number;
  recoilAppliedYaw: number;
  spreadRadians: number;
  isLastRound: boolean;
}

export function attemptFire(
  state: WeaponRuntimeState,
  spec: WeaponSpec,
  currentTimeSec: number,
  spreadRadians: number,
  rng: () => number = Math.random
): FireResult {
  const minIntervalSec = 60 / spec.fireRateRpm;

  if (state.isReloading || state.isDeploying || currentTimeSec < state.nextFireAllowedAtSec) {
    return {
      fired: false,
      shotDirectionPitchOffset: 0,
      shotDirectionYawOffset: 0,
      recoilAppliedPitch: 0,
      recoilAppliedYaw: 0,
      spreadRadians: 0,
      isLastRound: false
    };
  }

  if (state.ammoInMag <= 0) {
    return {
      fired: false,
      shotDirectionPitchOffset: 0,
      shotDirectionYawOffset: 0,
      recoilAppliedPitch: 0,
      recoilAppliedYaw: 0,
      spreadRadians: 0,
      isLastRound: false
    };
  }

  state.ammoInMag -= 1;
  state.nextFireAllowedAtSec = currentTimeSec + minIntervalSec;
  state.lastFireTimeSec = currentTimeSec;
  state.shotsFiredThisBurst += 1;

  // Apply recoil pattern step
  const patternIdx = Math.min(state.shotIndex, spec.recoilPattern.length - 1);
  const [pitchStep, yawStep] = spec.recoilPattern[patternIdx] || [spec.recoilVertical, 0];
  state.shotIndex += 1;

  const swaySeed = (rng() - 0.5) * spec.recoilHorizontal * 0.5;
  state.recoilPitch += pitchStep;
  state.recoilYaw += yawStep + swaySeed;
  state.recoilRecoveryDelay = spec.automatic ? 0.22 : 0.34;

  // Bullet direction deviation - Gaussian approximation via sum of uniforms
  const gauss = () => (rng() + rng() + rng() - 1.5) * 0.8165;
  const spreadPitch = gauss() * spreadRadians;
  const spreadYaw = gauss() * spreadRadians;

  return {
    fired: true,
    shotDirectionPitchOffset: spreadPitch,
    shotDirectionYawOffset: spreadYaw,
    recoilAppliedPitch: pitchStep,
    recoilAppliedYaw: yawStep + swaySeed,
    spreadRadians,
    isLastRound: state.ammoInMag === 0
  };
}

export function updateWeaponTimers(state: WeaponRuntimeState, spec: WeaponSpec, dt: number): void {
  if (state.isReloading) {
    state.reloadTimerSec -= dt;
    if (state.reloadTimerSec <= 0) {
      state.isReloading = false;
      const needed = spec.magazineSize - state.ammoInMag;
      const transferred = Math.min(needed, state.reserveAmmo);
      state.ammoInMag += transferred;
      state.reserveAmmo -= transferred;
      state.shotIndex = 0;
    }
  }

  if (state.isDeploying) {
    state.deployTimerSec -= dt;
    if (state.deployTimerSec <= 0) {
      state.isDeploying = false;
    }
  }

  // Recoil recovery
  if (state.recoilRecoveryDelay > 0) {
    state.recoilRecoveryDelay -= dt;
  } else {
    const recovery = spec.recoilRecoveryRate * dt;
    state.recoilPitch = Math.max(0, state.recoilPitch - state.recoilPitch * Math.min(1, recovery * 0.6) - recovery * 0.004);
    state.recoilYaw *= Math.max(0, 1 - recovery * 0.5);
    if (Math.abs(state.recoilPitch) < 0.0004) state.recoilPitch = 0;
    if (Math.abs(state.recoilYaw) < 0.0004) state.recoilYaw = 0;
  }

  // Reset spray index after sustained ceasefire
  if (!state.isReloading && state.shotIndex > 0) {
    const timeSinceLastShot = performance.now() / 1000 - state.lastFireTimeSec;
    if (timeSinceLastShot > 0.35) {
      state.shotIndex = Math.max(0, state.shotIndex - Math.ceil(dt * 45));
      state.shotsFiredThisBurst = 0;
    }
  }
}

export function beginReload(state: WeaponRuntimeState, spec: WeaponSpec): boolean {
  if (state.isReloading || state.isDeploying) return false;
  if (state.ammoInMag >= spec.magazineSize) return false;
  if (state.reserveAmmo <= 0) return false;
  if (spec.category === 'Melee' || spec.category === 'Grenades') return false;

  state.isReloading = true;
  state.reloadTimerSec = spec.reloadTimeSec;
  return true;
}

export function toggleScope(state: WeaponRuntimeState, spec: WeaponSpec): boolean {
  if (!spec.scopeLevels || spec.scopeLevels.length === 0) return false;
  if (state.isReloading) return false;

  if (!state.isScoped) {
    state.isScoped = true;
    state.scopeLevel = 0;
  } else if (state.scopeLevel < spec.scopeLevels.length - 1) {
    state.scopeLevel += 1;
  } else {
    state.isScoped = false;
    state.scopeLevel = 0;
  }
  return true;
}

export function getCurrentFov(baseFov: number, state: WeaponRuntimeState, spec: WeaponSpec): number {
  if (!state.isScoped || !spec.scopeLevels || spec.scopeLevels.length === 0) return baseFov;
  const scopedFov = spec.scopeLevels[Math.min(state.scopeLevel, spec.scopeLevels.length - 1)];
  return Math.min(baseFov, scopedFov);
}

// ============================================================================
// HITBOX RESOLUTION
// ============================================================================

export interface PlayerHitboxSet {
  head: { center: Vector3D; radius: number };
  chest: { center: Vector3D; radius: number };
  stomach: { center: Vector3D; radius: number };
  legs: { center: Vector3D; radius: number };
}

export function buildHitboxes(feetPos: Vector3D, crouching: boolean, heightScale = 1.0): PlayerHitboxSet {
  const h = crouching ? 1.22 : 1.82;
  const s = heightScale;
  return {
    head: {
      center: { x: feetPos.x, y: feetPos.y + h * 0.935 * s, z: feetPos.z },
      radius: 0.115 * s + 0.07
    },
    chest: {
      center: { x: feetPos.x, y: feetPos.y + h * 0.72 * s, z: feetPos.z },
      radius: 0.24 * s + 0.08
    },
    stomach: {
      center: { x: feetPos.x, y: feetPos.y + h * 0.5 * s, z: feetPos.z },
      radius: 0.25 * s + 0.08
    },
    legs: {
      center: { x: feetPos.x, y: feetPos.y + h * 0.22 * s, z: feetPos.z },
      radius: 0.28 * s + 0.08
    }
  };
}

function raySphereIntersect(origin: Vector3D, dir: Vector3D, center: Vector3D, radius: number): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = -b - sqrtDisc;
  const t2 = -b + sqrtDisc;
  if (t1 > 0.05) return t1;
  if (t2 > 0.05) return t2;
  return null;
}

export function raycastPlayerHitboxes(
  origin: Vector3D,
  dir: Vector3D,
  hitboxes: PlayerHitboxSet,
  maxDistance = 300
): { hitGroup: 'head' | 'chest' | 'stomach' | 'leg'; distance: number } | null {
  const candidates: Array<{ hitGroup: 'head' | 'chest' | 'stomach' | 'leg'; distance: number }> = [];

  const headDist = raySphereIntersect(origin, dir, hitboxes.head.center, hitboxes.head.radius);
  if (headDist !== null && headDist < maxDistance) candidates.push({ hitGroup: 'head', distance: headDist });

  const chestDist = raySphereIntersect(origin, dir, hitboxes.chest.center, hitboxes.chest.radius);
  if (chestDist !== null && chestDist < maxDistance) candidates.push({ hitGroup: 'chest', distance: chestDist });

  const stomachDist = raySphereIntersect(origin, dir, hitboxes.stomach.center, hitboxes.stomach.radius);
  if (stomachDist !== null && stomachDist < maxDistance) candidates.push({ hitGroup: 'stomach', distance: stomachDist });

  const legsDist = raySphereIntersect(origin, dir, hitboxes.legs.center, hitboxes.legs.radius);
  if (legsDist !== null && legsDist < maxDistance) candidates.push({ hitGroup: 'leg', distance: legsDist });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);

  // Prioritize headshots if they intersect at nearly the same distance (within 8cm)
  const head = candidates.find((c) => c.hitGroup === 'head');
  if (head && candidates[0].distance > head.distance - 0.08) {
    return head;
  }
  return candidates[0];
}
