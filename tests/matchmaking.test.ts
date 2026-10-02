import { describe, expect, it } from 'vitest';
import { LocalDevelopmentAdapter, MatchAllocator } from '../src/game/matchmaking/MatchAllocator';
import { MatchServerRegistry } from '../src/game/matchmaking/MatchServerRegistry';
import { RatingService } from '../src/game/rating/RatingService';

describe('matchmaking allocation contract', () => {
  it('allocates a server-issued development ticket without a client timer', async () => {
    const registry = new MatchServerRegistry();
    registry.upsert({ id: 'test-eu', region: 'EU', endpoint: 'embedded://test', tickRate: 64, currentPlayers: 2, capacity: 10, healthy: true, draining: false, latencyMs: 5, lastHeartbeatAt: Date.now() });
    const allocator = new MatchAllocator({ registry, adapter: new LocalDevelopmentAdapter(registry) });
    const ticket = await allocator.allocate({ mode: 'Competitive', mapId: 'harbor_protocol', region: 'EU', partySize: 1, rating: 12000, clientVersion: 'test' });
    expect(ticket.source).toBe('LOCAL_DEVELOPMENT_ADAPTER');
    expect(ticket.serverId).toBe('test-eu');
    expect(ticket.matchId).toContain('local_');
    expect(ticket.expiresAt).toBeGreaterThan(ticket.issuedAt);
  });
});

describe('rating service', () => {
  it('changes rating from server-validated outcome and prevents negative ratings', () => {
    const service = new RatingService();
    const result = service.calculate({ matchId: 'm1', mode: 'Premier', playerId: 'p1', team: 'SENTINEL', winner: 'VORTEX', kills: 0, deaths: 30, roundsWon: 0, roundsLost: 13 }, { playerId: 'p1', mode: 'Premier', rating: 1000, wins: 0, losses: 0, placementsRemaining: 0, updatedAt: Date.now() });
    expect(result.nextRating).toBe(1000);
    expect(result.delta).toBeLessThan(0);
  });
});
