# Contentra architecture

## Bounded contexts

- Identity: users, sessions, OAuth accounts.
- Workspace: membership, roles, permissions, subscriptions and entitlements.
- Intelligence: brand, audience, voice, content DNA, trends, opportunities.
- Content: content, versions, assets, collections, calendar, campaigns.
- Integrations: social, website, business systems and inbound events.
- Analytics: raw metrics, normalized metrics and attribution.
- Recommendations: recommendations and next-best-action.
- AI: provider abstraction, conversations, actions and usage.
- Platform: jobs, notifications, storage, API keys, webhooks, audit logs.

## Request pipeline

1. Parse and validate request.
2. Authenticate session/API key.
3. Resolve workspace through trusted membership lookup.
4. Authorize centralized permission.
5. Execute domain service.
6. Return a stable DTO, not a database object.
7. Emit audit/integration events where appropriate.

## ADR: workspace isolation

Every workspace-owned record has a workspace foreign key. Service methods require an authenticated workspace context. Cross-workspace access tests are mandatory. Database-level row security can be enabled in deployments that require defense in depth.

## ADR: provider abstractions

AI, storage, social, business and publishing providers expose capability interfaces. Provider-specific behavior stays in adapters so domain services remain portable.
