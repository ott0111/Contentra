import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, isTokenExpired, updatePlatformTokens } from "@/lib/platforms/oauth-utils";
import { fetchSocialMetrics, getSocialConfig, refreshSocialToken, type SocialPlatform } from "@/lib/platforms/social";

const platforms = new Set<SocialPlatform>(["instagram", "tiktok", "x"]);
const recentSyncs = new Map<string, number>();

async function user() {
  const supabase = await createClient();
  const { data: { user: current } } = await supabase.auth.getUser();
  return current;
}

export async function GET(request: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const platform = (await context.params).platform as SocialPlatform;
  if (!platforms.has(platform)) return NextResponse.json({ error: "Unsupported platform" }, { status: 404 });
  const current = await user();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("social_analytics_daily").select("date,views,impressions,reach,likes,comments,shares,saves,followers_gained,followers_lost,followers,watch_time_minutes,average_view_duration_seconds").eq("user_id", current.id).eq("platform", platform).order("date", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load analytics" }, { status: 500 });
  const { data: connection } = await admin.from("platforms").select("last_synced_at").eq("user_id", current.id).eq("platform", platform).eq("connected", true).maybeSingle();
  return NextResponse.json({ success: true, platform, lastSyncedAt: connection?.last_synced_at || null, analytics: data || [] });
}

export async function POST(_request: NextRequest, context: { params: Promise<{ platform: string }> }) {
  try {
    const platform = (await context.params).platform as SocialPlatform;
    if (!platforms.has(platform)) return NextResponse.json({ error: "Unsupported platform" }, { status: 404 });
    const current = await user();
    if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const key = `${current.id}:${platform}`;
    if (Date.now() - (recentSyncs.get(key) || 0) < 60_000) return NextResponse.json({ error: "A sync was completed recently. Please try again shortly." }, { status: 429 });
    recentSyncs.set(key, Date.now());
    const admin = createAdminClient();
    const { data: connection } = await admin.from("platforms").select("id,platform_user_id,access_token,refresh_token,token_expires_at").eq("user_id", current.id).eq("platform", platform).eq("connected", true).maybeSingle();
    if (!connection?.platform_user_id) return NextResponse.json({ error: `${platform} account not connected` }, { status: 400 });
    let accessToken = decryptToken(connection.access_token);
    const refreshToken = decryptToken(connection.refresh_token);
    if (!accessToken) return NextResponse.json({ error: "Stored authorization is invalid. Reconnect your account." }, { status: 400 });
    if (isTokenExpired(connection.token_expires_at ? new Date(connection.token_expires_at) : undefined)) {
      if (!refreshToken) return NextResponse.json({ error: "Authorization expired. Reconnect your account." }, { status: 400 });
      const config = getSocialConfig(platform);
      if (!config) return NextResponse.json({ error: `${platform} OAuth is not configured` }, { status: 503 });
      const refreshed = await refreshSocialToken(platform, config, refreshToken);
      accessToken = refreshed.accessToken;
      await updatePlatformTokens(current.id, platform, { accessToken, refreshToken: refreshed.refreshToken || refreshToken, expiresIn: refreshed.expiresIn });
    }
    const analytics = await fetchSocialMetrics(platform, accessToken, connection.platform_user_id);
    const rows = analytics.map(row => ({ user_id: current.id, platform, platform_account_id: connection.platform_user_id, date: row.date, views: row.views || 0, impressions: row.impressions || 0, reach: row.reach || 0, likes: row.likes || 0, comments: row.comments || 0, shares: row.shares || 0, saves: row.saves || 0, followers_gained: row.followersGained || 0, followers_lost: row.followersLost || 0, followers: row.followers ?? null, watch_time_minutes: row.watchTimeMinutes ?? null, average_view_duration_seconds: row.averageViewDurationSeconds ?? null, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await admin.from("social_analytics_daily").upsert(rows, { onConflict: "user_id,platform,platform_account_id,date" });
      if (error) throw new Error(`Could not store ${platform} analytics`);
    }
    const now = new Date().toISOString();
    const { error: updateError } = await admin.from("platforms").update({ last_synced_at: now, updated_at: now }).eq("id", connection.id);
    if (updateError) throw new Error(`Could not update ${platform} sync status`);
    return NextResponse.json({ success: true, platform, synced: rows.length, analytics });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Social analytics sync failed";
    console.error("Social analytics sync failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
