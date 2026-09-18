# Contentra — Final Report

Facts below were verified by reading the repository at `C:\Users\opeye\Downloads\Contentra` (see README, `prisma/schema.prisma`, `packages/*`, `apps/*`, `services/*`, prerequisites/migration SQL). Nothing here is invented; every claim maps to source you can open.

## Repository Overview
- Root product is "Contentra", a content-operations platform; the README titles this phase "Part 1 Backend Foundation" and describes an application-first architecture: clients → centralized Contentra API → core services → PostgreSQL/object storage/external providers.
- The README states the backend owns authentication, workspace authorization, billing entitlements, AI usage, integrations, publishing state, analytics normalization, and business-data access.
- It is a pnpm monorepo (pnpm@10.12.1, `pnpm-workspace.yaml`) with `apps/*`, `packages/*`, and `services/*` workspaces plus a git repo and `.env`/`.env.example` at the root.
- README notes this repo was scaffolded from a supplied specification; external credentials and infrastructure (PostgreSQL, OAuth providers, Gemini, billing/email providers) must be supplied before adapters can operate against live systems.

## Tech Stack
- API: Fastify (`fastify` ^5.3.2) with pino logging, zod validation (`@contentra/validation`), Prisma ORM (`@prisma/client` ^6.19.3) over PostgreSQL, and argon2 (`argon2id`) password hashing; tests via vitest.
- Web: Next.js 16 (`next` 16.3.3) + React 19, lucide-react icons, shared UI package; Playwright for e2e and vitest for unit tests.
- Mobile: Expo (expo ~53, react-native 0.79, expo-router 5, expo-notifications, expo-secure-store).
- Desktop: Tauri 2 (`@tauri-apps/cli` + `@tauri-apps/api` ^2) with a Vite + React renderer.
- Packages: `@contentra/core` (plans/entitlements/permissions), `@contentra/types`, `@contentra/validation`, `@contentra/config`, `@contentra/ui`, `@contentra/integrations`; services: `ai` (GeminiProvider), `intelligence`, `recommendations`, `analytics`, `publishing`, `processing`.

## Monorepo
- `pnpm-workspace.yaml` includes `apps/*`, `packages/*`, `services/*` and whitelists `onlyBuiltDependencies` (`@prisma/client`, `@prisma/engines`, `argon2`, `esbuild`, `prisma`, `sharp`).
- Root `package.json` orchestrates workspace-wide scripts: `build`, `typecheck`, `lint`, `test` (each `pnpm -r`), `db:generate`, `db:migrate`, `db:seed`, and a `validate` chain (`db:generate && typecheck && lint && test && build`).
- Workspace packages are referenced with `workspace:*` (e.g. `@contentra/api` depends on `@contentra/validation`, `@contentra/core`, `@contentra/ai`).
- Layout also contains `infrastructure/` (Dockerfile.api, Dockerfile.web, docker-compose.prod.yml) and a non-Prisma top-level `migrations/` folder.

## Apps
- `apps/api`: Fastify HTTP API (`src/server.ts` mounts route groups), a `worker.ts` for async jobs, Prisma seed, vitest tests under `apps/api/tests`.
- `apps/web`: Next.js App Router app — auth pages (`/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`), `/onboarding`, `/[preview]`, `/creatos`, `/app/*` (create, content, library, calendar, analytics, inspiration, business, settings incl. billing/ai-credits/api/notifications/workspaces), and an `/admin` portal.
- `apps/mobile`: Expo Router app with secure-store usage (sessions, push tokens via expo-notifications).
- `apps/desktop`: Tauri 2 app (`src-tauri/`) with a Vite + React renderer that targets the same API.

## Packages
- `packages/core`: central `PLANS` table (FREE/PRO/BUSINESS/AGENCY) with `features` and `limits` (workspaces, team_members, ai_credits, connected_accounts), `hasFeature`/`getLimit`, and semantic gates like `canUseCampaigns`, `canUseBusinessMode`, `canUseAdvancedAI`.
- `packages/validation`: zod schemas for auth, workspace, content, campaign, calendar, onboarding, referral (`referralClaimSchema`, `referralCodeCreateSchema`, `referralStatsSchema`), granular adjustments (`granularAdjustmentCreateSchema`, `adjustmentKindSchema`), funnel events, and AI actions.
- `packages/types`: shared enums/types (`ContentStatus`, `WorkspaceRole`, `WorkspaceType`) imported by API, web, mobile.
- `packages/ui`, `packages/config`, `packages/integrations`: shared UI components, config, and a `ProviderError` abstraction for integration adapters.

## Database
- PostgreSQL, wired via Prisma `datasource db` using `env("DATABASE_URL")`; client generator is `prisma-client-js`.
- Schema lives in `prisma/schema.prisma`; migration workflow is `prisma migrate dev` (`pnpm db:migrate`), generation via `prisma generate`.
- PowerShell/Windows notes and runbook docs exist under `docs/` (windows.md, runbook.md, deployment.md, production.md, providers.md).
- No SQLite or other fallback — the API depends on a running PostgreSQL for all data operations.

## Schema
- Core identity/auth: `User`, `Session` (tokenHash, expiresAt), `VerificationToken`, `PasswordResetToken`, `Account` (passwordHash, encrypted OAuth tokens, scopes).
- Workspace & ops: `Workspace`, `WorkspaceMember` (roles OWNER/ADMIN/MEMBER/VIEWER, unique per workspace+user), `WorkspaceInvite` (tokenHash, 7-day expiry), `Content`, `ContentVersion`, `ContentAsset`, `ContentCollection`/`ContentCollectionItem`, `CalendarItem`, `Campaign`.
- Intelligence/business: `BrandProfile`, `BrandIntelligence`, `AudienceProfile`, `BrandVoice`, `ContentDNA`, `Trend`, `Opportunity`, `Recommendation`, `NextBestAction`, `Website`/`WebsitePage`/`WebsiteScan`/`WebsiteAnalytics`, `SocialAccount`/`SocialConnection`/`SocialPost`/`SocialMetric`/`SocialAudienceSnapshot`, `BusinessIntegration` + `BusinessCustomer|Lead|Product|Order|Conversion`.
- AI/billing/admin: `AIConversation`/`AIMessage`/`AIAction`/`AIUsage`/`AICreditBalance`/`AICreditTransaction`, `Plan`/`Entitlement`/`Subscription`/`EntitlementOverride`, `StaffMember`/`AdminCode`/`AdminSession`, `ReferralCode`/`Referral`/`EntitlementAdjustment`/`FunnelEvent`, plus `AuditLog`, `Job`, `Release`, `APIKey`, `Webhook`, `IntegrationEvent`, `Notification`/`NotificationPreference`/`DeviceRegistration`, `ImportJob`/`ImportItem`, `AnalyticsSnapshot`/`AnalyticsMetric`, `LibraryItem`, `PrivacySetting`.

## Migrations
- Six Prisma migrations under `prisma/migrations`: `20260913194708_baseline`, `20260914000000_seed_reference_data`, `20260916000000_add_internal_admin`, `20260917000000_paddle_billing`, `20260917010000_optional_integrationevent_workspace`, and `20260918000000_referrals_granular_funnel`.
- The referrals/granular migration adds `ReferralStatus` and `AdjustmentKind` enums plus `ReferralCode`, `Referral`, `EntitlementAdjustment`, `FunnelEvent` tables with unique `(code)`, unique `(workspaceId)`, and unique `(codeId, referredUserId)` constraints.
- A separate top-level `migrations/` folder also exists (0002_part3_production, 0003_completion_foundation, 0004_updates_push) but is distinct from the Prisma migration set.
- Prisma migrations and the running schema are the source of truth for the data model used by the API.

## API Overview
- `apps/api/src/server.ts` registers route groups: `registerRoutes` (core), `registerBusinessRoutes`, `registerWebhookRoutes`, `registerReleaseRoutes`, `registerAdminRoutes`.
- Core routes live under `/api/v1/auth/*` (`signup`, `login`, `logout`, `me`, `verify-email`, `forgot-password`, `reset-password`), `/api/v1/me`, and `/api/v1/workspaces/*` (workspaces, members, invites, onboarding, settings, home, analytics, inspiration, content, library, calendar, campaigns, notifications, ai/actions, websites, ai-credits, devices, api-keys, webhooks, billing, billing/checkout, brand-intelligence, integrations).
- Business endpoints at `/api/v1/business/{customers,leads,products,orders,conversions}` accept either a session or a scoped `Bearer` API key.
- Response envelope is consistent: successes return `{ data, requestId }`; failures return `{ error: { code, message }, requestId }`.

## Auth
- Password accounts store an argon2id `passwordHash` on `Account` (provider "password"); `User` never holds a raw password.
- Sessions are random 32-byte tokens stored as SHA-256 `tokenHash` in `Session` with 30-day expiry, delivered via `HttpOnly` cookie `contentra_session`; cookie policy is `SameSite=Lax` in dev and `SameSite=None; Secure; Partitioned` in production.
- Email verification (24 h) and password reset (1 h) token flows are supported; all tokens are stored hashed and never returned through the API.
- OAuth2 social connections and scoped API keys (stored hashed with a `ctr_` prefix, returned to the client once) are the other auth surfaces.

## Workspaces
- Workspaces have types CREATOR/PERSONAL_BRAND/BUSINESS/AGENCY; membership roles OWNER/ADMIN/MEMBER/VIEWER are always resolved from the database membership record, never from client claims (`workspaceAuth` helper in routes).
- Signup server-side provisions a default workspace (`createDefaultWorkspace`, FREE plan, 100 AI credits, OWNER membership); `POST /api/v1/workspaces` creates more with `createWorkspace`.
- Create/list/get/update/delete are permission-gated per action (`workspace.read/update/delete`, `members.*`, etc.); deletion requires typing the exact workspace name and writes a `workspace.deletion.requested` audit row.
- Invites are by email with hashed tokens and 7-day expiry, cannot grant OWNER, and acceptance only succeeds when the signed-in email matches; team-seat limits are enforced through `assertLimit("team_members", …)`.

## Onboarding
- The web onboarding flow is a 10-step wizard (Welcome → workspace type → niche → goals → connect context → analyze → brand intelligence → content preferences → first opportunity → first content).
- Progress is persisted to `Workspace.onboardingState` via `GET/PUT /api/v1/workspaces/:id/onboarding`, validated against `onboardingStateSchema` (currentStep 0–9, `completed` sets `onboardedAt`).
- Each save or completion writes an audit action (`onboarding.saved` / `onboarding.completed`); completing onboarding also updates the workspace `type`.
- The landing page routes users by state: authenticated-but-not-onboarded → `/onboarding`, onboarded → `/app`, unauthenticated → `/login`, preferring the workspace id stored in localStorage.

## Content
- Content lives in the `Content` model (title/description/format/platform/caption/script, status IDEA→ARCHIVED, tags, scheduledAt/publishedAt, optional campaign link) with workspace-scoped indexes.
- Creation always writes an initial `ContentVersion` (v1); every update appends a new version, and a restore endpoint recreates the latest version from a chosen one under a transaction, with audit.
- CRUD routes are under `/api/v1/workspaces/:id/content`; detail includes versions, assets, publishAttempts, calendarItems, campaign, and socialPosts with metrics.
- The inspiration flow saves a trend into the "Inspiration" `ContentCollection` via a marker `inspiration:<trendId>` in the content description.

## Campaigns
- `Campaign` captures name/description/goal/startDate/endDate/platforms[]/status (DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED) and a metrics Json.
- `GET/POST /api/v1/workspaces/:id/campaigns` and `PATCH /:id` all call `assertFeature(workspaceId, "campaigns")` — campaigns are not part of the FREE plan and fail with 403 `FEATURE_LOCKED` for Free workspaces.
- Campaigns link to `Content` (campaignId) and `CalendarItem`; the list endpoint includes `contents` and `calendarItems`.
- Status and platform updates are validated with `updateCampaignSchema`.

## Calendar
- `CalendarItem` models `scheduledFor`, optional `platform`, and links to `content` or `campaign` (workspace-scoped, indexed by `[workspaceId, scheduledFor, status]`).
- The list endpoint filters by search/status/platform/campaignId/contentId and a `from`/`to` window, with pagination (`page`/`limit`, cap 100).
- `POST /calendar` validates that the referenced content/campaign belong to the workspace; `POST /calendar/:id/cancel` flips status to CANCELLED (idempotent) and audits `calendar.cancelled`.
- Create and schedule both emit audit records (`calendar.scheduled`, `calendar.cancelled`).

## Analytics
- `GET /api/v1/workspaces/:id/analytics` aggregates `SocialMetric` rows into per-platform views/reach/engagement, a timeline, per-content rows, the latest 20 audience snapshots, and NEW recommendations plus the latest next-best-action.
- Storage is purpose-built: `AnalyticsSnapshot`/`AnalyticsMetric` (per workspace), `SocialMetric`/`SocialAudienceSnapshot`, and `WebsiteAnalytics` (visitors/sessions/traffic/signups/purchases).
- The home endpoint (`services/home.ts`) composes nba, opportunities, recommendations, recent content, upcoming calendar, and metrics for the app dashboard.
- The analytics page renders data as "synced provider data" only and shows an empty state until a platform is connected and content is published.

## Shares
- No standalone sharing module, shareable-links, or `/shares` endpoints exist anywhere in the source — a grep for share-related identifiers in `apps/` returns nothing.
- The closest data-level concept is the `shares` column on `SocialMetric`, captured from connected platform analytics alongside views/reach/likes/comments/saves.
- Referral codes (see "Referral") are the mechanism by which users distribute Contentra externally; referral stats expose how many codes were "sent"/completed rather than a content-sharing feature.
- This section is deliberately limited to what is verifiable: sharing is not implemented beyond platform metric ingestion.

## Referral
- Every workspace owns exactly one immutable referral code, created on first request by `getOrCreateReferralCode`, formatted `CTRA-` + 8 chars from an unambiguous alphabet and normalized to uppercase.
- `claimReferral` prevents self-referral (by workspace and again by user identity), and the unique `(codeId, referredUserId)` constraint enforces that a user can be credited by a code only once, ever — one user = one reward, no farming across workspaces.
- `completeReferralAndReward` transitions PENDING → COMPLETED via a concurrency-safe conditional `updateMany` (only one winner; losers report `ALREADY_COMPLETED`), then adds the reward (default 10 AI generations) to `AICreditBalance` with an additive `increment`.
- The same transaction writes an `EntitlementAdjustment` row of kind ALLOWANCE for feature `ai_credits` (reason `referral:<codeId>`, `grantedBy` null) and an audit `referral.reward.delivered` — the reward is fully auditable and never overwrites the balance.
- `listReferralStats` returns the code plus sent/completed/pending counts and the sum of delivered generations.

## AI
- `POST /api/v1/workspaces/:id/ai/actions` validates against `aiActionSchema` (12 action types e.g. create_content, analyze_content, create_calendar_plan) and requires `GEMINI_API_KEY`, else 503 `AI_NOT_CONFIGURED`.
- Generation uses `GeminiProvider` from `@contentra/ai` (default model `gemini-2.5-flash`); cost is `ceil((inputUnits + outputUnits)/1000)` and the charged amount is `min(cost, balance)`.
- A transaction decrements `AICreditBalance`, writes a negative `AICreditTransaction` (reason `ai:<type>`), and records `AIUsage` (operation, provider, model, units, creditCost).
- The spend gate reads `AICreditBalance.balance` directly and returns 429 `AI_CREDITS_EXHAUSTED` when balance ≤ 0; some actions are confirmed via `requiresConfirmation`.

## Entitlements
- Plans are defined in `packages/core/src/entitlements.ts`: FREE (100 ai_credits, 1 seat, no features) → PRO (2000) → BUSINESS (10000) → AGENCY (25000), each with a features array and limits map.
- Effective plan = admin `EntitlementOverride` if active, else the Paddle subscription if it is ACTIVE/TRIALING/PAST_DUE, else FREE (`getPlanScope`/`effectivePlan` in `services/entitlements.ts`).
- `assertFeature` gates boolean features and `assertLimit` gates numeric limits (workspaces, team_members, ai_credits, connected_accounts), throwing `EntitlementError` (`FEATURE_LOCKED` / `PLAN_LIMIT_REACHED`) server-side.
- The billing GET endpoint reports `effectivePlanCode`, any override, and `paddleConfigured` (checkout and webhooks) booleans; plans are seeded idempotently (Plan/Entitlement rows).

## Granular
- `EntitlementAdjustment` is the granular layer: kind `ALLOWANCE` adds N to the numeric ceiling, kind `ACCESS` unlocks a boolean feature — both strictly additive on top of the plan/override/Paddle truth and never overwrite the base entitlement.
- `activeAdjustmentSumFor` sums only active, non-expired rows, so the effective limit is `plan limit + Σ active allowances` and access is `hasFeature(plan) || anyActiveAccess` (`assertFeature`/`assertLimit`).
- Admin endpoints (`GET/POST /admin/entitlements/:workspaceId/adjustments`, `DELETE .../:adjustmentId`) grant and soft-revoke adjustments; grants validate kind, positive integer amount, optional expiry, and a ≤500-char reason.
- Every grant/revoke is audited (`entitlement.adjustment.granted/revoked`); `grantedBy` records the staff id, and referral rewards also write ALLOWANCE rows with `grantedBy` left null.

## Adjusments
- Internal admin is separate from workspace RBAC: `StaffMember` rows are provisioned server-side by email, with a role ladder MANAGEMENT → OPERATIONS → DIRECTOR → VP → EVP → CHIEF → BOD → OWNER (`STAFF_RANK`).
- A protected root Owner is bootstrapped only from `ADMIN_ROOT_EMAIL` and only when no OWNER exists; only the root can grant/alter OWNER, and staff management + entitlement grants require ≥ DIRECTOR (audit ≥ OPERATIONS).
- Admin auth is code-based: `request-code`/`verify-code` with rotating 6-digit codes (10-min TTL, 5-attempt cap, timing-safe compare, in-memory per-IP+email rate limiter 5/5 min) and a 12-hour `HttpOnly` `contentra_admin` cookie.
- Routes live under `/api/v1/admin/*` in `routes/admin.ts`, backed by `services/admin.ts`; the web portal is `/admin`.

## Staff
- There is no `routes/staff.ts` — staff administration is implemented in `routes/admin.ts` + `services/admin.ts`, so "staff" and "admin" share one surface.
- `GET/POST /admin/staff` and `PATCH /admin/staff/:id` list, create, and update staff with guards against self-demotion, self-deactivation, non-root OWNER grants, and root mutation by a delegated account.
- `AdminCode` and `AdminSession` store hashed codes and session tokens; every login (`staff.login`), failed attempt (`staff.code_attempt_failed`), creation, and update is written to `AuditLog`.
- Staff events include IP address and user-agent capture for accountability.

## Audit
- `AuditLog` records `action`, `entityType`, `entityId`, `metadata` Json, `ipAddress`, `userAgent`, and optional `workspaceId`/`userId`/`staffId`, indexed by `(workspaceId, createdAt)`.
- Workspace-side audits cover deletions, onboarding, content version restore, calendar schedule/cancel, OAuth flows, integration sync/disconnect, API-key create/revoke, and referral rewards.
- Staff-side audits cover login, failed code attempts, root bootstrap, staff.created/updated, entitlement.granted/revoked, and entitlement.adjustment.granted/revoked.
- `GET /api/v1/admin/audit-logs` (≥ OPERATIONS) reads back staff-owned audit rows with `action`/`staffId` filters and pagination.

## Security
- All session, verification, reset, admin, and referral-adjacent tokens are stored as SHA-256 hashes; passwords use argon2id and live only on `Account`.
- Secrets at rest use AES-256-GCM (`encryptSecret`/`decryptSecret` in `security.ts`, keyed by `ENCRYPTION_KEY`) for OAuth tokens, webhook secrets, and push tokens.
- Outbound webhooks and the Paddle webhook verify HMAC-SHA256 signatures with a 300-second timestamp tolerance; the Paddle signature format `ts=<unix>;h1=<hex>` is parsed and compared in constant time.
- Session cookies are HttpOnly with SameSite handling (`Lax` locally, `SameSite=None; Secure; Partitioned` in production); the README documents invariants: membership-resolved authorization, centralized permission checks, hashed API keys, verified webhook signatures, and errors that never leak stack traces or secrets.

## Notifications
- `Notification` (workspaceId, optional userId, type, title, body, data, readAt) plus per-workspace/user `NotificationPreference` with a unique `(workspaceId, userId, channel, eventType)` key.
- `createNotification` writes the record and, when `push` is set, enqueues a `push_delivery` Job for active devices.
- `DeviceRegistration` (android/ios only) stores a hashed push token and an encrypted copy; endpoints upsert device tokens and revoke by id.
- Web surfaces: `GET /notifications`, `POST /notifications/:id/read`, and `GET/PUT /notification-preferences`; the worker (`worker.ts`) consumes queued jobs.

## Integrations
- Social integration lifecycle (`services/social.ts`): OAuth connect with signed opaque state, callback, disconnect, and manual sync; tokens are encrypted and accounts carry `IntegrationStatus` (CONNECTED/DISCONNECTED/ERROR/REAUTH_REQUIRED).
- Business integrations (`BusinessIntegration` with `credentialsEncrypted`) sync customers, leads, products, orders, and conversions, exposed via `/api/v1/business/*` gated by `business_intelligence` (session) or `business_api` (API key).
- Website analysis: `POST /api/v1/workspaces/:id/websites` validates the URL (private URLs rejected), fetches the page, strips scripts/styles/markup, stores up to 100k chars into `WebsitePage.contentText`, and tracks `WebsiteScan` status with completion/failure notifications.
- `GET /api/v1/workspaces/:id/integrations` summarizes social, business, and website state for the client.

## Email
- Email delivery is adapter-based (`services/email.ts`): a `WebhookEmailSender` POSTs to `EMAIL_WEBHOOK_URL` with `Bearer EMAIL_WEBHOOK_SECRET`; `configuredEmailSender()` returns null when those env vars are absent.
- The sender is used for signup verification, password reset, workspace invites, and admin staff sign-in codes — delivery failures degrade the flow (verification labeled `pending`, delivery "pending") instead of blocking signup.
- No SMTP server is implemented in-repo; a real provider (webhook-compatible) must supply `EMAIL_WEBHOOK_URL`/`EMAIL_WEBHOOK_SECRET`.

## Paddle
- Paddle Billing v1 (`api.paddle.com`, `Paddle-Version: 2024-08-05`): `POST /api/v1/workspaces/:id/billing/checkout` creates a hosted checkout for PRO/BUSINESS/AGENCY using env price IDs, embedding `custom_data.workspaceId` and reusing `externalCustomerId` when present.
- The webhook at `/api/v1/webhooks/paddle` verifies `Paddle-Signature` (HMAC-SHA256 over `ts:rawBody`, 300 s tolerance, `paddle-signature` header only), records events idempotently against the unique `(provider, eventType, event_id)` Index on `IntegrationEvent`, and acknowledges-but-ignores unsupported event types.
- Lifecycle mapping: active/trialing/past_due → entitled statuses; canceled/paused/revoked/payment_failed → fall back to FREE; `subscription.revoked` forces REVOKED + FREE; transaction events refresh status/period without erasing the plan mapping.
- Free is not a Paddle product — absent credentials simply leave the app working on Free, checkout returns 503 `BILLING_NOT_CONFIGURED`, and admin overrides never write Paddle rows.

## Web
- Next.js 16 App Router app under `apps/web`; pages include auth, onboarding, `/[preview]` (dev preview route that redirects to `/login` in production), `/creatos`, `/admin`, and the full `/app/*` workspace surface.
- The root page (`apps/web/src/app/page.tsx`) is an auth-state router: it calls `/api/v1/auth/me`, then sends users to `/onboarding`, `/app`, or `/login` based on workspace onboarded state and localStorage selection.
- Shared UI comes from `@contentra/ui` plus local `AppShell`, `SettingsShell`, `BusinessShell`, `ui.tsx`, and `locked.tsx` (entitlement-locked screens point users to billing).
- Settings cover account, workspaces, preferences, privacy, languages, integrations, billing, notifications, API keys, AI credits, and storage.

## E2E
- An `apps/web/e2e` folder exists (verified): `auth.spec.ts`, `app.spec.ts`, `onboarding.spec.ts`, `workspaces.spec.ts`, and a shared `helpers.ts`.
- `apps/web/playwright.config.ts` runs Chromium desktop (1440×900), single worker, 90 s timeout, with a `webServer` that executes `pnpm start` against `http://localhost:3000` (so e2e runs against a production build).
- The `@contentra/web` package exposes `test:e2e` (`playwright test`); a `test-results/.last-run.json` exists, indicating the suite has been executed locally.

## Testing
- API unit tests live in `apps/api/tests` — `security.test.ts`, `paddle.test.ts`, and `paddle.integration.test.ts` (opt-in DB integration suite); `apps/api` runs them via `vitest run`.
- Web unit tests are configured (`apps/web/vitest.config.ts` includes `src/**/*.{test,spec}.*`) but the `test` script is `vitest run --passWithNoTests`, and no `src` unit-test files currently exist.
- Root command `pnpm test` cascades through workspaces with `pnpm -r test`.
- Playwright e2e (above) is the browser-level verification layer for the web app.

## CI
- No CI pipeline is present in the repository — there is no `.github/workflows` (verified: the `.github` glob returns nothing) and no other pipeline definition.
- The closest thing to a reproducible gate is the root `validate` script: `pnpm db:generate && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- README documents the canonical local flow: `pnpm install`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Automated CI (and its deployment counterpart) remains an open item rather than an implemented workflow.

## Verification
- This report's claims were verified by reading source directly: the Prisma schema and migration SQL, the Fastify route groups, and the `@contentra/core` + `@contentra/validation` packages, plus package.json scripts and the Playwright/Vitest configs.
- The `validate` chain is the project's own end-to-end verification command, covering schema generation, typechecking, lint, tests, and builds.
- Test artifacts already present in the repo (e.g. `apps/web/test-results/.last-run.json`, the opt-in DB integration suite, and the e2e specs) show the suites are runnable, but no fresh pass was executed as part of this rewrite.
- Behavioral claims about live providers (Paddle checkout, Gemini, email delivery) are based on code paths only; the README explicitly states credentials must be supplied before those adapters work against live systems.

## Known Blocks
- **Referral loop is not yet end-to-end wired.** The service layer (`claimReferral`, `completeReferralAndReward`, `getOrCreateReferralCode`, `listReferralStats`), zod schemas, and DB migration all exist, but no HTTP route calls them, the signup route/service ignores the `ref` field, and the web signup form does not send `ref` — so referrals cannot be claimed or rewarded through the API today.
- **Funnel events are unconnected.** `FunnelEvent` (table + model) and `funnelEventSchema` exist, but no route or service writes funnel events and no landing page tracks them.
- **No CI workflow.** There is no `.github` pipeline or equivalent remote automation; only the local `validate` script exists.
- **No unit tests under web src** and no dedicated "Shares"/content-sharing module (only the `shares` metric on `SocialMetric`); both are gaps rather than features.
- **External-credential dependency.** Paddle, Gemini, email, and OAuth providers all require real credentials/infrastructure; until supplied, those paths fail closed (e.g. Free still works, checkout returns 503) by design.