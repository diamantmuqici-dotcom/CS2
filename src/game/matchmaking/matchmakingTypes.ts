import type { GameModeId, RegionId } from '../../shared/types';

export type QueueKind = 'MATCHMAKING' | 'PRACTICE' | 'CUSTOM';
export type QueuePhase = 'IDLE' | 'CONNECTING' | 'SEARCHING' | 'MATCH_FOUND' | 'ALLOCATING' | 'READY' | 'CANCELLED' | 'ERROR';

export interface QueueRequest {
  mode: GameModeId;
  mapId: string;
  region: RegionId;
  partySize: number;
  rating: number;
  clientVersion: string;
  kind?: QueueKind;
}

export interface MatchServer {
  id: string;
  region: RegionId;
  endpoint: string;
  tickRate: 64 | 128;
  currentPlayers: number;
  capacity: number;
  healthy: boolean;
  draining: boolean;
  latencyMs: number;
  lastHeartbeatAt: number;
}

export interface MatchAllocation {
  matchId: string;
  serverId: string;
  endpoint: string;
  region: RegionId;
  mode: GameModeId;
  mapId: string;
  tickRate: 64 | 128;
  playerSlots: number;
  issuedAt: number;
  expiresAt: number;
  source: 'SERVER' | 'LOCAL_DEVELOPMENT_ADAPTER';
}

export interface QueueStatus {
  phase: QueuePhase;
  request: QueueRequest | null;
  queuedAt: number | null;
  elapsedSec: number;
  estimatedWaitSec: number | null;
  message: string;
  allocation: MatchAllocation | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface MatchmakingAdapter {
  enqueue(request: QueueRequest, signal?: AbortSignal): Promise<MatchAllocation>;
  cancel?(request: QueueRequest): Promise<void> | void;
}

export type QueueListener = (status: QueueStatus) => void;
