import { GameMapDefinition, MapObjectDef, Vector3D } from '../../shared/types';
import { AABB, intersectRayAABB } from '../physics/physicsEngine';
import {
  VideoSettings,
  getObjectDistanceCutoffMeters,
  getPlayerDistanceCutoffMeters
} from '../settings/settingsStore';

export interface CullingFrameStats {
  totalObjects: number;
  visibleObjects: number;
  culledBehindCamera: number;
  culledByFrustum: number;
  culledByOcclusion: number;
  culledByDistance: number;
  lodHighCount: number;
  lodMediumCount: number;
  lodLowCount: number;
  visiblePlayers: number;
  culledPlayers: number;
  drawCalls: number;
  triangles: number;
}

export interface ObjectVisibilityDecision {
  objectId: string;
  visible: boolean;
  reason: 'visible' | 'behind_camera' | 'frustum' | 'occluded' | 'distance';
  lodLevel: 'high' | 'medium' | 'low';
  distanceMeters: number;
}

export function evaluateObjectVisibility(
  cameraPos: Vector3D,
  cameraForward: Vector3D,
  fovDegrees: number,
  aspect: number,
  obj: MapObjectDef,
  occluderBoxes: AABB[],
  video: VideoSettings
): ObjectVisibilityDecision {
  // Ground slab and perimeter boundaries remain visible to prevent skybox leaks
  if (obj.id === 'ground_main' || obj.id.startsWith('wall_north') || obj.id.startsWith('wall_south') || obj.id.startsWith('wall_east') || obj.id.startsWith('wall_west')) {
    return {
      objectId: obj.id,
      visible: true,
      reason: 'visible',
      lodLevel: 'high',
      distanceMeters: 0
    };
  }

  // Gameplay-critical zones (bomb sites) are never distance-culled
  const isCriticalObjective = obj.type === 'bomb_site_a' || obj.type === 'bomb_site_b' || obj.type === 'objective_zone';

  const dx = obj.position[0] - cameraPos.x;
  const dy = obj.position[1] - cameraPos.y;
  const dz = obj.position[2] - cameraPos.z;
  const dist = Math.hypot(dx, dy, dz);
  const boundingRadius = Math.hypot(obj.size[0], obj.size[1], obj.size[2]) * 0.55;

  // 1. Distance Culling (respecting LOD Tier & Object Visibility Distance setting)
  if (!isCriticalObjective) {
    const maxObjCutoff = getObjectDistanceCutoffMeters(video);
    const tierMultiplier =
      obj.lodTier === 'near' ? 0.55 : obj.lodTier === 'medium' ? 0.8 : obj.lodTier === 'far' ? 1.0 : 1.35;
    if (dist - boundingRadius > maxObjCutoff * tierMultiplier) {
      return {
        objectId: obj.id,
        visible: false,
        reason: 'distance',
        lodLevel: 'low',
        distanceMeters: dist
      };
    }
  }

  // 2. "Behind Me" Rear Hemisphere Culling & Frustum Culling
  if (video.frustumCulling && dist > boundingRadius + 1.2) {
    // Project vector from camera to object center onto cameraForward
    const forwardDot = dx * cameraForward.x + dy * cameraForward.y + dz * cameraForward.z;

    // If the entire bounding sphere is behind the camera plane, cull immediately
    if (forwardDot < -boundingRadius - 0.5) {
      return {
        objectId: obj.id,
        visible: false,
        reason: 'behind_camera',
        lodLevel: 'low',
        distanceMeters: dist
      };
    }

    // Horizontal/Vertical cone frustum check
    const halfFovRad = ((fovDegrees * Math.PI) / 180) * 0.5;
    const maxHalfAngle = Math.atan(Math.tan(halfFovRad) * Math.max(1.15, aspect)) + 0.22;
    const minCos = Math.cos(Math.min(Math.PI * 0.85, maxHalfAngle));
    const effectiveDist = Math.max(0.001, dist);
    const sphereAngleSin = Math.min(0.95, boundingRadius / effectiveDist);
    const cosAngle = forwardDot / effectiveDist;

    if (cosAngle + sphereAngleSin < minCos) {
      return {
        objectId: obj.id,
        visible: false,
        reason: 'frustum',
        lodLevel: 'low',
        distanceMeters: dist
      };
    }
  }

  // 3. Smart Solid-Wall Occlusion Culling ("Behind Solid Map Geometry")
  if (video.smartOcclusionCulling && !isCriticalObjective && dist > boundingRadius + 6.0) {
    const invDist = 1 / Math.max(0.001, dist);
    const dir = { x: dx * invDist, y: dy * invDist, z: dz * invDist };
    const maxOcclusionCheckDist = dist - boundingRadius - 0.4;

    if (maxOcclusionCheckDist > 2.0) {
      for (const box of occluderBoxes) {
        if (box.object.id === obj.id || !box.object.occluder) continue;
        // Only allow large solid walls/monoliths to occlude smaller behind-wall objects
        if (box.object.size[1] < obj.size[1] * 0.95) continue;

        const hit = intersectRayAABB(cameraPos, dir, box, maxOcclusionCheckDist);
        if (hit && hit.distance < maxOcclusionCheckDist) {
          // Verify top and horizontal corners of the object are also occluded by this wall
          const topDirLen = Math.hypot(dx, dy + obj.size[1] * 0.45, dz);
          const topDir = {
            x: dx / topDirLen,
            y: (dy + obj.size[1] * 0.45) / topDirLen,
            z: dz / topDirLen
          };
          const topHit = intersectRayAABB(cameraPos, topDir, box, maxOcclusionCheckDist);
          if (topHit) {
            return {
              objectId: obj.id,
              visible: false,
              reason: 'occluded',
              lodLevel: 'low',
              distanceMeters: dist
            };
          }
        }
      }
    }
  }

  // 4. Determine Streaming LOD Level based on distance
  let lodLevel: 'high' | 'medium' | 'low' = 'high';
  if (video.lodEnabled) {
    if (dist > 48) lodLevel = 'low';
    else if (dist > 22) lodLevel = 'medium';
  }

  return {
    objectId: obj.id,
    visible: true,
    reason: 'visible',
    lodLevel,
    distanceMeters: dist
  };
}

/**
 * Evaluates whether a remote player / bot should be rendered.
 * CRITICAL RULE (Section 4):
 * Never incorrectly hide gameplay-critical enemies in line of sight simply to improve FPS!
 * Only players who are BOTH behind solid walls (no line of sight) AND outside the camera frustum/distance
 * can have their cosmetic mesh skipped. Any enemy with line-of-sight or near the frustum is ALWAYS rendered.
 */
export function evaluatePlayerVisibility(
  cameraPos: Vector3D,
  cameraForward: Vector3D,
  targetPos: Vector3D,
  isEnemy: boolean,
  occluderBoxes: AABB[],
  video: VideoSettings
): { visible: boolean; lodLevel: 'high' | 'medium' | 'low'; hasLineOfSight: boolean } {
  const dx = targetPos.x - cameraPos.x;
  const dy = targetPos.y + 1.1 - cameraPos.y;
  const dz = targetPos.z - cameraPos.z;
  const dist = Math.hypot(dx, dy, dz);

  // Check gameplay line of sight to target head/chest
  const invDist = 1 / Math.max(0.001, dist);
  const dir = { x: dx * invDist, y: dy * invDist, z: dz * invDist };
  let losBlocked = false;
  for (const box of occluderBoxes) {
    if (!box.object.occluder) continue;
    const hit = intersectRayAABB(cameraPos, dir, box, dist - 0.35);
    if (hit) {
      losBlocked = true;
      break;
    }
  }

  const hasLos = !losBlocked;
  const lodLevel: 'high' | 'medium' | 'low' = !video.lodEnabled || dist < 24 ? 'high' : dist < 50 ? 'medium' : 'low';

  // Gameplay-critical rule: If the player has Line of Sight, NEVER hide them regardless of distance slider!
  if (hasLos) {
    return { visible: true, lodLevel, hasLineOfSight: true };
  }

  // If occluded behind solid wall AND completely behind the player's camera (> 4m away), we can safely skip rendering the mesh
  const forwardDot = dx * cameraForward.x + dy * cameraForward.y + dz * cameraForward.z;
  if (video.smartOcclusionCulling && losBlocked && forwardDot < -2.0 && dist > 4.5) {
    return { visible: false, lodLevel, hasLineOfSight: false };
  }

  // If occluded behind walls and beyond the user's configured Player Visibility Distance
  const maxPlayerDist = getPlayerDistanceCutoffMeters(video);
  if (!isEnemy && losBlocked && dist > maxPlayerDist) {
    return { visible: false, lodLevel, hasLineOfSight: false };
  }

  return { visible: true, lodLevel, hasLineOfSight: hasLos };
}
