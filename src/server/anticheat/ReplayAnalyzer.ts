import type { ReplayRecord } from '../../shared/types';

export interface ReplaySignal { type: 'MOVEMENT' | 'FIRE_TIMING' | 'VIEW_CHANGE' | 'PACKET_SEQUENCE'; severity: 'LOW' | 'MEDIUM' | 'HIGH'; detail: string; }

export class ReplayAnalyzer {
  inspect(replay: ReplayRecord): ReplaySignal[] {
    const signals: ReplaySignal[] = [];
    let previousTick = -1;
    for (const event of replay.events) {
      if (event.tick <= previousTick) signals.push({ type: 'PACKET_SEQUENCE', severity: 'HIGH', detail: 'Replay event ticks are not strictly increasing.' });
      previousTick = event.tick;
      if (event.actors?.some((actor) => !actor.pos.every(Number.isFinite))) signals.push({ type: 'MOVEMENT', severity: 'HIGH', detail: 'Replay contains a non-finite actor position.' });
    }
    return signals;
  }
}
