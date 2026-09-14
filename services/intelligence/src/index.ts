export interface IntelligenceItem<T = unknown> {
  key: string;
  value: T;
  source: "USER" | "WEBSITE" | "SOCIAL" | "IMPORT" | "ANALYTICS" | "BUSINESS" | "AI";
  confidence?: number;
  version: number;
  updatedAt: Date;
}

export interface ContentDNAAnalysis {
  topics: string[];
  hooks: string[];
  formats: string[];
  patterns: string[];
  gaps: string[];
  winners: string[];
  underperforming: string[];
}

export interface BrandKnowledge {
  identity: {
    name?: string;
    description?: string;
    website?: string;
    products: string[];
    services: string[];
  };
  audience: {
    target?: string;
    painPoints: string[];
    interests: string[];
    goals: string[];
  };
  positioning: {
    mission?: string;
    positioning?: string;
    differentiation?: string;
    topics: string[];
    competitors: string[];
  };
  voice: {
    tone: string[];
    writingStyle: string[];
    dos: string[];
    donts: string[];
  };
  contentDNA: ContentDNAAnalysis;
  knowledge: Array<{
    key: string;
    value: unknown;
    source: IntelligenceItem["source"];
    confidence: number;
    lastUpdated: Date;
  }>;
}

export interface IntelligenceSources {
  brandName?: string;
  niche?: string;
  goals?: string[];
  websiteText?: string;
  websiteUrl?: string;
  content: Array<{ title?: string | null; caption?: string | null; script?: string | null; format: string; platform: string; status: string }>;
  imported: Array<{ kind: string; extracted?: Record<string, unknown> | null }>;
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "our", "into", "about"]);

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

function topTerms(texts: string[], limit = 8) {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const word of tokens(text)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

function firstSentence(text?: string) {
  if (!text) return undefined;
  const match = text.trim().match(/^[^.!?\n]{12,220}/);
  return match?.[0]?.trim();
}

export function analyzeWorkspaceIntelligence(sources: IntelligenceSources): BrandKnowledge {
  const corpus = [
    sources.niche ?? "",
    sources.websiteText ?? "",
    ...sources.content.map((item) => `${item.title ?? ""} ${item.caption ?? ""} ${item.script ?? ""}`),
    ...sources.imported.map((item) => JSON.stringify(item.extracted ?? {})),
  ].filter(Boolean);
  const topics = topTerms(corpus);
  const formats = [...new Set(sources.content.map((item) => item.format))];
  const hooks = sources.content
    .map((item) => firstSentence(item.caption ?? item.script ?? item.title ?? undefined))
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
  const published = sources.content.filter((item) => item.status === "PUBLISHED");
  const drafts = sources.content.filter((item) => item.status === "DRAFT" || item.status === "IDEA");
  const now = new Date();
  const description = firstSentence(sources.niche) ?? firstSentence(sources.websiteText);
  return {
    identity: {
      name: sources.brandName,
      description,
      website: sources.websiteUrl,
      products: topics.slice(0, 3),
      services: topics.slice(3, 6),
    },
    audience: {
      target: sources.niche,
      painPoints: sources.goals?.length ? ["Unclear next action", "Inconsistent publishing"] : [],
      interests: topics,
      goals: sources.goals ?? [],
    },
    positioning: {
      mission: description,
      positioning: sources.niche,
      differentiation: topics[0] ? `Practical expertise in ${topics[0]}` : undefined,
      topics,
      competitors: [],
    },
    voice: {
      tone: ["clear", "direct", "useful"],
      writingStyle: ["short paragraphs", "concrete examples"],
      dos: ["Lead with the outcome", "Use the audience's language"],
      donts: ["Generic hype", "Unverified claims"],
    },
    contentDNA: {
      topics,
      hooks,
      formats,
      patterns: formats.length ? [`Repeats ${formats[0]}`] : [],
      gaps: drafts.length && !published.length ? ["No published content yet"] : topics.length < 3 ? ["Thin topic coverage"] : [],
      winners: published.slice(0, 5).map((item) => item.title ?? item.format),
      underperforming: [],
    },
    knowledge: [
      { key: "identity", value: description ?? null, source: sources.websiteText ? "WEBSITE" : "USER", confidence: description ? 0.6 : 0.2, lastUpdated: now },
      { key: "topics", value: topics, source: sources.content.length ? "IMPORT" : "USER", confidence: topics.length ? 0.55 : 0.15, lastUpdated: now },
      { key: "goals", value: sources.goals ?? [], source: "USER", confidence: sources.goals?.length ? 0.9 : 0.1, lastUpdated: now },
    ],
  };
}

export interface BrandIntelligenceService {
  upsert<T>(workspaceId: string, item: IntelligenceItem<T>): Promise<void>;
  analyzeContentDNA(workspaceId: string): Promise<ContentDNAAnalysis>;
}
