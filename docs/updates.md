# Release and update system

The API owns release metadata. Admin-only endpoints (`POST`/`GET`/`DELETE /api/v1/releases`, guarded by the `RELEASES_ADMIN_TOKEN` bearer credential) create, list, and delete `Release` records. `GET /api/v1/releases/latest?platform=web|windows|android|ios&version=x.y.z&buildNumber=n` is public and returns only client-safe metadata, whether an update exists, and whether it is required.

All three clients render a release-notice banner fetched from `/api/v1/releases/latest` and persist the dismissed state locally (web/desktop: `localStorage`, mobile: SecureStore). Web clients reload only after warning about unsaved work. Expo clients use `expo-updates` for JavaScript/OTA updates; entries requiring a native binary must be marked store-required in platform metadata and open the appropriate store. Tauri uses the official signed updater only: set a HTTPS endpoint and updater public key in production configuration, and keep `TAURI_SIGNING_PRIVATE_KEY` only in CI. The checked-in desktop config deliberately leaves the updater inactive until a signed production endpoint is configured; the desktop notice card intentionally offers no download link because release metadata contains no artifact URL.

## Push delivery

Push registrations are encrypted server-side (`ENCRYPTION_KEY`) and hashed for lookup. Mobile requests permission only when the user enables push, submits an Expo device token to `POST /api/v1/workspaces/:workspaceId/devices`, and revokes on disable or sign-out. `/api/v1/devices` records are decrypted per delivery.

Delivery runs through the database-backed job queue: `createNotification` (with `push: true`), website scan results, and social sync completion enqueue `push_delivery` jobs consumed by `pnpm --filter @contentra/api worker` (`WORKER_POLL_MS`, default 1000). The worker is a documented no-op when `EXPO_ACCESS_TOKEN` is unset — `sendPushToWorkspace` reports truthful `not_configured | no_devices | sent | partial | failed` statuses and never claims a fake send. Real delivery requires `EXPO_ACCESS_TOKEN` on the API plus `EXPO_PUBLIC_PROJECT_ID` on clients.
