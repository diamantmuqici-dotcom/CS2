import { ASSET_MANIFEST, type AssetManifestEntry } from './AssetManifest';

export class AssetRegistry {
  private readonly entries = new Map<string, AssetManifestEntry>(ASSET_MANIFEST.map((entry) => [entry.id, entry]));
  register(entry: AssetManifestEntry): void { this.entries.set(entry.id, entry); }
  get(id: string): AssetManifestEntry | null { return this.entries.get(id) ?? null; }
  list(kind?: AssetManifestEntry['kind']): AssetManifestEntry[] { return [...this.entries.values()].filter((entry) => !kind || entry.kind === kind); }
}

export const assetRegistry = new AssetRegistry();
