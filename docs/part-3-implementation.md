# Contentra Part 3 — Production completion status

## Implemented in source

### Production API foundation
- End-to-end email/password signup, login, logout, session expiry, email verification token creation, password reset token creation and reset flow.
- Passwords stored as Argon2id hashes in the credential account record; raw passwords are never persisted.
- Secure HTTP-only, Secure, SameSite=Lax session cookie.
- Generic authentication errors to avoid account enumeration during login.
- Authentication rate-limit guard for local/single-process deployments.
- Centralized workspace membership + permission checks on workspace-scoped routes.
- Workspace create/list/read/update/delete and member listing.
- Content create/read/update/delete with version creation and workspace scoping.
- Home aggregation endpoint backed by recommendations, opportunities, content, calendar, and normalized social metrics.
- Recommendation action endpoint.
- Calendar read/create/update endpoints.
- Campaign CRUD foundation.
- Integration status endpoint and safe disconnect behavior.
- Brand Intelligence read endpoint.
- AI action endpoint with confirmation metadata, Gemini REST provider support, and usage recording.
- AI provider abstraction retained; Gemini is selected only when `GEMINI_API_KEY` is configured.
- API key generation/revocation with hashed secret storage and one-time secret response.
- Controlled external Business API endpoints using scoped API keys.
- Webhook endpoint with encrypted secrets, HMAC signature verification, event allow-listing and duplicate-event idempotency.
- Website public URL validation and scanning foundation with DNS/private-network SSRF protection, redirect revalidation, size/time limits and scan history.
- Billing checkout foundation using the Paddle Billing API when `PADDLE_API_KEY` and price IDs are configured, with signature-verified, idempotent webhooks and a centralized entitlement layer (admin override > Paddle > Free).
- Notification read/list endpoints plus a `createNotification` service that writes a row and, when `push: true`, enqueues an idempotent `push_delivery` job (`push:<notificationId>` key).
- Database-backed job queue abstraction with bounded exponential retry behavior.
- Standard queue handlers: `push_delivery` (delegates to `sendPushToWorkspace`) and `cleanup` (expired sessions/verification/password-reset tokens; NEW→EXPIRED transitions on Opportunity/Recommendation/NextBestAction).
- Standalone queue worker process (`apps/api/src/worker.ts`, run via `pnpm --filter @contentra/api worker`, `WORKER_POLL_MS` controls the poll interval).
- Push provider boundary: `ExpoPushProvider` posts to `https://exp.host/--/api/v2/push/send` with a Bearer `EXPO_ACCESS_TOKEN`; `sendPushToWorkspace` decrypts tokens with `ENCRYPTION_KEY` and returns truthful `not_configured | no_devices | sent | partial | failed`. Without `EXPO_ACCESS_TOKEN` delivery is a documented no-op, never a fake success.
- Website scan (SUCCEEDED/FAILED) and social sync completion now create push-enabled notifications.
- Admin release management: `POST/GET/DELETE /api/v1/releases` guarded by the `RELEASES_ADMIN_TOKEN` bearer credential; public `GET /api/v1/releases/latest` unchanged.

### Frontend
- Root authentication decision now checks the session before routing to `/app` or `/login`.
- Application shell now loads the authenticated user/workspaces and persists the active workspace selection.
- Workspace-scoped API requests send `x-workspace-id` centrally.
- Home, Blitz, Content, Calendar and Analytics now request real workspace data rather than rendering fabricated sample metrics/content.
- Content detail loads real content, versions, assets, campaign and publishing-attempt data.
- Business OS navigation and route family added for Business/Agency workspaces.
- All 20 Part 2 creation formats remain backed by the shared creation route infrastructure.
- Every client (web, mobile, desktop) now has a signup mode on its auth screen (name + email + min-12-char password) matching the API signup contract.
- Web ships a `ReleaseNotice` banner (SSR `<header>` mount, localStorage dismiss); mobile renders it on Home with SecureStore-backed dismiss; desktop renders it below the top bar with dismiss persisted in localStorage. All three read `GET /api/v1/releases/latest`.
- Web security headers (nosniff, frame-options, referrer-policy, permissions-policy) added via `apps/web/next.config.mjs`.
- Mobile (`apps/mobile/src/api.ts`) captures the `contentra_session` cookie, persists it in SecureStore, and replays it as a `cookie` header because React Native fetch has no cookie jar.
- Mobile push registration (`apps/mobile/src/push.ts`) with expo-notifications/expo-device; aligned `react-native-screens`/`safe-area-context`/`reanimated` at Expo SDK 53 versions.

### Database
- Added `VerificationToken` and `PasswordResetToken` models.
- Added explicit `Account.passwordHash` instead of overloading an OAuth token field.
- Added targeted indexes for common workspace/content/calendar/social queries.
- Added a Part 3 migration SQL file for the new token tables, password hash column and indexes.
- Seed now creates plan entitlement rows for Free, Pro and Business.

## Deliberately not faked

The following remain configuration/provider dependent rather than being simulated:
- Email delivery unless `EMAIL_WEBHOOK_URL` + `EMAIL_WEBHOOK_SECRET` are configured.
- Gemini responses unless `GEMINI_API_KEY` is configured.
- Paddle checkout unless `PADDLE_API_KEY` + price IDs are configured.
- Social publishing/OAuth/sync adapters for Instagram, TikTok, YouTube and X; no fake connected states were added.
- Object storage until a concrete storage provider is configured.
- Business data until a real business integration supplies it.

## Validation status

| Check | Status | Reason |
|---|---|---|
| Source/package structure inspection | PASSED | Repository inspected and extended in place |
| Package manifest JSON parsing | PASSED | All manifests parse successfully |
| Dependency installation | PASSED | Registry reachable; `pnpm install` completes |
| Prisma generation | PASSED | `prisma generate` runs against the local PostgreSQL dev database |
| Prisma migration execution | PASSED | Migrations applied to the local dev database |
| TypeScript full typecheck | PASSED | `tsc --noEmit` green for api/config/validation/services/web/mobile/desktop |
| ESLint | PASSED | Green for api and services |
| Unit/integration tests | BLOCKED | Vitest/runtime providers not set up in this session |
| Next.js production build | PASSED | `next build` green (web) |
| Vite production build | PASSED | `vite build` green (desktop) |
| Expo export | PASSED | `expo export --platform android` produces a valid HBC bundle |
| Tauri Rust build | BLOCKED | No Rust/cargo toolchain installed on this machine |
| Browser QA | NOT RUN | Playwright not installed in this session; smoke coverage done via Node fetch against the live API |
| Mobile QA | PARTIAL | Android export and typecheck green; no device/emulator run in this session |
| Production deployment test | BLOCKED | Provider/database infrastructure unavailable |

## Live end-to-end smoke (local dev database)

Verified against the running API on `http://localhost:4000`: signup 201, workspace create 201 (`type` field), device register 201 ACTIVE, website scan 201, scan-result notification of type `website_scan_completed`, release create/list/latest 200 (with `updateAvailable: true`), and a `push_delivery` job that transitioned QUEUED → SUCCEEDED (no-op without `EXPO_ACCESS_TOKEN`).

## Exact environment blockers

1. No Rust toolchain on this machine: `cargo check`/`tauri build` cannot run; desktop validation stops at Vite typecheck/build.
2. Browser-level QA (web/desktop) has not run in this session: Playwright is not installed. API behavior was verified with Node-fetch smoke tests against the live API.

## Required production configuration

At minimum configure:
- `DATABASE_URL`
- `SESSION_SECRET` (32+ characters)
- `ENCRYPTION_KEY` (32+ characters)
- `WEB_ORIGIN`
- Email delivery (`EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_SECRET`) or replace with a production email adapter.
- `GEMINI_API_KEY` and optionally `GEMINI_MODEL`.
- `PADDLE_API_KEY` + `PADDLE_PRO_PRICE_ID` + `PADDLE_BUSINESS_PRICE_ID` + `PADDLE_AGENCY_PRICE_ID` (+ `PADDLE_WEBHOOK_SECRET`) for billing. Without them the app runs on Free; checkout returns 503.
- Provider-specific social/business credentials and OAuth callback URLs before enabling those integrations.
- Production object storage credentials before enabling private asset storage.
- Push: `EXPO_ACCESS_TOKEN` on the API and `EXPO_PROJECT_ID`; clients need `EXPO_PUBLIC_PROJECT_ID` and `EXPO_PUBLIC_API_URL`. Without these the push job is a truthful no-op.
- `RELEASES_ADMIN_TOKEN` before using the admin release endpoints; `WORKER_POLL_MS` (default 1000) tunes the worker poll interval.

## Local validation sequence

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm dev
pnpm dev:web
```

Do not mark the blocked checks as passed until they have actually executed successfully in a dependency- and database-enabled environment.

## Launch-readiness verification (2026-09-13)

Executed against the real environment: Windows 11, Node.js v22.23.2, pnpm 10.12.1, PostgreSQL reachable via DATABASE_URL (localhost:5050), Rust stable 1.98.1 + MSVC Build Tools.

### Added
- Playwright browser QA suite at `apps/web/e2e` (`pnpm --filter @contentra/web test:e2e`), run headless Chromium against a production `next start` build and the live API. Covers: unauthenticated gating, signup/session, invalid/valid login, logout, onboarding completion + persistence, returning-user routing, workspace-type Business OS gating, full nav/deep-links, missing-content error state, back/forward, Ctrl+K search, workspace create/delete with typed-name confirmation, and security header assertions. **18/18 passing.**
- `apps/web/vitest.config.ts` scopes Vitest to `src/**` so the Playwright specs are not picked up by `pnpm test`.

### Fixed during the pass (real defects found by validation)
1. **Onboarding was un-completable for fresh accounts.** Signup created no workspace and onboarding had no workspace-creation affordance, so every save failed. Onboarding now auto-creates (`My workspace`, CREATOR) or picks an existing workspace on mount; the Continue control stays disabled until a workspace is resolved. (`apps/web/src/app/onboarding/page.tsx`)
2. **Workspace owner delete always failed in the UI.** The settings page used a plain `confirm()` and sent a DELETE without the API-required exact-name `confirmation` body (API 400 CONFIRMATION_REQUIRED). Delete now prompts for the exact workspace name and sends it as the confirmation body. (`apps/web/src/app/app/settings/workspaces/page.tsx`)
3. **API CORS omitted PUT.** `Access-Control-Allow-Methods` was `GET,POST,PATCH,DELETE,OPTIONS`, so browser onboarding saves (PUT with `x-workspace-id`) were blocked by CORS preflight and every save silently failed. PUT added. (`apps/api/src/server.ts`)
4. **Windows desktop build was blocked by a missing icon.** Generated `apps/desktop/src-tauri/icons/icon.ico` (256x256, brand mark); `tauri build` now completes.

### Green
- API tests (`apps/api/tests/security.test.ts`) 4/4; root `pnpm test` passes (api + web).
- Typecheck: api, web, mobile, desktop, core, types — all pass.
- Lint: api, core, types — clean.
- Web production build (`next build`) green; pages served with the configured security headers.
- Desktop `pnpm --filter @contentra/desktop tauri build` green; release exe + NSIS installer produced.
- `prisma validate` clean; `prisma migrate status` — database schema up to date (1 migration).

### Still external / environment-dependent
- Live Gemini, Paddle checkout, social/business publisher adapters, OAuth providers, and Expo push remain gated on real provider credentials (see README env vars). Physical device/mobile-native QA not run on this machine.
