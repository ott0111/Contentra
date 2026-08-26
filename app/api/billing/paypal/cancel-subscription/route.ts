import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { paypalRequest } from "@/lib/paypal/client";

export async function POST(request: Request) {
  try {
    const user = await getUser(); if (!user) return NextResponse.json({ error: "Please log in to manage billing." }, { status: 401 });
    const body = await request.json().catch(() => ({})); const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 255) : "Requested by subscriber";
    const admin = createAdminClient(); const { data } = await admin.from("subscriptions").select("paypal_subscription_id").eq("user_id", user.id).maybeSingle();
    if (!data?.paypal_subscription_id) return NextResponse.json({ error: "No PayPal subscription was found." }, { status: 404 });
    await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(data.paypal_subscription_id)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
    await admin.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("user_id", user.id);
    return NextResponse.json({ canceled: true });
  } catch { return NextResponse.json({ error: "We couldn't cancel the PayPal subscription. Try again." }, { status: 502 }); }
}