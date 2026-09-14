export interface RecommendationInput {
  hasBrand: boolean;
  hasAudience: boolean;
  hasContent: boolean;
  unpublishedReady: number;
  scheduledSoon: number;
  connectedAccounts: number;
  websiteConnected: boolean;
  goals: string[];
  topics: string[];
  formats: string[];
  opportunities: number;
  trends: Array<{ topic: string; relevance: number }>;
}

export interface Recommendation {
  title: string;
  reason: string;
  priority: number;
  confidence: number;
  suggestedAction: string;
  relatedEntity?: { type: string; id: string };
}

export type NextBestActionType =
  | "CREATE"
  | "PUBLISH"
  | "IMPROVE"
  | "DISCOVER"
  | "ANALYZE"
  | "REPURPOSE"
  | "REVIEW"
  | "CONNECT";

export interface NextBestAction {
  type: NextBestActionType;
  title: string;
  reason: string;
  expectedValue: number;
  confidence: number;
}

export function generateRecommendations(input: RecommendationInput): Recommendation[] {
  const items: Recommendation[] = [];
  if (!input.connectedAccounts && !input.websiteConnected) {
    items.push({
      title: "Connect your existing world",
      reason: "Contentra cannot measure what is working until a website or social account is connected.",
      priority: 100,
      confidence: 0.95,
      suggestedAction: "CONNECT",
    });
  }
  if (!input.hasContent) {
    items.push({
      title: "Create your first piece of content",
      reason: "A first draft gives Contentra material to learn topics, hooks, and formats.",
      priority: 90,
      confidence: 0.9,
      suggestedAction: "CREATE",
    });
  }
  if (input.unpublishedReady > 0) {
    items.push({
      title: "Publish work that is already ready",
      reason: `${input.unpublishedReady} piece(s) are marked ready and can move through publishing.`,
      priority: 85,
      confidence: 0.8,
      suggestedAction: "PUBLISH",
    });
  }
  if (input.hasContent && input.formats.length === 1) {
    items.push({
      title: "Repurpose your strongest format",
      reason: `Most of your library is ${input.formats[0]}. Adjacent formats can reach the same audience with less new production.`,
      priority: 70,
      confidence: 0.62,
      suggestedAction: "REPURPOSE",
    });
  }
  if (input.topics[0]) {
    items.push({
      title: `Stay on ${input.topics[0]}`,
      reason: "This topic already appears in your workspace context and is the safest next publishing focus.",
      priority: 65,
      confidence: 0.58,
      suggestedAction: "CREATE",
    });
  }
  for (const trend of input.trends.filter((item) => item.relevance >= 0.5).slice(0, 3)) {
    items.push({
      title: `${trend.topic} is relevant to you`,
      reason: "This trend was scored against your workspace topics, not as a generic trending list.",
      priority: Math.round(60 + trend.relevance * 20),
      confidence: trend.relevance,
      suggestedAction: "DISCOVER",
    });
  }
  if (input.hasContent && !input.hasAudience) {
    items.push({
      title: "Review who this is for",
      reason: "Audience signals are thin. Confirm who you serve so recommendations stay specific.",
      priority: 55,
      confidence: 0.5,
      suggestedAction: "REVIEW",
    });
  }
  if (input.goals.includes("Generate leads") && input.opportunities === 0) {
    items.push({
      title: "Turn expertise into a lead magnet",
      reason: "Lead generation is a workspace goal, but no current opportunity is mapped to it.",
      priority: 72,
      confidence: 0.54,
      suggestedAction: "CREATE",
    });
  }
  return items.sort((a, b) => b.priority - a.priority).slice(0, 12);
}

export function computeNextBestAction(input: RecommendationInput): NextBestAction {
  if (!input.connectedAccounts && !input.websiteConnected && !input.hasContent) {
    return {
      type: "CONNECT",
      title: "Connect a source of truth",
      reason: "The highest-value next step is giving Contentra something real to understand.",
      expectedValue: 1,
      confidence: 0.95,
    };
  }
  if (!input.hasContent) {
    return {
      type: "CREATE",
      title: "Create the first piece of content",
      reason: "Once content exists, Contentra can learn what you make and recommend what to do next.",
      expectedValue: 0.9,
      confidence: 0.9,
    };
  }
  if (input.unpublishedReady > 0) {
    return {
      type: "PUBLISH",
      title: "Publish ready content",
      reason: "Shipping existing ready work beats creating more unfinished drafts.",
      expectedValue: 0.85,
      confidence: 0.8,
    };
  }
  if (input.scheduledSoon > 0) {
    return {
      type: "REVIEW",
      title: "Review upcoming scheduled posts",
      reason: "Confirm captions, assets, and platform targeting before they go live.",
      expectedValue: 0.7,
      confidence: 0.7,
    };
  }
  if (input.connectedAccounts && !input.topics.length) {
    return {
      type: "ANALYZE",
      title: "Analyze connected content",
      reason: "Accounts are connected, but Content DNA is still thin.",
      expectedValue: 0.75,
      confidence: 0.66,
    };
  }
  return {
    type: "CREATE",
    title: input.topics[0] ? `Create the next ${input.topics[0]} piece` : "Create the next piece",
    reason: "Your workspace has enough context to keep the understand → create loop moving.",
    expectedValue: 0.6,
    confidence: 0.55,
  };
}

export interface RecommendationEngine {
  generate(input: RecommendationInput): Promise<Recommendation[]>;
}
