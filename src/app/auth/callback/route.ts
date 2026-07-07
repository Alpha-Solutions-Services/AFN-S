import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { storeGoogleTokens } from "@/lib/google-tokens";

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(errorParam)}`);
  }

  if (!url || !anon || !code) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?error=auth`);
  }

  const session = sessionData.session;
  const user = session?.user;

  if (user && session?.provider_refresh_token) {
    const gmailAddress = user.email ?? "";
    const result = await storeGoogleTokens(
      user.id,
      session.provider_refresh_token,
      gmailAddress
    );
    if (!result.ok) {
      console.error("Failed to store Google tokens:", result.error);
    }
  } else if (user) {
    console.warn("No provider_refresh_token in session for user", user.id);
  }

  return NextResponse.redirect(`${origin}/dashboard/companies`);
}
