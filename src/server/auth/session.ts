import crypto from 'node:crypto';

export interface SessionRecord { sessionId: string; userId: string; expiresAt: number; csrfToken: string; }

export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();
  constructor(private readonly ttlMs = 1000 * 60 * 60 * 24 * 14) {}
  create(userId: string): SessionRecord { const sessionId = crypto.randomBytes(32).toString('base64url'); const record = { sessionId, userId, expiresAt: Date.now() + this.ttlMs, csrfToken: crypto.randomBytes(24).toString('base64url') }; this.sessions.set(sessionId, record); return record; }
  get(sessionId: string | undefined): SessionRecord | null { if (!sessionId) return null; const record = this.sessions.get(sessionId); if (!record || record.expiresAt <= Date.now()) { this.sessions.delete(sessionId); return null; } return record; }
  revoke(sessionId: string): void { this.sessions.delete(sessionId); }
  validateCsrf(record: SessionRecord, token: string | undefined): boolean { if (!token) return false; const expected = Buffer.from(record.csrfToken); const supplied = Buffer.from(token); return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied); }
}

export const sessionService = new SessionService();
