import { GameMapDefinition, MapObjectDef, MaterialSurface, Vector3D } from '../../shared/types';

export interface PlayerPhysicsState {
  position: Vector3D; // Feet position
  velocity: Vector3D;
  grounded: boolean;
  crouching: boolean;
  walking: boolean;
  sprinting: boolean;
  onLadder: boolean;
  inWater: boolean;
  eyeHeight: number;
  groundSurface: MaterialSurface;
}

export interface MovementInput {
  forward: number; // -1 to 1
  right: number; // -1 to 1
  jumpPressed: boolean;
  crouchHeld: boolean;
  walkHeld: boolean;
  sprintHeld: boolean;
  yaw: number;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  object: MapObjectDef;
}

export function buildMapAABBs(map: GameMapDefinition): AABB[] {
  return map.objects
    .filter((o) => o.collidable || o.type === 'ladder' || o.type === 'water' || o.type === 'buy_zone' || o.type === 'bomb_site_a' || o.type === 'bomb_site_b')
    .map((o) => {
      const hx = o.size[0] / 2;
      const hy = o.size[1] / 2;
      const hz = o.size[2] / 2;
      return {
        minX: o.position[0] - hx,
        maxX: o.position[0] + hx,
        minY: o.position[1] - hy,
        maxY: o.position[1] + hy,
        minZ: o.position[2] - hz,
        maxZ: o.position[2] + hz,
        object: o
      };
    });
}

const PLAYER_RADIUS = 0.42;
const STANDING_HEIGHT = 1.82;
const CROUCH_HEIGHT = 1.22;
const STANDING_EYE = 1.66;
const CROUCH_EYE = 1.08;
const STEP_HEIGHT = 0.48;

export function stepPlayerPhysics(
  state: PlayerPhysicsState,
  input: MovementInput,
  aabbs: AABB[],
  dt: number,
  options: {
    weaponSpeedMultiplier: number;
    gravityMultiplier: number;
    moveSpeedMultiplier: number;
    allowSprint: boolean;
  }
): PlayerPhysicsState {
  const clampedDt = Math.min(dt, 0.05);
  const next: PlayerPhysicsState = {
    position: { ...state.position },
    velocity: { ...state.velocity },
    grounded: state.grounded,
    crouching: input.crouchHeld,
    walking: input.walkHeld && !input.crouchHeld,
    sprinting: options.allowSprint && input.sprintHeld && !input.crouchHeld && !input.walkHeld,
    onLadder: false,
    inWater: false,
    eyeHeight: state.eyeHeight,
    groundSurface: state.groundSurface
  };

  // Smooth eye height interpolation
  const targetEye = next.crouching ? CROUCH_EYE : STANDING_EYE;
  next.eyeHeight += (targetEye - next.eyeHeight) * Math.min(1, clampedDt * 14);

  const playerHeight = next.crouching ? CROUCH_HEIGHT : STANDING_HEIGHT;

  // Check special triggers (ladder, water)
  for (const box of aabbs) {
    if (box.object.type !== 'ladder' && box.object.type !== 'water') continue;
    const overlaps =
      next.position.x + PLAYER_RADIUS > box.minX &&
      next.position.x - PLAYER_RADIUS < box.maxX &&
      next.position.y + playerHeight > box.minY &&
      next.position.y < box.maxY &&
      next.position.z + PLAYER_RADIUS > box.minZ &&
      next.position.z - PLAYER_RADIUS < box.maxZ;
    if (overlaps) {
      if (box.object.type === 'ladder') next.onLadder = true;
      if (box.object.type === 'water') next.inWater = true;
    }
  }

  // Compute wish direction in world space from camera yaw
  // Camera forward in Three.js is (-sin(yaw), 0, -cos(yaw)) and right is (cos(yaw), 0, -sin(yaw))
  const forwardX = -Math.sin(input.yaw);
  const forwardZ = -Math.cos(input.yaw);
  const rightX = Math.cos(input.yaw);
  const rightZ = -Math.sin(input.yaw);

  let wishX = forwardX * input.forward + rightX * input.right;
  let wishZ = forwardZ * input.forward + rightZ * input.right;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 0.0001) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const baseMaxSpeed = 6.8 * options.weaponSpeedMultiplier * options.moveSpeedMultiplier;
  let maxSpeed = baseMaxSpeed;
  if (next.crouching) maxSpeed *= 0.48;
  else if (next.walking) maxSpeed *= 0.54;
  else if (next.sprinting) maxSpeed *= 1.22;
  if (next.inWater) maxSpeed *= 0.78;

  if (next.onLadder) {
    next.velocity.x = wishX * 4.2;
    next.velocity.z = wishZ * 4.2;
    next.velocity.y = input.forward !== 0 ? input.forward * 4.5 : input.jumpPressed ? 4.5 : -1.5;
    next.grounded = false;
  } else if (next.grounded) {
    // Ground friction
    const speed = Math.hypot(next.velocity.x, next.velocity.z);
    if (speed > 0.001) {
      const drop = speed * 10.5 * clampedDt;
      const newSpeed = Math.max(0, speed - drop) / speed;
      next.velocity.x *= newSpeed;
      next.velocity.z *= newSpeed;
    }

    // Ground acceleration
    const accel = 14.0;
    const currentProj = next.velocity.x * wishX + next.velocity.z * wishZ;
    const addSpeed = maxSpeed - currentProj;
    if (addSpeed > 0 && wishLen > 0) {
      const accelSpeed = Math.min(addSpeed, accel * maxSpeed * clampedDt);
      next.velocity.x += accelSpeed * wishX;
      next.velocity.z += accelSpeed * wishZ;
    }

    // Jump
    if (input.jumpPressed) {
      next.velocity.y = 7.4;
      next.grounded = false;
    }
  } else {
    // Air acceleration (Competitive air-strafe feel)
    const airAccel = 9.5;
    const airCap = Math.min(maxSpeed, 5.8);
    const currentProj = next.velocity.x * wishX + next.velocity.z * wishZ;
    const addSpeed = airCap - currentProj;
    if (addSpeed > 0 && wishLen > 0) {
      const accelSpeed = Math.min(addSpeed, airAccel * maxSpeed * clampedDt);
      next.velocity.x += accelSpeed * wishX;
      next.velocity.z += accelSpeed * wishZ;
    }
    // Gravity
    next.velocity.y -= 19.6 * options.gravityMultiplier * clampedDt;
  }

  // Integrate X & Z with step-up and ramp support
  const solidBoxes = aabbs.filter((b) => b.object.collidable && b.object.type !== 'ladder' && b.object.type !== 'water');

  // Move X
  next.position.x += next.velocity.x * clampedDt;
  for (const box of solidBoxes) {
    if (box.object.id === 'ground_main') continue;
    if (
      next.position.x + PLAYER_RADIUS > box.minX &&
      next.position.x - PLAYER_RADIUS < box.maxX &&
      next.position.z + PLAYER_RADIUS > box.minZ &&
      next.position.z - PLAYER_RADIUS < box.maxZ &&
      next.position.y + playerHeight > box.minY &&
      next.position.y < box.maxY
    ) {
      const stepDelta = box.maxY - next.position.y;
      if (stepDelta > 0 && stepDelta <= STEP_HEIGHT && next.grounded) {
        next.position.y = box.maxY;
      } else if (box.object.type === 'ramp' || box.object.type === 'stairs') {
        const rampProgress = Math.max(0, Math.min(1, (next.position.z - box.minZ) / Math.max(0.1, box.maxZ - box.minZ)));
        const rampTop = box.minY + (box.maxY - box.minY) * (1 - rampProgress);
        if (rampTop - next.position.y <= 0.85) {
          next.position.y = Math.max(next.position.y, rampTop);
        }
      } else {
        if (next.velocity.x > 0) next.position.x = box.minX - PLAYER_RADIUS;
        else if (next.velocity.x < 0) next.position.x = box.maxX + PLAYER_RADIUS;
        next.velocity.x = 0;
      }
    }
  }

  // Move Z
  next.position.z += next.velocity.z * clampedDt;
  for (const box of solidBoxes) {
    if (box.object.id === 'ground_main') continue;
    if (
      next.position.x + PLAYER_RADIUS > box.minX &&
      next.position.x - PLAYER_RADIUS < box.maxX &&
      next.position.z + PLAYER_RADIUS > box.minZ &&
      next.position.z - PLAYER_RADIUS < box.maxZ &&
      next.position.y + playerHeight > box.minY &&
      next.position.y < box.maxY
    ) {
      const stepDelta = box.maxY - next.position.y;
      if (stepDelta > 0 && stepDelta <= STEP_HEIGHT && next.grounded) {
        next.position.y = box.maxY;
      } else if (box.object.type === 'ramp' || box.object.type === 'stairs') {
        const rampProgress = Math.max(0, Math.min(1, (next.position.z - box.minZ) / Math.max(0.1, box.maxZ - box.minZ)));
        const rampTop = box.minY + (box.maxY - box.minY) * (1 - rampProgress);
        if (rampTop - next.position.y <= 0.85) {
          next.position.y = Math.max(next.position.y, rampTop);
        }
      } else {
        if (next.velocity.z > 0) next.position.z = box.minZ - PLAYER_RADIUS;
        else if (next.velocity.z < 0) next.position.z = box.maxZ + PLAYER_RADIUS;
        next.velocity.z = 0;
      }
    }
  }

  // Move Y & Ground Detection
  next.position.y += next.velocity.y * clampedDt;
  next.grounded = false;

  if (next.position.y <= 0) {
    next.position.y = 0;
    next.velocity.y = 0;
    next.grounded = true;
    next.groundSurface = next.inWater ? 'water' : 'concrete';
  }

  for (const box of solidBoxes) {
    if (box.object.id === 'ground_main') continue;
    const withinXZ =
      next.position.x + PLAYER_RADIUS > box.minX &&
      next.position.x - PLAYER_RADIUS < box.maxX &&
      next.position.z + PLAYER_RADIUS > box.minZ &&
      next.position.z - PLAYER_RADIUS < box.maxZ;
    if (!withinXZ) continue;

    if (box.object.type === 'ramp' || box.object.type === 'stairs') {
      const rampProgress = Math.max(0, Math.min(1, (next.position.z - box.minZ) / Math.max(0.1, box.maxZ - box.minZ)));
      const surfaceY = box.minY + (box.maxY - box.minY) * (1 - rampProgress);
      if (next.position.y <= surfaceY + 0.18 && next.position.y >= box.minY - 0.3 && next.velocity.y <= 0) {
        next.position.y = surfaceY;
        next.velocity.y = 0;
        next.grounded = true;
        next.groundSurface = box.object.material;
      }
      continue;
    }

    // Landing on top of box
    if (
      next.velocity.y <= 0 &&
      state.position.y >= box.maxY - 0.15 &&
      next.position.y <= box.maxY + 0.08
    ) {
      next.position.y = box.maxY;
      next.velocity.y = 0;
      next.grounded = true;
      next.groundSurface = box.object.material;
    } else if (
      next.velocity.y > 0 &&
      state.position.y + playerHeight <= box.minY + 0.15 &&
      next.position.y + playerHeight >= box.minY
    ) {
      // Head bump on ceiling
      next.position.y = box.minY - playerHeight;
      next.velocity.y = 0;
    }
  }

  return next;
}

// ============================================================================
// RAYCAST & OCCLUSION QUERIES
// ============================================================================

export interface RayBoxHit {
  distance: number;
  point: Vector3D;
  normal: Vector3D;
  object: MapObjectDef;
}

export function intersectRayAABB(
  origin: Vector3D,
  dir: Vector3D,
  box: AABB,
  maxDistance = 300
): RayBoxHit | null {
  const invX = dir.x !== 0 ? 1 / dir.x : 1e9;
  const invY = dir.y !== 0 ? 1 / dir.y : 1e9;
  const invZ = dir.z !== 0 ? 1 / dir.z : 1e9;

  const t1 = (box.minX - origin.x) * invX;
  const t2 = (box.maxX - origin.x) * invX;
  const t3 = (box.minY - origin.y) * invY;
  const t4 = (box.maxY - origin.y) * invY;
  const t5 = (box.minZ - origin.z) * invZ;
  const t6 = (box.maxZ - origin.z) * invZ;

  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));

  if (tmax < 0 || tmin > tmax || tmin > maxDistance) return null;
  const dist = tmin >= 0 ? tmin : tmax;
  if (dist < 0 || dist > maxDistance) return null;

  const point = {
    x: origin.x + dir.x * dist,
    y: origin.y + dir.y * dist,
    z: origin.z + dir.z * dist
  };

  // Approximate surface normal
  const eps = 0.02;
  const normal = { x: 0, y: 0, z: 0 };
  if (Math.abs(point.x - box.minX) < eps) normal.x = -1;
  else if (Math.abs(point.x - box.maxX) < eps) normal.x = 1;
  else if (Math.abs(point.y - box.minY) < eps) normal.y = -1;
  else if (Math.abs(point.y - box.maxY) < eps) normal.y = 1;
  else if (Math.abs(point.z - box.minZ) < eps) normal.z = -1;
  else normal.z = 1;

  return { distance: dist, point, normal, object: box.object };
}

export function hasLineOfSight(
  from: Vector3D,
  to: Vector3D,
  aabbs: AABB[],
  activeSmokePositions: Vector3D[] = []
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.05) return true;

  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };

  // Check solid occluders
  for (const box of aabbs) {
    if (!box.object.occluder) continue;
    const hit = intersectRayAABB(from, dir, box, dist - 0.1);
    if (hit && hit.distance < dist - 0.15) {
      return false;
    }
  }

  // Check active smoke clouds (radius 4.2m blocks vision)
  for (const smoke of activeSmokePositions) {
    const sx = smoke.x - from.x;
    const sy = smoke.y + 1.4 - from.y;
    const sz = smoke.z - from.z;
    const proj = sx * dir.x + sy * dir.y + sz * dir.z;
    if (proj > 0 && proj < dist) {
      const closestX = from.x + dir.x * proj - smoke.x;
      const closestY = from.y + dir.y * proj - (smoke.y + 1.4);
      const closestZ = from.z + dir.z * proj - smoke.z;
      if (Math.hypot(closestX, closestY, closestZ) < 4.2) {
        return false;
      }
    }
  }

  return true;
}

// ============================================================================
// GRENADE PROJECTILE TRAJECTORY SIMULATION
// ============================================================================

export interface GrenadeProjectile {
  id: string;
  ownerId: string;
  type: 'smoke' | 'flash' | 'he' | 'incendiary' | 'decoy';
  position: Vector3D;
  velocity: Vector3D;
  fuseRemainingSec: number;
  bounces: number;
  detonated: boolean;
}

export function stepGrenadeProjectile(
  grenade: GrenadeProjectile,
  aabbs: AABB[],
  dt: number
): { bounced: boolean; detonated: boolean } {
  if (grenade.detonated) return { bounced: false, detonated: true };

  let bounced = false;
  grenade.fuseRemainingSec -= dt;
  grenade.velocity.y -= 16.5 * dt;

  const nextPos = {
    x: grenade.position.x + grenade.velocity.x * dt,
    y: grenade.position.y + grenade.velocity.y * dt,
    z: grenade.position.z + grenade.velocity.z * dt
  };

  // Ground bounce
  if (nextPos.y <= 0.15) {
    nextPos.y = 0.15;
    if (Math.abs(grenade.velocity.y) > 1.2) bounced = true;
    grenade.velocity.y = -grenade.velocity.y * 0.42;
    grenade.velocity.x *= 0.72;
    grenade.velocity.z *= 0.72;
    grenade.bounces++;
    if (grenade.type === 'incendiary') {
      grenade.detonated = true;
      grenade.position = nextPos;
      return { bounced, detonated: true };
    }
  }

  // Wall/box bounce
  const dirLen = Math.hypot(grenade.velocity.x, grenade.velocity.y, grenade.velocity.z);
  if (dirLen > 0.01) {
    const dir = {
      x: grenade.velocity.x / dirLen,
      y: grenade.velocity.y / dirLen,
      z: grenade.velocity.z / dirLen
    };
    const stepDist = dirLen * dt + 0.22;
    for (const box of aabbs) {
      if (!box.object.collidable || box.object.id === 'ground_main') continue;
      const hit = intersectRayAABB(grenade.position, dir, box, stepDist);
      if (hit) {
        if (hit.normal.x !== 0) grenade.velocity.x = -grenade.velocity.x * 0.55;
        if (hit.normal.y !== 0) grenade.velocity.y = -grenade.velocity.y * 0.45;
        if (hit.normal.z !== 0) grenade.velocity.z = -grenade.velocity.z * 0.55;
        bounced = true;
        grenade.bounces++;
        break;
      }
    }
  }

  grenade.position = nextPos;
  if (grenade.fuseRemainingSec <= 0) {
    grenade.detonated = true;
    return { bounced, detonated: true };
  }
  return { bounced, detonated: false };
}

export function computeGrenadeTrajectoryPreview(
  origin: Vector3D,
  velocity: Vector3D,
  aabbs: AABB[],
  steps = 45,
  stepDt = 0.04
): Vector3D[] {
  const sim: GrenadeProjectile = {
    id: 'preview',
    ownerId: 'local',
    type: 'smoke',
    position: { ...origin },
    velocity: { ...velocity },
    fuseRemainingSec: 2.0,
    bounces: 0,
    detonated: false
  };
  const points: Vector3D[] = [{ ...origin }];
  for (let i = 0; i < steps; i++) {
    stepGrenadeProjectile(sim, aabbs, stepDt);
    points.push({ ...sim.position });
    if (sim.detonated) break;
  }
  return points;
}
