# Contentra — Third-Party Provider Integration Guide

Status: **NO LIVE CREDENTIALS CONFIGURED.** Every provider below currently reports a truthful "not configured" state; the API never fakes an account, metric, subscription, delivery, or key. This document lists exactly what each provider needs before it can be connected, and what the API returns while it is not.

General rules:
- Secrets are server-only (`SESSION_SECRET`-adjacent env vars). Never use `NEXT_PUBLIC_/EXPO_PUBLIC_/VITE_` for them.
- Redirect URIs you register in provider dashboards must match zone-exactly `API_ORIGIN + /api/v1/integrations/social/<platform>/callback` (e.g. `https://api.contentra.app/api/v1/integrations/social/instagram/callback`).
- Missing credentials → request-time truth; never store fake tokens or fake deliveries.

## 1. AI — Google Gemini

- Env: `GEMINI_API_KEY` (server-only), `GEMINI_MODEL` (default `gemini-2.5-flash`).
- Portal: Google AI Studio / Gemini API console **[external]**; keep the key out of any bundle.
- Not configured: AI endpoints return HTTP 503 `AI_NOT_CONFIGURED`. No AI output is fabricated.
- Live verification: run `POST /api/v1/workspaces/:id/ai/actions` and confirm a real model response and `AIUsage` accounting.

## 2. Billing — Stripe

- Env: `STRIPE_SECRET_KEY` (live or test per environment), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`.
- Portal: Stripe dashboard → Products (create recurring Pro $19.99/mo and Business $49.99/mo, copy price IDs), Developers → API keys, Webhooks → create endpoint `API_ORIGIN/api/v1/webhooks/stripe` with `checkout.session.completed` / `customer.subscription.*` events, copy `whsec_` secret.
- Semantics: checkout returns 503 while price IDs are unset; webhook events are signature-verified (timestamp + HMAC, 300 s tolerance) and only then do subscription/plan states change.
- Never mix test/live keys across environments.

## 3. Push notifications — Expo

- Env: `EXPO_ACCESS_TOKEN` (server-only).
- Portal: Expo dashboard → project; also set client-side `EXPO_PUBLIC_PROJECT_ID`.
- Not configured: push job resolves `not_configured`; no delivery is sent.
- Requires `ENCRYPTION_KEY` so device tokens can be stored encrypted.

## 4. Email — webhook sender

- Env: `EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_SECRET`.
- Semantics: verification/reset/invite emails are POSTed to the webhook URL signed with the secret; auth flows never leak whether an address is registered (`forgot-password` always returns `accepted: true`). While unconfigured, deliveries are reported `pending` and no message is fabricated.

## 5. Object storage — S3-compatible

- Env: `STORAGE_ENDPOINT`, `STORAGE_BUCKET` (default `contentra`), `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`.
- Production fails closed: without these vars the API throws `STORAGE_NOT_CONFIGURED` rather than silently using the local disk, unless `STORAGE_PROVIDER=local` is set explicitly (single-instance self-host only).
- Endpoint must be reachable by the API (private network or public with locked-down keys).

## 6. Social OAuth — Instagram, TikTok, YouTube, X

Env pattern per provider `P` in `{instagram, tiktok, youtube, x}`:
`P_CLIENT_ID`, `P_CLIENT_SECRET`, `P_AUTHORIZATION_ENDPOINT`, `P_TOKEN_ENDPOINT`, `P_PROFILE_ENDPOINT`, `P_POSTS_ENDPOINT`, `P_METRICS_ENDPOINT`, `P_AUDIENCE_ENDPOINT`, `P_PUBLISH_ENDPOINT`, `P_REVOCATION_ENDPOINT`, `P_REDIRECT_URI`, `P_SCOPES`, `P_CAPABILITIES`.

Portal setup per platform (all **[external]**, exact menus change):
- **Instagram**: Meta for Developers → Instagram → "Create app" (Business type), Basic Display / Graph API product; set redirect URI; request `user_profile`, publish & insights permissions; app review may be required for publishing.
- **TikTok**: TikTok for Developers → create app → Content Posting API / Display API; approved redirect URI; `user.info.basic`, `video.upload` etc.
- **YouTube**: Google Cloud Console → OAuth credentials (Web app) → approved redirect URI; YouTube Data API v3 + consent screen; `youtube.readonly`, `youtube.upload`, `youtube.force-ssl` as granted.
- **X**: X Developer portal → app → OAuth 2.0; `tweet.read`, `tweet.write`, `users.read`, `offline.access`.

Not configured: `POST /integrations/social/<platform>/connect` → HTTP 503 `PROVIDER_NOT_CONFIGURED`. No authorization URL is produced and no state is created.

Security properties already hardcoded:
- OAuth `state` is an HMAC-signed payload bound to the initiating session + nonce, 10 min expiry, claimed exactly once (event idempotency).
- Access/refresh tokens are stored AES-256-GCM encrypted at rest (`ENCRYPTION_KEY`).
- Refresh failures transition to `REAUTH_REQUIRED`; never silent fake success.

## 7. Verification matrix to run on go-live

1. `GEMINI_API_KEY` → AI request returns content + credit change.
2. Stripe TEST checkout → succeeds → webhook → subscription `active`; price change reflected on `/billing`.
3. Each social platform → connect → authorize → callback stores encrypted token → `integrations` shows `connected`.
4. Email webhook target receives verification/reset to a real inbox.
5. `EXPO_ACCESS_TOKEN` + a registered device → push job `sent`.
6. Storage: upload asset → object appears in bucket, signed URL valid.
All of the above are **blocked** until real credentials are provisioned; none can be faked.