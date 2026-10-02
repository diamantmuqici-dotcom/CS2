// @vitest-environment jsdom
/**
 * Runtime URL resolution under a sub-path deployment.
 *
 * The live site is served from /CS2/, not the domain root. These tests lock in
 * the behaviour that fixed the original outage: every runtime URL must resolve
 * relative to the document, never to the origin root.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDeployBase, resolveAssetUrl, apiUrl, isBackendExpected, resetRuntimeCache } from '../src/shared/runtime';

type MutableWindow = Window & { location: Location };

const realWindow = globalThis.window;
const realDocument = globalThis.document;

function setLocation(href: string): void {
  const w = globalThis as unknown as { window?: MutableWindow; document?: Document };
  // A minimal stand-in: the module only reads location and queries <base>.
  const fakeWindow = {
    location: new URL(href) as unknown as Location
  } as unknown as MutableWindow;
  w.window = fakeWindow;
  w.document = {
    querySelector: () => null,
    baseURI: new URL(href).href
  } as unknown as Document;
}

afterEach(() => {
  const w = globalThis as unknown as { window?: unknown; document?: unknown };
  w.window = realWindow;
  w.document = realDocument;
  resetRuntimeCache();
});

describe('getDeployBase', () => {
  beforeEach(() => resetRuntimeCache());

  it('resolves the GitHub Pages project mount point', () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    expect(getDeployBase()).toBe('/CS2/');
  });

  it('resolves an index.html document inside the mount point', () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/index.html');
    expect(getDeployBase()).toBe('/CS2/');
  });

  it('resolves the domain root when served at the root', () => {
    setLocation('https://example.com/');
    expect(getDeployBase()).toBe('/');
  });

  it('resolves an arbitrary nested path', () => {
    setLocation('https://example.com/games/vanguard/');
    expect(getDeployBase()).toBe('/games/vanguard/');
  });

  it('always ends with a slash', () => {
    setLocation('https://example.com/CS2/');
    expect(getDeployBase().endsWith('/')).toBe(true);
  });

  it('falls back to "/" outside a browser', () => {
    const w = globalThis as unknown as { window?: unknown; document?: unknown };
    w.window = undefined;
    w.document = undefined;
    resetRuntimeCache();
    expect(getDeployBase()).toBe('/');
  });
});

describe('resolveAssetUrl', () => {
  beforeEach(() => resetRuntimeCache());

  it('never emits an origin-root path', () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    const resolved = resolveAssetUrl('assets/app.js');
    expect(resolved).toBe('/CS2/assets/app.js');
    expect(resolved.startsWith('/assets')).toBe(false);
  });

  it('normalises a leading slash into the mount point', () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    expect(resolveAssetUrl('/api/health')).toBe('/CS2/api/health');
  });

  it('leaves absolute URLs untouched', () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    expect(resolveAssetUrl('https://cdn.example.com/x.js')).toBe('https://cdn.example.com/x.js');
    expect(resolveAssetUrl('//cdn.example.com/x.js')).toBe('//cdn.example.com/x.js');
  });

  it('leaves data and blob URLs untouched', () => {
    setLocation('https://example.com/');
    expect(resolveAssetUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(resolveAssetUrl('blob:https://example.com/abc')).toBe('blob:https://example.com/abc');
  });
});

describe('apiUrl', () => {
  it('targets the deployment base, not the origin root', () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    expect(apiUrl('api/health')).toBe('/CS2/api/health');
  });
});

describe('isBackendExpected', () => {
  beforeEach(() => resetRuntimeCache());

  it('resolves false when fetch is unavailable (static host)', async () => {
    const w = globalThis as unknown as { window?: unknown; document?: unknown; fetch?: unknown };
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    const realFetch = w.fetch;
    w.fetch = undefined;
    await expect(isBackendExpected()).resolves.toBe(false);
    w.fetch = realFetch;
  });

  it('resolves false when the health endpoint answers with non-JSON', async () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    const w = globalThis as unknown as { fetch?: unknown };
    w.fetch = async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html; charset=utf-8' },
        json: async () => ({})
      }) as unknown as Response;
    await expect(isBackendExpected()).resolves.toBe(false);
  });

  it('resolves false on an HTTP error status', async () => {
    setLocation('https://diamantmuqici-dotcom.github.io/CS2/');
    const w = globalThis as unknown as { fetch?: unknown };
    w.fetch = async () =>
      ({ ok: false, status: 404, headers: { get: () => 'text/plain' } }) as unknown as Response;
    await expect(isBackendExpected()).resolves.toBe(false);
  });

  it('resolves true for a well-formed health payload', async () => {
    setLocation('https://example.com/');
    const w = globalThis as unknown as { fetch?: unknown };
    w.fetch = async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ tickRate: 64 })
      }) as unknown as Response;
    await expect(isBackendExpected()).resolves.toBe(true);
  });
});
