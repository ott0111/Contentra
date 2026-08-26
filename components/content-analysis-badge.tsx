"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ContentItem } from "@/types/content";
import type { ContentAnalysis } from "@/types/analyzer";
import { fetchAnalyses } from "@/lib/db/analysis-browser";

export default function ContentAnalysisBadge({ item }: { item: ContentItem }) {
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  useEffect(() => {
    void fetchAnalyses().then(rows => setAnalysis(rows.find(row => row.contentId === item.id) || null)).catch(() => setAnalysis(null));
  }, [item.id]);
  return <section className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Content score</p>{analysis ? <p className="mt-1 text-2xl font-bold text-[var(--purple-light)]">{analysis.overallScore} <span className="text-sm text-[var(--muted)]">/ 100</span></p> : <p className="mt-1 text-sm text-[var(--muted)]">No analysis yet</p>}</div><Link href={`/dashboard/analyzer?contentId=${item.id}`} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold hover:border-[var(--purple)]">{analysis ? "View Analysis" : "Analyze Content"}</Link></div></section>;
}
