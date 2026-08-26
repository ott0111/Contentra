import type { ContentPerformance } from "@/types/analytics";

type SocialRow = { date: string; views?: number; impressions?: number; reach?: number; likes?: number; comments?: number; shares?: number; saves?: number; followers_gained?: number; followers_lost?: number; followers?: number | null; watch_time_minutes?: number | null; average_view_duration_seconds?: number | null };

export async function fetchSocialAnalytics(platform: "instagram" | "tiktok" | "x"): Promise<ContentPerformance[]> {
  const response = await fetch(`/api/platforms/${platform}/sync`, { cache: "no-store" });
  if (!response.ok) return [];
  const result = await response.json() as { analytics?: SocialRow[] };
  return (result.analytics || []).map(row => ({
    id: `${platform}-${row.date}`,
    contentId: "",
    platform: platform === "x" ? "X" : platform[0].toUpperCase() + platform.slice(1),
    views: Number(row.views || 0),
    impressions: Number(row.impressions || 0),
    reach: Number(row.reach || 0),
    likes: Number(row.likes || 0),
    comments: Number(row.comments || 0),
    shares: Number(row.shares || 0),
    saves: Number(row.saves || 0),
    followersGained: Number(row.followers_gained || 0),
    followersLost: Number(row.followers_lost || 0),
    followers: row.followers == null ? undefined : Number(row.followers),
    watchTimeMinutes: row.watch_time_minutes == null ? undefined : Number(row.watch_time_minutes),
    averageViewDurationSeconds: row.average_view_duration_seconds == null ? undefined : Number(row.average_view_duration_seconds),
    recordedAt: row.date,
  }));
}