import { NextResponse } from "next/server";
import { askAI } from "@/lib/ai/openai";
import { buildImprovementPrompt } from "@/lib/ai/prompts";
import { parseGenerated } from "@/lib/ai/schemas";
import { recordAIUsage, reserveAIUsage } from "@/lib/billing/usage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const usage = await reserveAIUsage("improve");
    if (!usage.user) return NextResponse.json({ error: usage.error }, { status: usage.error === "Please log in to use AI." ? 401 : 429 });
    if (typeof body?.content !== "string" || !body.content.trim() || !body.profile) return NextResponse.json({ error: "Content and creator context are required." }, { status: 400 });
    const raw = await askAI(buildImprovementPrompt(body.content, body.profile));
    if (!raw) return NextResponse.json({ error: "AI is not configured. Add OPENAI_API_KEY to enable improvement." }, { status: 503 });
    const result = parseGenerated(JSON.parse(raw));
    if (result) await recordAIUsage(usage.user.id, "improve");
    return result ? NextResponse.json({ content: result.content }) : NextResponse.json({ error: "Contentra received an invalid improvement. Try again." }, { status: 502 });
  } catch { return NextResponse.json({ error: "Contentra couldn't improve this right now. Try again." }, { status: 500 }); }
}