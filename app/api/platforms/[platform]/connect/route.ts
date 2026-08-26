import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { beginSocialState, getSocialConfig, socialAuthUrl, type SocialPlatform } from "@/lib/platforms/social";

const platforms = new Set<SocialPlatform>(["instagram", "tiktok", "x"]);

export async function GET(request: Request, context: { params: Promise<{ platform: string }> }) {
  const platform = (await context.params).platform as SocialPlatform;
  if (!platforms.has(platform)) return NextResponse.json({ error: "Unsupported platform" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = getSocialConfig(platform);
  if (!config) return NextResponse.json({ error: `${platform} OAuth is not configured` }, { status: 503 });
  const response = NextResponse.redirect(new URL("/", request.url));
  const state = beginSocialState(user.id, platform, response);
  response.headers.set("Location", socialAuthUrl(platform, config, state));
  return response;
}
