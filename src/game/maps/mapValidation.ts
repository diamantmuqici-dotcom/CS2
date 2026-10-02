import type { GameMapDefinition } from '../../shared/types';

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateMapDefinition(map: GameMapDefinition): MapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!map.id || !/^[a-z0-9_-]+$/.test(map.id)) errors.push('Map id must use lowercase letters, numbers, underscores or hyphens.');
  if (!map.name.trim()) errors.push('Map name is required.');
  if (map.objects.length === 0) errors.push('Map must contain at least one world object.');
  if (map.objects.length > 2000) errors.push('Map exceeds the 2,000 object safety limit.');
  if (!map.waypoints.length) warnings.push('No navigation graph supplied; bots will use safe spawn fallback.');
  if (!map.callouts.length) warnings.push('No callouts supplied; minimap labels will be limited.');
  const ids = new Set<string>();
  for (const object of map.objects) {
    if (ids.has(object.id)) errors.push(`Duplicate world object id: ${object.id}`);
    ids.add(object.id);
    if (object.size.some((value) => !Number.isFinite(value) || value <= 0)) errors.push(`Invalid dimensions for object ${object.id}.`);
  }
  return { valid: errors.length === 0, errors, warnings };
}
