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
};

export const hasFeature = (plan: string, feature: Feature) =>
  PLANS[plan]?.features.includes(feature) ?? false;

export const hasLimit = (plan: string, key: LimitKey, value: number) => {
  const limit = PLANS[plan]?.limits[key];
  return limit === undefined || value <= limit;
};

export const getLimit = (plan: string, key: LimitKey) => PLANS[plan]?.limits[key];
