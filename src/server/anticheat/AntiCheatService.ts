import type { AntiCheatViolation } from '../../shared/security';
import { EventAnalyzer, type TelemetryEvent } from './EventAnalyzer';
import { RiskEngine, type RiskAssessment } from './RiskEngine';

export interface AntiCheatCase { caseId: string; playerId: string; matchId: string; mapId: string; mode: string; createdAt: string; risk: RiskAssessment; events: TelemetryEvent[]; state: 'NORMAL' | 'MONITOR' | 'SUSPICIOUS' | 'HIGH_RISK' | 'QUARANTINE'; }

export class AntiCheatService {
  private readonly cases = new Map<string, AntiCheatCase>();
  constructor(private readonly analyzer = new EventAnalyzer(), private readonly riskEngine = new RiskEngine()) {}
  ingest(input: { playerId: string; matchId: string; mapId: string; mode: string; violations: AntiCheatViolation[] }): AntiCheatCase {
    const events = this.analyzer.fromViolations(input.violations);
    const risk = this.riskEngine.assess(events);
    const state = risk.score >= 90 ? 'QUARANTINE' : risk.score >= 70 ? 'HIGH_RISK' : risk.score >= 40 ? 'SUSPICIOUS' : risk.score >= 15 ? 'MONITOR' : 'NORMAL';
    const record: AntiCheatCase = { caseId: `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, ...input, createdAt: new Date().toISOString(), risk, events, state };
    this.cases.set(record.caseId, record);
    return record;
  }
  get(caseId: string): AntiCheatCase | null { return this.cases.get(caseId) ?? null; }
  list(): AntiCheatCase[] { return [...this.cases.values()]; }
}

export const antiCheatService = new AntiCheatService();
