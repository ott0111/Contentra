export type TwitchDailyAnalyticsInput = {
  date: string;
  followerTotal: number;
  previousFollowers: number;
  videos: Array<{ created_at: string; view_count: number }>;
  streamSnapshots: Array<{ stream_id: string; started_at: string; ended_at?: string | null; viewer_count: number }>;
  nowMs: number;
};

export function buildTwitchAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "moderator:read:followers", state });
  return `https://id.twitch.tv/oauth2/authorize?${query}`;
}

export function buildTwitchTokenParams(clientId: string, clientSecret: string, grantType: string, credentialName: "code" | "refresh_token", credential: string, redirectUri?: string): URLSearchParams {
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: grantType, [credentialName]: credential });
  if (redirectUri) params.set("redirect_uri", redirectUri);
  return params;
}

export function parseTwitchDurationSeconds(value: string): number {
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export function addTwitchCursor(path: string, cursor: string): string {
  return cursor ? `${path}${path.includes("?") ? "&" : "?"}after=${encodeURIComponent(cursor)}` : path;
}

export function buildTwitchDailyAnalytics(input: TwitchDailyAnalyticsInput) {
  const sampledViewers = input.streamSnapshots.map(snapshot => Number(snapshot.viewer_count));
  const streamIds = new Map<string, number>();
  input.streamSnapshots.forEach(snapshot => {
    const endMs = snapshot.ended_at ? new Date(snapshot.ended_at).getTime() : input.nowMs;
    const duration = Math.max(0, (endMs - new Date(snapshot.started_at).getTime()) / 60000);
    streamIds.set(snapshot.stream_id, Math.max(streamIds.get(snapshot.stream_id) || 0, duration));
  });
  return {
    date: input.date,
    views: input.videos.filter(video => video.created_at.slice(0, 10) === input.date).reduce((total, video) => total + video.view_count, 0),
    followers: input.followerTotal,
    followersGained: Math.max(0, input.followerTotal - input.previousFollowers),
    streamDurationMinutes: [...streamIds.values()].reduce((total, duration) => total + duration, 0),
    averageSampledViewers: sampledViewers.length ? sampledViewers.reduce((total, viewers) => total + viewers, 0) / sampledViewers.length : 0,
    peakSampledViewers: sampledViewers.length ? Math.max(...sampledViewers) : 0,
  };
}
