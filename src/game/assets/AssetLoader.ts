import { AssetCache } from './AssetCache';
import type { AssetManifestEntry } from './AssetManifest';

export interface AssetLoadResult<T> { id: string; value: T; bytes: number; }

export class AssetLoader {
  private readonly cache = new AssetCache<unknown>();

  async loadText(entry: AssetManifestEntry): Promise<AssetLoadResult<string>> {
    const cached = this.cache.get(entry.id);
    if (typeof cached === 'string') return { id: entry.id, value: cached, bytes: cached.length };
    const response = await fetch(entry.url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`ASSET_LOAD_FAILED: ${entry.id} (${response.status})`);
    const value = await response.text();
    this.cache.set(entry.id, value);
    return { id: entry.id, value, bytes: value.length };
  }

  clear(): void { this.cache.clear(); }
}

export const assetLoader = new AssetLoader();
