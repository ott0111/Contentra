import type { ContentPerformance } from "@/types/analytics";

type YouTubeAnalyticsRow = {
  date: string;
  views: number;
  likes: number;
  comments: number;
  subscribers_gained: number;
  subscribers_lost: number;
  watch_time_minutes: number;
  average_view_duration_seconds: number;
};

export type YouTubeAnalyticsData = { records: ContentPerformance[]; lastSyncedAt: string | null; };

export async function fetchYouTubeAnalytics(days: number | "all" = "all"): Promise<YouTubeAnalyticsData> {
  const response = await fetch(`/api/platforms/youtube/sync?days=${days}`, { cache: "no-store" });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || "Could not load YouTube analytics");
  }
  const result = await response.json() as { analytics?: YouTubeAnalyticsRow[]; lastSyncedAt?: string | null };
  return { lastSyncedAt: result.lastSyncedAt || null, records: (result.analytics || []).map(row => ({
    id: `youtube-${row.date}`,
    contentId: "",
    platform: "YouTube",
    views: Number(row.views || 0),
    likes: Number(row.likes || 0),
    comments: Number(row.comments || 0),
    shares: 0,
    saves: 0,
    followersGained: Number(row.subscribers_gained || 0),
    followersLost: Number(row.subscribers_lost || 0),
    watchTimeMinutes: Number(row.watch_time_minutes || 0),
    averageViewDurationSeconds: Number(row.average_view_duration_seconds || 0),
    recordedAt: row.date,
  })) };
}
