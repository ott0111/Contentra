# Contentra — Operator Runbook

Common production operations. All commands assume a POSIX/PowerShell shell on the deployment host with the workspace checked out and env injected.

## 1. Health checks

```bash
curl -fsS https://api.contentra.app/health          # expect {"data":{"status":"ok",...}}
curl -fsS https://api.contentra.app/api/v1          # API banner
curl -fsSI https://contentra.app/                    # expect HSTS + nosniff + X-Frame-Options
```

The API logs structured JSON to stdout (`LOG_LEVEL`). Every response carries `requestId` (`req_...`) — use it to correlate stack traces.

## 2. Smoke suite (production mode)

```bash
# 1) database is migrated
DATABASE_URL=... pnpm --filter @contentra/api exec prisma migrate status --schema=../../prisma/schema.prisma
# expect: "Database schema is up to date!"

# 2) API boot + core flows
# Start API (NODE_ENV=production) with API_ORIGIN/WEB_ORIGIN/APP_ORIGINS set to public values, then:
curl -fsS -X POST https://api.contentra.app/api/v1/auth/signup \
  -H 'content-type: application/json' -H 'origin: https://contentra.app' \
  -d '{"email":"ops-test@example.com","password":"CorrectHorseBattery!123","name":"Ops"}' \
  -o /dev/null -w '%{http_code}\n'            # 201, + Set-Cookie httpOnly Secure
# 3) auto-flow: create workspace + complete onboarding (POST /workspaces, PUT /onboarding)
# 4) releases endpoint responds
curl -fsS 'https://api.contentra.app/api/v1/releases/latest?platform=web&version=1.0.0'
# 5) CORS preflight from the real origin returns allow-origin for that origin and no header for others
```

## 3. Migrations

Use only the deploy command on shared/prod databases:

```bash
DATABASE_URL=... pnpm --filter @contentra/api exec prisma migrate deploy --schema=../../prisma/schema.prisma
```

If a migration fails and you must roll it back before re-deploy (e.g. a buggy migration was recorded):

```bash
DATABASE_URL=... pnpm --filter @contentra/api exec prisma migrate resolve --schema=../../prisma/schema.prisma --rolled-back <migration_name>
# fix the migration.sql, then re-run migrate deploy
```

Reference data is shipped as a migration (`20260914000000_seed_reference_data`), so nothing needs manual seeding after deploy.

## 4. Worker

```bash
pnpm --filter @contentra/api worker          # dev
node dist/worker.js                          # production (compiled)
```

- One or more replicas; claims are atomic so no job runs twice.
- `WORKER_POLL_MS` (default 1000) controls poll cadence.
- Retries: exponential up to 1 h, max 5 attempts, then `FAILED` (visible in the `Job` table).
- Graceful shutdown on SIGTERM/SIGINT (drains in-flight job, 5 s guard).
- Job flow example: `api` enqueues `push_delivery`; worker sends; on `failed` status it retries with backoff.

## 5. Logs and debugging

- Standard log querying by `requestId`.
- Redaction list covers `authorization`, `cookie`, `api-key` request headers and `set-cookie` response headers.
- Provider unavailability is explicit and honestly reported:
  - `AI_NOT_CONFIGURED`, `PROVIDER_NOT_CONFIGURED`, `STORAGE_NOT_CONFIGURED`, `RATE_LIMITED`, `BILLING_NOT_CONFIGURED`-style 503s.
- If storage endpoints throw `STORAGE_NOT_CONFIGURED` in production, object storage is not configured (or `STORAGE_PROVIDER=local` was not set).

## 6. Rate limiting behavior

- Auth-family endpoints: 10 req / 60 s / IP / path (in-process). 429 body: `{"error":{"code":"RATE_LIMITED",...}}`.
- Budget resets 60 s after first request; each API process has its own budget.
- Production: put a distributed edge limiter in front (CDN/API gateway) — required, see `docs/production.md` §5.

## 7. SSLTrust/HTTPS & proxy

- TLS terminates at the edge. API behind it must set `TRUST_PROXY=1` so `X-Forwarded-For` is honored for the rate limiter and remote-address logging. Do NOT set it when the API is directly exposed.
- Cookies are `Secure` always; don't terminate TLS next to the API over cleartext for clients.

## 8. Backups & restores

- Database: use the managed provider's automated backups + point-in-time recovery; nightly logical dump recommended for offsite copies.
- `ENCRYPTION_KEY`: keep offsite backup — losing it makes stored OAuth tokens undecryptable.
- Object storage: enable provider-side versioning + lifecycle rules on `contentra` bucket.
- Restore drill: restore dump to a scratch DB, run `migrate status`, start a read-only API pointing at it.

## 9. Release publishing

Publish a `Release` row so clients show the "What's new" notice:

```bash
curl -fsS -X POST https://api.contentra.app/api/v1/releases \
  -H 'authorization: Bearer $RELEASES_ADMIN_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"platform":"web","version":"1.0.1","required":false,"title":"...","changelog":{"features":["..."]}}'
```

`GET /api/v1/releases/latest?platform=...&version=...` is public and drives client banners. Admin CRUD is token-gated.

## 10. Common incidents → actions

| Symptom | Likely cause | Action |
|---|---|---|
| 503 `AI_NOT_CONFIGURED` / `PROVIDER_NOT_CONFIGURED` | env missing on the API/worker | set provider credential, redeploy API |
| `Storage NOT_CONFIGURED` errors | S3 env missing (or `STORAGE_PROVIDER` unset) | configure bucket creds; verify endpoint reachability |
| 429 on auth | rate limit (in-process or edge) | confirm no loop; tune edge bucket |
| `Job` stuck `PROCESSING` | worker crash mid-job (older version) or signal | restart worker; re-queue manually if `startedAt` stale and attempts < max (or bump `availableAt`) |
| Web shows wrong API host | misbuilt `NEXT_PUBLIC_API_URL` | rebuild with public URL (never bake secrets) |
| Duplicate deliveries across workers | pre-graceful-shutdown version | upgrade worker (claims are atomic now) |