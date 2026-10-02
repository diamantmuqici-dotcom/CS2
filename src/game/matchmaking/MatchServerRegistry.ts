import type { MatchServer, QueueRequest } from './matchmakingTypes';

/**
 * Small registry abstraction shared by local development and a future region
 * service. It deliberately does not invent player counts: callers update
 * heartbeats with values returned by the server.
 */
export class MatchServerRegistry {
  private servers = new Map<string, MatchServer>();

  upsert(server: MatchServer): void {
    this.servers.set(server.id, { ...server });
  }

  remove(serverId: string): void {
    this.servers.delete(serverId);
  }

  list(region?: QueueRequest['region']): MatchServer[] {
    return [...this.servers.values()].filter((server) => !region || server.region === region);
  }

  select(request: QueueRequest): MatchServer | null {
    return this.list(request.region)
      .filter((server) => server.healthy && !server.draining && server.currentPlayers < server.capacity)
      .sort((a, b) => a.latencyMs - b.latencyMs || a.currentPlayers - b.currentPlayers)[0] ?? null;
  }

  healthSummary() {
    const servers = this.list();
    return {
      total: servers.length,
      healthy: servers.filter((server) => server.healthy && !server.draining).length,
      capacity: servers.reduce((sum, server) => sum + server.capacity, 0),
      players: servers.reduce((sum, server) => sum + server.currentPlayers, 0)
    };
  }
}

export const matchServerRegistry = new MatchServerRegistry();
