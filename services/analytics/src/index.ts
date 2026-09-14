export interface NormalizedMetrics {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  followers: number;
  engagementRate: number;
  watchTimeSeconds: number;
  clicks: number;
  profileVisits: number;
  websiteVisits: number;
  leads: number;
  customers: number;
  conversions: number;
  traffic: number;
  revenue: number;
}

export const CONTENTRA_METRIC_NAMES = [
  "views",
  "reach",
  "likes",
  "comments",
  "shares",
  "saves",
  "followers",
  "engagement_rate",
  "watch_time",
  "clicks",
  "conversions",
  "traffic",
  "leads",
  "customers",
  "revenue",
] as const;

export type ContentraMetricName = (typeof CONTENTRA_METRIC_NAMES)[number];

const ALIASES: Record<string, ContentraMetricName> = {
  view: "views",
  impressions: "views",
  impression: "views",
  plays: "views",
  play_count: "views",
  video_views: "views",
  reach: "reach",
  unique_reach: "reach",
  likes: "likes",
  like_count: "likes",
  favorites: "likes",
  comments: "comments",
  comment_count: "comments",
  replies: "comments",
  shares: "shares",
  share_count: "shares",
  retweets: "shares",
  saves: "saves",
  bookmarks: "saves",
  followers: "followers",
  subscriber_count: "followers",
  subscribers: "followers",
  engagement_rate: "engagement_rate",
  engagement: "engagement_rate",
  watch_time: "watch_time",
  watch_time_seconds: "watch_time",
  average_view_duration: "watch_time",
  clicks: "clicks",
  link_clicks: "clicks",
  conversions: "conversions",
  conversion: "conversions",
  traffic: "traffic",
  sessions: "traffic",
  visitors: "traffic",
  leads: "leads",
  customers: "customers",
  revenue: "revenue",
  sales: "revenue",
};

function numberish(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

export function normalizePlatformMetrics(raw: Record<string, unknown> | null | undefined): NormalizedMetrics {
  const source = raw ?? {};
  const bucket: Record<ContentraMetricName, number> = {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    followers: 0,
    engagement_rate: 0,
    watch_time: 0,
    clicks: 0,
    conversions: 0,
    traffic: 0,
    leads: 0,
    customers: 0,
    revenue: 0,
  };
  for (const [key, value] of Object.entries(source)) {
    const mapped = ALIASES[key.toLowerCase().replaceAll(" ", "_")];
    if (mapped) bucket[mapped] += numberish(value);
  }
  const interactions = bucket.likes + bucket.comments + bucket.shares + bucket.saves;
  const engagementRate =
    bucket.engagement_rate ||
    (bucket.views > 0 ? interactions / bucket.views : bucket.reach > 0 ? interactions / bucket.reach : 0);
  return {
    views: bucket.views,
    reach: bucket.reach,
    likes: bucket.likes,
    comments: bucket.comments,
    shares: bucket.shares,
    saves: bucket.saves,
    followers: bucket.followers,
    engagementRate,
    watchTimeSeconds: bucket.watch_time,
    clicks: bucket.clicks,
    profileVisits: numberish(source.profileVisits ?? source.profile_visits),
    websiteVisits: bucket.traffic,
    leads: bucket.leads,
    customers: bucket.customers,
    conversions: bucket.conversions,
    traffic: bucket.traffic,
    revenue: bucket.revenue,
  };
}

export function flattenNormalizedMetrics(metrics: NormalizedMetrics): Array<{ name: ContentraMetricName; value: number }> {
  const rows: Array<{ name: ContentraMetricName; value: number }> = [
    { name: "views", value: metrics.views },
    { name: "reach", value: metrics.reach },
    { name: "likes", value: metrics.likes },
    { name: "comments", value: metrics.comments },
    { name: "shares", value: metrics.shares },
    { name: "saves", value: metrics.saves },
    { name: "followers", value: metrics.followers },
    { name: "engagement_rate", value: metrics.engagementRate },
    { name: "watch_time", value: metrics.watchTimeSeconds },
    { name: "clicks", value: metrics.clicks },
    { name: "conversions", value: metrics.conversions },
    { name: "traffic", value: metrics.traffic },
    { name: "leads", value: metrics.leads },
    { name: "customers", value: metrics.customers },
    { name: "revenue", value: metrics.revenue },
  ];
  return rows.filter((row) => row.value !== 0);
}

export interface AnalyticsAdapter {
  normalize(raw: unknown): NormalizedMetrics;
}
