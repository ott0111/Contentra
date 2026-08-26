/**
 * YouTube OAuth Callback Route
 * Handles OAuth callback from YouTube after user grants permission
 * Exchanges authorization code for tokens and saves connection
 * 
 * GET /api/platforms/youtube/callback
 * Query: code (authorization code), state (CSRF token), error (if user denied)
 * 
 * Returns: Redirect to settings/connections page with success/error status
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOAuthProvider,
  verifyOAuthState,
  savePlatformConnection,
} from "@/lib/platforms/oauth-utils";
import { exchangeYouTubeCode, getYouTubeChannelInfo, validateYouTubeConfig } from "@/lib/platforms/youtube";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Build redirect URL for settings/connections page
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectTo = `${baseUrl}/dashboard/settings/connections`;
  const stateCookie = request.cookies.get("contentra_youtube_oauth_state")?.value;

  try {
    // Check for user denial
    if (error) {
      const errorMsg = searchParams.get("error_description") || "User denied access";
      return NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent(errorMsg)}`
      );
    }

    // Validate code and state
    if (!code || !state) {
      return NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Missing authorization code or state")}`
      );
    }

    // Verify CSRF state token
    const verified = verifyOAuthState(state, stateCookie);
    if (!verified) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Invalid or expired state token")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    // Verify user is still authenticated
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

    // Verify state belongs to current user
    if (verified.userId !== user.id) {
      return NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("State mismatch - user mismatch")}`
      );
    }

    // Get YouTube OAuth config
    const youtubeConfig = getOAuthProvider("youtube");
    if (!youtubeConfig || !validateYouTubeConfig(youtubeConfig)) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("YouTube OAuth is not configured")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    // Exchange code for tokens
    const tokenResponse = await exchangeYouTubeCode(youtubeConfig, code);

    if (!tokenResponse.access_token) {
      const response = NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Failed to obtain access token")}`
      );
      response.cookies.delete("contentra_youtube_oauth_state");
      return response;
    }

    // Get channel info to verify access and get username
    let channelInfo;
    try {
      channelInfo = await getYouTubeChannelInfo(tokenResponse.access_token);
    } catch (err) {
      console.error("Failed to fetch YouTube channel info:", err);
      return NextResponse.redirect(
        `${redirectTo}?error=${encodeURIComponent("Failed to fetch channel information")}`
      );
    }

    // Save connection with tokens to database
    const result = await savePlatformConnection(user.id, "youtube", {
      username: channelInfo.title,
      platformUserId: channelInfo.id,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      scope: tokenResponse.scope,
    });

    const response = NextResponse.redirect(
      result.error ? `${redirectTo}?error=${encodeURIComponent("Failed to save connection: " + result.error)}` : `${redirectTo}?success=connected`
    );
    response.cookies.delete("contentra_youtube_oauth_state");

    if (result.error) {
      return response;
    }

    // Redirect to connections page with success message
    return response;
  } catch (err) {
    console.error("YouTube callback error:", err);
    const response = NextResponse.redirect(
      `${redirectTo}?error=${encodeURIComponent("OAuth callback failed")}`
    );
    response.cookies.delete("contentra_youtube_oauth_state");
    return response;
  }
}
