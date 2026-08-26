export const analyzerPlatforms = ["X", "TikTok", "Instagram", "YouTube"] as const;
export type AnalyzerPlatform = typeof analyzerPlatforms[number];

export type AnalysisCategory = {
  score: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

export type ContentAnalysis = {
  id: string;
  contentId?: string;
  title: string;
  content: string;
  platform: AnalyzerPlatform;
  overallScore: number;
  hook: AnalysisCategory;
  clarity: AnalysisCategory;
  value: AnalysisCategory;
  engagement: AnalysisCategory;
  shareability: AnalysisCategory;
  cta: AnalysisCategory;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  improvedContent?: string;
  createdAt: string;
};

export type AnalyzerContext = {
  niche: string;
  targetAudience: string;
  primaryGoal: string;
  contentStyle: string;
  contentType: string;
};