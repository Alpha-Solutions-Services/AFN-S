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
      )}
    </DashboardShell>
  );
}
