import { prisma } from "../db.js";
import {
  canUseBusinessMode,
  canUseBusinessApi,
  canUseCampaigns,
  canUseAdvancedAI,
  canUseMultipleWorkspaces,
  canUseFamilySeats,
  getLimit,
  hasFeature,
  type Feature,
} from "@contentra/core";

export class EntitlementError extends Error {
  constructor(
    public code: "FEATURE_LOCKED" | "PLAN_LIMIT_REACHED",
    message: string,
  ) {
    super(message);
    this.name = "EntitlementError";
  }
}

export type PlanScope = {
  planCode: string;
  subscriptionStatus: string;
  overridePlan: string | null;
  override:
    | { grantedBy: string | null; expiresAt: Date | null; reason: string | null }
    | null;
};

// Local subscription statuses that reflect an active paid entitlement. Paddle
// maps to these; overrides are orthogonal and handled separately.
const ENTITLED_STATUSES = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);

export async function getPlanScope(workspaceId: string): Promise<PlanScope> {
  const [subscription, override] = await Promise.all([
    prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: { select: { code: true } } },
    }),
    findActiveOverride(workspaceId),
  ]);
  return {
    planCode: subscription?.plan?.code ?? "FREE",
    subscriptionStatus: subscription?.status ?? "ACTIVE",
    overridePlan: override?.plan ?? null,
    override: override
      ? {
          grantedBy: override.grantedBy,
          expiresAt: override.expiresAt,
          reason: override.reason,
        }
      : null,
  };
}

export function activePlan(scope: PlanScope) {
  // Canceled / past-due / paused subscriptions fall back to FREE, so
  // entitlements can never outlive billing.
  return ENTITLED_STATUSES.has(scope.subscriptionStatus)
    ? scope.planCode
    : "FREE";
}

// Effective Entitlement = Admin override if one exists, otherwise the Paddle
// entitlement, otherwise Free.
export function effectivePlan(scope: PlanScope): string {
  return scope.overridePlan ?? activePlan(scope);
}

export async function getEffectivePlan(workspaceId: string): Promise<string> {
  return effectivePlan(await getPlanScope(workspaceId));
}

export async function findActiveOverride(workspaceId: string) {
  const override = await prisma.entitlementOverride.findUnique({
    where: { workspaceId },
  });
  if (!override || !override.active) return null;
  if (override.expiresAt && override.expiresAt <= new Date()) return null;
  return override;
}

/**
 * Granular entitlement adjustments (EntitlementAdjustment) are additive to the
 * plan/override — they never replace the base entitlement. Two kinds:
 *
 *  - ALLOWANCE (feature "ai_credits"): adds N AI generations to the effective
 *    limit. The deliverable lands in AICreditBalance via the same additive
 *    ledger (referral reward, admin grants). Effective = plan limit + Σ allow.
 *  - ACCESS (feature "ai_credits" or arbitrary feature key): unlocks a feature
 *    for granular time-boxed windows regardless of plan tier.
 *
 * The spend gate still reads AICreditBalance.balance directly for the actual
 * deduction; adjustments inflate the limit the balance may not exceed.
 */
async function activeAdjustmentSumFor(
  workspaceId: string,
  feature: string,
): Promise<{ allowance: number; access: boolean }> {
  const rows = await prisma.entitlementAdjustment.findMany({
    where: { workspaceId, active: true, feature },
  });
  let allowance = 0;
  let access = false;
  for (const row of rows) {
    if (row.expiresAt && row.expiresAt <= new Date()) continue;
    if (row.kind === "ALLOWANCE" && row.amount && row.amount > 0) allowance += row.amount;
    if (row.kind === "ACCESS") access = true;
  }
  return { allowance, access };
}

export async function assertFeature(workspaceId: string, feature: Feature) {
  const scope = await getPlanScope(workspaceId);
  const planCode = effectivePlan(scope);
  const { access } = await activeAdjustmentSumFor(workspaceId, feature);
  if (!hasFeature(planCode, feature) && !access) {
    throw new EntitlementError(
      "FEATURE_LOCKED",
      `${feature} requires the Pro or Business plan. Upgrade to unlock it.`,
    );
  }
  return planCode;
}

export async function assertLimit(
  workspaceId: string,
  key: "workspaces" | "team_members" | "ai_credits" | "connected_accounts",
  value: number,
) {
  const scope = await getPlanScope(workspaceId);
  const planCode = effectivePlan(scope);
  const baseLimit = getLimit(planCode, key);
  // Granular ALLOWANCE adjustments are additive on top of the plan/override
  // limit — Never not overwrite. The AI credit ledger already carries the
  // reward/allowances, so the base plan limit + Σ allowances is the effective
  // ceiling (spend itself reads AICreditBalance.balance directly).
  const { allowance } = await activeAdjustmentSumFor(workspaceId, key);
  const effectiveLimit =
    baseLimit === undefined ? undefined : baseLimit + allowance;
  if (effectiveLimit !== undefined && value > effectiveLimit) {
    throw new EntitlementError(
      "PLAN_LIMIT_REACHED",
      `Your ${planCode} plan includes ${key}: ${baseLimit} (+${allowance} allowed). Upgrade to raise the limit.`,
    );
  }
  return planCode;
}

export { canUseBusinessMode, canUseBusinessApi, canUseCampaigns, canUseAdvancedAI, canUseMultipleWorkspaces, canUseFamilySeats };