-- Reference data required by the application at runtime.
-- Workspace creation connects a default Plan -> Subscription, so the three
-- plans and their entitlements must exist before any workspace is created in a
-- fresh (migrate-deploy-only) production database. The migration is idempotent
-- and safe for databases that already contain plans (e.g. pre-seeded dev DBs):
-- plans survive by ON CONFLICT on code, and entitlements resolve the plan by
-- code rather than assuming fixed plan IDs.

INSERT INTO "Plan" (id, code, name, "monthlyPriceCents") VALUES
  ('00000000-0000-4000-8000-000000000001', 'FREE',     'Free',     0),
  ('00000000-0000-4000-8000-000000000002', 'PRO',      'Pro',      1999),
  ('00000000-0000-4000-8000-000000000003', 'BUSINESS', 'Business', 4999)
ON CONFLICT (code) DO NOTHING;

INSERT INTO "Entitlement" (id, "planId", feature, "limitValue")
SELECT gen_random_uuid(), p.id, e.feature, e."limitValue"
FROM (VALUES
  ('FREE',     'workspaces',   1),
  ('FREE',     'team_members', 1),
  ('FREE',     'ai_credits',   100),
  ('PRO',      'workspaces',   5),
  ('PRO',      'team_members', 5),
  ('PRO',      'ai_credits',   2000),
  ('BUSINESS', 'workspaces',   25),
  ('BUSINESS', 'team_members', 50),
  ('BUSINESS', 'ai_credits',   10000)
) AS e(code, feature, "limitValue")
JOIN "Plan" p ON p.code = e.code
ON CONFLICT ("planId", feature) DO NOTHING;