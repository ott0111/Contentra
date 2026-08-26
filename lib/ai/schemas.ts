import type { ContentIdea, GeneratedContent } from "@/types/ai";
import type { AnalysisCategory, AnalyzerPlatform, ContentAnalysis } from "@/types/analyzer";
import { calculateOverallScore, sanitizeCategory } from "@/lib/analyzer/calculations";
export function parseGenerated(value: unknown): GeneratedContent | null { if (!value || typeof value !== "object") return null; const item = value as Record<string, unknown>; if (typeof item.content !== "string") return null; return { content: item.content, hook: typeof item.hook === "string" ? item.hook : "", cta: typeof item.cta === "string" ? item.cta : "", platform: typeof item.platform === "string" ? item.platform : "", contentType: typeof item.contentType === "string" ? item.contentType : "" }; }
export function parseIdeas(value: unknown): ContentIdea[] | null { if (!Array.isArray(value)) return null; const ideas = value.filter(item => item && typeof item === "object").map(item => { const row = item as Record<string, unknown>; return { title: String(row.title || ""), hook: String(row.hook || ""), angle: String(row.angle || ""), cta: String(row.cta || "") }; }).filter(item => item.title && item.hook); return ideas.length ? ideas : null; }

export function parseAnalysis(value: unknown, input: { content: string; platform: AnalyzerPlatform; contentId?: string; title?: string }): ContentAnalysis | null {
	if (!value || typeof value !== "object") return null;
	const row = value as Record<string, unknown>;
	const categories = ["hook", "clarity", "value", "engagement", "shareability", "cta"] as const;
	const parsed = Object.fromEntries(categories.map(key => [key, sanitizeCategory(row[key])])) as Record<typeof categories[number], AnalysisCategory>;
	const all = categories.flatMap(key => parsed[key].strengths);
	const weaknesses = categories.flatMap(key => parsed[key].weaknesses);
	const recommendations = categories.flatMap(key => parsed[key].recommendations);
	return { id: crypto.randomUUID(), contentId: input.contentId, title: input.title || input.content.split("\n")[0].slice(0, 72) || "Untitled analysis", content: input.content, platform: input.platform, overallScore: calculateOverallScore(parsed), ...parsed, strengths: [...new Set(all)].slice(0, 5), weaknesses: [...new Set(weaknesses)].slice(0, 5), recommendations: [...new Set(recommendations)].slice(0, 6), createdAt: new Date().toISOString() };
}