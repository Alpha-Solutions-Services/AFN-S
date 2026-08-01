import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
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

  let response = NextResponse.redirect(`${origin}/dashboard/calls`);

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("exchangeCodeForSession:", error.message);
    const key = error.message.includes("state") ? "bad_oauth_state" : "auth";
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(key)}`);
  }

  return response;
}
