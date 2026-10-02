import type { GameModeId, GameMapDefinition } from '../../shared/types';

export interface MapMetadata {
  id: string;
  displayName: string;
  subtitle: string;
  description: string;
  supportedModes: GameModeId[];
  thumbnail: string;
  playerSlots: number;
  objectiveSites: string[];
  performance: { staticObjects: number; occluders: number; recommendedQuality: 'Low' | 'Medium' | 'High' };
  originalContent: true;
}

export function createMapMetadata(map: GameMapDefinition): MapMetadata {
  return {
    id: map.id,
    displayName: map.name,
    subtitle: map.subtitle,
    description: map.description,
    supportedModes: map.supportedModes,
    thumbnail: `./branding/maps/${map.id}.svg`,
    playerSlots: Math.max(2, map.supportedModes.includes('Competitive') ? 10 : 6),
    objectiveSites: map.objects.filter((object) => object.type === 'bomb_site_a' || object.type === 'bomb_site_b').map((object) => object.name),
    performance: {
      staticObjects: map.objects.length,
      occluders: map.objects.filter((object) => object.occluder).length,
      recommendedQuality: map.objects.length > 220 ? 'Medium' : 'High'
    },
    originalContent: true
  };
}
