import { webhookService, type WebhookPayload } from './WebhookService';

export function notifyDiscord(payload: WebhookPayload): void {
  // The URL is read only by WebhookService from the server environment. This
  // module is never imported by the client bundle.
  webhookService.enqueue(payload);
}
