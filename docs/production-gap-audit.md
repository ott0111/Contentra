# Production gap audit — environment restoration pass

## IMPLEMENTED + NOT FULLY VALIDATED

- Resumable workspace-scoped onboarding persistence, completion tracking, and onboarding audit records.
- Library collection CRUD, collection-name search, save/remove existing content, workspace isolation, and Library page data loading.
- Migration `0003_completion_foundation` and its matching Prisma schema fields.
- Existing Part 3 authentication, workspace, content, calendar, campaign, API-key, webhook, and website-scanning source foundations.
- Workspace-scoped social OAuth lifecycle for configured Instagram, TikTok, YouTube, and X adapters: signed short-lived state bound to user/session/workspace/provider, single-use state claim, callback RBAC revalidation, normalized profile upsert, encrypted credential persistence, server-only refresh, safe status DTOs, disconnect, revocation attempt, and audit records.

These were inspected in source but cannot be marked validated until dependencies install, Prisma Client is generated, migrations run, and the app is exercised against PostgreSQL.

## PARTIAL

- The Library schema currently supports collections of existing content only; inspiration, templates, media, generated assets, hooks, scripts, and brand assets do not have a generalized saved-item model.
- Social adapters, provider sync, publishing, trend ingestion, attribution, Stripe lifecycle, worker handlers, settings forms, and Business OS screens remain incomplete source-level product work.
- The migration directory begins at `0002_part3_production`; no baseline migration is present in this repository. `0002` explicitly requires that baseline schema first, so a database-ready baseline migration/history must be supplied or reconciled before production migration validation.

## MISSING

- No installed dependencies, generated Prisma Client, lockfile, or local PostgreSQL development database are present in this checkout.

## BLOCKED BY INFRASTRUCTURE

- Registry access: Corepack's request for the pinned `pnpm@10.12.1` archive fails with `ECONNREFUSED 127.0.0.1:9`. The environment sets `ALL_PROXY`, `HTTP_PROXY`, `HTTPS_PROXY`, `GIT_HTTP_PROXY`, and `GIT_HTTPS_PROXY` to that unavailable endpoint, and sets `NPM_CONFIG_OFFLINE=true`. A one-command retry with those variables cleared still did not produce a lockfile or `node_modules`.
- Package installation, Prisma validation/generation, TypeScript checks, ESLint, tests, builds, API/web runtime, browser/mobile/accessibility QA, and migration execution are consequently blocked.
- `psql`, `postgres`, and `pg_isready` are not available on this machine; PostgreSQL cannot be provisioned or queried locally.

## BLOCKED BY THIRD-PARTY PROVIDER

- Live OAuth, profile normalization compatibility, refresh, revocation, sync, metrics, and publishing for Instagram, TikTok, YouTube, and X require provider applications, approvals, scopes, redirect URLs, and credentials.
- Stripe lifecycle requires Stripe credentials and a webhook signing secret; AI requires Gemini credentials; object storage requires a configured storage provider.
