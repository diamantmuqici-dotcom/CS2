/**
 * GitHub Pages deployment check.
 *
 * Serves `dist/` under a `/CS2/` sub-path — exactly how GitHub Pages serves a
 * project site — then fetches the document and every URL it references, using
 * the same resolution a browser would perform.
 *
 * This is the regression guard for the original outage: when Pages published
 * the raw repository the entry script resolved to /src/main.tsx and 404'd,
 * leaving the boot splash on screen forever.
 *
 * Usage: node scripts/verify-deploy.mjs [--serve]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..');
const DIST = join(ROOT, 'dist');
const MOUNT = '/CS2/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function createStaticServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    // Emulate GitHub Pages project-site routing: everything must live under
    // the mount point, and /CS2 redirects to /CS2/.
    if (pathname === MOUNT.slice(0, -1)) {
      res.statusCode = 301;
      res.setHeader('Location', MOUNT);
      res.end();
      return;
    }
    if (!pathname.startsWith(MOUNT)) {
      res.statusCode = 404;
      res.end('outside the project mount point');
      return;
    }

    let rel = pathname.slice(MOUNT.length) || 'index.html';
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';

    // Path traversal guard, matching the host's own behaviour.
    const target = normalize(join(DIST, rel));
    if (!target.startsWith(DIST)) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }

    try {
      const info = await stat(target);
      if (!info.isFile()) throw new Error('not a file');
      const body = await readFile(target);
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[extname(target)] || 'application/octet-stream');
      res.setHeader('Content-Length', body.length);
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found');
    }
  });
}

function listen(server) {
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));
}

/** Extracts every URL a browser would request from the document. */
function referencedUrls(html) {
  const urls = [];
  const attr = /(?:src|href)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = attr.exec(html))) {
    const value = m[1];
    if (value.startsWith('data:') || value.startsWith('#') || value.startsWith('mailto:')) continue;
    urls.push(value);
  }
  return urls;
}

function check(label, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const server = createStaticServer();
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const pageUrl = `${origin}${MOUNT}`;

  let failures = 0;
  try {
    console.log(`\nServing dist/ at ${pageUrl} (GitHub Pages project-site layout)\n`);

    // 1. The document itself.
    const docRes = await fetch(pageUrl, { redirect: 'manual' });
    const html = await docRes.text();
    failures += check('index.html loads', docRes.status === 200, `HTTP ${docRes.status}`) ? 0 : 1;

    // 2. GitHub Pages' no-trailing-slash redirect.
    const redir = await fetch(`${origin}${MOUNT.slice(0, -1)}`, { redirect: 'manual' });
    failures += check(
      '/CS2 redirects to /CS2/',
      redir.status === 301 && redir.headers.get('location') === MOUNT,
      `HTTP ${redir.status} -> ${redir.headers.get('location')}`
    ) ? 0 : 1;

    // 3. Every referenced asset, resolved exactly as a browser would.
    const refs = referencedUrls(html);
    const absolute = refs.filter((u) => u.startsWith('/'));
    failures += check(
      'no document-absolute URLs in index.html',
      absolute.length === 0,
      absolute.length ? absolute.join(', ') : `${refs.length} relative references`
    ) ? 0 : 1;

    for (const ref of refs) {
      const resolved = new URL(ref, pageUrl).toString();
      const res = await fetch(resolved);
      const type = res.headers.get('content-type') || '';
      const okStatus = res.status === 200;
      // A .js file served as text/html would be executed as nothing by a
      // strict module loader — this is how a broken deploy fails silently.
      const isJs = ref.endsWith('.js');
      const okMime = !isJs || /javascript|ecmascript/i.test(type);
      failures += check(
        `asset ${ref}`,
        okStatus && okMime,
        `HTTP ${res.status}${okStatus ? ` · ${type.split(';')[0]}` : ''}`
      ) ? 0 : 1;
    }

    // 4. The entry module must actually be a module, not an HTML fallback page.
    const entry = refs.find((r) => r.endsWith('.js') && r.includes('index'));
    if (entry) {
      const src = await (await fetch(new URL(entry, pageUrl))).text();
      failures += check(
        'entry chunk is real JavaScript',
        !/^\s*<(!doctype|html)/i.test(src) && src.length > 1000,
        `${src.length} bytes`
      ) ? 0 : 1;
    }

    // 5. The old failure mode, asserted directly.
    failures += check(
      'legacy /src/main.tsx is NOT what the page loads',
      !html.includes('/src/main.tsx'),
      'the source entry is absent from the built document'
    ) ? 0 : 1;

    // 6. three.js must stay out of the launcher's initial load. It is ~500 kB
    //    and is only needed once a 3D view opens, so a static import anywhere
    //    on the launcher path would regress the first paint.
    const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
    const heavy = preloads.filter((p) => /three[-.]/i.test(p));
    failures += check(
      'three.js is not preloaded on first paint',
      heavy.length === 0,
      heavy.length ? `preloaded: ${heavy.join(', ')}` : `preloads: ${preloads.length}`
    ) ? 0 : 1;

    // 7. Every declared preload must actually exist, or the browser logs a 404
    //    on the critical path.
    for (const preload of preloads) {
      const res = await fetch(new URL(preload, pageUrl));
      failures += check(`preload ${preload}`, res.status === 200, `HTTP ${res.status}`) ? 0 : 1;
    }
  } finally {
    server.close();
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} deployment check(s) FAILED`);
    process.exit(1);
  }
  console.log('All deployment checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
