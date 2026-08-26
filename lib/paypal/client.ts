const sandboxUrl = "https://api-m.sandbox.paypal.com";
const productionUrl = "https://api-m.paypal.com";
let tokenCache: { value: string; expiresAt: number } | null = null;

export function getPayPalBaseUrl() { return process.env.PAYPAL_ENVIRONMENT === "production" ? productionUrl : sandboxUrl; }
export function isPayPalConfigured() { return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID); }

export async function getPayPalAccessToken() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new Error("PayPal credentials are not configured.");
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store" });
  if (!response.ok) throw new Error("PayPal authentication failed.");
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("PayPal did not return an access token.");
  tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 300) * 1000 };
  return data.access_token;
}

export async function paypalRequest<T>(path: string, init: RequestInit = {}) {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store" });
  if (!response.ok) throw new Error("PayPal request failed.");
  return response.status === 204 ? null as T : await response.json() as T;
}
