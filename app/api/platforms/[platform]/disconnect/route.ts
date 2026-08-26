import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const supported = new Set(["instagram", "tiktok", "x"]);

export async function POST(request: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const platform = (await context.params).platform;
  if (!supported.has(platform)) return NextResponse.json({ error: "Unsupported platform" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { platformId?: string };
  if (!body.platformId) return NextResponse.json({ error: "Connection ID is required" }, { status: 400 });
  const { error } = await createAdminClient().from("platforms").delete().eq("id", body.platformId).eq("user_id", user.id).eq("platform", platform);
  if (error) return NextResponse.json({ error: "Could not disconnect account" }, { status: 500 });
  return NextResponse.json({ success: true });
}
