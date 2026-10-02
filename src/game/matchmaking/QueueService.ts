import { MatchAllocator } from './MatchAllocator';
import type { QueueListener, QueueRequest, QueueStatus } from './matchmakingTypes';

export class QueueService {
  private readonly listeners = new Set<QueueListener>();
  private controller: AbortController | null = null;
  private request: QueueRequest | null = null;
  private queuedAt: number | null = null;
  private status: QueueStatus = {
    phase: 'IDLE', request: null, queuedAt: null, elapsedSec: 0,
    estimatedWaitSec: null, message: 'Queue idle', allocation: null, error: null
  };

  constructor(private readonly allocator = new MatchAllocator({ mode: import.meta.env.PROD ? 'production' : 'development' })) {}

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): QueueStatus { return this.status; }

  consumeAllocation() {
    if (this.status.phase !== 'READY' || !this.status.allocation) return null;
    const allocation = this.status.allocation;
    this.request = null;
    this.controller = null;
    this.queuedAt = null;
    this.publish({ phase: 'IDLE', request: null, queuedAt: null, elapsedSec: 0, estimatedWaitSec: null, message: 'Queue idle', allocation: null, error: null });
    return allocation;
  }

  enqueue(request: QueueRequest): void {
    this.cancel();
    this.request = request;
    this.queuedAt = Date.now();
    this.controller = new AbortController();
    this.publish({ phase: 'SEARCHING', request, queuedAt: this.queuedAt, elapsedSec: 0, estimatedWaitSec: null, message: `Searching verified ${request.region} capacity`, allocation: null, error: null });

    void this.allocator.allocate(request, this.controller.signal).then((allocation) => {
      if (this.controller?.signal.aborted) return;
      const elapsedSec = (Date.now() - (this.queuedAt ?? Date.now())) / 1000;
      this.publish({ ...this.status, phase: 'READY', elapsedSec, message: 'Server allocated. Match ticket verified.', allocation, error: null });
    }).catch((error: unknown) => {
      if (this.controller?.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Matchmaking is temporarily unavailable.';
      this.publish({ ...this.status, phase: 'ERROR', message, error: { code: message.startsWith('MATCHMAKING_') ? message : 'MATCHMAKING_QUEUE_UNAVAILABLE', message: 'Matchmaking is temporarily unavailable. Try again shortly.', retryable: true } });
    });
  }

  cancel(): void {
    if (!this.request) return;
    this.controller?.abort();
    void this.allocator.cancel?.(this.request);
    const request = this.request;
    this.request = null;
    this.queuedAt = null;
    this.controller = null;
    this.publish({ phase: 'CANCELLED', request, queuedAt: null, elapsedSec: 0, estimatedWaitSec: null, message: 'Queue cancelled', allocation: null, error: null });
  }

  private publish(status: QueueStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }
}

export const queueService = new QueueService();
