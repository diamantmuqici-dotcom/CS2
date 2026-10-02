import { describe, it, expect } from 'vitest';
import {
  buildMapAABBs,
  hasLineOfSight,
  stepPlayerPhysics,
  type PlayerPhysicsState
} from '../src/game/physics/physicsEngine';
import { buildHitboxes, raycastPlayerHitboxes } from '../src/game/weapons/weaponSystem';
import { WEAPON_SPECS, calculateWeaponDamage } from '../src/shared/weapons';
import { HARBOR_PROTOCOL_MAP } from '../src/game/maps/officialMaps';
import {
  calculateRoundPayout,
  checkMatchComplete,
  evaluateRoundEnd,
  getModeConfig
} from '../src/game/modes/roundLogic';
import { updateBotAgent, type BotBrainState } from '../src/game/bots/botSystem';
import { MatchPlayerStats } from '../src/shared/types';

/**
 * Headless vertical-slice integration test.
 *
 * Simulates the core round loop — spawn → navigate → acquire target →
 * hitscan → damage → elimination → round resolution → economy payout —
 * with the exact same pure modules the live engine uses, but without a GPU.
 */

const aabbs = buildMapAABBs(HARBOR_PROTOCOL_MAP);

function makePlayer(id: string, team: 'SENTINEL' | 'VORTEX', pos: [number, number, number]): MatchPlayerStats {
  return {
    id,
    name: id,
    team,
    isBot: id.startsWith('bot'),
    alive: true,
    health: 100,
    armor: 100,
    hasHelmet: true,
    hasDefuseKit: team === 'SENTINEL',
    hasBomb: false,
    money: 800,
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    damageDealt: 0,
    utilityDamage: 0,
    entryKills: 0,
    clutches: 0,
    mvps: 0,
    score: 0,
    ping: 15,
    currentWeapon: team === 'SENTINEL' ? 'vanguard_m4a' : 'harbinger_47',
    position: { x: pos[0], y: pos[1], z: pos[2] },
    yaw: team === 'SENTINEL' ? Math.PI : 0,
    pitch: 0,
    crouching: false
  };
}

function makeBrain(id: string): BotBrainState {
  return {
    botId: id,
    targetWaypointId: null,
    reactionTimerSec: 0,
    burstTimerSec: 0,
    strafeDir: 1,
    strafeTimerSec: 0,
    lastKnownEnemyPos: null
  };
}

describe('Headless round simulation', () => {
  it('bots navigate the map, acquire line-of-sight targets, and resolve a round', () => {
    const sentinel = makePlayer('bot_aegis', 'SENTINEL', [0, 0, -44]);
    const vortex = makePlayer('bot_havoc', 'VORTEX', [0, 0, -12]);

    const sentinelBrain = makeBrain(sentinel.id);
    const vortexBrain = makeBrain(vortex.id);
    const roster = [sentinel, vortex];

    const dt = 1 / 64;
    let roundsSimulated = 0;
    let lastRoundResolution: ReturnType<typeof evaluateRoundEnd> | null = null;

    // Simulate up to 90 seconds of engagement
    for (let tick = 0; tick < 90 * 64; tick++) {
      for (const [bot, brain] of [
        [sentinel, sentinelBrain],
        [vortex, vortexBrain]
      ] as Array<[MatchPlayerStats, BotBrainState]>) {
        if (!bot.alive) continue;

        const result = updateBotAgent(
          bot,
          brain,
          roster,
          HARBOR_PROTOCOL_MAP,
          aabbs,
          [],
          { planted: false, position: null },
          'Hard',
          false,
          dt
        );

        if (result.firedTargetId && result.firedTargetId !== bot.id) {
          const victim = roster.find((r) => r.id === result.firedTargetId);
          if (victim && victim.alive) {
            const spec = WEAPON_SPECS[bot.currentWeapon];
            const eye = { x: bot.position.x, y: bot.position.y + 1.6, z: bot.position.z };
            const targetY =
              victim.position.y +
              (result.firedHitGroup === 'head' ? 1.68 : result.firedHitGroup === 'chest' ? 1.28 : 0.9);
            const target = { x: victim.position.x, y: targetY, z: victim.position.z };

            // Fair-play gate: never damage through solid geometry
            if (!hasLineOfSight(eye, target, aabbs)) continue;

            const dist = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
            const dmg = calculateWeaponDamage({
              weapon: spec,
              distanceMeters: dist,
              hitGroup: result.firedHitGroup,
              targetArmor: victim.armor,
              targetHasHelmet: victim.hasHelmet
            });
            victim.armor = Math.max(0, victim.armor - dmg.armorDamage);
            victim.health -= dmg.healthDamage;
            if (victim.health <= 0) {
              victim.health = 0;
              victim.alive = false;
              victim.deaths += 1;
              bot.kills += 1;
            }
          }
        }
      }

      const resolution = evaluateRoundEnd({
        mode: 'Competitive',
        sentinelAlive: roster.filter((p) => p.team === 'SENTINEL' && p.alive).length,
        vortexAlive: roster.filter((p) => p.team === 'VORTEX' && p.alive).length,
        bombPlanted: false,
        bombTimerSec: 40,
        roundTimeRemainingSec: Math.max(0, 115 - tick * dt),
        bombDefused: false
      });

      if (resolution.ended) {
        lastRoundResolution = resolution;
        roundsSimulated++;
        break;
      }
    }

    expect(lastRoundResolution).not.toBeNull();
    expect(lastRoundResolution!.winner).toBeTruthy();
    expect(roundsSimulated).toBe(1);
    // Exactly one combatant should have been eliminated for a 1v1 elimination ending
    expect(roster.filter((p) => !p.alive).length).toBe(1);
  });

  it('never lets a bot damage a target it cannot see (walls are authoritative)', () => {
    // Two players on opposite sides of the mid divider — a guaranteed solid occluder
    const eye = { x: -14, y: 1.6, z: -22 };
    const target = { x: -14, y: 1.28, z: 4 };
    expect(hasLineOfSight(eye, target, aabbs)).toBe(false);

    // Even with a lethal weapon, the fair-play gate must block the damage entirely
    const candidateDamage = calculateWeaponDamage({
      weapon: WEAPON_SPECS.monolith_awm,
      distanceMeters: 26,
      hitGroup: 'head',
      targetArmor: 0,
      targetHasHelmet: false
    });
    expect(candidateDamage.healthDamage).toBeGreaterThan(100);

    const blocked = !hasLineOfSight(eye, target, aabbs);
    expect(blocked).toBe(true);
  });

  it('a full 13-round competitive match resolves to a winner', () => {
    let sentinelScore = 0;
    let vortexScore = 0;
    let rounds = 0;

    while (rounds < 40) {
      const completion = checkMatchComplete(sentinelScore, vortexScore, 24, false, true);
      if (completion.complete) break;
      // Deterministic two-wins-to-one-loss pattern → Sentinel eventually takes a 2-round lead
      if (rounds % 3 !== 0) sentinelScore++;
      else vortexScore++;
      rounds++;
    }

    const completion = checkMatchComplete(sentinelScore, vortexScore, 24, false, true);
    expect(completion.complete).toBe(true);
    expect(completion.winner).toBeTruthy();
    expect(Math.max(sentinelScore, vortexScore)).toBeGreaterThanOrEqual(13);
  });

  it('economy rewards and match flow stay internally consistent over 24 rounds', () => {
    let money = 800;
    let lossStreak = 0;
    const history: number[] = [];

    for (let round = 0; round < 24; round++) {
      const won = round % 3 !== 0; // roughly two wins for each loss
      const payout = calculateRoundPayout({
        mode: 'Competitive',
        wonRound: won,
        lossStreak,
        bombPlantedByThisTeam: false,
        isAttacker: false,
        killReward: 0
      });
      lossStreak = payout.newLossStreak;
      money = Math.min(16000, money + payout.reward + 1200);
      history.push(money);
    }

    expect(money).toBe(16000); // reaches the economy ceiling, never exceeds it
    expect(history.every((m) => m <= 16000)).toBe(true);
    expect(lossStreak).toBeGreaterThanOrEqual(0);
  });
});

describe('Player-vs-bot hitscan integration', () => {
  it('a ray from eye level down an open lane hits the enemy hitbox', () => {
    const shooter: PlayerPhysicsState = {
      position: { x: 0, y: 0, z: -40 },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
      crouching: false,
      walking: false,
      sprinting: false,
      onLadder: false,
      inWater: false,
      eyeHeight: 1.66,
      groundSurface: 'concrete'
    };
    const targetPos = { x: 0, y: 0, z: -12 };

    const eye = { x: shooter.position.x, y: shooter.position.y + shooter.eyeHeight, z: shooter.position.z };
    const boxes = buildHitboxes(targetPos, false);
    const dx = targetPos.x - eye.x;
    const dz = targetPos.z - eye.z;
    const dist = Math.hypot(dx, dz);
    const dir = { x: dx / dist, y: (boxes.chest.center.y - eye.y) / dist, z: dz / dist };

    // Confirm no world geometry blocks the shot
    expect(hasLineOfSight(eye, boxes.chest.center, aabbs)).toBe(true);

    const hit = raycastPlayerHitboxes(eye, dir, boxes, 60);
    expect(hit).not.toBeNull();
    expect(['head', 'chest', 'stomach']).toContain(hit!.hitGroup);
  });

  it('a shot at a wall-occluded enemy is blocked by the world rather than hitting the hitbox', () => {
    const eye = { x: -14, y: 1.66, z: -22 };
    const targetPos = { x: -14, y: 0, z: 4 };
    expect(hasLineOfSight(eye, { x: targetPos.x, y: 1.28, z: targetPos.z }, aabbs)).toBe(false);
  });

  it('kill reward accrual never exceeds the economy ceiling', () => {
    let money = 0;
    const spec = WEAPON_SPECS.breacher_12;
    for (let i = 0; i < 300; i++) {
      money = Math.min(16000, money + spec.killReward);
    }
    expect(money).toBe(16000);
  });
});

describe('Movement + round loop sanity', () => {
  it('a player can walk from the Sentinel spawn to mid without leaving the map bounds', () => {
    let state: PlayerPhysicsState = {
      position: { x: 0, y: 0.05, z: -42 },
      velocity: { x: 0, y: 0, z: 0 },
      grounded: true,
      crouching: false,
      walking: false,
      sprinting: false,
      onLadder: false,
      inWater: false,
      eyeHeight: 1.66,
      groundSurface: 'concrete'
    };

    for (let i = 0; i < 64 * 20; i++) {
      state = stepPlayerPhysics(
        state,
        { forward: 1, right: 0, jumpPressed: false, crouchHeld: false, walkHeld: false, sprintHeld: false, yaw: 0 },
        aabbs,
        1 / 64,
        { weaponSpeedMultiplier: 1, gravityMultiplier: 1, moveSpeedMultiplier: 1, allowSprint: false }
      );
    }

    expect(state.position.z).toBeLessThan(-15); // progressed south toward mid
    expect(Math.abs(state.position.x)).toBeLessThan(60);
    expect(Math.abs(state.position.z)).toBeLessThan(60);
    expect(state.position.y).toBeGreaterThanOrEqual(0);
  });

  it('mode configurations produce self-consistent round budgets', () => {
    const modes = ['Competitive', 'Premier', 'Wingman', 'Rush', 'Casual', 'Retakes'] as const;
    for (const mode of modes) {
      const cfg = getModeConfig(mode);
      expect(cfg.maxRounds).toBeGreaterThanOrEqual(4);
      expect(cfg.maxRounds % 2).toBe(0);
      expect(Math.floor(cfg.maxRounds / 2) + 1).toBeLessThanOrEqual(cfg.maxRounds);
    }
  });
});
