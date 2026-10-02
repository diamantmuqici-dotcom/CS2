export interface ObservabilitySnapshot { activeMatches: number; queueDepth: number; players: number; websocketConnections: number; errorRate: number; database: 'NOT_CONFIGURED' | 'HEALTHY' | 'UNHEALTHY'; worker: 'NOT_CONFIGURED' | 'HEALTHY'; }

export class ObservabilityService {
  private snapshot: ObservabilitySnapshot = { activeMatches: 0, queueDepth: 0, players: 0, websocketConnections: 0, errorRate: 0, database: 'NOT_CONFIGURED', worker: 'NOT_CONFIGURED' };
  set(patch: Partial<ObservabilitySnapshot>): void { this.snapshot = { ...this.snapshot, ...patch }; }
  get(): ObservabilitySnapshot { return { ...this.snapshot }; }
}

export const observabilityService = new ObservabilityService();
