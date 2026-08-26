import { getUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { planLimits, type BillingPlan } from "@/lib/billing/plans";

export async function reserveAIUsage(feature: string) {
  const user = await getUser();
  if (!user) return { user: null, error: "Please log in to use AI." };
  const admin = createAdminClient();
  const { data: subscription } = await admin.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
  const plan = ((subscription?.plan || "FREE").toUpperCase() in planLimits ? subscription?.plan.toUpperCase() : "FREE") as BillingPlan;
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", start.toISOString());
  if ((count || 0) >= planLimits[plan]) return { user: null, error: "You've reached your monthly AI limit." };
  return { user, admin, feature };
}

export async function recordAIUsage(userId: string, feature: string, tokensUsed = 0) { await createAdminClient().from("ai_usage").insert({ user_id: userId, feature, tokens_used: Math.max(0, Math.round(tokensUsed)) }); }
