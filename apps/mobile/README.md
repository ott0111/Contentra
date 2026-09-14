# Contentra mobile

Expo client for iOS and Android. It only calls the Contentra API; it does not contain provider, database, payment, or AI credentials.

Set `EXPO_PUBLIC_API_URL` to the API origin (for example, a LAN-reachable development API when testing on a physical phone). Run `pnpm install`, then `pnpm --filter @contentra/mobile start`, `android`, or `ios`.

The current API uses an HTTP-only session cookie. Test the API with HTTPS or compatible local cookie settings on real devices. The app stores only the selected workspace identifier in Expo SecureStore; it never stores session cookies, OAuth tokens, or secrets.

The Expo scheme is `contentra`. OAuth and checkout must return through the API's configured public callback/web origin until a provider-specific native callback is configured. Mobile displays API errors and never assumes that a provider connection or Checkout completed successfully.
