"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  team: string | null;
  emailsSent: number;
  calls: number;
  interested: number;
  won: number;
};

export default function TeamPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team/overview");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRows(data.rows ?? []);
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
    <DashboardShell title="Team">
      <p className="mb-4 text-sm text-muted">
        10 Forces leaderboard — last 30 days. Ranked by won, then interested, then
        calls.
      </p>
      {error ? <p className="mb-4 font-mono text-xs text-danger">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No activity yet.</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            {(() => {
              const t = rows.reduce(
                (acc, r) => ({
                  emails: acc.emails + r.emailsSent,
                  calls: acc.calls + r.calls,
                  interested: acc.interested + r.interested,
                  won: acc.won + r.won,
                }),
                { emails: 0, calls: 0, interested: 0, won: 0 }
              );
              const cards = [
                { label: "Emails", value: t.emails, cls: "text-text" },
                { label: "Calls", value: t.calls, cls: "text-text" },
                { label: "Interested", value: t.interested, cls: "text-accent" },
                { label: "Won", value: t.won, cls: "text-success" },
              ];
              return cards.map((c) => (
                <div key={c.label} className="panel p-4">
                  <p className="data-label">{c.label}</p>
                  <p className={`mt-1 text-2xl font-semibold ${c.cls}`}>{c.value}</p>
                </div>
              ));
            })()}
          </div>

          <div className="panel mb-6 p-6">
            <h2 className="text-sm font-medium text-text">Calls & wins by agent</h2>
            <div className="mt-4 space-y-2">
              {(() => {
                const maxCalls = Math.max(1, ...rows.map((r) => r.calls));
                return rows.slice(0, 12).map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs text-muted sm:w-32">
                      {r.full_name || r.email}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-bg">
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-accent/40"
                        style={{ width: `${Math.round((r.calls / maxCalls) * 100)}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-success"
                        style={{ width: `${Math.round((r.won / maxCalls) * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right font-mono text-[11px] text-muted">
                      {r.calls}c · {r.won}w
                    </span>
                  </div>
                ));
              })()}
            </div>
            <p className="mt-3 flex gap-4 font-mono text-[10px] uppercase text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded bg-accent/40" /> calls
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded bg-success" /> won
              </span>
            </p>
          </div>

          <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-xs uppercase text-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Emails</th>
                <th className="px-4 py-3 text-right">Calls</th>
                <th className="px-4 py-3 text-right">Interested</th>
                <th className="px-4 py-3 text-right">Won</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-4 py-3 font-mono text-xs text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-text">{r.full_name || r.email}</td>
                  <td className="px-4 py-3 capitalize text-muted">{r.team ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs uppercase text-muted">
                    {r.role.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-right">{r.emailsSent}</td>
                  <td className="px-4 py-3 text-right">{r.calls}</td>
                  <td className="px-4 py-3 text-right text-accent">{r.interested}</td>
                  <td className="px-4 py-3 text-right text-success">{r.won}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </DashboardShell>
  );
}
