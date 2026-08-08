"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSiteUrl } from "@/lib/site-url";

const OAUTH_ERRORS: Record<string, string> = {
  access_denied:
    "Google blocked sign-in. Add your account as a test user in Google Cloud Console (OAuth consent screen → Test users).",
  bad_oauth_state:
    "Sign-in session expired. Keep `npm run dev` running, then click Continue with Google again without waiting on the consent screen.",
  auth: "Sign-in failed. Add this site's /auth/callback URL in Supabase redirect URLs, then try again.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? OAUTH_ERRORS[urlError] ?? `Sign-in error: ${urlError}` : null
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwLoading(true);
    setError(null);

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured. Check your environment variables.");
      setPwLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError(authError.message || "Invalid email or password.");
      setPwLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

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

    // Auth only — outbound mail uses shared sales.afn.alpha@gmail.com (SMTP), not gmail.send OAuth
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
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
          Sales agents: sign in with the email and password your manager gave you.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
            {error}
          </p>
        ) : null}

        <form onSubmit={signInWithPassword} className="mt-6 space-y-3">
          <div>
            <label className="data-label mb-1 block">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="sales.afn.patriot+1@gmail.com"
              required
            />
          </div>
          <div>
            <label className="data-label mb-1 block">Password</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              placeholder="Your password"
              required
            />
          </div>
          <button type="submit" disabled={pwLoading} className="btn-primary w-full">
            {pwLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Managers & team leads
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="btn-secondary w-full"
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
