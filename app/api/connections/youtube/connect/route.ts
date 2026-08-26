import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthProvider, generateOAuthState, storeOAuthState } from "@/lib/platforms/oauth-utils";
import { getYouTubeAuthUrl, validateYouTubeConfig } from "@/lib/platforms/youtube";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const youtubeConfig = getOAuthProvider("youtube");
    if (!youtubeConfig || !validateYouTubeConfig(youtubeConfig)) {
      return NextResponse.json({ error: "YouTube OAuth is not configured" }, { status: 500 });
    }

    const state = generateOAuthState();
    const response = NextResponse.redirect(getYouTubeAuthUrl(youtubeConfig, state));
    storeOAuthState(state, user.id, "youtube", response);

    return response;
  } catch (error) {
    console.error("YouTube connect error:", error);
    return NextResponse.json({ error: "OAuth flow initiation failed" }, { status: 500 });
  }
}
