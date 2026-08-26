/**
 * YouTube OAuth Connect Route
 * Initiates the OAuth flow by redirecting to YouTube's consent screen
 * 
 * GET /api/platforms/youtube/connect
 * Query: (none)
 * 
 * Returns: Redirect to YouTube OAuth consent URL or error JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthProvider, generateOAuthState, storeOAuthState } from "@/lib/platforms/oauth-utils";
import { getYouTubeAuthUrl, validateYouTubeConfig } from "@/lib/platforms/youtube";

export async function GET(_request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get YouTube OAuth config
    const youtubeConfig = getOAuthProvider("youtube");
    if (!youtubeConfig || !validateYouTubeConfig(youtubeConfig)) {
      return NextResponse.json({ error: "YouTube OAuth is not configured" }, { status: 500 });
    }

    // Generate CSRF state token
    const state = generateOAuthState();
    const authUrl = getYouTubeAuthUrl(youtubeConfig, state);
    const response = NextResponse.redirect(authUrl);
    storeOAuthState(state, user.id, "youtube", response);

    // Redirect user to YouTube OAuth consent screen
    return response;
  } catch (error) {
    console.error("YouTube connect error:", error);
    return NextResponse.json({ error: "OAuth flow initiation failed" }, { status: 500 });
  }
}
