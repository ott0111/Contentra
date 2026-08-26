import { Suspense } from "react";
import ContentAnalyzer from "@/components/content-analyzer";

export default function AnalyzerPage() {
	return <Suspense fallback={<main className="min-h-screen bg-[var(--background)] p-8 text-sm text-[var(--muted)]">Loading analyzer...</main>}><ContentAnalyzer /></Suspense>;
}