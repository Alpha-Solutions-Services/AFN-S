"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/supabase/env";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
