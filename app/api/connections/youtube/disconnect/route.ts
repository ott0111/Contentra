import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { platformId?: string };
    const platformId = body.platformId;

    if (!platformId) {
      return NextResponse.json({ error: "platformId is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("platforms")
      .delete()
      .eq("id", platformId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to disconnect platform:", error);
      return NextResponse.json({ error: "Failed to disconnect platform" }, { status: 500 });
    }

    return NextResponse.json({ success: true, platform: "youtube" });
  } catch (error) {
    console.error("Disconnect error:", error);
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
