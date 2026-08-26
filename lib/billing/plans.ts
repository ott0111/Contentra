export const planLimits = { FREE: 10, CREATOR: 150, PRO: 1000 } as const;
export type BillingPlan = keyof typeof planLimits;
export const paypalPlanFor = (plan: BillingPlan) => plan === "CREATOR" ? process.env.PAYPAL_CREATOR_PLAN_ID : plan === "PRO" ? process.env.PAYPAL_PRO_PLAN_ID : undefined;
