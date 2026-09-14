export const developmentPreviewEnabled = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEVELOPMENT_PREVIEW === "1";

export const developmentWorkspace = { id: "development-contentra-demo", name: "Contentra Demo", type: "CREATOR", role: "OWNER" } as const;

const content = { id: "development-content-1", title: "Three ways to make your content workflow lighter", format: "carousel", platform: "instagram", status: "DRAFT", updatedAt: "2026-01-15T10:00:00.000Z" };
const opportunity = { id: "development-opportunity-1", title: "Turn your workflow into a practical carousel", description: "Share a concise, useful look at how you plan and ship content.", whyItMatters: "Development preview data only — no provider data is connected.", suggestedFormat: "carousel", suggestedPlatform: "instagram" };
const home = { nba: { title: "Draft your next practical carousel", reason: "Development preview data only. Connect real sources for evidence-backed recommendations.", type: "DEMO" }, opportunities: [opportunity], recommendations: [], recentContent: [content], upcomingCalendar: [{ id: "development-calendar-1", scheduledFor: "2026-01-16T14:00:00.000Z", status: "SCHEDULED", platform: "instagram", content }], metrics: [{ views: 0, reach: 0, followers: 0, engagementRate: null }] };

export function developmentPreviewResponse(path: string, method = "GET"): unknown | undefined {
  if (!developmentPreviewEnabled) return undefined;
  const pathname = path.split("?")[0];
  if (pathname === "/api/v1/auth/me") return { user: { id: "development-user", name: "Dev User", email: "dev-user@contentra.local" }, workspaces: [{ role: "OWNER", workspace: developmentWorkspace }] };
  if (pathname === "/api/v1/me") return { id: "development-user", name: "Dev User", email: "dev-user@contentra.local", preferences: {} };
  if (pathname === "/api/v1/auth/logout") return { ok: true };
  if (pathname === "/api/v1/workspaces") return [{ role: "OWNER", workspace: developmentWorkspace }];
  if (/\/home$/.test(pathname)) return home;
  if (/\/analytics$/.test(pathname)) return { accounts: [], platform: [], timeline: [], content: [], audience: [], recommendations: [], nba: null };
  if (/\/content$/.test(pathname)) return method === "POST" ? { id: content.id } : [content];
  if (/\/calendar$/.test(pathname)) return method === "GET" ? home.upcomingCalendar : { id: "development-calendar-1" };
  if (/\/library\/collections$/.test(pathname)) return [{ id: "development-collection-1", name: "Demo ideas", description: "Development preview data only.", _count: { items: 1 }, items: [{ content }] }];
  if (/\/inspiration\/saved$/.test(pathname)) return [];
  if (/\/inspiration$/.test(pathname)) return [{ id: "development-trend-1", topic: "Show the system behind the result", platform: "instagram", momentum: 0, relevance: 0 }];
  if (/\/ai\/actions$/.test(pathname)) return { output: "Development preview: AI is unavailable until a provider is configured.", provider: "development-preview", model: "mock" };
  return undefined;
}
