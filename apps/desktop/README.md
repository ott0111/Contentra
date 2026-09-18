# Contentra desktop

Tauri + Vite client for Windows. Set `VITE_API_URL` to the Contentra API origin, run `pnpm install`, then `pnpm --filter @contentra/desktop dev` or `pnpm --filter @contentra/desktop tauri dev`.

The desktop UI uses only HTTP API calls with the browser session cookie and a locally stored workspace ID. It does not ship database, Paddle, Gemini, OAuth, encryption, or session secrets. OAuth and billing are opened only from API-issued flows; their completion is confirmed by refreshing API state.

Windows bundling additionally requires Rust, the Tauri prerequisites, WebView2, and Windows build tools. The frontend CSP permits API connections but keeps script sources local.
