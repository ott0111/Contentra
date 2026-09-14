export type CreditOperation =
  | "ai.generate_text"
  | "ai.analyze"
  | "ai.classify"
  | "ai.structured"
  | "ai.embed"
  | "intelligence.brand_analyze"
  | "intelligence.content_dna"
  | "intelligence.website_extract"
  | "recommendation.generate"
  | "content.generate"
  | "content.improve"
  | "content.repurpose";

const DEFAULT_COSTS: Record<CreditOperation, number> = {
  "ai.generate_text": 2,
  "ai.analyze": 3,
  "ai.classify": 1,
  "ai.structured": 3,
  "ai.embed": 1,
  "intelligence.brand_analyze": 4,
  "intelligence.content_dna": 3,
  "intelligence.website_extract": 2,
  "recommendation.generate": 0,
  "content.generate": 5,
  "content.improve": 3,
  "content.repurpose": 3,
};

export function creditCost(operation: CreditOperation, override?: Partial<Record<CreditOperation, number>>) {
  const configured = Number(process.env[`CREDIT_COST_${operation.replaceAll(".", "_").toUpperCase()}`] ?? "");
  if (Number.isFinite(configured) && configured >= 0) return configured;
  return override?.[operation] ?? DEFAULT_COSTS[operation] ?? 0;
}

export function isCreditExempt(operation: CreditOperation) {
  return creditCost(operation) === 0;
}
