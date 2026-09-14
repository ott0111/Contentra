# Cross-platform architecture

Web, Expo mobile, and Tauri Windows clients call the existing Contentra API. The API is the only source of truth for authentication, workspace authorization, onboarding, content, library, calendar, analytics, AI, billing, and integrations.

Clients may persist a non-sensitive workspace selection. They must not persist server credentials, database credentials, Stripe secrets, Gemini keys, OAuth refresh tokens, encryption keys, or session tokens. A workspace header provides context only; server membership validation remains authoritative.

The one documented exception is the Expo client: React Native's fetch has no cookie jar, so `apps/mobile/src/api.ts` stores the API `contentra_session` cookie in SecureStore (OS keychain/keystore) and replays it as a `cookie` header. Web, desktop, and the API itself keep the HttpOnly cookie exactly as issued. Session tokens never enter plain AsyncStorage, logs, or analytics.

All products use Contentra terminology: Home, Blitz, Create, Content, Library, Calendar, Analytics, and Contentra AI. Empty states deliberately explain missing source data rather than manufacture metrics or social activity.

Onboarding state is read and written through the workspace onboarding endpoint at every step. Content updates create versions through the existing content service; schedules use the Calendar API and clients display local date/time before the API normalizes it. Billing and OAuth begin at backend routes and are confirmed only after a backend-state refresh.
