import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse, Server as HttpServer } from 'http';
import { authoritativeServer } from './src/server/gameServer';

function vanguardAuthoritativeBackendPlugin(): Plugin {
  return {
    name: 'vanguard-authoritative-backend',
    configureServer(server) {
      if (server.httpServer) {
        authoritativeServer.attachWebSocketServer(server.httpServer as unknown as HttpServer);
      }

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || '';
        if (url === '/api/health' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(authoritativeServer.getHealthStatus()));
          return;
        }
        if (url === '/api/matchmaking/queue' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const allocation = authoritativeServer.allocateMatch(JSON.parse(body));
              res.statusCode = allocation.ok ? 200 : 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(allocation.ok ? allocation : { error: allocation.error }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: { code: 'MATCHMAKING_INVALID_REQUEST', message: 'The queue request was malformed.', retryable: false } }));
            }
          });
          return;
        }
        if (url === '/api/workshop/validate' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const validation = authoritativeServer.validateAndStoreWorkshopMap(parsed);
              res.statusCode = validation.valid ? 200 : 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(validation));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ valid: false, errors: ['Malformed JSON body'] }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

/**
 * The site is published as a *project* page at
 * https://diamantmuqici-dotcom.github.io/CS2/ — NOT at the domain root.
 *
 * Vite defaults `base` to "/", which bakes absolute `/assets/...` URLs into
 * index.html. On a project subpath those resolve to
 * https://diamantmuqici-dotcom.github.io/assets/... (404) and the module
 * bootstrap never runs, leaving the page stuck on the boot splash.
 *
 * "./" makes every emitted URL relative to the *document*, so the same build
 * works from "/CS2/", from a custom domain root, and from a local preview
 * server regardless of mount point.
 */
export const DEPLOY_BASE = './';

export default defineConfig({
  base: DEPLOY_BASE,
  plugins: [react(), vanguardAuthoritativeBackendPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // GitHub Pages serves assets with a max-age of 10 minutes but treats
    // index.html as cacheable too. Hashed filenames make the bundles
    // immutable-safe, and "no-cache" on the document keeps deploys honest.
    assetsInlineLimit: 4096,
    // three.js is a deliberately large vendored dependency and is code-split away
    // from the launcher's critical path, so the default warning is not useful here.
    chunkSizeWarningLimit: 600,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vendor: ['react', 'react-dom', 'zustand', 'lucide-react']
        }
      }
    }
  }
});
