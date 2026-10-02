import http from 'http';
import path from 'path';
import express from 'express';
import { authoritativeServer } from './gameServer';
import { REGION_SERVERS } from '../game/core/gameStateStore';
import { requireAdminRole } from './auth/authz';
import { observabilityService } from './observability';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json(authoritativeServer.getHealthStatus());
});

app.get('/api/regions', (_req, res) => {
  res.json({ regions: REGION_SERVERS, recommended: 'EU' });
});

app.post('/api/matchmaking/queue', (req, res) => {
  const allocation = authoritativeServer.allocateMatch(req.body);
  res.status(allocation.ok ? 200 : 400).json(allocation.ok ? allocation : { error: allocation.error });
});

app.get('/api/admin/overview', requireAdminRole('MODERATOR'), (_req, res) => {
  res.json({ health: authoritativeServer.getHealthStatus(), observability: observabilityService.get() });
});

app.post('/api/workshop/validate', (req, res) => {
  const result = authoritativeServer.validateAndStoreWorkshopMap(req.body);
  res.status(result.valid ? 200 : 400).json(result);
});

// Serve static production build if available
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));

const server = http.createServer(app);
authoritativeServer.attachWebSocketServer(server);

const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 4000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[CSGO SERVER] Authoritative HTTP + WebSocket Server listening on http://0.0.0.0:${PORT}`);
});
