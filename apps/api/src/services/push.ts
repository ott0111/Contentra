import { prisma } from "../db.js";
import { decryptSecret } from "../security.js";

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  status: "not_configured" | "no_devices" | "sent" | "partial" | "failed";
  attempted: number;
  delivered: number;
  errors: string[];
  provider: string | null;
}

export interface PushProvider {
  readonly name: string;
  send(tokens: string[], message: PushMessage): Promise<{ delivered: number; errors: string[] }>;
}

/**
 * Expo Push API provider. Only construct when EXPO_ACCESS_TOKEN is configured;
 * delivery is never reported as successful without the provider being configured.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = "expo";
  constructor(
    private readonly accessToken: string,
    private readonly options: { endpoint?: string; timeoutMs?: number } = {},
  ) {}

  async send(tokens: string[], message: PushMessage): Promise<{ delivered: number; errors: string[] }> {
    if (!tokens.length) return { delivered: 0, errors: [] };
    const batch: Array<Record<string, unknown>> = tokens.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      ...(message.data ? { data: message.data } : {}),
    }));
    const response = await fetch(this.options.endpoint ?? "https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15000),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EXPO_PUSH_HTTP_${response.status}: ${text.slice(0, 300)}`);
    }
    const payload = (await response.json()) as Array<{ status: string; message?: string }>;
    const errors: string[] = [];
    let delivered = 0;
    for (const entry of payload) {
      if (entry.status === "ok" || entry.status === "success" || entry.status === "sent") delivered++;
      else if (entry.message) errors.push(entry.message);
    }
    return { delivered, errors };
  }
}

export function configuredPushProvider(): PushProvider | null {
  const token = process.env.EXPO_ACCESS_TOKEN;
  if (!token) return null;
  return new ExpoPushProvider(token);
}

/**
 * Send a push message to every ACTIVE device registered in a workspace (and
 * optional userId scope). Returns a truthful result; when no provider is
 * configured it reports not_configured and never sends anything.
 */
export async function sendPushToWorkspace(
  workspaceId: string,
  message: PushMessage,
  options: { userId?: string } = {},
): Promise<PushSendResult> {
  const provider = configuredPushProvider();
  const where = options.userId
    ? { workspaceId, userId: options.userId, status: "ACTIVE" as const }
    : { workspaceId, status: "ACTIVE" as const };
  const devices = await prisma.deviceRegistration.findMany({ where });
  if (!provider) return { status: "not_configured", attempted: devices.length, delivered: 0, errors: [], provider: null };
  if (!devices.length) return { status: "no_devices", attempted: 0, delivered: 0, errors: [], provider: provider.name };
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) return { status: "failed", attempted: devices.length, delivered: 0, errors: ["ENCRYPTION_NOT_CONFIGURED"], provider: provider.name };
  const tokens: string[] = [];
  const tokenErrors: string[] = [];
  for (const device of devices) {
    try {
      tokens.push(decryptSecret(device.tokenEncrypted, encryptionKey));
    } catch {
      tokenErrors.push(`TOKEN_DECRYPT_FAILED:${device.id}`);
    }
  }
  if (!tokens.length) return { status: "failed", attempted: devices.length, delivered: 0, errors: tokenErrors, provider: provider.name };
  try {
    const result = await provider.send(tokens, message);
    return {
      status: result.delivered === tokens.length ? "sent" : result.delivered > 0 ? "partial" : "failed",
      attempted: tokens.length,
      delivered: result.delivered,
      errors: [...tokenErrors, ...result.errors],
      provider: provider.name,
    };
  } catch (error) {
    return {
      status: "failed",
      attempted: tokens.length,
      delivered: 0,
      errors: [error instanceof Error ? error.message : "PUSH_SEND_FAILED", ...tokenErrors],
      provider: provider.name,
    };
  }
}