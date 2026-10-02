export type AssetKind = 'texture' | 'audio' | 'map' | 'ui';

export interface AssetManifestEntry {
  id: string;
  kind: AssetKind;
  url: string;
  bytes?: number;
  critical?: boolean;
}

export const ASSET_MANIFEST: AssetManifestEntry[] = [
  { id: 'brand-mark', kind: 'ui', url: './branding/csgo-mark.svg', critical: true },
  { id: 'menu-grid', kind: 'ui', url: './branding/menu-grid.svg', critical: true }
];
