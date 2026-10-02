import type { GameModeId } from '../../shared/types';
import { getModeConfig } from './roundLogic';

export interface ModeMetadata { id: GameModeId; label: string; queue: string; mapPool: string[]; rules: string[]; statistics: string[]; }
const MAPS = ['foundry_wing', 'district', 'terminal', 'quarry', 'harbor_protocol', 'citadel_spire'];

export const MODE_REGISTRY: Record<GameModeId, ModeMetadata> = Object.fromEntries((['Competitive', 'Premier', 'Wingman', 'Rush', 'Casual', 'Deathmatch', 'Retakes', 'Practice', 'Custom'] as GameModeId[]).map((id) => {
  const config = getModeConfig(id);
  return [id, { id, label: id, queue: id === 'Practice' || id === 'Custom' ? 'SERVER_SESSION' : 'SKILL_REGION_PARTY', mapPool: id === 'Wingman' ? ['foundry_wing', 'district'] : MAPS, rules: [config.description, config.scoring, `${config.teamSize} per team`, `${config.roundTimeSec}s active timer`], statistics: ['rounds', 'kills', 'deaths', 'assists', 'objective contribution', 'rating delta'] }];
})) as Record<GameModeId, ModeMetadata>;

export function getModeMetadata(mode: GameModeId): ModeMetadata { return MODE_REGISTRY[mode]; }
