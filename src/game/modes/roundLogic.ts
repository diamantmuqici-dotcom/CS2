import { GameModeId, TeamId, BotDifficulty } from '../../shared/types';

export interface EconomyContext {
  mode: GameModeId;
  wonRound: boolean;
  lossStreak: number;
  bombPlantedByThisTeam: boolean;
  isAttacker: boolean;
  killReward: number;
  objectiveReward?: number;
}

export interface EconomyPayout {
  reward: number;
  reason: string;
  newLossStreak: number;
}

const LOSS_BONUS_TABLE = [1400, 1900, 2400, 2900, 3400];
const WINGMAN_LOSS_BONUS_TABLE = [1500, 2000, 2500, 3000];
const RUSH_LOSS_BONUS_TABLE = [1600, 2100, 2600];

export function calculateRoundPayout(ctx: EconomyContext): EconomyPayout {
  if (ctx.mode === 'Deathmatch' || ctx.mode === 'Practice') {
    return { reward: 0, reason: 'No economy in this mode', newLossStreak: 0 };
  }

  if (ctx.wonRound) {
    let reward = 3250;
    if (ctx.mode === 'Wingman') reward = 3000;
    if (ctx.mode === 'Rush') reward = 2800;
    let reason = `Round Victory (+$${reward})`;

    if (ctx.mode === 'Competitive' || ctx.mode === 'Premier') {
      if (ctx.bombPlantedByThisTeam && !ctx.isAttacker) {
        reward += 600;
        reason += ' + Defused Bomb (+$600)';
      } else if (ctx.bombPlantedByThisTeam && ctx.isAttacker) {
        reward += 800;
        reason += ' + Objective Executed (+$800)';
      }
    }
    return { reward, reason, newLossStreak: 0 };
  }

  const table =
    ctx.mode === 'Wingman'
      ? WINGMAN_LOSS_BONUS_TABLE
      : ctx.mode === 'Rush'
      ? RUSH_LOSS_BONUS_TABLE
      : LOSS_BONUS_TABLE;

  const idx = Math.min(Math.max(0, ctx.lossStreak), table.length - 1);
  let reward = table[idx];
  let reason = `Loss Bonus Tier ${idx + 1} (+$${reward})`;

  if (ctx.bombPlantedByThisTeam && ctx.isAttacker && (ctx.mode === 'Competitive' || ctx.mode === 'Premier')) {
    reward += 800;
    reason += ' + Bomb Planted (+$800)';
  }

  return { reward, reason, newLossStreak: ctx.lossStreak + 1 };
}

export type RoundEndReason =
  | 'SENTINEL_ELIMINATION'
  | 'VORTEX_ELIMINATION'
  | 'BOMB_EXPLODED'
  | 'BOMB_DEFUSED'
  | 'TIME_EXPIRED_DEFENDERS_WIN'
  | 'TIME_EXPIRED_ATTACKERS_WIN'
  | 'OBJECTIVE_CAPTURED'
  | 'SCORE_LIMIT_REACHED';

export interface RoundStateInput {
  mode: GameModeId;
  sentinelAlive: number;
  vortexAlive: number;
  bombPlanted: boolean;
  bombTimerSec: number;
  roundTimeRemainingSec: number;
  bombDefused: boolean;
}

export interface RoundResolution {
  ended: boolean;
  winner: TeamId | null;
  reason: RoundEndReason | null;
}

export function evaluateRoundEnd(state: RoundStateInput): RoundResolution {
  // Stampede / Rush / Deathmatch: only elimination matters
  const isDeathmatch = state.mode === 'Deathmatch';
  const isPractice = state.mode === 'Practice';
  const isRetakes = state.mode === 'Retakes' || state.mode === 'Rush';

  if (isDeathmatch || isPractice) {
    return { ended: false, winner: null, reason: null };
  }

  if (state.bombDefused) {
    return { ended: true, winner: 'SENTINEL', reason: 'BOMB_DEFUSED' };
  }

  if (state.bombPlanted && state.bombTimerSec <= 0) {
    return { ended: true, winner: 'VORTEX', reason: 'BOMB_EXPLODED' };
  }

  if (!state.bombPlanted) {
    if (state.vortexAlive <= 0) {
      return { ended: true, winner: 'SENTINEL', reason: 'VORTEX_ELIMINATION' };
    }
    // Retakes start post-plant; attackers eliminated before plant = defenders win
    if (state.sentinelAlive <= 0 && !isRetakes) {
      return { ended: true, winner: 'VORTEX', reason: 'SENTINEL_ELIMINATION' };
    }
    if (state.sentinelAlive <= 0 && isRetakes) {
      return { ended: true, winner: 'VORTEX', reason: 'SENTINEL_ELIMINATION' };
    }
    if (state.roundTimeRemainingSec <= 0) {
      return { ended: true, winner: 'SENTINEL', reason: 'TIME_EXPIRED_DEFENDERS_WIN' };
    }
  } else {
    // Post-plant: defenders must defuse or eliminate all attackers
    if (state.sentinelAlive <= 0) {
      return { ended: true, winner: 'VORTEX', reason: 'SENTINEL_ELIMINATION' };
    }
    if (state.vortexAlive <= 0 && state.mode !== 'Retakes') {
      // Bomb still ticking; defenders must defuse — round continues
      return { ended: false, winner: null, reason: null };
    }
    if (state.bombTimerSec <= 0) {
      return { ended: true, winner: 'VORTEX', reason: 'BOMB_EXPLODED' };
    }
  }

  return { ended: false, winner: null, reason: null };
}

export function checkMatchComplete(
  sentinelScore: number,
  vortexScore: number,
  maxRounds: number,
  isWingman: boolean,
  overtimeEnabled = true
): { complete: boolean; winner: TeamId | 'DRAW' | null; needsOvertime: boolean } {
  const regulationTarget = Math.floor(maxRounds / 2) + 1;
  const overtimeTarget = regulationTarget + 3;

  if (sentinelScore >= regulationTarget && sentinelScore - vortexScore >= 2) {
    return { complete: true, winner: 'SENTINEL', needsOvertime: false };
  }
  if (vortexScore >= regulationTarget && vortexScore - sentinelScore >= 2) {
    return { complete: true, winner: 'VORTEX', needsOvertime: false };
  }

  // Overtime: tied at regulation target - 1 with both sides having reached the target
  const regulationTie = Math.floor(maxRounds / 2);
  if (overtimeEnabled && sentinelScore === regulationTie && vortexScore === regulationTie) {
    return { complete: false, winner: null, needsOvertime: true };
  }

  if (overtimeEnabled && overtimeTarget > 0) {
    if (sentinelScore >= overtimeTarget + 3 && sentinelScore - vortexScore >= 2) {
      return { complete: true, winner: 'SENTINEL', needsOvertime: false };
    }
    if (vortexScore >= overtimeTarget + 3 && vortexScore - sentinelScore >= 2) {
      return { complete: true, winner: 'VORTEX', needsOvertime: false };
    }
  }

  return { complete: false, winner: null, needsOvertime: false };
}

export interface RetakeSpawnPlan {
  position: [number, number, number];
  equipment: {
    primary: string;
    secondary: string;
    armor: number;
    helmet: boolean;
    grenades: string[];
    defuseKit: boolean;
  };
}

const RETAKE_LOADOUTS: Array<{ primary: string; secondary: string; grenades: string[] }> = [
  { primary: 'vanguard_m4a', secondary: 'viper_p250', grenades: ['flash_grenade', 'smoke_grenade'] },
  { primary: 'harbinger_47', secondary: 'viper_p250', grenades: ['he_grenade', 'flash_grenade'] },
  { primary: 'solaris_553', secondary: 'vp9_tactical', grenades: ['smoke_grenade'] },
  { primary: 'dagger_fam', secondary: 'talon_50', grenades: ['incendiary_grenade'] },
  { primary: 'monolith_awm', secondary: 'vp9_tactical', grenades: ['flash_grenade'] },
  { primary: 'vector_9', secondary: 'viper_p250', grenades: ['flash_grenade', 'he_grenade'] }
];

export function assignRetakeLoadout(seed: number): RetakeSpawnPlan['equipment'] {
  const loadout = RETAKE_LOADOUTS[seed % RETAKE_LOADOUTS.length];
  return {
    primary: loadout.primary,
    secondary: loadout.secondary,
    armor: 100,
    helmet: true,
    grenades: loadout.grenades,
    defuseKit: seed % 2 === 0
  };
}

export function getModeConfig(mode: GameModeId): {
  teamSize: number;
  maxRounds: number;
  roundTimeSec: number;
  buyTimeSec: number;
  bombTimerSec: number;
  startingMoney: number;
  friendlyFire: boolean;
  overtime: boolean;
  description: string;
  scoring: string;
} {
  switch (mode) {
    case 'Competitive':
      return {
        teamSize: 5,
        maxRounds: 24,
        roundTimeSec: 115,
        buyTimeSec: 20,
        bombTimerSec: 40,
        startingMoney: 800,
        friendlyFire: false,
        overtime: true,
        description: 'Standard 5v5 round-based competitive play with full economy and MR12 ruleset.',
        scoring: 'First to 13 rounds. Overtime at 12-12.'
      };
    case 'Premier':
      return {
        teamSize: 5,
        maxRounds: 24,
        roundTimeSec: 115,
        buyTimeSec: 20,
        bombTimerSec: 40,
        startingMoney: 800,
        friendlyFire: false,
        overtime: true,
        description: 'Ranked Premier ladder with Premier Rating, map veto phase, and season leaderboards.',
        scoring: 'Premier Rating adjusted per round differential.'
      };
    case 'Wingman':
      return {
        teamSize: 2,
        maxRounds: 16,
        roundTimeSec: 100,
        buyTimeSec: 15,
        bombTimerSec: 40,
        startingMoney: 800,
        friendlyFire: false,
        overtime: true,
        description: 'Fast 2v2 objective play on compact single-site maps.',
        scoring: 'First to 9 rounds.'
      };
    case 'Rush':
      return {
        teamSize: 3,
        maxRounds: 12,
        roundTimeSec: 75,
        buyTimeSec: 8,
        bombTimerSec: 30,
        startingMoney: 1400,
        friendlyFire: false,
        overtime: false,
        description: 'Accelerated objective rush with boosted economy and shortened timers.',
        scoring: 'First to 7 rounds.'
      };
    case 'Casual':
      return {
        teamSize: 5,
        maxRounds: 16,
        roundTimeSec: 130,
        buyTimeSec: 20,
        bombTimerSec: 45,
        startingMoney: 1000,
        friendlyFire: false,
        overtime: false,
        description: 'Relaxed ruleset with simplified economy and join-in-progress support.',
        scoring: 'First to 9 rounds.'
      };
    case 'Deathmatch':
      return {
        teamSize: 10,
        maxRounds: 1,
        roundTimeSec: 600,
        buyTimeSec: 0,
        bombTimerSec: 0,
        startingMoney: 16000,
        friendlyFire: false,
        overtime: false,
        description: 'Continuous respawn free-for-all / team deathmatch with instant loadout selection.',
        scoring: 'Highest score at time limit. 10 minutes.'
      };
    case 'Retakes':
      return {
        teamSize: 4,
        maxRounds: 20,
        roundTimeSec: 35,
        buyTimeSec: 0,
        bombTimerSec: 35,
        startingMoney: 0,
        friendlyFire: false,
        overtime: false,
        description: 'Post-plant retake scenarios with pre-assigned randomized loadouts.',
        scoring: 'Rapid rounds. First to 11.'
      };
    case 'Practice':
      return {
        teamSize: 1,
        maxRounds: 0,
        roundTimeSec: 3600,
        buyTimeSec: 0,
        bombTimerSec: 0,
        startingMoney: 16000,
        friendlyFire: false,
        overtime: false,
        description: 'Sandbox training: infinite ammo, full armory, trajectory preview, hitbox visualization.',
        scoring: 'No scoring. Sandbox.'
      };
    case 'Custom':
    default:
      return {
        teamSize: 5,
        maxRounds: 24,
        roundTimeSec: 115,
        buyTimeSec: 15,
        bombTimerSec: 40,
        startingMoney: 800,
        friendlyFire: false,
        overtime: true,
        description: 'Player-configured server rules for LAN, scrims, and community matches.',
        scoring: 'Configured by host.'
      };
  }
}

export { LOSS_BONUS_TABLE, WINGMAN_LOSS_BONUS_TABLE, RUSH_LOSS_BONUS_TABLE };
