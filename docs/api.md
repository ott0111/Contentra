# API contract

Base path: `/api/v1`

Domains: `/auth`, `/users`, `/workspaces`, `/brand`, `/content`, `/ideas`, `/library`, `/calendar`, `/analytics`, `/trends`, `/opportunities`, `/recommendations`, `/ai`, `/integrations`, `/campaigns`, `/billing`, `/notifications`, `/settings`.

All protected endpoints validate input, authenticate, resolve workspace, authorize, execute, and serialize a stable DTO.

Example response envelope:

```json
{"data":{},"requestId":"req_..."}
```

Example error envelope:

```json
{"error":{"code":"FORBIDDEN","message":"You do not have permission for this operation."},"requestId":"req_..."}
```

## Part 3 API surface

Authentication:
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

Workspace/content:
- `GET/POST /api/v1/workspaces`
- `GET/PATCH/DELETE /api/v1/workspaces/:workspaceId`
- `GET /api/v1/workspaces/:workspaceId/home`
- `GET/POST /api/v1/workspaces/:workspaceId/content`
- `GET/PATCH/DELETE /api/v1/workspaces/:workspaceId/content/:contentId`
- `GET/POST/PATCH /api/v1/workspaces/:workspaceId/calendar`
- `GET/PUT /api/v1/workspaces/:workspaceId/onboarding` — reads or saves resumable onboarding state; `PUT` accepts current step, workspace type, niche, goals, connection/import choices, preferences, and `completed`.
- `GET/POST /api/v1/workspaces/:workspaceId/library/collections`
- `PATCH/DELETE /api/v1/workspaces/:workspaceId/library/collections/:collectionId`
- `POST /api/v1/workspaces/:workspaceId/library/collections/:collectionId/items`
- `DELETE /api/v1/workspaces/:workspaceId/library/collections/:collectionId/items/:contentId`
- `GET/POST/PATCH /api/v1/workspaces/:workspaceId/campaigns`
- `GET/POST/DELETE /api/v1/workspaces/:workspaceId/api-keys`
- `POST /api/v1/workspaces/:workspaceId/content/:contentId/versions/:versionId/restore` appends a restored version; it never overwrites history.
- `POST /api/v1/workspaces/:workspaceId/calendar/:id/cancel` is idempotent and does not delete content.
- `GET/POST/DELETE /api/v1/workspaces/:workspaceId/devices` registers/revokes encrypted mobile push tokens.
- `GET /api/v1/workspaces/:workspaceId/notifications` lists notifications; `POST /api/v1/workspaces/:workspaceId/notifications/:id/read` marks one read.
- `GET /api/v1/releases/latest?platform=&version=&buildNumber=` returns a platform-filtered update manifest (public).
- `GET /api/v1/releases` lists releases; `POST /api/v1/releases` creates one; `DELETE /api/v1/releases/:version` removes it. All three are admin-only and require the `RELEASES_ADMIN_TOKEN` bearer credential.
- `GET/POST/DELETE /api/v1/workspaces/:workspaceId/webhooks`

Business API:
- Bearer API keys are required.
- Scopes are checked before data access.
- `customers:read`, `leads:read`, `products:read`, and `analytics:read` endpoints are workspace-scoped.

Security:
- Browser sessions use HTTP-only Secure SameSite cookies.
- Workspace authorization is enforced server-side.
- API secrets are stored as hashes.
- API-key create/revoke, version restore, calendar cancellation, and workspace deletion are audit logged. Workspace deletion is owner-only and requires an exact-name confirmation body.
- Webhook secrets are encrypted at rest and signatures are checked with constant-time comparison.
- Website scanning validates DNS destinations and revalidates every redirect to prevent SSRF against private address space.

## Gap-closure endpoints

All endpoints below require an authenticated browser session and workspace membership. Reads require `content.read` or `workspace.read`; writes require the corresponding workspace/content write permission.

### Onboarding

`GET /api/v1/workspaces/:workspaceId/onboarding` returns `{ state, completedAt }`. `PUT` saves a validated partial journey and marks the workspace onboarded only when `completed: true`. This lets a user leave and resume without relying on client-only state.

### Library collections

Collections are workspace-scoped saved-content groups. Creating a collection accepts `{ name, description? }`; adding an item accepts `{ contentId }`. An item must be content owned by the same workspace. List supports optional `?q=` collection-name search and includes item counts plus the saved content needed by the Library UI. Cross-workspace collection and content IDs return `404` rather than exposing either record.

### Social OAuth connections

Social connections are available for the configured `instagram`, `tiktok`, `youtube`, and `x` providers. They require an authenticated browser session, a workspace ID, and the `integrations.manage` permission.

- `GET /api/v1/workspaces/:workspaceId/integrations` requires `integrations.read` and returns safe account status: provider, account/profile fields, scopes, expiry, status, and non-secret error metadata. It never returns OAuth credentials.
- `POST /api/v1/workspaces/:workspaceId/integrations/social/:provider/connect` creates a short-lived, signed, single-use connection attempt and returns `{ provider, authorizationUrl, expiresAt }`. The client must navigate to `authorizationUrl`; it must not construct provider URLs itself.
- `GET /api/v1/integrations/social/:provider/callback` is the registered provider callback. It requires the same signed-in browser session and accepts provider `state` and `code`. State is bound to the initiating user and session, workspace, provider, action, and expiry. Invalid, expired, replayed, cross-provider, or no-longer-authorized attempts are rejected. A successful response returns only safe connection metadata.
- `DELETE /api/v1/workspaces/:workspaceId/integrations/social/:id` requires `integrations.manage`. It scopes the account to the workspace, attempts provider revocation when configured, clears encrypted credentials locally, and returns `{ disconnected: true }`.

OAuth and refresh credentials are encrypted at rest, are only decrypted in trusted server-side provider flows, and are never included in API responses, audit records, or error messages. Provider callback, token, profile, refresh, or revocation failures use stable error codes and generic messages.
