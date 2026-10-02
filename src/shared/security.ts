import { GameMapDefinition, MapObjectDef, Vector3D } from './types';
import { WEAPON_SPECS } from './weapons';

export interface WorkshopValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedMap?: GameMapDefinition;
  packageSizeBytes: number;
}

const MAX_PACKAGE_BYTES = 5 * 1024 * 1024; // 5 MB max
const MAX_OBJECTS_PER_MAP = 1500;
const ALLOWED_OBJECT_TYPES = new Set([
  'floor',
  'wall',
  'cube',
  'ramp',
  'stairs',
  'cylinder',
  'doorway',
  'window',
  'prop',
  'cover',
  'ladder',
  'water',
  'spawn_sentinel',
  'spawn_vortex',
  'buy_zone',
  'bomb_site_a',
  'bomb_site_b',
  'objective_zone',
  'occlusion_zone',
  'visibility_portal',
  'sound_zone',
  'light'
]);

const ALLOWED_MATERIALS = new Set([
  'concrete',
  'metal',
  'wood',
  'tile',
  'sand',
  'glass',
  'water',
  'energy'
]);

const DANGEROUS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bsetTimeout\s*\(/i,
  /\bsetInterval\s*\(/i,
  /__proto__/i,
  /\bconstructor\b/i,
  /onload\s*=/i,
  /onerror\s*=/i,
  /document\.cookie/i,
  /window\.location/i,
  /import\s*\(/i
];

export function validateWorkshopPackage(rawPayload: unknown): WorkshopValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let serialized = '';
  try {
    serialized = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  } catch {
    return {
      valid: false,
      errors: ['Failed to serialize workshop package payload.'],
      warnings: [],
      packageSizeBytes: 0
    };
  }

  const packageSizeBytes = new TextEncoder().encode(serialized).length;
  if (packageSizeBytes > MAX_PACKAGE_BYTES) {
    errors.push(`Package size (${packageSizeBytes} bytes) exceeds maximum limit (${MAX_PACKAGE_BYTES} bytes).`);
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push(`Security violation: Prohibited script or prototype pattern detected (${pattern.source}).`);
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : (rawPayload as Record<string, unknown>);
  } catch {
    return {
      valid: false,
      errors: ['Malformed JSON in workshop package.'],
      warnings,
      packageSizeBytes
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: ['Workshop map root must be a JSON object.'],
      warnings,
      packageSizeBytes
    };
  }

  if (typeof parsed.name !== 'string' || parsed.name.trim().length < 2 || parsed.name.length > 64) {
    errors.push('Map name must be a string between 2 and 64 characters.');
  }

  if (!Array.isArray(parsed.objects)) {
    errors.push('Map package must contain an objects array.');
  } else {
    if (parsed.objects.length === 0) {
      errors.push('Map must contain at least 1 geometry object.');
    }
    if (parsed.objects.length > MAX_OBJECTS_PER_MAP) {
      errors.push(`Map exceeds maximum object count (${MAX_OBJECTS_PER_MAP}).`);
    }

    let hasSentinelSpawn = false;
    let hasVortexSpawn = false;

    parsed.objects.forEach((obj: unknown, idx: number) => {
      if (!obj || typeof obj !== 'object') {
        errors.push(`Object at index ${idx} is invalid.`);
        return;
      }
      const o = obj as Partial<MapObjectDef>;
      if (!o.type || !ALLOWED_OBJECT_TYPES.has(o.type)) {
        errors.push(`Object at index ${idx} has unsupported type "${String(o.type)}".`);
      }
      if (o.type === 'spawn_sentinel') hasSentinelSpawn = true;
      if (o.type === 'spawn_vortex') hasVortexSpawn = true;

      if (!Array.isArray(o.position) || o.position.length !== 3 || o.position.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 2000)) {
        errors.push(`Object at index ${idx} has out-of-bounds or invalid position.`);
      }
      if (!Array.isArray(o.size) || o.size.length !== 3 || o.size.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1000)) {
        errors.push(`Object at index ${idx} has invalid dimensions.`);
      }
      if (o.material && !ALLOWED_MATERIALS.has(o.material)) {
        errors.push(`Object at index ${idx} uses disallowed material "${String(o.material)}".`);
      }
      if (typeof o.color === 'string' && !/^#[0-9a-fA-F]{3,8}$/.test(o.color)) {
        errors.push(`Object at index ${idx} has invalid hex color "${o.color}".`);
      }
    });

    if (!hasSentinelSpawn) {
      warnings.push('Map has no explicit Sentinel spawn; default fallback spawn will be used.');
    }
    if (!hasVortexSpawn) {
      warnings.push('Map has no explicit Vortex spawn; default fallback spawn will be used.');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings, packageSizeBytes };
  }

  const sanitizedMap: GameMapDefinition = {
    id: String(parsed.id || `ws_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, ''),
    name: String(parsed.name).trim().slice(0, 64),
    subtitle: String(parsed.subtitle || 'Community Workshop Sector').slice(0, 96),
    author: String(parsed.author || 'Operative').slice(0, 48),
    version: String(parsed.version || '1.0.0').slice(0, 16),
    description: String(parsed.description || 'Validated community tactical map.').slice(0, 1000),
    supportedModes: Array.isArray(parsed.supportedModes)
      ? (parsed.supportedModes.slice(0, 9) as GameMapDefinition['supportedModes'])
      : ['Competitive', 'Deathmatch', 'Practice'],
    ambientColor: typeof parsed.ambientColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.ambientColor) ? parsed.ambientColor : '#475569',
    skyColor: typeof parsed.skyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.skyColor) ? parsed.skyColor : '#0f172a',
    fogColor: typeof parsed.fogColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.fogColor) ? parsed.fogColor : '#1e293b',
    sunDirection: [45, 80, 35],
    bounds: { min: [-120, -10, -120], max: [120, 60, 120] },
    objects: (parsed.objects as MapObjectDef[]).map((o, idx) => ({
      id: String(o.id || `obj_${idx}`).replace(/[^a-zA-Z0-9_-]/g, ''),
      name: String(o.name || `Object ${idx}`).slice(0, 48),
      type: o.type,
      position: [Number(o.position[0]), Number(o.position[1]), Number(o.position[2])],
      size: [Number(o.size[0]), Number(o.size[1]), Number(o.size[2])],
      rotation: Array.isArray(o.rotation) && o.rotation.length === 3
        ? [Number(o.rotation[0]) || 0, Number(o.rotation[1]) || 0, Number(o.rotation[2]) || 0]
        : [0, 0, 0],
      color: o.color || '#64748b',
      material: o.material || 'concrete',
      collidable: Boolean(o.collidable ?? true),
      occluder: Boolean(o.occluder ?? (o.type === 'wall' || o.type === 'cube')),
      lodTier: o.lodTier || 'always',
      roomId: o.roomId || 'main',
      layer: o.layer || 'Default',
      penetrationResistance: typeof o.penetrationResistance === 'number' ? Math.max(0, Math.min(1, o.penetrationResistance)) : 0.5
    })),
    portals: Array.isArray(parsed.portals) ? (parsed.portals as GameMapDefinition['portals']) : [],
    waypoints: Array.isArray(parsed.waypoints) ? (parsed.waypoints as GameMapDefinition['waypoints']) : [],
    callouts: Array.isArray(parsed.callouts) ? (parsed.callouts as GameMapDefinition['callouts']) : []
  };

  return {
    valid: true,
    errors: [],
    warnings,
    sanitizedMap,
    packageSizeBytes
  };
}

// ============================================================================
// SERVER-SIDE ANTI-CHEAT & INPUT VALIDATION
// ============================================================================

export interface AntiCheatViolation {
  type:
    | 'IMPOSSIBLE_MOVEMENT_SPEED'
    | 'IMPOSSIBLE_FIRE_RATE'
    | 'INVALID_VIEW_ANGLES'
    | 'ABNORMAL_AIM_SNAP'
    | 'IMPOSSIBLE_DAMAGE_CLAIM'
    | 'UNAUTHORIZED_ECONOMY_ACTION';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  timestamp: number;
}

export interface PlayerValidationState {
  lastPosition: Vector3D;
  lastTimestampMs: number;
  /**
   * The first input packet after spawn/teleport establishes the baseline.
   * Validating it against a near-zero delta time would produce a false positive
   * (the client's very first sample is measured against connection time).
   */
  hasBaseline: boolean;
  lastFireTimestampMs: number;
  lastYaw: number;
  lastPitch: number;
  violationScore: number;
  violations: AntiCheatViolation[];
}

export function validateMovementStep(
  prevPos: Vector3D,
  nextPos: Vector3D,
  dtSec: number,
  maxAllowedSpeedUnitsPerSec = 12.5 // generous cap above 7.5 m/s knife run + air strafe
): AntiCheatViolation | null {
  if (dtSec <= 0 || dtSec > 2) return null;
  const dx = nextPos.x - prevPos.x;
  const dz = nextPos.z - prevPos.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);
  const horizontalSpeed = horizontalDist / dtSec;

  if (horizontalSpeed > maxAllowedSpeedUnitsPerSec * 1.45) {
    return {
      type: 'IMPOSSIBLE_MOVEMENT_SPEED',
      severity: horizontalSpeed > maxAllowedSpeedUnitsPerSec * 2.5 ? 'critical' : 'high',
      details: `Horizontal velocity ${horizontalSpeed.toFixed(2)} m/s exceeds server cap ${maxAllowedSpeedUnitsPerSec.toFixed(2)} m/s.`,
      timestamp: Date.now()
    };
  }
  return null;
}

export function validateFireInterval(
  weaponId: string,
  lastFireMs: number,
  nowMs: number
): AntiCheatViolation | null {
  const spec = WEAPON_SPECS[weaponId];
  if (!spec) {
    return {
      type: 'IMPOSSIBLE_DAMAGE_CLAIM',
      severity: 'critical',
      details: `Unknown weapon ID "${weaponId}" in fire packet.`,
      timestamp: nowMs
    };
  }
  const minIntervalMs = (60 / spec.fireRateRpm) * 1000 * 0.82; // 18% jitter tolerance
  const elapsed = nowMs - lastFireMs;
  if (lastFireMs > 0 && elapsed < minIntervalMs) {
    return {
      type: 'IMPOSSIBLE_FIRE_RATE',
      severity: 'high',
      details: `Weapon ${spec.name} fired after ${elapsed.toFixed(1)}ms (min allowed: ${minIntervalMs.toFixed(1)}ms).`,
      timestamp: nowMs
    };
  }
  return null;
}

export function validateViewAnglesAndSnap(
  prevYaw: number,
  prevPitch: number,
  nextYaw: number,
  nextPitch: number,
  dtSec: number,
  didHeadshotKill: boolean
): AntiCheatViolation | null {
  if (!Number.isFinite(nextYaw) || !Number.isFinite(nextPitch)) {
    return {
      type: 'INVALID_VIEW_ANGLES',
      severity: 'critical',
      details: 'Non-finite view angles submitted.',
      timestamp: Date.now()
    };
  }
  // Pitch must be within [-PI/2, PI/2] with slight tolerance
  if (Math.abs(nextPitch) > Math.PI / 2 + 0.05) {
    return {
      type: 'INVALID_VIEW_ANGLES',
      severity: 'critical',
      details: `Pitch angle ${nextPitch.toFixed(3)} rad exceeds vertical gimbal limit.`,
      timestamp: Date.now()
    };
  }
  if (dtSec > 0 && dtSec < 0.05 && didHeadshotKill) {
    let yawDiff = Math.abs(nextYaw - prevYaw) % (Math.PI * 2);
    if (yawDiff > Math.PI) yawDiff = Math.PI * 2 - yawDiff;
    const pitchDiff = Math.abs(nextPitch - prevPitch);
    const totalAngleDeg = (Math.sqrt(yawDiff * yawDiff + pitchDiff * pitchDiff) * 180) / Math.PI;

    // Instant >140 degree single-tick snap into an immediate headshot
    if (totalAngleDeg > 145) {
      return {
        type: 'ABNORMAL_AIM_SNAP',
        severity: 'medium',
        details: `Instant ${totalAngleDeg.toFixed(1)}° angular snap within ${(dtSec * 1000).toFixed(1)}ms resulting in headshot.`,
        timestamp: Date.now()
      };
    }
  }
  return null;
}


/**
 * Leaky-bucket movement validator.
 *
 * Measuring an instantaneous delta alone is unreliable: client input packets
 * arrive unevenly, get coalesced by the browser, and can bunch after a network
 * hiccup. Comparing raw displacement against wall-clock arrival time therefore
 * produces false positives on legitimate players.
 *
 * Instead the server maintains a time-regenerated movement budget. Legitimate
 * bursts are absorbed by previously accumulated credit, while sustained
 * impossible speed (teleports, speed hacks, fly exploits) drains the bucket and
 * is flagged. The bucket is capped so credit cannot be hoarded indefinitely.
 */
export interface MovementBudgetState {
  budget: number;
}

export function createMovementBudget(): MovementBudgetState {
  return { budget: 0 };
}

export function validateMovementBudget(
  prevPos: Vector3D,
  nextPos: Vector3D,
  dtSec: number,
  budgetState: MovementBudgetState,
  maxAllowedSpeedUnitsPerSec = 12.5
): AntiCheatViolation | null {
  const clampedDt = Math.min(Math.max(dtSec, 0), 2);
  const dx = nextPos.x - prevPos.x;
  const dz = nextPos.z - prevPos.z;
  const horizontalDist = Math.sqrt(dx * dx + dz * dz);

  const burstCap = maxAllowedSpeedUnitsPerSec * 0.8; // ~0.8s of credit
  budgetState.budget = Math.min(burstCap, budgetState.budget + clampedDt * maxAllowedSpeedUnitsPerSec);
  budgetState.budget -= horizontalDist;

  const tolerance = maxAllowedSpeedUnitsPerSec * 0.35;
  if (budgetState.budget < -tolerance) {
    const instantaneousSpeed = clampedDt > 0 ? horizontalDist / clampedDt : horizontalDist * 64;
    budgetState.budget = 0; // reset so a single offence does not spam the log
    return {
      type: 'IMPOSSIBLE_MOVEMENT_SPEED',
      severity: instantaneousSpeed > maxAllowedSpeedUnitsPerSec * 3 ? 'critical' : 'high',
      details: `Movement budget exhausted: instantaneous ${instantaneousSpeed.toFixed(
        2
      )} m/s over ${(clampedDt * 1000).toFixed(1)}ms (cap ${maxAllowedSpeedUnitsPerSec.toFixed(2)} m/s).`,
      timestamp: Date.now()
    };
  }
  return null;
}
