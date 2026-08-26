import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOAuthProvider,
  savePlatformConnection,
  verifyOAuthState,
} from "@/lib/platforms/oauth-utils";
import { exchangeYouTubeCode, getYouTubeChannelInfo, validateYouTubeConfig } from "@/lib/platforms/youtube";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const stateCookie = request.cookies.get("contentra_youtube_oauth_state")?.value;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectTo = `${baseUrl}/dashboard/settings/connections`;

  try {
    if (error) {
      return NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent(searchParams.get("error_description") || "User denied access")}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Missing authorization code or state")}`
      );
    }

    const verified = verifyOAuthState(state, stateCookie);
    if (!verified) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Invalid or expired state token")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Authentication required")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    if (verified.userId !== user.id) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("State mismatch - user mismatch")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    const youtubeConfig = getOAuthProvider("youtube");
    if (!youtubeConfig || !validateYouTubeConfig(youtubeConfig)) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("YouTube OAuth is not configured")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    const tokenResponse = await exchangeYouTubeCode(youtubeConfig, code);
    if (!tokenResponse.access_token) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Failed to obtain access token")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    const channelInfo = await getYouTubeChannelInfo(tokenResponse.access_token);
    const saveResult = await savePlatformConnection(user.id, "youtube", {
      username: channelInfo.title,
      platformUserId: channelInfo.id,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      scope: tokenResponse.scope,
    });

    const response = NextResponse.redirect(
      saveResult.error
        ? `${redirectTo}?error=${encodeURIComponent("Failed to save connection: " + saveResult.error)}`
        : `${redirectTo}?success=connected`
    );
    response.cookies.delete("contentra_youtube_oauth_state");
    return response;
  } catch (caughtError) {
    console.error("YouTube callback error:", caughtError);
    const response = NextResponse.redirect(
      `${redirectTo}?error=${encodeURIComponent("OAuth callback failed")}`
    );
    response.cookies.delete("contentra_youtube_oauth_state");
    return response;
  }
}
