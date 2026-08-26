import { NextResponse } from "next/server";
import { askAI } from "@/lib/ai/openai";
import { buildAnalysisPrompt } from "@/lib/ai/prompts";
import { parseAnalysis } from "@/lib/ai/schemas";
import type { AnalyzerPlatform } from "@/types/analyzer";
import { recordAIUsage, reserveAIUsage } from "@/lib/billing/usage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const usage = await reserveAIUsage("analyze");
    if (!usage.user) return NextResponse.json({ error: usage.error }, { status: usage.error === "Please log in to use AI." ? 401 : 429 });
    if (typeof body?.content !== "string" || !body.content.trim()) return NextResponse.json({ error: "Paste some content to analyze." }, { status: 400 });
    if (!["X", "TikTok", "Instagram", "YouTube"].includes(body.platform)) return NextResponse.json({ error: "Choose a platform before analyzing." }, { status: 400 });
    if (!body.profile) return NextResponse.json({ error: "Creator context is required." }, { status: 400 });
    const raw = await askAI(buildAnalysisPrompt(body.content, body.platform, body.contentType || "", body.profile));
    if (!raw) return NextResponse.json({ error: "AI is not configured. Add OPENAI_API_KEY to enable analysis." }, { status: 503 });
    const result = parseAnalysis(JSON.parse(raw), { content: body.content, platform: body.platform as AnalyzerPlatform, contentId: body.contentId, title: body.title });
    if (result) await recordAIUsage(usage.user.id, "analyze");
    return result ? NextResponse.json(result) : NextResponse.json({ error: "Contentra received an invalid analysis. Try again." }, { status: 502 });
  } catch { return NextResponse.json({ error: "Contentra couldn't analyze this right now. Try again." }, { status: 500 }); }
}