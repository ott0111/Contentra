export type Feature =
  | "advanced_analytics"
  | "advanced_ai"
  | "business_intelligence"
  | "business_api"
  | "multiple_workspaces"
  | "team_members"
  | "advanced_recommendations"
  | "advanced_publishing"
  | "campaigns";

export type LimitKey =
  | "workspaces"
  | "team_members"
  | "ai_credits"
  | "connected_accounts";

export interface PlanDefinition {
  code: string;
  features: readonly Feature[];
  limits: Record<LimitKey, number>;
}

export const PLANS: Record<string, PlanDefinition> = {
  FREE: {
    code: "FREE",
    features: [],
    limits: { workspaces: 1, team_members: 1, ai_credits: 100, connected_accounts: 2 },
  },
  PRO: {
    code: "PRO",
    features: [
      "advanced_analytics",
      "advanced_ai",
      "multiple_workspaces",
      "team_members",
      "advanced_recommendations",
      "advanced_publishing",
      "campaigns",
    ],
    limits: { workspaces: 5, team_members: 5, ai_credits: 2000, connected_accounts: 10 },
  },
  BUSINESS: {
    code: "BUSINESS",
    features: [
      "advanced_analytics",
      "advanced_ai",
      "business_intelligence",
      "business_api",
      "multiple_workspaces",
      "team_members",
      "advanced_recommendations",
      "advanced_publishing",
      "campaigns",
    ],
    limits: { workspaces: 25, team_members: 50, ai_credits: 10000, connected_accounts: 50 },
  },
  AGENCY: {
    code: "AGENCY",
    features: [
      "advanced_analytics",
      "advanced_ai",
      "business_intelligence",
      "business_api",
      "multiple_workspaces",
      "team_members",
      "advanced_recommendations",
      "advanced_publishing",
      "campaigns",
    ],
    limits: { workspaces: 100, team_members: 250, ai_credits: 25000, connected_accounts: 200 },
  },
};

export const hasFeature = (plan: string, feature: Feature) =>
  PLANS[plan]?.features.includes(feature) ?? false;

export const hasLimit = (plan: string, key: LimitKey, value: number) => {
  const limit = PLANS[plan]?.limits[key];
  return limit === undefined || value <= limit;
};

export const getLimit = (plan: string, key: LimitKey) => PLANS[plan]?.limits[key];

// Semantic gates used by routes and clients. Prefer these over ad-hoc
// `plan === ...` comparisons so gating stays centralized.
export const canUseBusinessMode = (plan: string) => hasFeature(plan, "business_intelligence");
export const canUseBusinessApi = (plan: string) => hasFeature(plan, "business_api");
export const canUseCampaigns = (plan: string) => hasFeature(plan, "campaigns");
export const canUseAdvancedAI = (plan: string) => hasFeature(plan, "advanced_ai");
export const canUseMultipleWorkspaces = (plan: string) => hasFeature(plan, "multiple_workspaces");
export const canUseFamilySeats = (plan: string) => hasFeature(plan, "team_members");
export const canUseAdvancedAnalytics = (plan: string) => hasFeature(plan, "advanced_analytics");
