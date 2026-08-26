import assert from "node:assert/strict";
import { test } from "node:test";
import { addTwitchCursor, buildTwitchAuthorizationUrl, buildTwitchDailyAnalytics, buildTwitchTokenParams, parseTwitchDurationSeconds } from "../lib/platforms/twitch-utils.ts";

test("builds the Twitch authorization request with the minimum scope", () => {
  const url = new URL(buildTwitchAuthorizationUrl("client", "https://example.com/callback", "state"));
  assert.equal(url.origin + url.pathname, "https://id.twitch.tv/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "client");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.com/callback");
  assert.equal(url.searchParams.get("scope"), "moderator:read:followers");
  assert.equal(url.searchParams.get("state"), "state");
});

test("parses Twitch ISO duration strings", () => {
  assert.equal(parseTwitchDurationSeconds("1h2m3.5s"), 3723.5);
  assert.equal(parseTwitchDurationSeconds("invalid"), 0);
});

test("adds cursor pagination without altering the base query", () => {
  assert.equal(addTwitchCursor("/helix/videos?first=100", "next cursor"), "/helix/videos?first=100&after=next%20cursor");
  assert.equal(addTwitchCursor("/helix/videos?first=100", ""), "/helix/videos?first=100");
});

test("normalizes sampled viewer and follower analytics", () => {
  const analytics = buildTwitchDailyAnalytics({ date: "2026-08-26", followerTotal: 120, previousFollowers: 110, videos: [{ created_at: "2026-08-26T10:00:00Z", view_count: 42 }], streamSnapshots: [{ stream_id: "stream-1", started_at: "2026-08-26T08:00:00Z", viewer_count: 10 }, { stream_id: "stream-1", started_at: "2026-08-26T08:00:00Z", viewer_count: 30 }], nowMs: Date.parse("2026-08-26T09:00:00Z") });
  assert.equal(analytics.views, 42);
  assert.equal(analytics.followersGained, 10);
  assert.equal(analytics.averageSampledViewers, 20);
  assert.equal(analytics.peakSampledViewers, 30);
  assert.equal(analytics.streamDurationMinutes, 60);
});

test("stops completed streams at their recorded end time", () => {
  const analytics = buildTwitchDailyAnalytics({ date: "2026-08-26", followerTotal: 120, previousFollowers: 120, videos: [], streamSnapshots: [{ stream_id: "stream-1", started_at: "2026-08-26T08:00:00Z", ended_at: "2026-08-26T09:00:00Z", viewer_count: 20 }], nowMs: Date.parse("2026-08-26T12:00:00Z") });
  assert.equal(analytics.streamDurationMinutes, 60);
});

test("builds authorization-code and refresh token requests", () => {
  const authorizationParams = buildTwitchTokenParams("client", "secret", "authorization_code", "code", "authorization-code", "https://example.com/callback");
  assert.equal(authorizationParams.get("grant_type"), "authorization_code");
  assert.equal(authorizationParams.get("code"), "authorization-code");
  assert.equal(authorizationParams.get("redirect_uri"), "https://example.com/callback");
  const refreshParams = buildTwitchTokenParams("client", "secret", "refresh_token", "refresh_token", "refresh-token");
  assert.equal(refreshParams.get("grant_type"), "refresh_token");
  assert.equal(refreshParams.get("refresh_token"), "refresh-token");
});