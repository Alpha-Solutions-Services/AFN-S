import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { storeGoogleTokens } from "@/lib/google-tokens";
import { isAllowedSiteOrigin } from "@/lib/site-url";

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const errorCode = searchParams.get("error_code");

  if (!isAllowedSiteOrigin(origin)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 400 });
  }

  if (errorParam || errorCode) {
    const key = errorCode || errorParam || "auth";
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(key)}`);
  }

  if (!url || !anon || !code) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  let response = NextResponse.redirect(`${origin}/dashboard/companies`);

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("exchangeCodeForSession:", error.message);
    const key = error.message.includes("state") ? "bad_oauth_state" : "auth";
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(key)}`);
  }

  const session = sessionData.session;
  const user = session?.user;

  if (user && session?.provider_refresh_token) {
    const result = await storeGoogleTokens(
      user.id,
      session.provider_refresh_token,
      user.email ?? ""
    );
    if (!result.ok) {
      console.error("Failed to store Google tokens:", result.error);
    }
  } else if (user) {
    console.warn("No provider_refresh_token in session for user", user.id);
  }

  return response;
}
