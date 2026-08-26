import type { CreatorProfile } from "@/types/creator";
export type StudioMode = "content" | "ideas";
export type StudioSettings = { platform: string; contentType: string; topic: string; tone: string; goal: string; length: string };
export type GeneratedContent = { content: string; hook: string; cta: string; platform: string; contentType: string };
export type ContentIdea = { title: string; hook: string; angle: string; cta: string };
export type AIRequest = { settings: StudioSettings; profile: CreatorProfile };