import { notFound, redirect } from "next/navigation";

const previewRoutes: Record<string, string> = {
  blitz: "/creatos", creatos: "/creatos", inspiration: "/app/inspiration", create: "/app/create", content: "/app/content",
  library: "/app/library", calendar: "/app/calendar", analytics: "/app/analytics", settings: "/app/settings/account",
};

export default async function PreviewRoute({ params }: { params: Promise<{ preview: string }> }) {
  const { preview } = await params;
  const destination = previewRoutes[preview];
  if (!destination) notFound();
  redirect(process.env.NODE_ENV === "development" ? destination : "/login");
}
