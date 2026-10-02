export type LogCategory = 'AUTH' | 'MATCHMAKING' | 'GAME' | 'NETWORK' | 'ANTICHEAT' | 'MODERATION' | 'WORKSHOP' | 'DATABASE' | 'SERVER' | 'ADMIN';

export interface LogEntry { timestamp: string; category: LogCategory; level: 'INFO' | 'WARN' | 'ERROR'; correlationId: string; message: string; context?: Record<string, unknown>; }

export class StructuredLogger {
  private readonly entries: LogEntry[] = [];
  log(category: LogCategory, level: LogEntry['level'], message: string, context?: Record<string, unknown>, correlationId = `corr_${Date.now().toString(36)}`): LogEntry {
    const entry = { timestamp: new Date().toISOString(), category, level, correlationId, message, context };
    this.entries.push(entry);
    if (this.entries.length > 500) this.entries.shift();
    const method = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.info;
    method(`[${category}] ${message}`, context ?? '');
    return entry;
  }
  recent(category?: LogCategory): LogEntry[] { return this.entries.filter((entry) => !category || entry.category === category); }
}

export const structuredLogger = new StructuredLogger();
