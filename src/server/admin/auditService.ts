import type { AdminRole } from './authorization';

export interface AdminAuditEntry { actorId: string; actorRole: AdminRole; action: string; targetType: string; targetId: string; result: 'SUCCESS' | 'DENIED' | 'ERROR'; correlationId: string; timestamp: string; metadata: Record<string, unknown>; }

export class AdminAuditService {
  private readonly entries: AdminAuditEntry[] = [];
  record(entry: Omit<AdminAuditEntry, 'timestamp'>): AdminAuditEntry { const next = { ...entry, timestamp: new Date().toISOString() }; this.entries.push(next); return next; }
  list(): AdminAuditEntry[] { return [...this.entries].reverse(); }
}

export const adminAuditService = new AdminAuditService();
