import AppShell from "@/components/app-shell";
import { CreatorProvider } from "@/components/creator-provider";
import { ContentProvider } from "@/components/content-provider";
import { AnalyticsProvider } from "@/components/analytics-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <CreatorProvider><ContentProvider><AnalyticsProvider><AppShell>{children}</AppShell></AnalyticsProvider></ContentProvider></CreatorProvider>;
}
