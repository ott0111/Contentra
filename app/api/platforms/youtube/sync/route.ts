import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOAuthProvider,
  getPlatformTokens,
  isTokenExpired,
  updatePlatformTokens,
} from "@/lib/platforms/oauth-utils";
import {
  getYouTubeDailyAnalytics,
  refreshYouTubeToken,
  validateYouTubeConfig,
} from "@/lib/platforms/youtube";

const recentSyncs = new Map<string, number>();
const ranges = new Set([7, 28, 30, 90]);

function getDateRange(value: string | null) {
  const days = value ? Number(value) : 28;
  if (value === "all") return { days: null, startDate: null, endDate: null };
  if (!Number.isInteger(days) || !ranges.has(days)) return null;
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { days, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

async function authenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user?.id ? null : user;
}

async function getStoredConnection(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platforms")
    .select("id,platform_user_id")
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .eq("connected", true)
    .maybeSingle();
  return error || !data?.platform_user_id ? null : data;
}

async function getAccessToken(userId: string) {
  const tokens = await getPlatformTokens(userId, "youtube");
  if (!tokens) throw new Error("YouTube account not connected");
  if (!isTokenExpired(tokens.expiresAt)) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error("YouTube authorization has expired. Reconnect your account.");

  const config = getOAuthProvider("youtube");
  if (!config || !validateYouTubeConfig(config)) throw new Error("YouTube OAuth is not configured");
  const refreshed = await refreshYouTubeToken(config, tokens.refreshToken);
  await updatePlatformTokens(userId, "youtube", {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresIn: refreshed.expires_in,
  });
  return refreshed.access_token;
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const range = getDateRange(request.nextUrl.searchParams.get("days"));
  if (!range) return NextResponse.json({ error: "Supported ranges are 7, 28, 30, or 90 days" }, { status: 400 });

  const admin = createAdminClient();
  let query = admin
    .from("youtube_analytics_daily")
    .select("date,views,likes,comments,subscribers_gained,subscribers_lost,watch_time_minutes,average_view_duration_seconds,estimated_revenue")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .order("date", { ascending: true });
  if (range.startDate) query = query.gte("date", range.startDate);
  if (range.endDate) query = query.lte("date", range.endDate);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load YouTube analytics" }, { status: 500 });
  const { data: connection } = await admin
    .from("platforms")
    .select("last_synced_at")
    .eq("user_id", user.id)
    .eq("platform", "youtube")
    .eq("connected", true)
    .maybeSingle();
  return NextResponse.json({ success: true, range, lastSyncedAt: connection?.last_synced_at || null, analytics: data || [] });
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({})) as { days?: number };
    const range = getDateRange(body.days?.toString() || null);
    if (!range || !range.startDate || !range.endDate) return NextResponse.json({ error: "Sync supports 7, 28, 30, or 90 days" }, { status: 400 });

    const lastSync = recentSyncs.get(user.id) || 0;
    if (Date.now() - lastSync < 60_000) {
      return NextResponse.json({ error: "A sync was completed recently. Please try again shortly." }, { status: 429 });
    }
    recentSyncs.set(user.id, Date.now());

    const connection = await getStoredConnection(user.id);
    if (!connection) return NextResponse.json({ error: "YouTube account not connected" }, { status: 400 });
    const accessToken = await getAccessToken(user.id);
    const analytics = await getYouTubeDailyAnalytics(accessToken, connection.platform_user_id, range.startDate, range.endDate);
    const now = new Date().toISOString();
    const admin = createAdminClient();
    const rows = analytics.map(row => ({
      user_id: user.id,
      platform: "youtube",
      platform_account_id: connection.platform_user_id,
      date: row.date,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      subscribers_gained: row.subscribersGained,
      subscribers_lost: row.subscribersLost,
      watch_time_minutes: row.watchTimeMinutes,
      average_view_duration_seconds: row.averageViewDurationSeconds,
      estimated_revenue: row.estimatedRevenue,
      updated_at: now,
    }));
    if (rows.length) {
      const { error } = await admin
        .from("youtube_analytics_daily")
        .upsert(rows, { onConflict: "user_id,platform,platform_account_id,date" });
      if (error) {
        console.error("YouTube analytics storage error:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        const storageError = process.env.NODE_ENV === "development"
          ? `Could not store YouTube analytics (${error.code || "database_error"}: ${error.message})`
          : "Could not store YouTube analytics";
        throw new Error(storageError);
      }
    }
    const { error: platformError } = await admin.from("platforms").update({ last_synced_at: now, updated_at: now }).eq("id", connection.id);
    if (platformError) throw new Error("Could not update YouTube sync status");
    return NextResponse.json({ success: true, synced: rows.length, analytics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube sync failed";
    const status = message.includes("not connected") || message.includes("expired") ? 400 : 502;
    console.error("YouTube sync failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
