# Windows desktop (Tauri)

The Windows app is a Tauri shell hosting a Vite React client. It uses the same API endpoint shapes and workspace headers as web and mobile. Authentication is the API's HTTP-only session cookie; only the current workspace ID is stored locally.

Set `VITE_API_URL` to the API origin, install dependencies, then run `pnpm --filter @contentra/desktop dev` or `pnpm --filter @contentra/desktop tauri dev`. Build with `pnpm --filter @contentra/desktop build` followed by Tauri packaging.

Set `VITE_API_URL` to the public API origin. Do not put server secrets in `VITE_*` variables. OAuth, AI, billing, and social integrations use API endpoints; completion is determined by refreshed backend state. The minimal Tauri opener plugin launches backend-issued OAuth and Stripe URLs in the system browser. Provider callbacks terminate at the API; after returning to the app the user refreshes integration or billing state. No provider token ever enters Tauri.

Windows packaging needs Rust, Windows build tools, WebView2, and the Tauri CLI prerequisites.

## Updates

The API release manifest is shared with other clients, but Windows installation uses the official signed Tauri updater only. Configure an HTTPS updater endpoint, Tauri updater public key, and CI-only signing key before enabling the updater plugin. The checked-in configuration does not enable an empty or unsigned updater endpoint. Never download or execute an arbitrary release executable from API metadata. The desktop app renders a `ReleaseNotice` card from `/api/v1/releases/latest?platform=windows` with the action suppressed (no artifact link), since delivery is the updater's job.
