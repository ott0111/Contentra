import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { encryptToken, decryptToken, getSocialOAuthStateCookieName, storeSocialOAuthState } from "@/lib/platforms/oauth-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextResponse } from "next/server";

export type SocialPlatform = "instagram" | "tiktok" | "x";
export type SocialMetricRow = {
  date: string;
  views?: number;
  impressions?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  followers?: number | null;
  followersGained?: number;
  followersLost?: number;
  watchTimeMinutes?: number | null;
  averageViewDurationSeconds?: number | null;
};

type ProviderConfig = { clientId: string; clientSecret: string; redirectUri: string };

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const redirectFor = (platform: SocialPlatform) => process.env[`${platform.toUpperCase()}_OAUTH_REDIRECT_URI`] || `${baseUrl}/api/platforms/${platform}/callback`;

export function getSocialConfig(platform: SocialPlatform): ProviderConfig | null {
  const values = platform === "instagram"
    ? [process.env.META_APP_ID, process.env.META_APP_SECRET]
    : platform === "tiktok"
      ? [process.env.TIKTOK_CLIENT_KEY, process.env.TIKTOK_CLIENT_SECRET]
      : [process.env.X_CLIENT_ID, process.env.X_CLIENT_SECRET];
  if (!values[0] || !values[1]) return null;
  return { clientId: values[0], clientSecret: values[1], redirectUri: redirectFor(platform) };
}

export function socialAuthUrl(platform: SocialPlatform, config: ProviderConfig, state: string): string {
  if (platform === "instagram") {
    const query = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement", state });
    return `https://www.facebook.com/v23.0/dialog/oauth?${query}`;
  }
  if (platform === "tiktok") {
    const query = new URLSearchParams({ client_key: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "user.info.basic,user.info.stats,video.list", state });
    return `https://www.tiktok.com/v2/auth/authorize/?${query}`;
  }
  const query = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, scope: "tweet.read users.read offline.access", state, code_challenge: state, code_challenge_method: "plain" });
  return `https://twitter.com/i/oauth2/authorize?${query}`;
}

export function beginSocialState(userId: string, platform: SocialPlatform, response: NextResponse): string {
  const state = randomBytes(32).toString("hex");
  storeSocialOAuthState(state, userId, platform, response);
  return state;
}

export function verifySocialState(state: string, cookieValue: string | undefined): { userId: string; platform: string } | null {
  if (!cookieValue) return null;
  try {
    const [encoded, signature] = cookieValue.split(".");
    const key = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
    if (!encoded || !signature || !key) return null;
    const expected = createHmac("sha256", key).update(Buffer.from(encoded, "base64url").toString("utf8")).digest("hex");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { state: string; userId: string; platform: string; expiresAt: number };
    return payload.state === state && payload.expiresAt >= Date.now() ? { userId: payload.userId, platform: payload.platform } : null;
  } catch { return null; }
}

export { getSocialOAuthStateCookieName, encryptToken, decryptToken };

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : `Provider request failed (${response.status})`);
  return data as Record<string, unknown>;
}

async function instagramDiagnosticRequest(url: string, label: string, pageName?: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  const error = data.error as Record<string, unknown> | undefined;
  console.info("Instagram OAuth discovery", {
    endpoint: label,
    status: response.status,
    ...(pageName ? { pageName } : {}),
    ...(error ? { metaError: { code: error.code ?? null, type: error.type ?? null, message: error.message ?? null } } : {}),
  });
  if (!response.ok) throw new Error(typeof error?.message === "string" ? error.message : `Instagram request failed (${response.status})`);
  return data;
}

export async function exchangeSocialCode(platform: SocialPlatform, config: ProviderConfig, code: string, codeVerifier?: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }> {
  if (platform === "instagram") {
    const data = await jsonRequest("https://graph.facebook.com/v23.0/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code }) });
    return { accessToken: String(data.access_token), expiresIn: Number(data.expires_in || 0) || undefined };
  }
  if (platform === "tiktok") {
    const data = await jsonRequest("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: config.clientId, client_secret: config.clientSecret, code, grant_type: "authorization_code", redirect_uri: config.redirectUri }) });
    return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token || "") || undefined, expiresIn: Number(data.expires_in || 0) || undefined, scope: String(data.scope || "") || undefined };
  }
  const data = await jsonRequest("https://api.x.com/2/oauth2/token", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: config.redirectUri, code_verifier: codeVerifier || "" }) });
  return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token || "") || undefined, expiresIn: Number(data.expires_in || 0) || undefined, scope: String(data.scope || "") || undefined };
}

export async function refreshSocialToken(platform: SocialPlatform, config: ProviderConfig, refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  if (platform === "instagram") throw new Error("Instagram authorization must be reconnected when it expires.");
  if (platform === "tiktok") {
    const data = await jsonRequest("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
    return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token || refreshToken), expiresIn: Number(data.expires_in || 0) || undefined };
  }
  const data = await jsonRequest("https://api.x.com/2/oauth2/token", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: refreshToken, grant_type: "refresh_token" }) });
  return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token || refreshToken), expiresIn: Number(data.expires_in || 0) || undefined };
}

export async function fetchSocialAccount(platform: SocialPlatform, accessToken: string): Promise<{ id: string; username: string; displayName?: string }> {
  if (platform === "instagram") {
    const pagesData = await instagramDiagnosticRequest(`https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`, "me/accounts");
    const pages = (pagesData.data as Array<Record<string, unknown>> | undefined) || [];
    console.info("Instagram OAuth discovery", {
      endpoint: "me/accounts summary",
      pageCount: pages.length,
      pages: pages.map(page => ({ name: typeof page.name === "string" ? page.name : null, hasAccessToken: typeof page.access_token === "string" && page.access_token.length > 0 })),
    });
    let account: { id?: string } | undefined;
    for (const candidate of pages) {
      const pageId = typeof candidate.id === "string" ? candidate.id : "";
      if (!pageId) continue;
      const pageToken = typeof candidate.access_token === "string" ? candidate.access_token : accessToken;
      const pageName = typeof candidate.name === "string" ? candidate.name : "Unknown Page";
      const pageData = await instagramDiagnosticRequest(`https://graph.facebook.com/v23.0/${pageId}?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(pageToken)}`, "page lookup", pageName);
      const candidateAccount = pageData.instagram_business_account as { id?: string } | undefined;
      console.info("Instagram OAuth discovery", { endpoint: "page lookup result", pageName, hasInstagramBusinessAccount: Boolean(candidateAccount?.id) });
      if (candidateAccount?.id) {
        account = candidateAccount;
        break;
      }
    }
    if (!account?.id) throw new Error("Instagram requires a connected Professional account and Facebook Page.");
    const profile = await jsonRequest(`https://graph.facebook.com/v23.0/${account.id}?fields=id,username,name&access_token=${encodeURIComponent(accessToken)}`);
    return { id: String(profile.id), username: String(profile.username || profile.name || "Instagram account"), displayName: String(profile.name || "") };
  }
  if (platform === "tiktok") {
    const data = await jsonRequest("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username", { headers: { Authorization: `Bearer ${accessToken}` } });
    const user = data.data as Record<string, unknown>;
    const profile = user.user as Record<string, unknown>;
    return { id: String(profile.open_id || ""), username: String(profile.username || profile.display_name || "TikTok account") };
  }
  const data = await jsonRequest("https://api.x.com/2/users/me?user.fields=username,name,public_metrics", { headers: { Authorization: `Bearer ${accessToken}` } });
  const user = data.data as Record<string, unknown>;
  return { id: String(user.id), username: String(user.username || user.name || "X account"), displayName: String(user.name || "") };
}

export async function fetchSocialMetrics(platform: SocialPlatform, accessToken: string, accountId: string): Promise<SocialMetricRow[]> {
  const date = new Date().toISOString().slice(0, 10);
  if (platform === "instagram") {
    const data = await jsonRequest(`https://graph.facebook.com/v23.0/${accountId}/insights?metric=reach,views&period=day&access_token=${encodeURIComponent(accessToken)}`);
    const values = Object.fromEntries((data.data as Array<Record<string, unknown>> || []).map(metric => [metric.name, Number((metric.values as Array<Record<string, unknown>>)?.[0]?.value || 0)]));
    return [{ date, reach: values.reach || 0, views: values.views || 0 }];
  }
  if (platform === "tiktok") {
    const data = await jsonRequest("https://open.tiktokapis.com/v2/video/list/?fields=id,view_count,like_count,comment_count,share_count", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20 }) });
    const videos = (data.data as { videos?: Array<Record<string, unknown>> })?.videos || [];
    return [{ date, views: videos.reduce((sum, video) => sum + Number(video.view_count || 0), 0), likes: videos.reduce((sum, video) => sum + Number(video.like_count || 0), 0), comments: videos.reduce((sum, video) => sum + Number(video.comment_count || 0), 0), shares: videos.reduce((sum, video) => sum + Number(video.share_count || 0), 0) }];
  }
  const data = await jsonRequest(`https://api.x.com/2/users/${accountId}?user.fields=public_metrics`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const metrics = (data.data as { public_metrics?: Record<string, number> })?.public_metrics || {};
  return [{ date, impressions: 0, followers: Number(metrics.followers_count || 0) }];
}

export async function saveSocialTokens(userId: string, platform: SocialPlatform, account: { id: string; username: string }, tokens: { accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }) {
  const admin = createAdminClient();
  const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;
  const { data, error } = await admin.from("platforms").upsert({ user_id: userId, platform, platform_user_id: account.id, username: account.username, access_token: encryptToken(tokens.accessToken), refresh_token: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null, token_expires_at: expiresAt, scope: tokens.scope || null, connected: true, updated_at: new Date() }, { onConflict: "user_id,platform" }).select("id").single();
  if (error) throw new Error("Could not save social connection");
  return data.id as string;
}
