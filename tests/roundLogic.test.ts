import { describe, it, expect } from 'vitest';
import {
  calculateRoundPayout,
  checkMatchComplete,
  evaluateRoundEnd,
  getModeConfig,
  assignRetakeLoadout,
  LOSS_BONUS_TABLE
} from '../src/game/modes/roundLogic';
import { WEAPON_SPECS } from '../src/shared/weapons';
import type { GameModeId } from '../src/shared/types';

describe('Economy', () => {
  it('pays the round-win reward for a standard competitive victory', () => {
    const payout = calculateRoundPayout({
      mode: 'Competitive',
      wonRound: true,
      lossStreak: 0,
      bombPlantedByThisTeam: false,
      isAttacker: false,
      killReward: 0
    });
    expect(payout.reward).toBeGreaterThanOrEqual(3250);
    expect(payout.newLossStreak).toBe(0);
  });

  it('adds the bomb-defuse bonus for defenders who defuse', () => {
    const payout = calculateRoundPayout({
      mode: 'Competitive',
      wonRound: true,
      lossStreak: 0,
      bombPlantedByThisTeam: true,
      isAttacker: false,
      killReward: 0
    });
    expect(payout.reward).toBe(3250 + 600);
  });

  it('adds the objective-executed bonus for attackers who detonate', () => {
    const payout = calculateRoundPayout({
      mode: 'Competitive',
      wonRound: true,
      lossStreak: 0,
      bombPlantedByThisTeam: true,
      isAttacker: true,
      killReward: 0
    });
    expect(payout.reward).toBe(3250 + 800);
  });

  it('climbs the loss-bonus ladder and then caps', () => {
    const first = calculateRoundPayout({ mode: 'Competitive', wonRound: false, lossStreak: 0, bombPlantedByThisTeam: false, isAttacker: false, killReward: 0 });
    const second = calculateRoundPayout({ mode: 'Competitive', wonRound: false, lossStreak: 1, bombPlantedByThisTeam: false, isAttacker: false, killReward: 0 });
    expect(second.reward).toBeGreaterThan(first.reward);
    expect(second.newLossStreak).toBe(2);

    const capped = calculateRoundPayout({ mode: 'Competitive', wonRound: false, lossStreak: 99, bombPlantedByThisTeam: false, isAttacker: false, killReward: 0 });
    expect(capped.reward).toBe(LOSS_BONUS_TABLE[LOSS_BONUS_TABLE.length - 1]);
  });

  it('adds a plant bonus to a losing attacker round', () => {
    const payout = calculateRoundPayout({
      mode: 'Competitive',
      wonRound: false,
      lossStreak: 0,
      bombPlantedByThisTeam: true,
      isAttacker: true,
      killReward: 0
    });
    expect(payout.reward).toBe(LOSS_BONUS_TABLE[0] + 800);
  });

  it('pays no economy in respawn modes', () => {
    expect(calculateRoundPayout({ mode: 'Deathmatch', wonRound: true, lossStreak: 0, bombPlantedByThisTeam: false, isAttacker: false, killReward: 0 }).reward).toBe(0);
    expect(calculateRoundPayout({ mode: 'Practice', wonRound: false, lossStreak: 0, bombPlantedByThisTeam: false, isAttacker: false, killReward: 0 }).reward).toBe(0);
  });

  it('uses smaller loss tiers in Wingman and Rush', () => {
    const wingman = calculateRoundPayout({ mode: 'Wingman', wonRound: false, lossStreak: 0, bombPlantedByThisTeam: false, isAttacker: false, killReward: 0 });
    const competitive = calculateRoundPayout({ mode: 'Competitive', wonRound: false, lossStreak: 0, bombPlantedByThisTeam: false, isAttacker: false, killReward: 0 });
    expect(wingman.reward).toBeGreaterThan(competitive.reward);
  });
});

describe('Round end resolution', () => {
  const base = {
    mode: 'Competitive' as GameModeId,
    sentinelAlive: 5,
    vortexAlive: 5,
    bombPlanted: false,
    bombTimerSec: 40,
    roundTimeRemainingSec: 100,
    bombDefused: false
  };

  it('does not end a round in progress', () => {
    expect(evaluateRoundEnd(base).ended).toBe(false);
  });

  it('ends the round when one team is eliminated', () => {
    expect(evaluateRoundEnd({ ...base, vortexAlive: 0 }).winner).toBe('SENTINEL');
    expect(evaluateRoundEnd({ ...base, sentinelAlive: 0 }).winner).toBe('VORTEX');
  });

  it('does not end the round when defenders are eliminated post-plant', () => {
    expect(evaluateRoundEnd({ ...base, bombPlanted: true, sentinelAlive: 0 }).winner).toBe('VORTEX');
  });

  it('continues the round if attackers die after the plant while the bomb ticks', () => {
    const res = evaluateRoundEnd({ ...base, bombPlanted: true, vortexAlive: 0, bombTimerSec: 20 });
    expect(res.ended).toBe(false);
  });

  it('ends with defenders when the bomb is defused', () => {
    const res = evaluateRoundEnd({ ...base, bombPlanted: true, bombDefused: true });
    expect(res.ended).toBe(true);
    expect(res.winner).toBe('SENTINEL');
    expect(res.reason).toBe('BOMB_DEFUSED');
  });

  it('ends with attackers when the bomb explodes', () => {
    const res = evaluateRoundEnd({ ...base, bombPlanted: true, bombTimerSec: 0 });
    expect(res.winner).toBe('VORTEX');
    expect(res.reason).toBe('BOMB_EXPLODED');
  });

  it('awards the round to defenders when time expires without a plant', () => {
    const res = evaluateRoundEnd({ ...base, roundTimeRemainingSec: 0 });
    expect(res.winner).toBe('SENTINEL');
    expect(res.reason).toBe('TIME_EXPIRED_DEFENDERS_WIN');
  });

  it('never auto-ends Deathmatch or Practice', () => {
    expect(evaluateRoundEnd({ ...base, mode: 'Deathmatch', roundTimeRemainingSec: 0 }).ended).toBe(false);
    expect(evaluateRoundEnd({ ...base, mode: 'Practice', roundTimeRemainingSec: 0 }).ended).toBe(false);
  });
});

describe('Match completion', () => {
  it('completes at the regulation target with a two-round lead', () => {
    expect(checkMatchComplete(13, 10, 24, false).complete).toBe(true);
    expect(checkMatchComplete(13, 10, 24, false).winner).toBe('SENTINEL');
    expect(checkMatchComplete(10, 13, 24, false).winner).toBe('VORTEX');
  });

  it('does not complete on a one-round lead at the target', () => {
    expect(checkMatchComplete(13, 12, 24, false).complete).toBe(false);
  });

  it('flags overtime when regulation finishes level', () => {
    const result = checkMatchComplete(12, 12, 24, false);
    expect(result.complete).toBe(false);
    expect(result.needsOvertime).toBe(true);
  });

  it('completes Wingman at the smaller target', () => {
    expect(checkMatchComplete(9, 5, 16, true).complete).toBe(true);
  });
});

describe('Mode configuration', () => {
  it('returns sensible configuration for every mode', () => {
    const modes: GameModeId[] = [
      'Competitive',
      'Premier',
      'Wingman',
      'Rush',
      'Casual',
      'Deathmatch',
      'Retakes',
      'Practice',
      'Custom'
    ];
    for (const mode of modes) {
      const cfg = getModeConfig(mode);
      expect(cfg.teamSize).toBeGreaterThan(0);
      expect(cfg.description.length).toBeGreaterThan(10);
      expect(cfg.scoring.length).toBeGreaterThan(3);
    }
  });

  it('Wingman is 2v2 and Competitive is 5v5', () => {
    expect(getModeConfig('Wingman').teamSize).toBe(2);
    expect(getModeConfig('Competitive').teamSize).toBe(5);
    expect(getModeConfig('Premier').teamSize).toBe(5);
  });
});

describe('Retakes loadouts', () => {
  it('assigns a valid primary weapon for every seed', () => {
    for (let seed = 0; seed < 12; seed++) {
      const loadout = assignRetakeLoadout(seed);
      expect(WEAPON_SPECS[loadout.primary]).toBeDefined();
      expect(WEAPON_SPECS[loadout.secondary]).toBeDefined();
      expect(loadout.armor).toBe(100);
      expect(loadout.helmet).toBe(true);
      for (const g of loadout.grenades) {
        expect(WEAPON_SPECS[g]).toBeDefined();
      }
    }
  });
});
