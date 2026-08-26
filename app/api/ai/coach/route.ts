import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reserveAIUsage, recordAIUsage } from "@/lib/billing/usage";
import { askAI } from "@/lib/ai/openai";
import { buildCoachPrompt } from "@/lib/ai/coach/prompts";
import { validateCoachResponse } from "@/lib/ai/coach/schemas";
import type { CoachSnapshot } from "@/types/coach";

export async function POST() {
  try {
    const usage = await reserveAIUsage("coach");
    if (!usage.user) return NextResponse.json({ error: usage.error }, { status: usage.error === "Please log in to use AI." ? 401 : 429 });
    const supabase = await createClient();
    const [{ data: profile }, { data: content }, { data: analytics }, { data: youtubeAnalytics }, { data: socialAnalytics }, { data: previousInsights }] = await Promise.all([
      supabase.from("profiles").select("niche,target_audience,primary_goal,content_styles").eq("user_id", usage.user.id).maybeSingle(),
      supabase.from("content").select("id,title,platform,content_type,tags,status,scheduled_at").eq("user_id", usage.user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("content_analytics").select("content_id,views,likes,comments,shares,followers_gained,recorded_at").eq("user_id", usage.user.id).order("recorded_at", { ascending: false }).limit(100),
      supabase.from("youtube_analytics_daily").select("date,views,likes,comments,subscribers_gained").eq("user_id", usage.user.id).order("date", { ascending: false }).limit(90),
      supabase.from("social_analytics_daily").select("date,platform,views,impressions,reach,likes,comments,shares,saves,followers_gained,followers_lost,followers").eq("user_id", usage.user.id).order("date", { ascending: false }).limit(90),
      supabase.from("coach_insights").select("summary,created_at").eq("user_id", usage.user.id).order("created_at", { ascending: false }).limit(5),
    ]);
    const rows = content || []; const performance = [...(analytics || []), ...(youtubeAnalytics || []).map(row => ({ content_id: "", views: row.views, likes: row.likes, comments: row.comments, shares: 0, followers_gained: row.subscribers_gained, recorded_at: row.date, platform: "YouTube" })), ...(socialAnalytics || []).map(row => ({ content_id: "", views: row.views, likes: row.likes, comments: row.comments, shares: row.shares, followers_gained: row.followers_gained, recorded_at: row.date, platform: row.platform }))];
    const platformTotals = new Map<string, number>(); const typeTotals = new Map<string, number>();
    performance.forEach(row => { const item = rows.find(candidate => candidate.id === row.content_id); const platform = "platform" in row && row.platform ? row.platform : item?.platform || "Unknown"; platformTotals.set(platform, (platformTotals.get(platform) || 0) + Number(row.likes || 0) + Number(row.comments || 0) + Number(row.shares || 0)); if (item) typeTotals.set(item.content_type, (typeTotals.get(item.content_type) || 0) + Number(row.likes || 0) + Number(row.comments || 0) + Number(row.shares || 0)); });
    const totalEngagement = performance.reduce((sum, row) => sum + Number(row.likes || 0) + Number(row.comments || 0) + Number(row.shares || 0), 0);
    const snapshot: CoachSnapshot = { goal: profile?.primary_goal || "Not set", topPlatform: [...platformTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null, topContentType: [...typeTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null, averageEngagement: performance.length ? Math.round(totalEngagement / performance.length) : null, publishingConsistency: null, recentGrowth: performance.length > 1 ? Number(performance[0].followers_gained || 0) : null, contentCount: rows.length, analyticsCount: performance.length, scheduledCount: rows.filter(row => row.scheduled_at).length };
    const raw = await askAI(buildCoachPrompt({ profile: { niche: profile?.niche || "", targetAudience: profile?.target_audience || "", primaryGoal: profile?.primary_goal || "", contentStyles: profile?.content_styles || [] }, content: rows.map(row => ({ title: row.title, platform: row.platform, contentType: row.content_type, tags: row.tags || [], status: row.status, scheduledAt: row.scheduled_at })), analytics: performance.map(row => ({ platform: "platform" in row ? String(row.platform) : "Content", contentType: "", views: row.views, likes: row.likes, comments: row.comments, shares: row.shares, followersGained: row.followers_gained, recordedAt: row.recorded_at })), previousInsights: (previousInsights || []).map(row => ({ summary: row.summary, createdAt: row.created_at })), snapshot }));
    if (!raw) return NextResponse.json({ error: "AI is not configured. Add OPENAI_API_KEY to enable the Growth Coach." }, { status: 503 });
    const coach = validateCoachResponse(JSON.parse(raw)); if (!coach) return NextResponse.json({ error: "Contentra received an invalid coach response. Try again." }, { status: 502 });
    await supabase.from("coach_insights").insert({ user_id: usage.user.id, summary: coach.summary, strengths: coach.strengths, opportunities: coach.opportunities, recommendations: coach.recommendations, weekly_plan: coach.weeklyPlan });
    await recordAIUsage(usage.user.id, "coach");
    return NextResponse.json({ coach, snapshot, updatedAt: new Date().toISOString() });
  } catch { return NextResponse.json({ error: "Contentra couldn't prepare your growth insights right now. Try again." }, { status: 500 }); }
}
