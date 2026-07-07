"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/site-url";

const OAUTH_ERRORS: Record<string, string> = {
  access_denied:
    "Google blocked sign-in. Add your Gmail as a test user in Google Cloud Console (OAuth consent screen → Test users).",
  bad_oauth_state:
    "Sign-in session expired. Keep `npm run dev` running, then click Continue with Google again without waiting on the consent screen.",
  auth: "Sign-in failed. Add this site's /auth/callback URL in Supabase redirect URLs, then try again.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? OAUTH_ERRORS[urlError] ?? `Sign-in error: ${urlError}` : null
  );

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured. Check your environment variables.");
      setLoading(false);
      return;
    }

    const siteUrl =
      typeof window !== "undefined" ? window.location.origin : getSiteUrl();

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/gmail.send",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="panel w-full max-w-md p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Alpha Sales Point
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-text">Sales CRM</h1>
        <p className="mt-3 text-sm text-muted">
          Sign in with the Google account you want cold emails to send from.
          Gmail send permission is required.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="btn-primary mt-6 w-full"
        >
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
