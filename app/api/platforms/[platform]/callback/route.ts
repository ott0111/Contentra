import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSocialOAuthStateCookieName } from "@/lib/platforms/oauth-utils";
import { exchangeSocialCode, fetchSocialAccount, getSocialConfig, saveSocialTokens, verifySocialState, type SocialPlatform } from "@/lib/platforms/social";

const platforms = new Set<SocialPlatform>(["instagram", "tiktok", "x"]);

export async function GET(request: NextRequest, context: { params: Promise<{ platform: string }> }) {
  const platform = (await context.params).platform as SocialPlatform;
  const redirectTo = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/dashboard/settings/connections`;
  if (!platforms.has(platform)) return NextResponse.redirect(`${redirectTo}?error=Unsupported%20platform`);
  const error = request.nextUrl.searchParams.get("error");
  if (error) return NextResponse.redirect(`${redirectTo}?error=${encodeURIComponent("Authorization was cancelled")}`);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const verified = state ? verifySocialState(state, request.cookies.get(getSocialOAuthStateCookieName())?.value) : null;
  if (!code || !state || !verified || verified.platform !== platform) return NextResponse.redirect(`${redirectTo}?error=Invalid%20or%20expired%20OAuth%20state`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== verified.userId) return NextResponse.redirect(`${redirectTo}?error=Authentication%20required`);
  try {
    const config = getSocialConfig(platform);
    if (!config) throw new Error(`${platform} OAuth is not configured`);
    const tokens = await exchangeSocialCode(platform, config, code, state);
    const account = await fetchSocialAccount(platform, tokens.accessToken);
    await saveSocialTokens(user.id, platform, account, tokens);
    const response = NextResponse.redirect(`${redirectTo}?success=connected`);
    response.cookies.delete(getSocialOAuthStateCookieName());
    return response;
  } catch (caught) {
    console.error(`${platform} OAuth callback failed:`, caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.redirect(`${redirectTo}?error=${encodeURIComponent(caught instanceof Error ? caught.message : "Could not connect account")}`);
  }
}
