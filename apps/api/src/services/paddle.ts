import crypto from "node:crypto";
import { prisma } from "../db.js";
import { timingSafeEqualHex } from "../security.js";

// Paddle Billing v1 API. Checkout creation and webhooks are environment-agnostic
// (the API host is the same; env controls which API key / price IDs / secret are
// supplied). PADDLE_ENV only labels the configured environment for humans and
// tests — absent credentials mean the app still works on Free.
const API_BASE = "https://api.paddle.com";
const PADDLE_VERSION = "2024-08-05";

export class PaddleConfigError extends Error {
  constructor(
    message: string,
    public code = "PADDLE_NOT_CONFIGURED",
    public status = 503,
  ) {
    super(message);
    this.name = "PaddleConfigError";
  }
}

export function paddleEnvironment() {
  return process.env.PADDLE_ENV === "sandbox" ? "sandbox" : "production";
}

export const PADDLE_PLANS = ["PRO", "BUSINESS", "AGENCY"] as const;
export type PaddlePlan = (typeof PADDLE_PLANS)[number];

export function priceIdForPlan(plan: string) {
  const key = { PRO: "PADDLE_PRO_PRICE_ID", BUSINESS: "PADDLE_BUSINESS_PRICE_ID", AGENCY: "PADDLE_AGENCY_PRICE_ID" }[plan];
  return key ? process.env[key] : undefined;
}

export function planForPriceId(priceId?: string): string {
  if (!priceId) return "FREE";
  if (priceId === process.env.PADDLE_PRO_PRICE_ID) return "PRO";
  if (priceId === process.env.PADDLE_BUSINESS_PRICE_ID) return "BUSINESS";
  if (priceId === process.env.PADDLE_AGENCY_PRICE_ID) return "AGENCY";
  return "FREE";
}

export async function createPaddleCheckout(
  workspaceId: string,
  plan: PaddlePlan,
  successUrl: string,
  cancelUrl: string,
) {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey)
    throw new PaddleConfigError(
      "Paddle checkout is not configured. Add PADDLE_API_KEY to the server environment.",
    );
  const priceId = priceIdForPlan(plan);
  if (!priceId)
    throw new PaddleConfigError(
      `No Paddle price is configured for the ${plan} plan. Add PADDLE_${plan}_PRICE_ID.`,
    );
  const existing = await prisma.subscription.findUnique({
    where: { workspaceId },
  });
  const body: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    custom_data: { workspaceId },
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
  // Reuse the Paddle customer id when known so upgrades hit the same customer.
  if (existing?.externalCustomerId) {
    body.customer = { id: existing.externalCustomerId };
  }
  const response = await fetch(`${API_BASE}/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Paddle-Version": PADDLE_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`PADDLE_HTTP_${response.status}`);
  const payload = (await response.json()) as {
    data?: { id?: string; url?: string };
  };
  const url = payload?.data?.url;
  if (!url) throw new Error("PADDLE_CHECKOUT_MISSING_URL");
  return { url, id: payload.data?.id };
}

// Paddle Billing signs webhook payloads with an HMAC-SHA256 over
// `${timestamp}:${rawBody}` using the webhook "Secret key". The signature is
// sent in the `Paddle-Signature` header as `ts=<unix>;h1=<hex>`.
export function verifyPaddleWebhookSignature(rawBody: string, header?: string) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const match = /ts=(\d+);h1=([0-9a-f]+)/i.exec(header);
  if (!match) return false;
  const ts = Number(match[1]);
  const h1 = match[2].toLowerCase();
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300)
    return false;
  const computed = crypto
    .createHmac("sha256", secret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");
  return timingSafeEqualHex(computed, h1);
}

export type PaddleEvent = {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  data: {
    id?: string;
    status?: string;
    customer_id?: string;
    subscription_id?: string | null;
    items?: { price?: { id?: string } }[];
    current_billing_period?: { starts_at?: string; ends_at?: string };
    custom_data?: Record<string, unknown>;
    customer_data?: { custom_data?: Record<string, unknown> };
  };
};

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.resumed",
  "subscription.paused",
  "subscription.canceled",
  "subscription.cancelled",
  "subscription.revoked",
  "subscription.billed",
]);

const TRANSACTION_EVENTS = new Set([
  "transaction.completed",
  "transaction.paid",
  "transaction.past_due",
  "transaction.payment_failed",
]);

export function supportedPaddleEvent(eventType: string) {
  return SUBSCRIPTION_EVENTS.has(eventType) || TRANSACTION_EVENTS.has(eventType);
}

export function paddleStatusToLocal(status?: string) {
  const map: Record<string, string> = {
    active: "ACTIVE",
    trialing: "TRIALING",
    past_due: "PAST_DUE",
    paused: "PAUSED",
    canceled: "CANCELED",
    cancelled: "CANCELED",
    revoked: "REVOKED",
    completed: "ACTIVE",
    paid: "ACTIVE",
    payment_failed: "PAYMENT_FAILED",
  };
  return map[status ?? ""] ?? "UNKNOWN";
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function processPaddleEvent(event: PaddleEvent) {
  const { event_id: eventId, event_type: eventType, data } = event;
  if (!eventId || !eventType || !data)
    throw new Error("PADDLE_PROCESSING_FAILED");

  try {
    const record = await prisma.integrationEvent.create({
      data: {
        provider: "paddle",
        eventType,
        externalId: eventId,
        payload: event as never,
      },
    });
    try {
      const result = await applyPaddleEvent(event);
      await prisma.integrationEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date() },
      });
      return { duplicate: false, workspaceId: result.workspaceId };
    } catch (error) {
      await prisma.integrationEvent.update({
        where: { id: record.id },
        data: {
          error: error instanceof Error ? error.message : "PADDLE_PROCESSING_FAILED",
        },
      });
      throw error;
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) return { duplicate: true, workspaceId: undefined };
    throw error;
  }
}

function paddleSubscriptionId(event: PaddleEvent) {
  const { event_type, data } = event;
  // transaction.* events carry the transaction id in data.id and the linked
  // subscription id in data.subscription_id — prefer the subscription id there.
  return event_type.startsWith("transaction.")
    ? (data.subscription_id ?? data.id ?? undefined)
    : (data.id ?? data.subscription_id ?? undefined);
}

async function applyPaddleEvent(event: PaddleEvent) {
  const { event_type: eventType, data } = event;
  const subscriptionId = paddleSubscriptionId(event);
  const currentPeriodEnd = data.current_billing_period?.ends_at;
  const hasPrice = Boolean(data.items?.[0]?.price?.id);
  let status = paddleStatusToLocal(data.status);
  let planCode = planForPriceId(data.items?.[0]?.price?.id);
  if (eventType === "subscription.revoked") {
    status = "REVOKED";
    planCode = "FREE";
  }
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new Error("BILLING_PLAN_NOT_SEEDED");

  const workspaceId = await resolveWorkspaceId(event);
  if (!workspaceId) {
    if (!subscriptionId) throw new Error("PADDLE_WORKSPACE_NOT_FOUND");
    // Transaction-only event for a workspace we know only by subscription id:
    // refresh status/period without touching plan mapping.
    const link = await prisma.subscription.findUnique({
      where: {
        provider_externalSubscriptionId: {
          provider: "paddle",
          externalSubscriptionId: String(subscriptionId),
        },
      },
    });
    if (!link) throw new Error("PADDLE_WORKSPACE_NOT_FOUND");
    await prisma.subscription.update({
      where: { workspaceId: link.workspaceId },
      data: {
        status,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
      },
    });
    return { workspaceId: link.workspaceId };
  }

  const shared = {
    provider: "paddle",
    externalCustomerId: data.customer_id ?? null,
    externalSubscriptionId: subscriptionId ? String(subscriptionId) : null,
    status,
    currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
  };
  // Only move planId when the event actually carries pricing (or explicitly
  // revokes). A status/period-only refresh keeps the existing plan.
  const movePlan = eventType === "subscription.revoked" || hasPrice;
  await prisma.subscription.upsert({
    where: { workspaceId },
    update: {
      ...shared,
      ...(movePlan ? { planId: plan.id } : {}),
    },
    create: {
      workspaceId,
      planId: plan.id,
      ...shared,
    },
  });
  return { workspaceId };
}

async function resolveWorkspaceId(event: PaddleEvent): Promise<string | null> {
  const customWorkspaceId = (
    event.data.custom_data?.workspaceId ??
    event.data.customer_data?.custom_data?.workspaceId
  );
  if (customWorkspaceId && typeof customWorkspaceId === "string")
    return customWorkspaceId;
  const subscriptionId = paddleSubscriptionId(event);
  if (subscriptionId) {
    const link = await prisma.subscription.findUnique({
      where: {
        provider_externalSubscriptionId: {
          provider: "paddle",
          externalSubscriptionId: String(subscriptionId),
        },
      },
    });
    if (link) return link.workspaceId;
  }
  return null;
}