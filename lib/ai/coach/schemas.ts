import type { CoachResponse } from "@/types/coach";

const strings = (value: unknown, max = 5) => Array.isArray(value) ? value.filter(item => typeof item === "string" && item.trim()).map(item => item.trim()).slice(0, max) : [];
export function validateCoachResponse(value: unknown): CoachResponse | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.summary !== "string" || !row.summary.trim()) return null;
  const rawRecommendations = Array.isArray(row.recommendations) ? row.recommendations : [];
  const recommendations = rawRecommendations.filter(item => item && typeof item === "object").map(item => { const rec = item as Record<string, unknown>; const action = ["create", "analyze", "schedule", "analytics", "content"].includes(String(rec.action)) ? rec.action as CoachResponse["recommendations"][number]["action"] : "content"; return { title: typeof rec.title === "string" ? rec.title : "Review your content", explanation: typeof rec.explanation === "string" ? rec.explanation : "Review recent content performance.", reason: typeof rec.reason === "string" ? rec.reason : "This is based on your available data.", action, actionLabel: typeof rec.actionLabel === "string" ? rec.actionLabel : "View Content" }; }).slice(0, 5);
  const progress = row.goalProgress && typeof row.goalProgress === "object" ? row.goalProgress as Record<string, unknown> : {};
  const score = typeof progress.score === "number" && Number.isFinite(progress.score) ? Math.max(0, Math.min(100, Math.round(progress.score))) : null;
  const weeklyPlan = Array.isArray(row.weeklyPlan) ? row.weeklyPlan.filter(item => item && typeof item === "object").map(item => { const plan = item as Record<string, unknown>; return { day: typeof plan.day === "string" ? plan.day : "", task: typeof plan.task === "string" ? plan.task : "" }; }).filter(item => item.day && item.task).slice(0, 7) : [];
  return { summary: row.summary.trim(), strengths: strings(row.strengths), opportunities: strings(row.opportunities), recommendations, weeklyPlan, contentIdeas: strings(row.contentIdeas, 6), goalProgress: { score, explanation: typeof progress.explanation === "string" ? progress.explanation : "Your goal does not have enough measurable data yet." } };
}
