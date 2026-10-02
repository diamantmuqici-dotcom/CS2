import { queueService } from './QueueService';
import type { QueueListener, QueueRequest, QueueStatus } from './matchmakingTypes';

/** Public facade used by UI and future party/session clients. */
export class MatchmakingService {
  enqueue(request: QueueRequest): void { queueService.enqueue(request); }
  cancel(): void { queueService.cancel(); }
  subscribe(listener: QueueListener): () => void { return queueService.subscribe(listener); }
  getStatus(): QueueStatus { return queueService.getStatus(); }
  consumeAllocation() { return queueService.consumeAllocation(); }
}

export const matchmakingService = new MatchmakingService();
