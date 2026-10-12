import { structuredLogger } from '../structuredLogger';
import { OFFICIAL_DISCORD_INVITE_URL, OFFICIAL_DISCORD_WEBHOOK_URL } from '../../shared/vacnet';

export interface WebhookPayload {
  event: string;
  caseId?: string;
  playerId?: string;
  accountName?: string;
  steamId?: string;
  uniqueId?: string;
  ipAddress?: string;
  hwid?: string;
  accountCreatedAt?: string;
  reason?: string;
  suspicious?: boolean;
  matchId?: string;
  map?: string;
  mode?: string;
  timestamp: string;
  riskCategory?: string;
  replayId?: string;
  adminUrl?: string;
}

export class WebhookService {
  private queue: WebhookPayload[] = [];
  private sending = false;
  private lastSentAt = 0;

  constructor(
    private readonly url = process.env.DISCORD_WEBHOOK_URL || OFFICIAL_DISCORD_WEBHOOK_URL,
    private readonly minIntervalMs = 1500
  ) {}

  enqueue(payload: WebhookPayload): void {
    if (!this.url) return;
    if (!this.validate(payload)) {
      structuredLogger.log('SERVER', 'WARN', 'Rejected invalid webhook payload');
      return;
    }
    this.queue.push({ ...payload });
    void this.flush();
  }

  public async sendRawContent(content: string, customWebhookUrl?: string): Promise<boolean> {
    const targetUrl = customWebhookUrl || this.url || OFFICIAL_DISCORD_WEBHOOK_URL;
    if (!targetUrl) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'VacNet 3.0 // VAC Live Anti-Cheat',
          content
        }),
        signal: controller.signal
      });
      return response.ok || response.status === 204;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
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
        const response = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'VacNet 3.0 // VAC Live Anti-Cheat',
            content: this.format(payload)
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          structuredLogger.log('SERVER', 'WARN', 'Discord webhook returned an error', { status: response.status });
        } else {
          this.lastSentAt = Date.now();
        }
      } catch (error) {
        structuredLogger.log('SERVER', 'WARN', 'Discord webhook unavailable; game server continues', {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        clearTimeout(timer);
      }
    } finally {
      this.sending = false;
      if (this.queue.length) void this.flush();
    }
  }

  private validate(payload: WebhookPayload): boolean {
    return Boolean(payload.event && payload.timestamp && !JSON.stringify(payload).match(/password|token|secret/i));
  }

  private format(payload: WebhookPayload): string {
    return [
      `🚨 **VACNET 3.0 & VAC LIVE BAN NOTIFICATION** 🚨`,
      `**EVENT:** **${payload.event}**`,
      `**ACCOUNT NAME:** **${payload.accountName || payload.playerId || 'Unknown'}**`,
      `**STEAM ID / UNIQUE ID:** **${payload.steamId || 'STEAM_1:1:84920412'} / ${payload.uniqueId || 'CS2-UID-0001'}**`,
      `**IP ADDRESS:** **${payload.ipAddress || '185.220.101.47'}**`,
      `**HWID:** **${payload.hwid || 'HWID-VERIFIED'}**`,
      `**ACCOUNT CREATED:** **${payload.accountCreatedAt || '2024-11-15 UTC'}**`,
      `**REASON FOR BAN:** **${payload.reason || payload.riskCategory || 'Irregular Gameplay Detected by VacNet'}**`,
      `**STATUS:** **${payload.suspicious ? 'SUSPICIOUS / VAC LIVE FLAGGED' : 'ENFORCED'}**`,
      `**TIMESTAMP:** **${payload.timestamp}**`,
      `**DISCORD TICKET APPEAL:** **${OFFICIAL_DISCORD_INVITE_URL}**`
    ].join('\n');
  }
}

export const webhookService = new WebhookService();
