import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, isTokenExpired, updatePlatformTokens } from "@/lib/platforms/oauth-utils";
import { fetchSocialMetrics, fetchTwitchData, getSocialConfig, isTwitchApiError, refreshSocialToken, validateTwitchToken, type SocialPlatform, TwitchApiError } from "@/lib/platforms/social";
import { buildTwitchDailyAnalytics, parseTwitchDurationSeconds } from "@/lib/platforms/twitch-utils";

const platforms = new Set<SocialPlatform>(["instagram", "tiktok", "x", "twitch"]);
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
  const { data, error } = await admin.from("social_analytics_daily").select("date,views,impressions,reach,likes,comments,shares,saves,followers_gained,followers_lost,followers,watch_time_minutes,average_view_duration_seconds,stream_duration_minutes,average_sampled_viewers,peak_sampled_viewers").eq("user_id", current.id).eq("platform", platform).order("date", { ascending: true });
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
    if (platform === "twitch") {
      const validated = await validateTwitchToken(accessToken);
      if (validated.userId !== connection.platform_user_id) return NextResponse.json({ error: "Twitch authorization belongs to a different account. Reconnect Twitch." }, { status: 409 });
      const twitch = await fetchTwitchData(accessToken, connection.platform_user_id);
      const observedAt = new Date().toISOString();
      const openSnapshots = admin.from("twitch_stream_snapshots").update({ ended_at: observedAt }).eq("user_id", current.id).eq("platform_account_id", connection.platform_user_id).is("ended_at", null);
      const { error: closeError } = twitch.stream ? await openSnapshots.neq("stream_id", twitch.stream.id) : await openSnapshots;
      if (closeError) throw new Error("Could not close Twitch stream snapshot");
      if (twitch.stream) {
        const { error: snapshotError } = await admin.from("twitch_stream_snapshots").insert({ user_id: current.id, platform_account_id: connection.platform_user_id, stream_id: twitch.stream.id, started_at: twitch.stream.started_at, observed_at: observedAt, viewer_count: twitch.stream.viewer_count, game_id: twitch.stream.game_id || null, game_name: twitch.stream.game_name || null, title: twitch.stream.title || null });
        if (snapshotError) throw new Error("Could not store Twitch stream snapshot");
      }
      const videoRows = twitch.videos.map(video => ({ user_id: current.id, platform_account_id: connection.platform_user_id, video_id: video.id, stream_id: video.stream_id, title: video.title, created_at: video.created_at, published_at: video.published_at, url: video.url, view_count: video.view_count, duration_seconds: parseTwitchDurationSeconds(video.duration), updated_at: observedAt }));
      if (videoRows.length) {
        const { error: videoError } = await admin.from("twitch_videos").upsert(videoRows, { onConflict: "user_id,platform_account_id,video_id" });
        if (videoError) throw new Error("Could not store Twitch videos");
      }
      const date = observedAt.slice(0, 10);
      const { data: snapshots } = await admin.from("twitch_stream_snapshots").select("stream_id,started_at,ended_at,viewer_count").eq("user_id", current.id).eq("platform_account_id", connection.platform_user_id).gte("observed_at", `${date}T00:00:00.000Z`).lt("observed_at", `${date}T23:59:59.999Z`);
      const previous = await admin.from("social_analytics_daily").select("followers").eq("user_id", current.id).eq("platform", platform).eq("platform_account_id", connection.platform_user_id).order("date", { ascending: false }).limit(1).maybeSingle();
      const previousFollowers = previous.data?.followers == null ? twitch.followerTotal : Number(previous.data.followers);
      const analytics = [buildTwitchDailyAnalytics({ date, followerTotal: twitch.followerTotal, previousFollowers, videos: twitch.videos, streamSnapshots: snapshots || [], nowMs: Date.now() })];
      const rows = analytics.map(row => ({ user_id: current.id, platform, platform_account_id: connection.platform_user_id, date: row.date, views: row.views || 0, impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers_gained: row.followersGained || 0, followers_lost: 0, followers: row.followers ?? null, watch_time_minutes: null, average_view_duration_seconds: null, stream_duration_minutes: row.streamDurationMinutes ?? null, average_sampled_viewers: row.averageSampledViewers ?? null, peak_sampled_viewers: row.peakSampledViewers ?? null, updated_at: observedAt }));
      const { error: analyticsError } = await admin.from("social_analytics_daily").upsert(rows, { onConflict: "user_id,platform,platform_account_id,date" });
      if (analyticsError) throw new Error("Could not store Twitch analytics");
      const { error: updateError } = await admin.from("platforms").update({ last_synced_at: observedAt, updated_at: observedAt }).eq("id", connection.id);
      if (updateError) throw new Error("Could not update Twitch sync status");
      return NextResponse.json({ success: true, platform, synced: rows.length, analytics });
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
    if (isTwitchApiError(caught, 429)) {
      const retryAt = (caught as TwitchApiError).retryAt;
      return NextResponse.json({ error: "Twitch rate limit reached. Please try again later.", retryAt: retryAt || null }, { status: 429 });
    }
    const message = caught instanceof Error ? caught.message : "Social analytics sync failed";
    console.error("Social analytics sync failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
