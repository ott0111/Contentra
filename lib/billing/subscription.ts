import { createClient } from "@/lib/supabase/server";
import type { BillingPlan } from "@/lib/billing/plans";

export type UserSubscription = { plan: BillingPlan; status: string; current_period_end: string | null; paypal_subscription_id: string | null };
export async function getUserSubscription(userId: string): Promise<UserSubscription> { const supabase = await createClient(); const { data } = await supabase.from("subscriptions").select("plan,status,current_period_end,paypal_subscription_id").eq("user_id", userId).maybeSingle(); return { plan: (data?.plan || "FREE") as BillingPlan, status: data?.status || "active", current_period_end: data?.current_period_end || null, paypal_subscription_id: data?.paypal_subscription_id || null }; }
export async function getUserPlan(userId: string) { return (await getUserSubscription(userId)).plan; }
