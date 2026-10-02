import { structuredLogger } from '../structuredLogger';

export interface WebhookPayload { event: string; caseId?: string; playerId?: string; matchId?: string; map?: string; mode?: string; timestamp: string; riskCategory?: string; replayId?: string; adminUrl?: string; }

export class WebhookService {
  private queue: WebhookPayload[] = [];
  private sending = false;
  private lastSentAt = 0;
  constructor(private readonly url = process.env.DISCORD_WEBHOOK_URL, private readonly minIntervalMs = 1500) {}

  enqueue(payload: WebhookPayload): void {
    if (!this.url) return;
    if (!this.validate(payload)) {
      structuredLogger.log('SERVER', 'WARN', 'Rejected invalid webhook payload');
      return;
    }
    this.queue.push({ ...payload });
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.sending || !this.url || !this.queue.length) return;
    this.sending = true;
    try {
      const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.lastSentAt));
      if (wait) await new Promise<void>((resolve) => setTimeout(resolve, wait));
      const payload = this.queue.shift();
      if (!payload) return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: this.format(payload) }), signal: controller.signal });
        if (!response.ok) structuredLogger.log('SERVER', 'WARN', 'Discord webhook returned an error', { status: response.status });
        else this.lastSentAt = Date.now();
      } catch (error) {
        structuredLogger.log('SERVER', 'WARN', 'Discord webhook unavailable; game server continues', { error: error instanceof Error ? error.message : String(error) });
      } finally { clearTimeout(timer); }
    } finally {
      this.sending = false;
      if (this.queue.length) void this.flush();
    }
  }

  private validate(payload: WebhookPayload): boolean { return Boolean(payload.event && payload.timestamp && !JSON.stringify(payload).match(/password|token|secret|webhook/i)); }
  private format(payload: WebhookPayload): string { return `[${payload.event}] ${JSON.stringify(payload)}`; }
}

export const webhookService = new WebhookService();
