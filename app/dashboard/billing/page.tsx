import BillingView from "@/components/billing-page";
import { getUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
	const user = await getUser();
	if (!user) return null;
	const { data } = await (await createClient()).from("subscriptions").select("plan,status,current_period_end").eq("user_id", user.id).maybeSingle();
	return <BillingView currentPlan={(data?.plan || "FREE") as "FREE" | "CREATOR" | "PRO"} status={data?.status || "active"} renewal={data?.current_period_end || null} paypalConfigured={Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_CREATOR_PLAN_ID && process.env.PAYPAL_PRO_PLAN_ID && process.env.PAYPAL_WEBHOOK_ID)} />;
}