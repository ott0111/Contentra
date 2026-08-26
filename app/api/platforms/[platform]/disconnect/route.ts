import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken, getSocialConfig, revokeTwitchToken } from "@/lib/platforms/social";

const supported = new Set(["instagram", "tiktok", "x", "twitch"]);

export async function POST(request: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const platform = (await context.params).platform;
  if (!supported.has(platform)) return NextResponse.json({ error: "Unsupported platform" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { platformId?: string };
  if (!body.platformId) return NextResponse.json({ error: "Connection ID is required" }, { status: 400 });
  if (platform === "twitch") {
    const { data: connection } = await createAdminClient().from("platforms").select("access_token").eq("id", body.platformId).eq("user_id", user.id).eq("platform", platform).maybeSingle();
    const config = getSocialConfig("twitch");
    const accessToken = decryptToken(connection?.access_token);
    if (config && accessToken) await revokeTwitchToken(config, accessToken).catch(() => undefined);
  }
  const { error } = await createAdminClient().from("platforms").delete().eq("id", body.platformId).eq("user_id", user.id).eq("platform", platform);
  if (error) return NextResponse.json({ error: "Could not disconnect account" }, { status: 500 });
  return NextResponse.json({ success: true });
}
