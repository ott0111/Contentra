import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayPalAccessToken, getPayPalBaseUrl } from "@/lib/paypal/client";

type PayPalEvent = { id?: string; event_type?: string; resource?: Record<string, unknown> };
const statusMap: Record<string, string> = { "BILLING.SUBSCRIPTION.ACTIVATED": "active", "BILLING.SUBSCRIPTION.CREATED": "pending", "BILLING.SUBSCRIPTION.UPDATED": "active", "BILLING.SUBSCRIPTION.SUSPENDED": "suspended", "BILLING.SUBSCRIPTION.CANCELLED": "canceled", "BILLING.SUBSCRIPTION.EXPIRED": "expired", "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "past_due", "PAYMENT.SALE.DENIED": "past_due" };
export async function POST(request: Request) {
  if (!process.env.PAYPAL_WEBHOOK_ID) return NextResponse.json({ error: "PayPal webhook is not configured." }, { status: 503 });
  try {
    const raw = await request.text(); const event = JSON.parse(raw) as PayPalEvent; const headers = request.headers;
    const verification = await fetch(`${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`, { method: "POST", headers: { Authorization: `Bearer ${await getPayPalAccessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ auth_algo: headers.get("paypal-auth-algo"), cert_url: headers.get("paypal-cert-url"), transmission_id: headers.get("paypal-transmission-id"), transmission_sig: headers.get("paypal-transmission-sig"), transmission_time: headers.get("paypal-transmission-time"), webhook_id: process.env.PAYPAL_WEBHOOK_ID, webhook_event: event }) });
    const verificationResult = await verification.json() as { verification_status?: string }; if (!verification.ok || verificationResult.verification_status !== "SUCCESS") return NextResponse.json({ error: "PayPal webhook verification failed." }, { status: 400 });
    if (!event.id || !event.event_type) return NextResponse.json({ error: "Invalid PayPal event." }, { status: 400 });
    const admin = createAdminClient(); const { error: eventError } = await admin.from("paypal_webhook_events").insert({ event_id: event.id, event_type: event.event_type }); if (eventError?.code === "23505") return NextResponse.json({ received: true }); if (eventError) throw eventError;
    const resource = event.resource || {}; const subscriptionId = String(resource.id || resource.billing_agreement_id || ""); const userId = typeof resource.custom_id === "string" ? resource.custom_id : undefined; const status = statusMap[event.event_type];
    if (status && subscriptionId) { const query = userId ? admin.from("subscriptions").update({ paypal_subscription_id: subscriptionId, plan: String(resource.plan_id || "") === process.env.PAYPAL_PRO_PLAN_ID ? "PRO" : "CREATOR", status, current_period_end: typeof resource.billing_info === "object" && resource.billing_info && "next_billing_time" in resource.billing_info ? String((resource.billing_info as { next_billing_time: string }).next_billing_time) : null, updated_at: new Date().toISOString() }).eq("user_id", userId) : admin.from("subscriptions").update({ status, updated_at: new Date().toISOString() }).eq("paypal_subscription_id", subscriptionId); await query; }
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: "PayPal webhook processing failed." }, { status: 400 }); }
}