import type { BotDifficulty } from '../../shared/types';

export interface BotDifficultyProfile {
  label: BotDifficulty;
  reactionDelaySec: number;
  aimSpreadRad: number;
  fireIntervalMultiplier: number;
  maxAudioAwarenessMeters: number;
  decisionHz: number;
}

export const BOT_DIFFICULTIES: Record<BotDifficulty, BotDifficultyProfile> = {
  Easy: { label: 'Easy', reactionDelaySec: 0.68, aimSpreadRad: 0.095, fireIntervalMultiplier: 2.1, maxAudioAwarenessMeters: 14, decisionHz: 8 },
  Normal: { label: 'Normal', reactionDelaySec: 0.42, aimSpreadRad: 0.055, fireIntervalMultiplier: 1.45, maxAudioAwarenessMeters: 20, decisionHz: 12 },
  Hard: { label: 'Hard', reactionDelaySec: 0.24, aimSpreadRad: 0.028, fireIntervalMultiplier: 1.15, maxAudioAwarenessMeters: 28, decisionHz: 16 },
  'Very Hard': { label: 'Very Hard', reactionDelaySec: 0.18, aimSpreadRad: 0.020, fireIntervalMultiplier: 1.05, maxAudioAwarenessMeters: 34, decisionHz: 24 },
  Extreme: { label: 'Extreme', reactionDelaySec: 0.14, aimSpreadRad: 0.014, fireIntervalMultiplier: 1.0, maxAudioAwarenessMeters: 40, decisionHz: 32 },
  Expert: { label: 'Expert', reactionDelaySec: 0.14, aimSpreadRad: 0.014, fireIntervalMultiplier: 1.0, maxAudioAwarenessMeters: 40, decisionHz: 32 }
};

export function getBotDifficultyProfile(level: BotDifficulty): BotDifficultyProfile {
  return BOT_DIFFICULTIES[level] ?? BOT_DIFFICULTIES.Normal;
}
