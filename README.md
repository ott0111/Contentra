# Contentra — Part 1 Backend Foundation

Production-oriented monorepo scaffold for Contentra. The root product is application-first; this phase deliberately excludes the final visual frontend.

## Architecture

Clients (web/mobile/desktop) → centralized Contentra API → core services → PostgreSQL/object storage/external providers.

The backend owns authentication, workspace authorization, billing entitlements, AI usage, integrations, publishing state, analytics normalization and business-data access.

## Current state

This repository was created from the supplied Part 1 specification because no pre-existing repository was available in the workspace. External credentials and infrastructure (PostgreSQL, object storage, OAuth provider credentials, Gemini, billing/email providers) must be supplied before those adapters can operate against live systems.

## Commands

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm typecheck
pnpm test
pnpm build
```

## Security invariants

* Workspace resources are always resolved from authenticated membership, never trusted from arbitrary client identity claims.
* Permission checks are centralized.
* Integration secrets are encrypted at rest and never returned to clients.
* API keys are stored as hashes.
* Webhook signatures are verified before processing.
* Production errors never expose stack traces, secrets or database internals.
