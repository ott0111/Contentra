/**
 * YouTube OAuth Service
 * Handles secure server-side OAuth flow for YouTube integrations
 * 
 * CRITICAL SECURITY NOTES:
 * - All token operations are server-side only
 * - Tokens are NEVER sent to or stored on client
 * - Refresh tokens are encrypted and stored server-side
 * - Access tokens are validated and cached server-side
 */

const YOUTUBE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface YouTubeTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

export interface YouTubeVideoAnalytics {
  videoId: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface YouTubeDailyAnalytics {
  date: string;
  views: number;
  likes: number;
  comments: number;
  subscribersGained: number;
  subscribersLost: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  estimatedRevenue: number | null;
}

/**
 * Generate OAuth authorization URL for YouTube consent screen
 * User visits this URL to grant permission
 */
export function getYouTubeAuthUrl(config: YouTubeOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" "),
    state,
    access_type: "offline",
    prompt: "consent", // Force consent to always get refresh token
  });

  return `${YOUTUBE_AUTH_BASE}?${params.toString()}`;
}

/**
 * Exchange authorization code for access and refresh tokens
 * SERVER-SIDE ONLY - never call from client
 */
export async function exchangeYouTubeCode(
  config: YouTubeOAuthConfig,
  code: string
): Promise<YouTubeTokenResponse> {
  const response = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`YouTube token exchange failed: ${response.statusText}`);
  }

  return response.json() as Promise<YouTubeTokenResponse>;
}

/**
 * Refresh an expired access token using refresh token
 * SERVER-SIDE ONLY - called during analytics sync
 */
export async function refreshYouTubeToken(
  config: YouTubeOAuthConfig,
  refreshToken: string
): Promise<YouTubeTokenResponse> {
  const response = await fetch(YOUTUBE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`YouTube token refresh failed: ${response.statusText}`);
  }

  return response.json() as Promise<YouTubeTokenResponse>;
}

/**
 * Fetch authenticated user's YouTube channel info
 * Requires valid access token
 */
export async function getYouTubeChannelInfo(
  accessToken: string
): Promise<YouTubeChannelInfo> {
  // First get the channel ID
  const channelsResponse = await fetch(
    `${YOUTUBE_API_BASE}/channels?part=id,snippet,statistics&mine=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!channelsResponse.ok) {
    throw new Error(`YouTube channels API failed: ${channelsResponse.statusText}`);
  }

  const channelsData = (await channelsResponse.json()) as {
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        description: string;
        thumbnails: {
          medium?: { url: string };
          default?: { url: string };
        };
      };
      statistics: {
        subscriberCount: string;
        viewCount: string;
        videoCount: string;
      };
    }>;
  };

  if (!channelsData.items?.[0]) {
    throw new Error("No YouTube channel found");
  }

  const channel = channelsData.items[0];

  return {
    id: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description,
    thumbnailUrl: channel.snippet.thumbnails.medium?.url || channel.snippet.thumbnails.default?.url || "",
    subscriberCount: parseInt(channel.statistics.subscriberCount, 10) || 0,
    viewCount: parseInt(channel.statistics.viewCount, 10) || 0,
    videoCount: parseInt(channel.statistics.videoCount, 10) || 0,
  };
}

/**
 * Fetch recent video analytics from user's channel
 * Returns view count, likes, comments for recent videos
 * Note: YouTube API doesn't provide direct share count; we track views, likes, comments
 */
export async function getYouTubeVideoAnalytics(
  accessToken: string,
  maxResults: number = 10
): Promise<YouTubeVideoAnalytics[]> {
  // Get recent uploads from channel
  const searchResponse = await fetch(
    `${YOUTUBE_API_BASE}/search?part=id&forMine=true&type=video&maxResults=${maxResults}&order=date`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!searchResponse.ok) {
    throw new Error(`YouTube search API failed: ${searchResponse.statusText}`);
  }

  const searchData = (await searchResponse.json()) as {
    items?: Array<{ id: { videoId: string } }>;
  };

  if (!searchData.items?.length) {
    return [];
  }

  const videoIds = searchData.items.map((item) => item.id.videoId).join(",");

  // Get detailed statistics for videos
  const statsResponse = await fetch(
    `${YOUTUBE_API_BASE}/videos?part=id,snippet,statistics&id=${videoIds}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!statsResponse.ok) {
    throw new Error(`YouTube videos API failed: ${statsResponse.statusText}`);
  }

  const statsData = (await statsResponse.json()) as {
    items?: Array<{
      id: string;
      snippet: { title: string };
      statistics: {
        viewCount: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  };

  return (statsData.items || []).map((video) => ({
    videoId: video.id,
    title: video.snippet.title,
    views: parseInt(video.statistics.viewCount, 10) || 0,
    likes: parseInt(video.statistics.likeCount || "0", 10) || 0,
    comments: parseInt(video.statistics.commentCount || "0", 10) || 0,
    shares: 0, // YouTube API doesn't provide share count
  }));
}

export async function getYouTubeDailyAnalytics(
  accessToken: string,
  channelId: string,
  startDate: string,
  endDate: string,
): Promise<YouTubeDailyAnalytics[]> {
  const params = new URLSearchParams({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: "views,likes,comments,subscribersGained,subscribersLost,estimatedMinutesWatched,averageViewDuration",
    dimensions: "day",
    sort: "day",
  });
  const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`YouTube analytics API failed: ${response.status}`);
  }

  const data = (await response.json()) as { columnHeaders?: Array<{ name: string }>; rows?: Array<Array<string | number>> };
  const headers = data.columnHeaders?.map(column => column.name) || [];
  return (data.rows || []).map(row => {
    const values = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    return {
      date: String(values.day),
      views: Number(values.views || 0),
      likes: Number(values.likes || 0),
      comments: Number(values.comments || 0),
      subscribersGained: Number(values.subscribersGained || 0),
      subscribersLost: Number(values.subscribersLost || 0),
      watchTimeMinutes: Number(values.estimatedMinutesWatched || 0),
      averageViewDurationSeconds: Number(values.averageViewDuration || 0),
      estimatedRevenue: null,
    };
  });
}

/**
 * Validate that YouTube configuration is complete
 */
export function validateYouTubeConfig(config: YouTubeOAuthConfig): boolean {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}
