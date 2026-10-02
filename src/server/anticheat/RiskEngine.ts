import type { TelemetryEvent } from './EventAnalyzer';

export interface RiskAssessment { score: number; category: 'NORMAL' | 'MONITOR' | 'SUSPICIOUS' | 'HIGH_RISK'; signals: string[]; reviewRequired: boolean; }

export class RiskEngine {
  assess(events: TelemetryEvent[]): RiskAssessment {
    const signals: string[] = [];
    let score = 0;
    for (const event of events) {
      const weight = event.severity === 'critical' ? 35 : event.severity === 'high' ? 20 : event.severity === 'medium' ? 9 : 3;
      score += weight;
      signals.push(event.code);
    }
    const bounded = Math.min(100, score);
    return { score: bounded, category: bounded >= 70 ? 'HIGH_RISK' : bounded >= 40 ? 'SUSPICIOUS' : bounded >= 15 ? 'MONITOR' : 'NORMAL', signals: [...new Set(signals)], reviewRequired: bounded >= 40 };
  }
}
