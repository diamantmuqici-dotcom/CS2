import { BotDifficulty, GameMapDefinition, MatchPlayerStats, TeamId, Vector3D } from '../../shared/types';
import { WEAPON_SPECS } from '../../shared/weapons';
import { AABB, hasLineOfSight, stepPlayerPhysics } from '../physics/physicsEngine';

export interface BotBrainState {
  botId: string;
  targetWaypointId: string | null;
  reactionTimerSec: number;
  burstTimerSec: number;
  strafeDir: number;
  strafeTimerSec: number;
  lastKnownEnemyPos: Vector3D | null;
}

const DIFFICULTY_PARAMS: Record<
  BotDifficulty,
  { reactionDelaySec: number; aimSpreadRad: number; fireIntervalMultiplier: number; headshotChance: number }
> = {
  Easy: { reactionDelaySec: 0.68, aimSpreadRad: 0.095, fireIntervalMultiplier: 2.1, headshotChance: 0.08 },
  Normal: { reactionDelaySec: 0.42, aimSpreadRad: 0.055, fireIntervalMultiplier: 1.45, headshotChance: 0.18 },
  Hard: { reactionDelaySec: 0.24, aimSpreadRad: 0.028, fireIntervalMultiplier: 1.15, headshotChance: 0.34 },
  Expert: { reactionDelaySec: 0.14, aimSpreadRad: 0.014, fireIntervalMultiplier: 1.0, headshotChance: 0.52 }
};

export const BOT_CALLSIGNS: Record<'SENTINEL' | 'VORTEX', string[]> = {
  SENTINEL: ['Aegis-01', 'Valkyrie', 'Cipher', 'Bastion', 'Kestrel-CT', 'Orion', 'Frost', 'Talon-6'],
  VORTEX: ['Havoc', 'Wraith', 'Viper-X', 'Raptor', 'Scorch', 'Phantom', 'Reaper', 'Nyx']
};

export function performBotBuyDecision(bot: MatchPlayerStats, mode: string): void {
  if (mode === 'Retakes' || mode === 'Practice') return;
  if (bot.money >= 1000 && bot.armor < 50) {
    bot.armor = 100;
    bot.hasHelmet = true;
    bot.money -= 1000;
  } else if (bot.money >= 650 && bot.armor === 0) {
    bot.armor = 100;
    bot.money -= 650;
  }

  if (bot.team === 'SENTINEL' && !bot.hasDefuseKit && bot.money >= 400) {
    bot.hasDefuseKit = true;
    bot.money -= 400;
  }

  // Buy primary weapon if currently holding pistol
  const currentSpec = WEAPON_SPECS[bot.currentWeapon];
  if (!currentSpec || currentSpec.slot === 'secondary') {
    if (bot.money >= 2900) {
      bot.currentWeapon = bot.team === 'SENTINEL' ? 'vanguard_m4s' : 'harbinger_47';
      bot.money -= WEAPON_SPECS[bot.currentWeapon].price;
    } else if (bot.money >= 1800) {
      bot.currentWeapon = bot.team === 'SENTINEL' ? 'dagger_fam' : 'korsak_gal';
      bot.money -= WEAPON_SPECS[bot.currentWeapon].price;
    } else if (bot.money >= 1250) {
      bot.currentWeapon = 'vector_9';
      bot.money -= 1250;
    }
  }
}

export interface BotStepResult {
  firedTargetId: string | null;
  firedHitGroup: 'head' | 'chest' | 'stomach' | 'leg';
  wantsPlantBomb: boolean;
  wantsDefuseBomb: boolean;
}

export function updateBotAgent(
  bot: MatchPlayerStats,
  brain: BotBrainState,
  allPlayers: MatchPlayerStats[],
  map: GameMapDefinition,
  aabbs: AABB[],
  activeSmokes: Vector3D[],
  bombState: { planted: boolean; position: Vector3D | null },
  difficulty: BotDifficulty,
  isFreezetime: boolean,
  dt: number
): BotStepResult {
  const result: BotStepResult = {
    firedTargetId: null,
    firedHitGroup: 'chest',
    wantsPlantBomb: false,
    wantsDefuseBomb: false
  };

  if (!bot.alive || isFreezetime) return result;

  const params = DIFFICULTY_PARAMS[difficulty] || DIFFICULTY_PARAMS.Normal;
  const botEye = { x: bot.position.x, y: bot.position.y + 1.62, z: bot.position.z };

  // 1. Fair Target Acquisition: ONLY see enemies with true Line-of-Sight (blocked by walls & smoke)
  let visibleEnemy: MatchPlayerStats | null = null;
  let closestDist = Infinity;

  for (const other of allPlayers) {
    if (!other.alive || other.id === bot.id) continue;
    if (other.team === bot.team) continue;

    const otherEye = { x: other.position.x, y: other.position.y + 1.55, z: other.position.z };
    const dist = Math.hypot(otherEye.x - botEye.x, otherEye.y - botEye.y, otherEye.z - botEye.z);
    if (dist < closestDist && hasLineOfSight(botEye, otherEye, aabbs, activeSmokes)) {
      closestDist = dist;
      visibleEnemy = other;
    }
  }

  // 2. Navigation / Objective Waypoint Selection
  if (!brain.targetWaypointId && map.waypoints.length > 0) {
    // Pick objective waypoint
    const siteWaypoints = map.waypoints.filter((w) => w.tag === 'siteA' || w.tag === 'siteB' || w.tag === 'mid');
    const chosen =
      siteWaypoints.length > 0
        ? siteWaypoints[Math.floor(Math.random() * siteWaypoints.length)]
        : map.waypoints[Math.floor(Math.random() * map.waypoints.length)];
    brain.targetWaypointId = chosen.id;
  }

  let moveGoal: Vector3D | null = null;

  if (bombState.planted && bombState.position) {
    // If bomb is planted, Sentinels move to defuse, Vortex guard it
    moveGoal = bombState.position;
    const distToBomb = Math.hypot(bombState.position.x - bot.position.x, bombState.position.z - bot.position.z);
    if (bot.team === 'SENTINEL' && distToBomb < 2.6 && !visibleEnemy) {
      result.wantsDefuseBomb = true;
      return result;
    }
  } else if (bot.team === 'VORTEX' && bot.hasBomb) {
    // Bomb carrier moves to Site A or B to plant
    const siteObj = map.objects.find((o) => o.type === 'bomb_site_a' || o.type === 'bomb_site_b');
    if (siteObj) {
      moveGoal = { x: siteObj.position[0], y: 0, z: siteObj.position[2] };
      const distToSite = Math.hypot(moveGoal.x - bot.position.x, moveGoal.z - bot.position.z);
      if (distToSite < 3.5 && !visibleEnemy) {
        result.wantsPlantBomb = true;
      }
    }
  }

  if (!moveGoal && brain.targetWaypointId) {
    const wp = map.waypoints.find((w) => w.id === brain.targetWaypointId);
    if (wp) {
      moveGoal = { x: wp.position[0], y: wp.position[1], z: wp.position[2] };
      const distWp = Math.hypot(moveGoal.x - bot.position.x, moveGoal.z - bot.position.z);
      if (distWp < 2.4 && wp.connections.length > 0) {
        brain.targetWaypointId = wp.connections[Math.floor(Math.random() * wp.connections.length)];
      }
    }
  }

  // 3. Movement & Aiming
  brain.strafeTimerSec -= dt;
  if (brain.strafeTimerSec <= 0) {
    brain.strafeDir = Math.random() > 0.5 ? 1 : -1;
    brain.strafeTimerSec = 0.7 + Math.random() * 0.9;
  }

  let forwardInput = 0;
  let rightInput = 0;

  if (visibleEnemy) {
    brain.lastKnownEnemyPos = { ...visibleEnemy.position };
    const dx = visibleEnemy.position.x - bot.position.x;
    const dz = visibleEnemy.position.z - bot.position.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    bot.yaw += (desiredYaw - bot.yaw) * Math.min(1, dt * 10);

    // Tactical strafe-peeking while engaging
    rightInput = brain.strafeDir * 0.65;
    forwardInput = closestDist > 18 ? 0.6 : 0;

    brain.reactionTimerSec += dt;
    brain.burstTimerSec -= dt;

    const spec = WEAPON_SPECS[bot.currentWeapon] || WEAPON_SPECS.vp9_tactical;
    const fireInterval = (60 / spec.fireRateRpm) * params.fireIntervalMultiplier;

    if (brain.reactionTimerSec >= params.reactionDelaySec && brain.burstTimerSec <= 0) {
      brain.burstTimerSec = fireInterval;
      // Compute hit accuracy based on distance and difficulty spread
      const hitProb = Math.max(0.12, 1 - (closestDist / 75) * (params.aimSpreadRad * 10));
      if (Math.random() < hitProb) {
        result.firedTargetId = visibleEnemy.id;
        const r = Math.random();
        if (r < params.headshotChance) result.firedHitGroup = 'head';
        else if (r < 0.78) result.firedHitGroup = 'chest';
        else if (r < 0.92) result.firedHitGroup = 'stomach';
        else result.firedHitGroup = 'leg';
      }
    }
  } else {
    brain.reactionTimerSec = Math.max(0, brain.reactionTimerSec - dt * 1.5);
    if (moveGoal) {
      const dx = moveGoal.x - bot.position.x;
      const dz = moveGoal.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.8) {
        bot.yaw = Math.atan2(-dx, -dz);
        forwardInput = 0.88;
      }
    }
  }

  const physState = stepPlayerPhysics(
    {
      position: bot.position,
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
      crouching: false,
      walking: false,
      sprinting: false,
      onLadder: false,
      inWater: false,
      eyeHeight: 1.66,
      groundSurface: 'concrete'
    },
    {
      forward: forwardInput,
      right: rightInput,
      jumpPressed: false,
      crouchHeld: false,
      walkHeld: false,
      sprintHeld: false,
      yaw: bot.yaw
    },
    aabbs,
    dt,
    {
      weaponSpeedMultiplier: 0.9,
      gravityMultiplier: 1.0,
      moveSpeedMultiplier: 0.85,
      allowSprint: false
    }
  );

  bot.position = physState.position;
  return result;
}
