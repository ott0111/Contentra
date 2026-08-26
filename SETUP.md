# Contentra Setup

Contentra is an app-first creator workspace. The public routes are intentionally lightweight; the authenticated product lives under `/dashboard`.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the values described below.
3. Start the app with `npm run dev`.
4. Open `http://localhost:3000`.

The local OAuth callbacks are:

```text
http://localhost:3000/api/platforms/youtube/callback
http://localhost:3000/api/platforms/instagram/callback
http://localhost:3000/api/platforms/tiktok/callback
http://localhost:3000/api/platforms/x/callback
```

Set the matching provider-specific redirect variable to the local URL when using an explicit override. If it is unset, the app builds the callback from `NEXT_PUBLIC_BASE_URL`, which defaults to `http://localhost:3000`.

## Supabase

1. Create a Supabase project.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Project Settings > API.
3. Set `SUPABASE_SECRET_KEY` to the server-only secret key. Never expose it in browser code or commit it.
4. Run migrations in order from `supabase/migrations/`.
5. In Authentication > URL Configuration, set the local site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback`.

## Environment variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_BASE_URL` are client-safe. The first two are required; the base URL is optional locally and should be set in production.

The following are server-only and must never be prefixed with `NEXT_PUBLIC_` or exposed to the browser:

```text
SUPABASE_SECRET_KEY
YOUTUBE_TOKEN_ENCRYPTION_KEY
OPENAI_API_KEY
YOUTUBE_OAUTH_CLIENT_ID
YOUTUBE_OAUTH_CLIENT_SECRET
YOUTUBE_OAUTH_REDIRECT_URI
META_APP_ID
META_APP_SECRET
INSTAGRAM_OAUTH_REDIRECT_URI
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
TIKTOK_OAUTH_REDIRECT_URI
X_CLIENT_ID
X_CLIENT_SECRET
X_OAUTH_REDIRECT_URI
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_ENVIRONMENT
PAYPAL_CREATOR_PLAN_ID
PAYPAL_PRO_PLAN_ID
PAYPAL_WEBHOOK_ID
```

`YOUTUBE_TOKEN_ENCRYPTION_KEY` is required for encrypted OAuth token storage and state signing. `OPENAI_API_KEY` is required only when AI features are enabled. PayPal keys are optional when billing is disabled. Provider credentials and redirect variables are required only for the corresponding integration.

## Vercel and custom domain

1. Import the repository into Vercel and use the default Next.js build settings: `npm run build`.
2. Add environment variables in Vercel Project Settings for Preview and Production as appropriate. Use the same server-only boundaries above.
3. Set `NEXT_PUBLIC_BASE_URL` to the real public origin, for example `https://app.example.com`. Do not use a placeholder or hardcode the production domain in source.
4. Add the custom domain in Vercel and wait for its DNS and certificate setup to complete.
5. Configure Supabase Authentication Site URL and redirect URLs for the real domain.
6. Configure each provider console with the corresponding HTTPS callback below.

For a real domain of `https://YOUR-DOMAIN`, the production callbacks are:

```text
https://YOUR-DOMAIN/api/platforms/youtube/callback
https://YOUR-DOMAIN/api/platforms/instagram/callback
https://YOUR-DOMAIN/api/platforms/tiktok/callback
https://YOUR-DOMAIN/api/platforms/x/callback
```

The application also supports explicit provider-specific redirect variables. Set them to the exact production callback when a provider console requires a fixed value. Otherwise, leave them unset and the app derives callbacks from `NEXT_PUBLIC_BASE_URL`.

Public developer-platform URLs are:

```text
https://YOUR-DOMAIN/
https://YOUR-DOMAIN/terms
https://YOUR-DOMAIN/privacy
```

Replace `YOUR-DOMAIN` only in deployment configuration and provider consoles. The source code does not assume a domain.

## OAuth provider setup

- YouTube requires a Google OAuth web client, the YouTube Data API, and the YouTube Analytics API.
- Instagram uses Meta OAuth and requires a Professional Instagram account linked to a Facebook Page.
- TikTok requires Login Kit approval and the scopes used by the integration.
- X requires OAuth 2.0 with `tweet.read`, `users.read`, and `offline.access`.

Third-party OAuth is not considered verified until the corresponding provider console is configured and a real connection flow succeeds.

## Verification

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

Check `/`, `/pricing`, `/terms`, `/privacy`, `/login`, and `/signup` without an account. `/dashboard` and its child routes redirect unauthenticated users to `/login`; authenticated users without a completed profile are sent through onboarding.

The deployment still requires real Vercel, Supabase, domain, billing, AI, and developer-console configuration. No deployment is performed by this repository setup.