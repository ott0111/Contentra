# Contentra — Production Operating Guide

Target domain: `https://contentra.app` (web) and `https://api.contentra.app` (API). Replace with the actual configured domains wherever they differ.

## 1. Architecture

Centralized architecture: **Web** (Next.js) + **Mobile** (Expo) + **Desktop** (Tauri) all talk to one **Contentra API** (Fastify + Prisma + PostgreSQL). Background work runs in the **worker** process using the same PostgreSQL-backed job queue. There is no separate queue service.

```
browser / mobile / desktop  →  https://api.contentra.app  →  PostgreSQL
                                        │
                                        ├─ push (Expo)
                                        ├─ email (webhook)
                                        ├─ AI (Gemini)
                                        ├─ billing (Paddle)
                                        ├─ social OAuth (IG/TikTok/YT/X)
                                        └─ object storage (S3-compatible)
                     worker  →  same Job queue in PostgreSQL
```

**Processes that must run in every environment:**
1. **web** — Next.js server (production build, `next start`). Static export is not used.
2. **api** — HTTP service on `PORT` (default 4000).
3. **worker** — one or more replicas consuming the `Job` queue (`pnpm --filter @contentra/api worker`). Handlers currently registered: `push_delivery`, `cleanup`.

## 2. Environment separation (verified)

- **Server-only vars** (API/worker): `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, all `*_CLIENT_SECRET`, `PADDLE_*`, `GEMINI_API_KEY`, `EMAIL_WEBHOOK_*`, `STORAGE_*`, `EXPO_ACCESS_TOKEN`, `RELEASES_ADMIN_TOKEN`, `ADMIN_ROOT_EMAIL`, `PORT`, `LOG_LEVEL`, `TRUST_PROXY`, `WORKER_POLL_MS`, `CREDIT_COST_*`.
- **Client-exposed vars** (embedded in bundles): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DEVELOPMENT_PREVIEW`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_PROJECT_ID`, `VITE_API_URL`. Never put secrets in these.
- Reference copies: root `.env.example`, plus `apps/api/.env.example`, `apps/web/.env.example`, `apps/mobile/.env.example`, `apps/desktop/.env.example`.
- **Preview gate**: `NEXT_PUBLIC_DEVELOPMENT_PREVIEW=1` is honored only when the bundle is built with `NODE_ENV=development`/`test`. A production build (`next build`) can never enable the preview environment. This was verified by building the production bundle and confirming the gate code path.

## 3. This is NOT yet a live deployment

As of this document, no production infrastructure, DNS/HTTPS, or provider credentials exist. Everything below is the verified production **code path**: `prisma migrate deploy` on a fresh database, `NODE_ENV=production` API + worker, production CORS/session/logging behavior, and a production web bundle with the real API URL. See `docs/deployment.md` for the go-live steps this machine cannot perform (DNS, hosting, credentials).

## 4. Database

- Connection: `DATABASE_URL` (required, TLS in production).
- **Migrations**: ALWAYS `prisma migrate deploy`. Never `migrate dev` against a shared/production database.
  `pnpm --filter @contentra/api exec prisma migrate deploy --schema=../../prisma/schema.prisma`
- **Reference data**: plans/entitlements are shipped as a data migration (`prisma/migrations/20260914000000_seed_reference_data/migration.sql`). Workspace creation connects a default `Plan -> Subscription`, so a fresh prune-deployed DB is fully functional without manual seeding.
- Migrations applied and verified: `20260913194708_baseline`, `20260914000000_seed_reference_data` (fresh db created, both deployed, `migrate status` = up to date).
- Recommended production posture: managed Postgres with TLS, connection pooling (e.g. PgBouncer), automated backups, isolated non-superuser credentials, and restricted network access. Backups/restores are operator tasks documented in `docs/runbook.md`.

## 5. Session and authentication

- Cookie `contentra_session`: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30 days). Session tokens are random 32-byte values stored hashed (SHA-256) in `Session`.
- `Secure` is always set, which is correct behind HTTPS terminators.
- During dev over plain HTTP on `localhost` browsers accept the Secure cookie (localhost is a secure context).
- Token expiry: email verification 24 h, password reset 1 h, workspace invites 7 days.
- Login/signup responses never reveal whether an email exists (`forgot-password` always returns `accepted: true`; email is only sent when an email sender is configured).
- Passwords: argon2, minimum 12 characters.

### Rate limiting (in-process; NOT a substitute for an edge limiter)

`RATE_LIMITED_PATHS` = `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`. Window 60 s, max 10 requests per IP per path → HTTP 429 `RATE_LIMITED`. State is in-memory per API process, so each process has its own budget.

**Production requirement (blocker):** place a distributed/custom rate limiter at the edge (e.g. CDN/API gateway) to cover all endpoints and preserve budget across replicas.

## 6. CORS (verified)

- Allowlist comes from `APP_ORIGINS` (comma-separated); falls back to `WEB_ORIGIN`, then `http://localhost:3000`. Only origins in the list receive CORS headers; credentials allowed; `vary: Origin`; OPTIONS short-circuits 204.
- **Production requirement (blocker):** set `APP_ORIGINS=https://contentra.app,https://www.contentra.app` (and `WEB_ORIGIN`) at deploy time. No wildcard is used now or allowed.
- `API_ORIGIN` must be the public API origin; it builds OAuth `redirect_uri`s.

## 7. HTTPS / origin URLs / leak audit

- Web responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` (camera/mic/geolocation blocked) via `apps/web/next.config.mjs`.
- HTTPS termination at the edge (TLS provider/plat-platform); the API should run behind it with `TRUST_PROXY=1` so rate limiter/IP log honor `X-Forwarded-For`. Only enable when the proxy is trusted.
- **Verified**: a production web bundle built with `NEXT_PUBLIC_API_URL=https://api.contentra.app` contains **zero** `localhost`/`127.0.0.1` references to the API and bakes the real URL. Dev defaults remain only in source and are overridden by env at build time.
- API link-building uses `WEB_ORIGIN` (verification/reset/invite/Paddle success+return). Any stale default in prod would send users invalid links; deploy tools must inject the real origins.

## 8. Secrets and logging

- Never committed: `.env*` is gitignored (only `.env.example` allowed). Production secrets are injected by the deploy tool; never hardcode.
- `ENCRYPTION_KEY` encrypts stored OAuth tokens at rest (AES-256-GCM). It must be stable per environment and backed up; rotation means re-linking external accounts.
- `SESSION_SECRET` signs OAuth `state` (anti-CSRF) — a distinct role from the DB-backed sessions.
- API pino logging is configured with **redaction** for `authorization`, `cookie`, `api-key` headers, and `set-cookie` response headers. Error logs include `requestId`; webhook errors log event id only. Worker uses console. No secrets are logged by verified paths.

## 9. Background worker

- Loop: poll `Job` table (`QUEUED` and `availableAt <= now`), drain while work exists, `WORKER_POLL_MS` poll interval.
- **Atomic claim**: a job is claimed via conditional `updateMany` (succeeds only if still `QUEUED`), preventing duplicate processing when multiple workers run.
- Retry/backoff: exponential `2^attempts` s capped at 1 h, max 5 attempts, then `FAILED`.
- Idempotency: unique `idempotencyKey`; duplicate enqueue returns existing (P2002 swallowed).
- **Graceful shutdown**: `SIGTERM`/`SIGINT` stop polling, let the in-flight job finish (guarded, exits after 5 s max).
- Handlers registered: `push_delivery`, `cleanup` (expires sessions/tokens/opportunities/recommendations and `nextBestAction`s).

## 10. SSRF protection for the website scanner (verified)

`apps/api/src/services/website.ts`:
- Blocks `localhost*`, `metadata.google.internal`, private/reserved ranges (RFC1918, loopback, link-local, CGNAT `100.64/10`, `0.0.0.0/8`, `192.0.0.0/24`, `198.18/15`, TEST-NET, multicast, `::1`, ULA, link/site-local, IPv4-mapped forms).
- Restricts schemes to `http:`/`https:` and ports to 80/443.
- **DNS-rebinding pinning**: each connection is pinned to the exact public address validated at resolve time via a custom `lookup`, so a hostname that flips to an internal address between validation and connect is not followed. Redirect targets are re-validated identically (max 3), 10 s timeout, 1.5 MB cap, `text/html` only.

## 11. Providers — truthful unprovisioned behavior

Without credentials, the API **fails honestly**; it never fabricates connected accounts, metrics, subscriptions, or deliveries. Exact codes and per-provider setup are in `docs/providers.md`.

- AI → HTTP 503 `AI_NOT_CONFIGURED`
- Social connect → HTTP 503 `PROVIDER_NOT_CONFIGURED`
- Paddle checkout → HTTP 503 `BILLING_NOT_CONFIGURED` (Paddle key or price IDs unset); the app keeps running on Free. Invalid/absent Paddle webhook signature → 401 `INVALID_PADDLE_SIGNATURE`, no state change; events idempotent per event id.
- Email → sender null; deliveries reported `pending`; `forgot-password` accepts without sending
- Push → delivery status `not_configured`
- Storage (S3-compatible) → production now **fails closed** (`STORAGE_NOT_CONFIGURED`) instead of silently falling back to the local disk unless `STORAGE_PROVIDER=local` is explicitly chosen (single-instance self-host only)

## 12. Releases / client versioning

- All packages and app manifests are aligned at **1.0.0** (web/mobile/desktop/api/packages/services; `mobile/app.json`, `tauri.conf.json`, and each client's release-check version).
- Release manifest lives in the DB (`Release`), edited via `POST/DELETE /api/v1/releases` with `RELEASES_ADMIN_TOKEN` (Bearer).

## 13. Health and monitoring

- `GET /health` → `{ data: { status: "ok", service: "contentra-api" } }` (unauthenticated; used by load balancer/probes).
- `GET /api/v1` → API capability banner.
- Structured JSON logs (pino) on stdout; direct `LOG_LEVEL`.
- No metrics exporter or tracing is wired yet (documented gap for the hosting platform's monitoring).

## 14. Known gaps / operator to-dos

1. Edge rate limiter (distributed) — required for shared traffic.
2. Hosting platform monitoring/alerting (CPU, memory, uptime probes, log shipping).
3. Real provider credentials + live smoke tests (see `docs/providers.md`).
4. DNS + TLS + CORS origin finalization for `contentra.app`.
5. Backups (DB) and restore drills.
6. Remote production DB — verified locally only; go-live on real managed Postgres is pending.