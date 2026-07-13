"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { readJsonResponse } from "@/lib/fetch-json";

interface SettingsData {
  email: string | null;
  gmailConnected: boolean;
  gmailAddress: string | null;
  gmailUpdatedAt: string | null;
  aiProvider: "groq" | "gemini" | null;
  error?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const data = await readJsonResponse<SettingsData>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load settings");
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell title="Settings">
      {error ? (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      ) : null}

      {loading || !settings ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <div className="grid max-w-2xl gap-4">
          <div className="panel p-5">
            <p className="data-label">Signed in as</p>
            <p className="mt-2 text-sm text-text">{settings.email || "Unknown"}</p>
          </div>

          <div className="panel p-5">
            <p className="data-label">Gmail connection</p>
            {settings.gmailConnected ? (
              <>
                <p className="mt-2 text-sm text-success">Connected</p>
                <p className="mt-1 font-mono text-xs text-muted">
                  {settings.gmailAddress}
                </p>
                {settings.gmailUpdatedAt ? (
                  <p className="mt-1 font-mono text-xs text-muted">
                    Updated {new Date(settings.gmailUpdatedAt).toLocaleString()}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-danger">Not connected</p>
                <p className="mt-2 text-xs text-muted">
                  Sign out and sign in again with Google to reconnect Gmail send
                  access. Make sure Gmail API is enabled in Google Cloud.
                </p>
              </>
            )}
          </div>

          <div className="panel p-5">
            <p className="data-label">AI provider</p>
            {settings.aiProvider ? (
              <p className="mt-2 text-sm capitalize text-text">{settings.aiProvider}</p>
            ) : (
              <p className="mt-2 text-sm text-danger">
                No AI key configured. Add GROQ_API_KEY or GEMINI_API_KEY.
              </p>
            )}
            <p className="mt-2 text-xs text-muted">
              Draft generation uses free-tier rate limits. Generate all will pause
              and retry when limits are hit.
            </p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
