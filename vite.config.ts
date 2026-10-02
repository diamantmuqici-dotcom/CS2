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

export default defineConfig({
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
    // three.js is a deliberately large vendored dependency and is code-split away
    // from the launcher's critical path, so the default warning is not useful here.
    chunkSizeWarningLimit: 600,
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
