import { caseManager, type CaseDecision } from './CaseManager';
import type { AntiCheatCase } from './AntiCheatService';

export class ReviewService {
  submit(caseRecord: AntiCheatCase, reviewerId: string, decision: CaseDecision, note: string) {
    return caseManager.review(caseRecord, reviewerId, decision, note);
  }
}

export const reviewService = new ReviewService();
