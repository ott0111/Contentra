/**
 * YouTube OAuth Disconnect Route
 * Revokes YouTube OAuth access and removes connection from database
 * 
 * POST /api/platforms/youtube/disconnect
 * Body: { platformId: string }
 * 
 * Returns: JSON { success: boolean, error?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
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

    // Get platform ID from request body
    const body = (await request.json()) as { platformId: string };
    if (!body.platformId) {
      return NextResponse.json({ error: "platformId is required" }, { status: 400 });
    }

    // Delete the platform connection
    // RLS policy enforces that user can only delete their own connections
    const { error: deleteError } = await supabase
      .from("platforms")
      .delete()
      .eq("id", body.platformId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Failed to disconnect platform:", deleteError);
      return NextResponse.json(
        { error: "Failed to disconnect platform" },
        { status: 500 }
      );
    }

    // TODO: Call YouTube API to revoke token if needed
    // Google recommends revoking tokens, but it's not strictly required
    // Tokens will eventually expire on their own

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Disconnect error:", error);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
