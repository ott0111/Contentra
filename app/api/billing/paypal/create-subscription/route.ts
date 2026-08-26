import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { paypalPlanFor, type BillingPlan } from "@/lib/billing/plans";
import { paypalRequest } from "@/lib/paypal/client";

type PayPalSubscription = { id?: string; links?: { href: string; rel: string }[] };
export async function POST(request: Request) {
  try {
    const user = await getUser(); const body = await request.json(); const plan = String(body?.plan || "").toUpperCase() as BillingPlan;
    if (!user) return NextResponse.json({ error: "Please log in to manage billing." }, { status: 401 });
    if (plan !== "CREATOR" && plan !== "PRO") return NextResponse.json({ error: "Choose a valid paid plan." }, { status: 400 });
    const planId = paypalPlanFor(plan); if (!planId) return NextResponse.json({ error: "PayPal billing is not configured yet." }, { status: 503 });
    const admin = createAdminClient(); const { data: current } = await admin.from("subscriptions").select("paypal_subscription_id,status,plan").eq("user_id", user.id).maybeSingle();
    if (current?.paypal_subscription_id && ["active", "approved", "pending", "created"].includes(String(current.status).toLowerCase())) return NextResponse.json({ error: "You already have a subscription. Cancel it before choosing another plan." }, { status: 409 });
    const origin = new URL(request.url).origin;
    const subscription = await paypalRequest<PayPalSubscription>("/v1/billing/subscriptions", { method: "POST", headers: { "PayPal-Request-Id": crypto.randomUUID() }, body: JSON.stringify({ plan_id: planId, custom_id: user.id, application_context: { brand_name: "Contentra", user_action: "SUBSCRIBE_NOW", return_url: `${origin}/dashboard/billing/success?plan=${plan}`, cancel_url: `${origin}/dashboard/billing?canceled=1` } }) });
    const approval = subscription.links?.find(link => link.rel === "approve")?.href;
    if (!subscription.id || !approval) return NextResponse.json({ error: "PayPal did not return an approval link. Try again." }, { status: 502 });
    await admin.from("subscriptions").upsert({ user_id: user.id, paypal_subscription_id: subscription.id, plan, status: "pending", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return NextResponse.json({ url: approval });
  } catch { return NextResponse.json({ error: "We couldn't start PayPal checkout right now. Try again." }, { status: 500 }); }
}