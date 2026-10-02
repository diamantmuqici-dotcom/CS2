/**
 * Runtime URL resolution for a sub-path deployment.
 *
 * The project is published as a GitHub Pages *project* site at
 * `/CS2/`, not at the domain root. Any hard-coded "/..." URL therefore
 * escapes the deployment (e.g. "/api/health" -> github.io/api/health, and
 * "/assets/x.js" -> github.io/assets/x.js) and 404s.
 *
 * `vite.config.ts` sets `base: './'` so the built HTML/CSS/JS are already
 * document-relative. This module covers the *runtime* URLs the bundler
 * cannot rewrite: the optional backend API, the WebSocket endpoint and
 * any dynamically constructed asset path.
 */

/**
 * Evaluated lazily rather than cached at module load: the module may be
 * imported by a test or a tool before a DOM exists, and a stale `false` here
 * would pin every URL to the origin root.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function normalizeDir(pathname: string): string {
  const lastSlash = pathname.lastIndexOf('/');
  const dir = lastSlash === -1 ? '/' : pathname.slice(0, lastSlash + 1);
  return dir.endsWith('/') ? dir : `${dir}/`;
}

let cachedBase: string | null = null;

/**
 * Absolute deployment base, always ending in "/".
 *
 * Resolution order:
 *  1. An explicit <base href> in the document (set by index.html).
 *  2. Vite's injected `import.meta.env.BASE_URL`, when it is already absolute.
 *  3. The directory of the current document URL.
 *
 * Falls back to "/" in non-browser contexts (SSR, unit tests).
 */
export function getDeployBase(): string {
  if (cachedBase) return cachedBase;

  if (!isBrowser()) {
    cachedBase = '/';
    return cachedBase;
  }

  const baseEl = document.querySelector('base[href]');
  const declared = baseEl?.getAttribute('href');

  if (declared) {
    try {
      cachedBase = new URL(declared, document.baseURI).pathname.replace(/[^/]*$/, '');
    } catch {
      cachedBase = normalizeDir(window.location.pathname);
    }
    return cachedBase;
  }


  // The document's own location is the ground truth for where the page is
  // actually being served. `import.meta.env.BASE_URL` is deliberately NOT used
  // as a shortcut: it is a build-time constant that says where the *bundle*
  // was configured to live, which is not necessarily where the page is
  // mounted. Preferring it here would silently produce an origin-root URL on a
  // sub-path deployment — exactly the bug being fixed.
  cachedBase = normalizeDir(window.location.pathname);
  return cachedBase;
}

/** Resolves a deployment-relative path such as "assets/x.png" or "api/health". */
export function resolveAssetUrl(path: string): string {
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  return `${getDeployBase()}${path.replace(/^\/+/, '')}`;
}

/**
 * Backend endpoints only exist when the Node authoritative server is running
 * (npm run dev / npm run server). On static hosting such as GitHub Pages they
 * do not exist at all, so every call site must tolerate a miss. Callers use
 * `isBackendExpected()` to avoid pointless network chatter and to label the UI
 * honestly instead of reporting a false outage.
 */
export function apiUrl(path: string): string {
  return resolveAssetUrl(path);
}

/**
 * Heuristic: a static host serves the document but no API. Detected by probing
 * once; the result is cached for the page lifetime. Never rejects — a network
 * failure simply means "not available", which is the normal GitHub Pages case.
 */
let backendProbe: Promise<boolean> | null = null;

export function isBackendExpected(): Promise<boolean> {
  if (!isBrowser() || typeof fetch !== 'function') return Promise.resolve(false);
  if (backendProbe) return backendProbe;

  backendProbe = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(apiUrl('api/health'), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return false;
      // A SPA catch-all or a 404 HTML page can answer 200; require real JSON.
      const type = res.headers.get('content-type') || '';
      if (!type.includes('json')) return false;
      const data = (await res.json()) as { tickRate?: number; antiCheatActive?: boolean };
      return typeof data.tickRate === 'number';
    } catch {
      return false;
    }
  })();

  return backendProbe;
}

/** Clears memoised URL state. Used by tests and by the in-app diagnostic tools. */
export function resetRuntimeCache(): void {
  cachedBase = null;
  backendProbe = null;
}
