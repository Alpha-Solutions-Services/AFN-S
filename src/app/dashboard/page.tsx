"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { readJsonResponse } from "@/lib/fetch-json";
import { COMPANY_STAGES, STAGE_LABELS } from "@/lib/stages";
import type { CompanyStage, EmailLog } from "@/lib/types";

interface Stats {
  companiesTotal: number;
  byStage: Record<CompanyStage, number>;
  campaignsTotal: number;
  campaignsSending: number;
  campaignsPaused: number;
  emailsSent: number;
  emailsFailed: number;
  draftsReady: number;
  recentLogs: EmailLog[];
}

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stats");
      const data = await readJsonResponse<Stats & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load stats");
      setStats(data);
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
    <DashboardShell title="Overview">
      {error ? (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      ) : null}

      {loading || !stats ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="panel p-4">
              <p className="data-label">Companies</p>
              <p className="mt-2 text-2xl font-semibold text-text">
                {stats.companiesTotal.toLocaleString()}
              </p>
            </div>
            <div className="panel p-4">
              <p className="data-label">Emails sent</p>
              <p className="mt-2 text-2xl font-semibold text-success">
                {stats.emailsSent.toLocaleString()}
              </p>
            </div>
            <div className="panel p-4">
              <p className="data-label">Failed sends</p>
              <p className="mt-2 text-2xl font-semibold text-danger">
                {stats.emailsFailed.toLocaleString()}
              </p>
            </div>
            <div className="panel p-4">
              <p className="data-label">Drafts ready to send</p>
              <p className="mt-2 text-2xl font-semibold text-accent">
                {stats.draftsReady.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-text">Pipeline snapshot</h2>
                <Link href="/dashboard/leads" className="text-xs text-accent hover:underline">
                  Open pipeline
                </Link>
              </div>
              <div className="space-y-2">
                {COMPANY_STAGES.map((stage) => (
                  <div key={stage} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{STAGE_LABELS[stage]}</span>
                    <span className="font-mono text-text">
                      {(stats.byStage[stage] ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium text-text">Campaigns</h2>
                <Link
                  href="/dashboard/campaigns"
                  className="text-xs text-accent hover:underline"
                >
                  Manage
                </Link>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Total</span>
                  <span className="font-mono">{stats.campaignsTotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Sending</span>
                  <span className="font-mono text-warning">{stats.campaignsSending}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Paused / needs attention</span>
                  <span className="font-mono text-danger">{stats.campaignsPaused}</span>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/dashboard/companies" className="btn-secondary text-xs">
                  Import companies
                </Link>
                <Link href="/dashboard/campaigns" className="btn-primary text-xs">
                  New campaign
                </Link>
              </div>
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium text-text">Recent email activity</h2>
            </div>
            {stats.recentLogs.length === 0 ? (
              <p className="p-4 text-sm text-muted">No sends yet.</p>
            ) : (
              <ul>
                {stats.recentLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm text-text">{log.subject || "(no subject)"}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {log.recipient_email}
                      </p>
                      {!log.success && log.error_message ? (
                        <p className="mt-1 max-w-xl font-mono text-xs text-danger">
                          {log.error_message}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <span
                        className={
                          log.success
                            ? "font-mono text-xs uppercase text-success"
                            : "font-mono text-xs uppercase text-danger"
                        }
                      >
                        {log.success ? "sent" : "failed"}
                      </span>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </DashboardShell>
  );
}
