# Contentra — Deployment Guide

> Status: **NOT YET DEPLOYED TO A LIVE PLATFORM.** This document is the runbook for go-live. It reflects verified code paths (fresh-DB `prisma migrate deploy`, `NODE_ENV=production` API+worker, production CORS/session/logging, production web bundle) but no real DNS, hosting, TLS, or customer credentials have been provisioned. Blocks that require external accounts/domains are marked **[external]**.

## 1. Topology

| Service | Image/artifact | Port(s) | Notes |
|---|---|---|---|
| web | Next.js (output from `apps/web`, `next start`) | 3000 | behind HTTPS edge; env: `NEXT_PUBLIC_API_URL` |
| api | Fastify (`apps/api`, `node --import tsx src/server.ts`) | 4000 (external = 443 via edge) | behind HTTPS edge with `TRUST_PROXY=1`; CORS `APP_ORIGINS` |
| worker | same package (`src/worker.ts`) | none | ≥1 replica, same `DATABASE_URL`/`ENCRYPTION_KEY` |
| postgres | managed provider **[external]** | — | TLS, pooled, backed up |

Recommended: a managed platform (see §5). Everything is containerizable (§4, reference Dockerfiles — unvalidated build: Docker is not installed in the dev environment).

## 2. Prerequisites check (operator)

- [] DNS for `contentra.app` (+ `www`) and `api.contentra.app` (A/AAAA to edge) **[external]**
- [] TLS certificates at the edge **[external]**
- [] Managed PostgreSQL instance reachable over TLS **[external]**
- [] All server-only secrets prepared (see `docs/providers.md`) **[external]**
- [] Edge rate limiting + monitoring/alerting **[external]**

## 3. Database migrate (migration path — verified locally)

```powershell
# uses DATABASE_URL from the Docker/deploy environment
pnpm --filter @contentra/api exec prisma migrate deploy --schema=../../prisma/schema.prisma
```

- Only `migrate deploy` on shared/prod DBs. `migrate dev` is for local development.
- The migration set is: `20260913194708_baseline`, `20260914000000_seed_reference_data`. The latter inserts the FREE/PRO/BUSINESS plans + entitlements (idempotent).
- After deploy, run `migrate status` and confirm `up to date`, then health-check the API.

## 4. Builds & artifacts

### 4.1 Web

```powershell
# production build with the real public API URL (required, otherwise localhost default leaks)
$env:NEXT_PUBLIC_API_URL = "https://api.contentra.app"
$env:NEXT_PUBLIC_DEVELOPMENT_PREVIEW = "0"
pnpm --filter @contentra/web build
```

Verified: this bundle contains zero localhost API references and the real API URL. Do not bake secrets into `NEXT_PUBLIC_*`.

### 4.2 API

```powershell
pnpm --filter @contentra/api build   # tsc -> dist (run via node dist/server.js)
```

The dev script uses `--import tsx` (ts sources, no watch). For production you can run compiled output or tsx; both are supported. Prefer `node dist/server.js` (build output) with environment injected by the platform.

### 4.3 Worker

Compile as API, then run `node dist/worker.js` (or `tsx src/worker.ts`). Same env as the API.

### 4.4 Desktop / Mobile

- Desktop: `pnpm --filter @contentra/desktop tauri build` with `VITE_API_URL=https://api.contentra.app`. NSIS installer bundles the production URL. No updater pipeline is configured yet.
- Mobile: EAS build with `EXPO_PUBLIC_API_URL=https://api.contentra.app` and `EXPO_PUBLIC_PROJECT_ID` (Expo project) **[external]**.

## 5. Platform options

### Managed (recommended), pick one:
- **Azure** (via `azure` deploy tooling): Web App / Container Apps for web; Container Apps or Functions for api+worker; Azure Database for PostgreSQL; Key Vault for secrets; Front Door / Application Gateway for TLS + edge rate limiting.
- **Railway/Render/Fly.io**: three services (web, api, worker) + managed Postgres; set the env vars in the dashboards; connect TLS at their edge.
- **Vercel + external**: Vercel for web; a container host for api/worker.

Env injection must set at minimum:
`NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `WEB_ORIGIN=https://contentra.app`, `APP_ORIGINS=https://contentra.app,https://www.contentra.app`, `API_ORIGIN=https://api.contentra.app`, `NEXT_PUBLIC_API_URL=https://api.contentra.app`, `NEXT_PUBLIC_DEVELOPMENT_PREVIEW=0`, `PORT`, `LOG_LEVEL=info`, `TRUST_PROXY=1`, `RELEASES_ADMIN_TOKEN`, and any provider vars from `docs/providers.md`.

### Self-host
Reference artifacts in `infrastructure/` (§4 Dockerfiles, marked **unvalidated**). Build images on the deploy host with Docker; wire a reverse proxy (Caddy/Nginx) for TLS; run the worker as a 2nd container/service; provide Postgres backing storage.

## 6. Go-live checklist

1. Create hosting accounts, DNS records, manage Postgres **[external]**
2. Provision secrets per provider **[external]**
3. Deploy DB: `prisma migrate deploy` + `migrate status`
4. Deploy api + worker; verify `GET /health`, `GET /api/v1`
5. Deploy web (production build with real `NEXT_PUBLIC_API_URL`); verify headers + no localhost refs
6. Set `APP_ORIGINS`; run a browser preflight OPTIONS from the real origin
7. Live smoke suite (`docs/runbook.md` §2) against the public API
8. Wire edge rate limiting + monitoring + backups **[external]**
9. Publish first Release row so clients show the correct version notice

## 7. Deploying changes (rollout)

- Schema-change deployments: commit migration, run `migrate deploy` as part of the release, then deploy api/worker/web.
- Web + API are independent; mobile/desktop ship via their stores/build pipeline.
- Never deploy a web build whose `NEXT_PUBLIC_API_URL` doesn't match the current API origin.