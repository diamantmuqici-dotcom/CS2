/**
 * Headless boot verification.
 *
 * Loads the BUILT site in jsdom and imports the real emitted module graph, so
 * this exercises the same code the browser runs — including the code-split
 * chunk boundaries and every relative import.
 *
 * This is the exact failure that took the live deployment down: the entry
 * script never resolved, so nothing mounted and the boot splash sat on screen
 * until the old watchdog printed "Failed to start." A build that produces a
 * 404, a broken import, or a module that throws during evaluation fails here.
 *
 * jsdom has no WebGL and no canvas 2D, which is a useful second assertion: the
 * app must still boot, mount, and select a compatibility renderer rather than
 * refusing to start.
 *
 * Usage: node scripts/verify-boot.mjs
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '..', 'dist');
// Served under the real project mount point so every relative path in the
// bundle resolves the same way it does on GitHub Pages.
const PAGE_URL = 'https://diamantmuqici-dotcom.github.io/CS2/';

function check(label, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok ? 0 : 1;
}

function installDomGlobals(window) {
  const g = globalThis;
  const copy = [
    'window',
    'document',
    'navigator',
    'location',
    'history',
    'localStorage',
    'sessionStorage',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLInputElement',
    'HTMLSelectElement',
    'Element',
    'Node',
    'Event',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'UIEvent',
    'DocumentFragment',
    'NodeFilter',
    'getComputedStyle',
    'DOMParser',
    'XMLSerializer',
    'MutationObserver',
    'IntersectionObserver',
    'ResizeObserver',
    'CSS',
    'Image',
    'Blob',
    'File',
    'FileReader',
    'FormData',
    'Headers',
    'Request',
    'Response',
    'AbortController',
    'TextEncoder',
    'TextDecoder',
    'URL',
    'URLSearchParams'
  ];
  // `performance` is deliberately NOT copied: jsdom's getter delegates to the
  // Node global, so assigning it back would recurse.
  for (const key of copy) {
    if (window[key] !== undefined) {
      try {
        g[key] = window[key];
      } catch {
        // Some globals are read-only on globalThis; ignore those.
      }
    }
  }

  // jsdom implements neither of these, and the app feature-detects them.
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      }
    });
  }
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

  // Node ships a global WebSocket (undici) that is not DOM-compatible and
  // throws when the connection fails. In a browser the constructor comes from
  // `window`, so provide a browser-faithful stub that reports a failed
  // handshake the way a real one does. This is the GitHub Pages case: no
  // backend, so the client must fall back to local authority without crashing.
  class StubWebSocket extends window.EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      super();
      this.url = url;
      this.readyState = StubWebSocket.CONNECTING;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      // Asynchronous failure, exactly like a real connection attempt.
      setTimeout(() => {
        if (this.readyState === StubWebSocket.CLOSED) return;
        this.readyState = StubWebSocket.CLOSED;
        const err = new window.Event('error');
        if (typeof this.onerror === 'function') this.onerror(err);
        this.dispatchEvent(err);
        const close = new window.Event('close');
        if (typeof this.onclose === 'function') this.onclose(close);
        this.dispatchEvent(close);
      }, 5);
    }
    send() {}
    close() {
      this.readyState = StubWebSocket.CLOSED;
    }
  }
  window.WebSocket = StubWebSocket;
  g.WebSocket = StubWebSocket;

  g.requestAnimationFrame = window.requestAnimationFrame;
  g.cancelAnimationFrame = window.cancelAnimationFrame;
  g.matchMedia = window.matchMedia;
  g.self = window;
  g.window = window;
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const html = await readFile(join(DIST, 'index.html'), 'utf8');

  const errors = [];
  const warnings = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  virtualConsole.on('error', (...a) => errors.push(a.map(String).join(' ')));
  virtualConsole.on('warn', (...a) => warnings.push(a.map(String).join(' ')));

  const dom = new JSDOM(html, {
    url: PAGE_URL,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  installDomGlobals(window);

  let failures = 0;

  const entryMatch = html.match(/<script[^>]+src="([^"]*index-[^"]*\.js)"[^>]*>/);
  if (!entryMatch) {
    console.error('FAIL  could not locate the built entry chunk in dist/index.html');
    process.exit(1);
  }
  const entryHref = entryMatch[1];
  // Resolve the document-relative URL exactly as a browser would, then map it
  // back onto dist/ — this is the step the old deployment got wrong.
  const entryUrl = new URL(entryHref, PAGE_URL);
  const entryPath = join(DIST, entryUrl.pathname.replace('/CS2/', ''));

  console.log(`\nBooting the built site from ${entryHref} at ${PAGE_URL} (no WebGL, no canvas 2D)\n`);

  let thrown = null;
  try {
    await import(pathToFileURL(entryPath).href);
  } catch (err) {
    thrown = err;
  }

  failures += check(
    'entry module graph evaluates without throwing',
    !thrown,
    thrown ? String(thrown && thrown.stack ? thrown.stack.split('\n').slice(0, 2).join(' ') : thrown) : 'all chunks linked and evaluated'
  );

  if (thrown) {
    console.error('\nFirst errors:\n' + errors.slice(0, 5).join('\n'));
    process.exit(1);
  }

  // Let React flush and the boot supervisor's rAF poll run.
  await new Promise((r) => setTimeout(r, 800));

  const doc = window.document;
  const root = doc.getElementById('root');
  const mountedChildren = root ? root.childElementCount : 0;

  failures += check('React mounted content into #root', mountedChildren > 0, `${mountedChildren} child element(s)`);

  const bodyText = doc.body.textContent || '';
  failures += check(
    'launcher shell rendered',
    /VANGUARD/i.test(bodyText),
    bodyText.replace(/\s+/g, ' ').trim().slice(0, 70)
  );

  failures += check(
    'navigation tabs rendered',
    ['PLAY', 'SETTINGS', 'GRAPHICS', 'DIAGNOSTICS'].every((t) => bodyText.includes(t)),
    'PLAY / SETTINGS / GRAPHICS / DIAGNOSTICS present'
  );

  failures += check(
    'LOCAL LINK control present',
    /local link|zero.ping session/i.test(bodyText) || !!doc.querySelector('[aria-haspopup="dialog"]'),
    'round map-plate button rendered in the top bar'
  );

  const splash = doc.getElementById('boot-splash');
  failures += check(
    'boot splash dismissed after mount',
    !splash || !splash.isConnected || splash.classList.contains('hidden'),
    splash ? `class="${splash.className}" connected=${splash.isConnected}` : 'removed from DOM'
  );

  const errorBox = doc.getElementById('boot-error');
  failures += check(
    'no initialization failure screen shown',
    !errorBox || errorBox.style.display === 'none',
    errorBox ? `display="${errorBox.style.display || 'block'}"` : 'not present'
  );

  failures += check(
    'no "requires WebGL2" hard-fail message',
    !/requires a modern browser with WebGL2/i.test(bodyText),
    'generic browser error absent'
  );

  // ---- boot diagnostics -------------------------------------------------
  const report = window.__vanguardBoot;
  failures += check('boot report published to window.__vanguardBoot', Boolean(report && report.stages));

  if (report) {
    const byId = Object.fromEntries(report.stages.map((s) => [s.id, s]));
    for (const id of ['RUNTIME', 'ENVIRONMENT', 'MODULES', 'RENDERER', 'GPU', 'ASSETS', 'APPLICATION']) {
      const st = byId[id];
      failures += check(
        `stage ${id} recorded as ok`,
        st && st.status === 'ok',
        st ? `${st.status}${st.detail ? ` — ${st.detail}` : ''}` : 'missing'
      );
    }
    failures += check(
      'no boot failures recorded',
      report.failures.length === 0,
      report.failures.length ? report.failures.join(' | ') : 'none'
    );
    failures += check(
      'renderer tier resolved on a GPU-less machine',
      typeof report.rendererTier === 'string' && report.rendererTier.length > 0,
      `tier="${report.rendererTier}"`
    );
    // Losing every accelerated context must degrade quality, never raise the
    // initialization-failure screen.
    failures += check(
      'GPU-less machine still reports a successful boot',
      report.ready === true,
      `ready=${report.ready}`
    );
    failures += check(
      'capabilities captured',
      Boolean(report.capabilities && report.capabilities.detectionMs >= 0),
      report.capabilities ? `detection ${report.capabilities.detectionMs}ms, ${report.capabilities.warnings.length} notice(s)` : 'missing'
    );
  }

  // The realErrors filter drops only environment noise, not app failures.
  const realErrors = errors.filter(
    (e) => !/Could not parse CSS|Not implemented|Could not load img|jsdomError/i.test(e)
  );
  failures += check(
    'no uncaught errors during boot',
    realErrors.length === 0,
    realErrors.length ? realErrors.slice(0, 3).join(' | ') : `${warnings.length} warning(s) suppressed`
  );

  console.log('');
  if (failures > 0) {
    console.error(`${failures} boot check(s) FAILED`);
    if (realErrors.length) console.error('\nErrors:\n' + realErrors.slice(0, 6).join('\n'));
    process.exit(1);
  }
  console.log('All boot checks passed — the module graph executes and the UI mounts with no GPU present.');
  // jsdom leaves timers and the stub socket alive; exit explicitly so this
  // runs cleanly in CI.
  window.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
