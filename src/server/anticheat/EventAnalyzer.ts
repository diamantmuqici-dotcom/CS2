import type { AntiCheatViolation } from '../../shared/security';

export interface TelemetryEvent { id: string; code: string; severity: AntiCheatViolation['severity']; timestamp: number; detail: string; evidence: Record<string, unknown>; }

export class EventAnalyzer {
  fromViolations(violations: AntiCheatViolation[]): TelemetryEvent[] {
    return violations.map((violation, index) => ({ id: `evt_${violation.timestamp}_${index}`, code: violation.type, severity: violation.severity, timestamp: violation.timestamp, detail: violation.details, evidence: { source: 'server-validation' } }));
  }
}
