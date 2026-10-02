import type { BotExperienceProfile } from './botLearning';

export type BotTactic = 'HOLD_ANGLE' | 'ROTATE' | 'TRADE' | 'ESCORT_OBJECTIVE' | 'PRESSURE_SITE' | 'FALLBACK';

export function chooseBotTactic(profile: BotExperienceProfile, context: { hasVisibleTarget: boolean; objectiveActive: boolean; teammatesAlive: number; enemiesAlive: number }): BotTactic {
  if (context.objectiveActive) return profile.objectiveProfile.defuseRate >= profile.objectiveProfile.plantRate ? 'ESCORT_OBJECTIVE' : 'PRESSURE_SITE';
  if (context.hasVisibleTarget && context.teammatesAlive < context.enemiesAlive) return 'FALLBACK';
  if (context.hasVisibleTarget && profile.tacticalPreferences.tradeDistance < 15) return 'TRADE';
  if (profile.tacticalPreferences.rotateEarly > 0.65) return 'ROTATE';
  return profile.tacticalPreferences.holdAngles > profile.tacticalPreferences.aggression ? 'HOLD_ANGLE' : 'PRESSURE_SITE';
}
