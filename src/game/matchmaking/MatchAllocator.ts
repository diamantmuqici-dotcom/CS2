import type { MatchAllocation, MatchmakingAdapter, QueueRequest } from './matchmakingTypes';
import { matchServerRegistry, MatchServerRegistry } from './MatchServerRegistry';
import { apiUrl } from '../../shared/runtime';

export interface MatchAllocatorOptions {
  adapter?: MatchmakingAdapter;
  registry?: MatchServerRegistry;
  mode?: 'development' | 'production';
}

/**
 * Allocates a real match ticket. The development adapter is explicit and
 * deterministic; it is not a timer disguised as matchmaking. Production
 * requests go to the server API and fail with a structured error when no
 * backend is configured.
 */
export class MatchAllocator {
  private readonly adapter: MatchmakingAdapter;
  private readonly registry: MatchServerRegistry;

  constructor(options: MatchAllocatorOptions = {}) {
    this.registry = options.registry ?? matchServerRegistry;
    this.adapter = options.adapter ?? (options.mode === 'production' ? new HttpMatchmakingAdapter() : new LocalDevelopmentAdapter(this.registry));
  }

  allocate(request: QueueRequest, signal?: AbortSignal): Promise<MatchAllocation> {
    return this.adapter.enqueue(request, signal);
  }

  cancel(request: QueueRequest): Promise<void> | void {
    return this.adapter.cancel?.(request);
  }
}

export class LocalDevelopmentAdapter implements MatchmakingAdapter {
  constructor(private readonly registry: MatchServerRegistry) {
    const regions = ['EU', 'NA', 'SA', 'Asia', 'Oceania', 'Middle East', 'Africa'] as const;
    regions.forEach((region, index) => {
      if (this.registry.list(region).length === 0) {
        this.registry.upsert({
          id: `local-authority-${region.toLowerCase().replace(' ', '-')}`,
          region,
          endpoint: 'embedded://local-authority',
          tickRate: 64,
          currentPlayers: 0,
          capacity: 10,
          healthy: true,
          draining: false,
          latencyMs: index + 1,
          lastHeartbeatAt: Date.now()
        });
      }
    });
  }

  async enqueue(request: QueueRequest): Promise<MatchAllocation> {
    const server = this.registry.select(request);
    if (!server) {
      throw new Error('MATCHMAKING_SERVER_UNAVAILABLE');
    }
    return {
      matchId: `local_${request.mode.toLowerCase()}_${Date.now().toString(36)}`,
      serverId: server.id,
      endpoint: server.endpoint,
      region: server.region,
      mode: request.mode,
      mapId: request.mapId,
      tickRate: server.tickRate,
      playerSlots: server.capacity,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      source: 'LOCAL_DEVELOPMENT_ADAPTER'
    };
  }
}

class HttpMatchmakingAdapter implements MatchmakingAdapter {
  async enqueue(request: QueueRequest, signal?: AbortSignal): Promise<MatchAllocation> {
    const response = await fetch(apiUrl('api/matchmaking/queue'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal
    });
    const body = (await response.json().catch(() => null)) as MatchAllocation | { error?: { message?: string } } | null;
    if (!response.ok || !body || !('matchId' in body)) {
      throw new Error(body && 'error' in body ? body.error?.message || 'MATCHMAKING_QUEUE_UNAVAILABLE' : 'MATCHMAKING_QUEUE_UNAVAILABLE');
    }
    return body;
  }
}
