export interface EmailMessage { to: string; subject: string; text: string; html?: string }
export interface EmailSender { send(message: EmailMessage): Promise<void> }

export class WebhookEmailSender implements EmailSender {
  constructor(private readonly endpoint: string, private readonly secret: string) {}
  async send(message: EmailMessage) {
    const response = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.secret}` }, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
  }
}

export function configuredEmailSender(): EmailSender | null {
  const endpoint = process.env.EMAIL_WEBHOOK_URL;
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  return endpoint && secret ? new WebhookEmailSender(endpoint, secret) : null;
}
