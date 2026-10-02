import type { AntiCheatCase } from './AntiCheatService';

export type CaseDecision = 'OPEN' | 'MONITOR' | 'QUARANTINED' | 'CLEARED' | 'RESTRICTED';
export interface CaseReview { reviewerId: string; decision: CaseDecision; note: string; createdAt: string; }

export class CaseManager {
  private readonly reviews = new Map<string, CaseReview[]>();
  review(target: AntiCheatCase, reviewerId: string, decision: CaseDecision, note: string): CaseReview {
    const review = { reviewerId, decision, note, createdAt: new Date().toISOString() };
    this.reviews.set(target.caseId, [...(this.reviews.get(target.caseId) ?? []), review]);
    return review;
  }
  history(caseId: string): CaseReview[] { return this.reviews.get(caseId) ?? []; }
}

export const caseManager = new CaseManager();
