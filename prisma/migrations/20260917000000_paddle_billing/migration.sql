-- CreateTable
CREATE TABLE "EntitlementOverride" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "grantedBy" TEXT,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntitlementOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementOverride_workspaceId_key" ON "EntitlementOverride"("workspaceId");

-- CreateIndex
CREATE INDEX "EntitlementOverride_active_idx" ON "EntitlementOverride"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_provider_externalSubscriptionId_key" ON "Subscription"("provider", "externalSubscriptionId");

-- AddForeignKey
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed AGENCY plan + entitlements (parity with apps/api/prisma/seed.ts, idempotent)
INSERT INTO "Plan" ("id", "code", "name", "monthlyPriceCents")
SELECT 'plan-agency-' || gen_random_uuid(), 'AGENCY', 'Agency', 9999
WHERE NOT EXISTS (SELECT 1 FROM "Plan" WHERE "code" = 'AGENCY');

INSERT INTO "Entitlement" ("id", "planId", "feature", "limitValue")
SELECT 'ent-agency-' || gen_random_uuid(), p."id", v."feature", v."limitValue"
FROM "Plan" p, (VALUES ('workspaces', 100), ('team_members', 250), ('ai_credits', 25000)) AS v("feature", "limitValue")
WHERE p."code" = 'AGENCY'
  AND NOT EXISTS (SELECT 1 FROM "Entitlement" e WHERE e."planId" = p."id" AND e."feature" = v."feature");
