import type { GameMapDefinition } from '../../shared/types';
import { OFFICIAL_MAPS } from './officialMaps';
import { createMapMetadata, type MapMetadata } from './mapMetadata';
import { validateMapDefinition } from './mapValidation';

export class MapRegistry {
  private readonly maps = new Map<string, GameMapDefinition>();

  constructor(initialMaps: Record<string, GameMapDefinition> = OFFICIAL_MAPS) {
    Object.values(initialMaps).forEach((map) => this.register(map));
  }

  register(map: GameMapDefinition): void {
    const result = validateMapDefinition(map);
    if (!result.valid) throw new Error(`MAP_INVALID: ${result.errors.join(' ')}`);
    this.maps.set(map.id, map);
  }

  get(id: string): GameMapDefinition | null { return this.maps.get(id) ?? null; }
  has(id: string): boolean { return this.maps.has(id); }
  list(): GameMapDefinition[] { return [...this.maps.values()]; }
  metadata(): MapMetadata[] { return this.list().map(createMapMetadata); }
}

export const mapRegistry = new MapRegistry();
