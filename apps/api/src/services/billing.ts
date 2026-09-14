import crypto from "node:crypto";
import { prisma } from "../db.js";
import { timingSafeEqualHex } from "../security.js";

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function stripeSecret() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (
    !secret ||
    (!secret.startsWith("sk_test_") && !secret.startsWith("rk_test_"))
  )
    throw new Error("BILLING_NOT_CONFIGURED");
  return secret;
}

function planForPrice(priceId?: string) {
  if (priceId && priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO";
  if (priceId && priceId === process.env.STRIPE_BUSINESS_PRICE_ID)
    return "BUSINESS";
  return "FREE";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
function subscriptionId(object: Record<string, unknown>) {
  const value = object.subscription;
  return (
    asString(value) ??
    (value && typeof value === "object"
      ? asString((value as Record<string, unknown>).id)
      : undefined)
  );
}
function workspaceFrom(object: Record<string, unknown>) {
  const metadata = object.metadata;
  if (metadata && typeof metadata === "object")
    return asString((metadata as Record<string, unknown>).workspaceId);
  const details = object.subscription_details;
  if (details && typeof details === "object") {
    const nested = (details as Record<string, unknown>).metadata;
    if (nested && typeof nested === "object")
      return asString((nested as Record<string, unknown>).workspaceId);
  }
  return undefined;
}
function priceFrom(object: Record<string, unknown>) {
  const items = object.items;
  const data =
    items && typeof items === "object"
      ? (items as { data?: unknown[] }).data
      : undefined;
  const first = data?.[0] as { price?: { id?: unknown } } | undefined;
  return asString(first?.price?.id);
}

export async function createStripeCheckout(
  workspaceId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
) {
  const secret = stripeSecret();
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
  });
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: workspaceId,
    "metadata[workspaceId]": workspaceId,
    "subscription_data[metadata][workspaceId]": workspaceId,
  });
  if (subscription?.externalCustomerId)
    params.set("customer", subscription.externalCustomerId);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`STRIPE_HTTP_${response.status}`);
  const session = (await response.json()) as { url?: string; id?: string };
  if (!session.url) throw new Error("STRIPE_CHECKOUT_MISSING_URL");
  return session;
}

export function verifyStripeWebhook(raw: string, header?: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith("whsec_") || !header) return false;
  const parts = header
    .split(",")
    .reduce<Record<string, string[]>>((result, part) => {
      const [key, value] = part.split("=");
      if (key && value) (result[key] ??= []).push(value);
      return result;
    }, {});
  const timestamp = Number(parts.t?.[0]);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300
  )
    return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return (parts.v1 ?? []).some((signature) =>
    timingSafeEqualHex(expected, signature),
  );
}

export async function processStripeEvent(event: StripeEvent) {
  let object = event.data.object;
  const externalSubscriptionId =
    subscriptionId(object) ??
    (event.type.startsWith("customer.subscription.")
      ? asString(object.id)
      : undefined);
  if (
    externalSubscriptionId &&
    !event.type.startsWith("customer.subscription.")
  ) {
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(externalSubscriptionId)}`,
      {
        headers: { authorization: `Bearer ${stripeSecret()}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("STRIPE_SUBSCRIPTION_LOOKUP_FAILED");
    object = (await response.json()) as Record<string, unknown>;
  }
  const workspaceId =
    workspaceFrom(object) ??
    workspaceFrom(event.data.object) ??
    (externalSubscriptionId
      ? (
          await prisma.subscription.findFirst({
            where: { externalSubscriptionId },
            select: { workspaceId: true },
          })
        )?.workspaceId
      : undefined);
  if (!workspaceId) throw new Error("STRIPE_WORKSPACE_NOT_FOUND");
  const received = await prisma.integrationEvent
    .create({
      data: {
        workspaceId,
        provider: "stripe",
        eventType: event.type,
        externalId: event.id,
        payload: event as never,
      },
    })
    .catch((error: unknown) => {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    });
  if (!received) return { duplicate: true, workspaceId };
  try {
    const cancelled = event.type === "customer.subscription.deleted";
    const status = cancelled
      ? "CANCELED"
      : (
          asString(object.status) ??
          (event.type === "checkout.session.completed" ? "ACTIVE" : "UNKNOWN")
        ).toUpperCase();
    const planCode = cancelled ? "FREE" : planForPrice(priceFrom(object));
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new Error("BILLING_PLAN_NOT_SEEDED");
    const periodEnd =
      typeof object.current_period_end === "number"
        ? new Date(object.current_period_end * 1000)
        : undefined;
    await prisma.subscription.upsert({
      where: { workspaceId },
      update: {
        planId: plan.id,
        provider: "stripe",
        externalCustomerId: asString(object.customer),
        externalSubscriptionId,
        status,
        currentPeriodEnd: periodEnd,
      },
      create: {
        workspaceId,
        planId: plan.id,
        provider: "stripe",
        externalCustomerId: asString(object.customer),
        externalSubscriptionId,
        status,
        currentPeriodEnd: periodEnd,
      },
    });
    await prisma.integrationEvent.update({
      where: { id: received.id },
      data: { processedAt: new Date() },
    });
    return { duplicate: false, workspaceId };
  } catch (error) {
    await prisma.integrationEvent.update({
      where: { id: received.id },
      data: {
        error:
          error instanceof Error ? error.message : "STRIPE_PROCESSING_FAILED",
      },
    });
    throw error;
  }
}
