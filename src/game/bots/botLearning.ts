import type { Vector3D } from '../../shared/types';

export interface BotExperienceProfile {
  mapFamiliarity: Record<string, number>;
  tacticalPreferences: { aggression: number; holdAngles: number; rotateEarly: number; tradeDistance: number };
  routeKnowledge: Record<string, number>;
  reactionProfile: { medianMs: number; varianceMs: number };
  aggressionProfile: { preferredEngagementDistance: number; pushRate: number };
  objectiveProfile: { plantRate: number; defuseRate: number; escortRate: number };
  repeatedMistakes: Record<string, number>;
  preferredAreas: Record<string, number>;
}

export interface PlayerRoundObservation {
  mapId: string;
  route: string[];
  engagements: Array<{ distance: number; reactionMs: number }>;
  objective: 'NONE' | 'PLANT' | 'DEFUSE' | 'ESCORT';
  area: string;
  mistake?: string;
}

export function createBotExperienceProfile(): BotExperienceProfile {
  return {
    mapFamiliarity: {}, routeKnowledge: {}, preferredAreas: {}, repeatedMistakes: {},
    tacticalPreferences: { aggression: 0.5, holdAngles: 0.5, rotateEarly: 0.5, tradeDistance: 12 },
    reactionProfile: { medianMs: 360, varianceMs: 120 },
    aggressionProfile: { preferredEngagementDistance: 18, pushRate: 0.5 },
    objectiveProfile: { plantRate: 0, defuseRate: 0, escortRate: 0 }
  };
}

/** Updates only from observed, human-visible events; no hidden enemy state is stored. */
export function learnFromRound(profile: BotExperienceProfile, observation: PlayerRoundObservation): BotExperienceProfile {
  const next = structuredClone(profile) as BotExperienceProfile;
  next.mapFamiliarity[observation.mapId] = Math.min(1, (next.mapFamiliarity[observation.mapId] ?? 0) + 0.06);
  observation.route.forEach((waypoint, index) => {
    const weight = 1 / Math.max(1, index + 1);
    next.routeKnowledge[waypoint] = Math.min(1, (next.routeKnowledge[waypoint] ?? 0) * 0.92 + weight * 0.08);
  });
  next.preferredAreas[observation.area] = (next.preferredAreas[observation.area] ?? 0) + 1;
  if (observation.engagements.length) {
    const distance = observation.engagements.reduce((sum, engagement) => sum + engagement.distance, 0) / observation.engagements.length;
    const reaction = observation.engagements.reduce((sum, engagement) => sum + engagement.reactionMs, 0) / observation.engagements.length;
    next.aggressionProfile.preferredEngagementDistance = next.aggressionProfile.preferredEngagementDistance * 0.8 + distance * 0.2;
    next.reactionProfile.medianMs = next.reactionProfile.medianMs * 0.8 + reaction * 0.2;
  }
  if (observation.mistake) next.repeatedMistakes[observation.mistake] = (next.repeatedMistakes[observation.mistake] ?? 0) + 1;
  if (observation.objective === 'PLANT') next.objectiveProfile.plantRate += 0.05;
  if (observation.objective === 'DEFUSE') next.objectiveProfile.defuseRate += 0.05;
  if (observation.objective === 'ESCORT') next.objectiveProfile.escortRate += 0.05;
  return next;
}
