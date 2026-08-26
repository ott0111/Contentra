import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookies => cookies.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options); }),
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const protectedRoute = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const onboardingRoute = pathname === "/onboarding";
  if (onboardingRoute && !user) return NextResponse.redirect(new URL("/login", request.url));
  if (onboardingRoute && user) {
    const { data: profile } = await supabase.from("profiles").select("username,display_name,niche,target_audience,experience_level,primary_goal,platforms,content_styles").eq("user_id", user.id).maybeSingle();
    const complete = Boolean(profile?.username && profile?.display_name && profile?.niche && profile?.target_audience && profile?.experience_level && profile?.primary_goal && profile?.platforms?.length && profile?.content_styles?.length);
    if (complete) return NextResponse.redirect(new URL("/dashboard", request.url));
    return response;
  }
  if (protectedRoute && !user) return NextResponse.redirect(new URL("/login", request.url));
  if (protectedRoute && user) {
    const { data: profile } = await supabase.from("profiles").select("username,display_name,niche,target_audience,experience_level,primary_goal,platforms,content_styles").eq("user_id", user.id).maybeSingle();
    const complete = Boolean(profile?.username && profile?.display_name && profile?.niche && profile?.target_audience && profile?.experience_level && profile?.primary_goal && profile?.platforms?.length && profile?.content_styles?.length);
    if (!complete) return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  if ((pathname === "/login" || pathname === "/signup") && user) return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/login", "/signup", "/onboarding", "/auth/:path*", "/api/connections/youtube/callback", "/api/platforms/youtube/callback"] };
