export type CoachAction = "create" | "analyze" | "schedule" | "analytics" | "content";
export type CoachRecommendation = { title: string; explanation: string; reason: string; action: CoachAction; actionLabel: string };
export type WeeklyPlanItem = { day: string; task: string };
export type CoachResponse = { summary: string; strengths: string[]; opportunities: string[]; recommendations: CoachRecommendation[]; weeklyPlan: WeeklyPlanItem[]; contentIdeas: string[]; goalProgress: { score: number | null; explanation: string } };
export type CoachSnapshot = { goal: string; topPlatform: string | null; topContentType: string | null; averageEngagement: number | null; publishingConsistency: number | null; recentGrowth: number | null; contentCount: number; analyticsCount: number; scheduledCount: number };
