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
  getYouTubeChannelInfo,
  getYouTubeVideoAnalytics,
  refreshYouTubeToken,
  validateYouTubeConfig,
} from "@/lib/platforms/youtube";

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingTokens = await getPlatformTokens(user.id, "youtube");
    if (!existingTokens) {
      return NextResponse.json({ error: "YouTube account not connected" }, { status: 400 });
    }

    let accessToken = existingTokens.accessToken;
    let refreshToken = existingTokens.refreshToken;

    if (isTokenExpired(existingTokens.expiresAt)) {
      if (!refreshToken) {
        return NextResponse.json({ error: "Access token expired and no refresh token is available" }, { status: 400 });
      }

      const youtubeConfig = getOAuthProvider("youtube");
      if (!youtubeConfig || !validateYouTubeConfig(youtubeConfig)) {
        return NextResponse.json({ error: "YouTube OAuth is not configured" }, { status: 500 });
      }

      const refreshed = await refreshYouTubeToken(youtubeConfig, refreshToken);
      accessToken = refreshed.access_token;
      refreshToken = refreshed.refresh_token || refreshToken;

      const tokenUpdated = await updatePlatformTokens(user.id, "youtube", {
        accessToken,
        refreshToken,
        expiresIn: refreshed.expires_in,
      });

      if (!tokenUpdated) {
        return NextResponse.json({ error: "Failed to persist refreshed token" }, { status: 500 });
      }
    }

    const channelInfo = await getYouTubeChannelInfo(accessToken);
    const admin = createAdminClient();
    const { data: platformRow, error: platformError } = await admin
      .from("platforms")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "youtube")
      .eq("connected", true)
      .single();

    if (platformError || !platformRow) {
      return NextResponse.json({ error: "YouTube connection not found" }, { status: 400 });
    }

    const videoAnalytics = await getYouTubeVideoAnalytics(accessToken, 10);
    const now = new Date();

    await admin
      .from("platforms")
      .update({
        username: channelInfo.title,
        platform_user_id: channelInfo.id,
        connected: true,
        last_synced_at: now,
        token_expires_at: new Date(Date.now() + 3600 * 1000),
        updated_at: now,
      })
      .eq("id", platformRow.id);

    if (videoAnalytics.length > 0) {
      await admin.from("platform_analytics").insert({
        user_id: user.id,
        platform_id: platformRow.id,
        platform: "youtube",
        followers: channelInfo.subscriberCount,
        total_views: channelInfo.viewCount,
        engagement_rate: videoAnalytics.reduce((sum, video) => sum + (video.likes + video.comments), 0) / Math.max(videoAnalytics.length, 1),
        recorded_at: now,
      });
    }

    return NextResponse.json({
      success: true,
      platform: "youtube",
      syncedAt: now.toISOString(),
      channel: {
        id: channelInfo.id,
        name: channelInfo.title,
        thumbnail: channelInfo.thumbnailUrl || null,
      },
      analytics: {
        totalViews: channelInfo.viewCount,
        subscriberCount: channelInfo.subscriberCount,
        videoCount: channelInfo.videoCount,
        videos: videoAnalytics.map((video) => ({
          id: video.videoId,
          title: video.title,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
        })),
      },
    });
  } catch (error) {
    console.error("YouTube sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
