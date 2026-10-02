import type { GameMapDefinition } from '../../shared/types';
import { mapRegistry } from './mapRegistry';
import { validateMapDefinition } from './mapValidation';

export interface MapLoadProgress { phase: 'VALIDATING' | 'READY' | 'FAILED'; loadedObjects: number; totalObjects: number; }

export class MapLoader {
  async load(mapId: string, onProgress?: (progress: MapLoadProgress) => void): Promise<GameMapDefinition> {
    const map = mapRegistry.get(mapId);
    if (!map) throw new Error(`MAP_NOT_FOUND: ${mapId}`);
    onProgress?.({ phase: 'VALIDATING', loadedObjects: 0, totalObjects: map.objects.length });
    const result = validateMapDefinition(map);
    if (!result.valid) throw new Error(`MAP_VALIDATION_FAILED: ${result.errors.join(' ')}`);
    onProgress?.({ phase: 'READY', loadedObjects: map.objects.length, totalObjects: map.objects.length });
    return map;
  }
}

export const mapLoader = new MapLoader();
