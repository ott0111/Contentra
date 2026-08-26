"use client";
import { use } from "react";
import Link from "next/link";
import ContentDetail from "@/components/content-detail";
import { useContent } from "@/components/content-provider";
import ContentPerformance from "@/components/content-performance";
import ContentAnalysisBadge from "@/components/content-analysis-badge";
export default function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); const { items } = useContent(); const item = items.find(content => content.id === id); return item ? <><ContentDetail item={item} /><div className="bg-[var(--background)] px-5 pb-10 sm:px-10"><div className="mx-auto max-w-3xl"><ContentAnalysisBadge item={item} /><ContentPerformance contentId={item.id} /></div></div></> : <main className="min-h-screen bg-[var(--background)] p-10 text-center"><h1 className="text-2xl font-bold">Content not found</h1><Link href="/dashboard/content" className="mt-4 inline-block text-[var(--purple-light)]">Back to library</Link></main>; }