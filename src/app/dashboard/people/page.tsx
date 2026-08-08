"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useUi } from "@/components/ui/UiProvider";
import { FORCES } from "@/lib/roles";

type Person = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  team: string | null;
  agent_number: number | null;
  active: boolean;
};
type Ip = { id: string; ip: string; label: string | null; created_at: string };
type Attempt = {
  id: string;
  email: string | null;
  ip: string | null;
  allowed: boolean;
  created_at: string;
};
type Attendance = {
  id: string;
  email: string;
  full_name: string | null;
  team: string | null;
  online: boolean;
  todayMinutes: number;
  weekMinutes: number;
  lastLoginAt: string | null;
  lastIp: string | null;
};

function hrs(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function PeoplePage() {
  const ui = useUi();
  const [role, setRole] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [ips, setIps] = useState<Ip[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // create form
  const [newRole, setNewRole] = useState<"agent" | "team_lead">("agent");
  const [team, setTeam] = useState<string>(FORCES[0]);
  const [agentNumber, setAgentNumber] = useState("1");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // ip form
  const [newIp, setNewIp] = useState("");
  const [ipLabel, setIpLabel] = useState("");

  // inline password reset
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState("");

  const isManager = role === "manager" || role === null;

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const meRes = await fetch("/api/me");
      const me = await meRes.json();
      const r = me?.profile?.role ?? null;
      setRole(r);

      const [pplRes, attRes] = await Promise.all([
        fetch("/api/admin/agents"),
        fetch("/api/admin/attendance"),
      ]);
      if (pplRes.ok) setPeople((await pplRes.json()).people ?? []);
      if (attRes.ok) setAttendance((await attRes.json()).summary ?? []);

      if (r === "manager" || r === null) {
        const [ipsRes, atmRes] = await Promise.all([
          fetch("/api/admin/ips"),
          fetch("/api/admin/login-attempts"),
        ]);
        if (ipsRes.ok) setIps((await ipsRes.json()).ips ?? []);
        if (atmRes.ok) setAttempts((await atmRes.json()).attempts ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function createPerson(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: newRole,
          team,
          agent_number: newRole === "agent" ? Number(agentNumber) : undefined,
          full_name: fullName || null,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      setMsg(`Created ${data.email}`);
      setFullName("");
      setPassword("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(p: Person) {
    const ok = await ui.confirm({
      title: p.active ? "Deactivate account?" : "Reactivate account?",
      message: `${p.active ? "Suspend" : "Restore"} ${p.email}?`,
      confirmLabel: p.active ? "Deactivate" : "Reactivate",
      danger: p.active,
    });
    if (!ok) return;
    await fetch("/api/admin/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    await loadAll();
  }

  function openReset(p: Person) {
    setResetId(p.id);
    setResetValue("");
    setMsg(null);
    setError(null);
  }

  function generatePassword() {
    setResetValue(
      `Afn-${Math.random().toString(36).slice(2, 8)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`
    );
  }

  async function submitReset(p: Person) {
    if (resetValue.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const res = await fetch("/api/admin/agents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, password: resetValue.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to reset password.");
      return;
    }
    setResetId(null);
    setResetValue("");
    setMsg(`Password updated for ${p.email}: ${resetValue.trim()}`);
  }

  async function addIp(e: React.FormEvent) {
    e.preventDefault();
    if (!newIp.trim()) return;
    await fetch("/api/admin/ips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: newIp.trim(), label: ipLabel || null }),
    });
    setNewIp("");
    setIpLabel("");
    await loadAll();
  }

  async function removeIp(id: string) {
    await fetch(`/api/admin/ips?id=${id}`, { method: "DELETE" });
    await loadAll();
  }

  async function approveAttempt(id: string) {
    await fetch("/api/admin/login-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadAll();
  }

  const headcount = FORCES.map((f) => ({
    team: f,
    count: people.filter((p) => p.team === f && p.role !== "manager").length,
  }));
  const maxHead = Math.max(1, ...headcount.map((h) => h.count));
  const hoursRows = [...attendance].sort((a, b) => b.weekMinutes - a.weekMinutes);
  const maxWeek = Math.max(1, ...attendance.map((a) => a.weekMinutes));
  const onlineCount = attendance.filter((a) => a.online).length;
  const totalPeople = people.filter((p) => p.role !== "manager").length;

  return (
    <DashboardShell title="People">
      {error ? <p className="mb-4 font-mono text-xs text-danger">{error}</p> : null}
      {msg ? <p className="mb-4 font-mono text-xs text-success">{msg}</p> : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="data-label">Headcount</p>
          <p className="mt-1 text-2xl font-semibold text-text">{totalPeople}</p>
          <p className="text-xs text-muted">agents + team leads</p>
        </div>
        <div className="panel p-4">
          <p className="data-label">Online now</p>
          <p className="mt-1 text-2xl font-semibold text-success">{onlineCount}</p>
          <p className="text-xs text-muted">active sessions</p>
        </div>
        <div className="panel p-4">
          <p className="data-label">Blocked logins</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {attempts.filter((a) => !a.allowed).length}
          </p>
          <p className="text-xs text-muted">awaiting IP approval</p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-sm font-medium text-text">Headcount by Force</h2>
          <div className="mt-4 space-y-2">
            {headcount.map((h) => (
              <div key={h.team} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs capitalize text-muted sm:w-20">
                  {h.team}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-bg">
                  <div
                    className="h-3 rounded bg-accent transition-all"
                    style={{ width: `${Math.round((h.count / maxHead) * 100)}%` }}
                  />
                </div>
                <span className="w-6 text-right font-mono text-xs text-muted">
                  {h.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-sm font-medium text-text">Hours this week</h2>
          <div className="mt-4 space-y-2">
            {hoursRows.length === 0 ? (
              <p className="text-sm text-muted">No sessions yet.</p>
            ) : (
              hoursRows.slice(0, 10).map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 truncate text-xs text-muted sm:w-28">
                    {a.full_name || a.email}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-bg">
                    <div
                      className={`h-3 rounded transition-all ${
                        a.online ? "bg-success" : "bg-accent"
                      }`}
                      style={{ width: `${Math.round((a.weekMinutes / maxWeek) * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right font-mono text-xs text-muted">
                    {hrs(a.weekMinutes)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {isManager ? (
          <div className="panel p-6">
            <h2 className="text-sm font-medium text-text">Create account</h2>
            <form onSubmit={createPerson} className="mt-4 space-y-3">
              <div className="flex gap-4 text-sm text-muted">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={newRole === "agent"}
                    onChange={() => setNewRole("agent")}
                  />
                  Sales agent
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={newRole === "team_lead"}
                    onChange={() => setNewRole("team_lead")}
                  />
                  Team lead
                </label>
              </div>
              <div>
                <label className="data-label mb-1 block">Team (Force)</label>
                <select
                  className="input"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                >
                  {FORCES.map((f) => (
                    <option key={f} value={f} className="capitalize">
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              {newRole === "agent" ? (
                <div>
                  <label className="data-label mb-1 block">Agent number</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={agentNumber}
                    onChange={(e) => setAgentNumber(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Login will be sales.afn.{team}+{agentNumber || "N"}@gmail.com
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted">
                  Login will be sales.afn.{team}@gmail.com
                </p>
              )}
              <div>
                <label className="data-label mb-1 block">Full name</label>
                <input
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="data-label mb-1 block">Temp password</label>
                <input
                  className="input"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min 8 characters"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? "Creating…" : "Create account"}
              </button>
            </form>
          </div>
        ) : null}

        <div className="panel p-6">
          <h2 className="text-sm font-medium text-text">People</h2>
          <div className="mt-3 space-y-2">
            {people.length === 0 ? (
              <p className="text-sm text-muted">No people yet.</p>
            ) : (
              people.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-text">
                        {p.full_name || p.email}
                        {p.active ? "" : " · suspended"}
                      </p>
                      <p className="font-mono text-xs text-muted">
                        {p.email} · {p.role.replace("_", " ")}
                        {p.team ? ` · ${p.team}` : ""}
                      </p>
                    </div>
                    {isManager && p.role !== "manager" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => openReset(p)}
                        >
                          Reset pw
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => void toggleActive(p)}
                        >
                          {p.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {resetId === p.id ? (
                    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
                      <input
                        className="input min-w-0 flex-1"
                        type="text"
                        value={resetValue}
                        onChange={(e) => setResetValue(e.target.value)}
                        placeholder="New password (min 8 chars)"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={generatePassword}
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          onClick={() => void submitReset(p)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => {
                            setResetId(null);
                            setResetValue("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-sm font-medium text-text">Attendance (7 days)</h2>
          <div className="mt-3 space-y-2">
            {attendance.length === 0 ? (
              <p className="text-sm text-muted">No sessions yet.</p>
            ) : (
              attendance.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <div>
                    <p className="text-text">
                      {a.full_name || a.email}
                      {a.online ? (
                        <span className="ml-2 font-mono text-[10px] uppercase text-success">
                          online
                        </span>
                      ) : null}
                    </p>
                    <p className="font-mono text-xs text-muted">
                      {a.team ?? "—"} · last IP {a.lastIp ?? "—"}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs text-muted">
                    <p>today {hrs(a.todayMinutes)}</p>
                    <p>week {hrs(a.weekMinutes)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {isManager ? (
          <div className="panel p-6">
            <h2 className="text-sm font-medium text-text">Office IPs & login approvals</h2>
            <form onSubmit={addIp} className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <input
                className="input min-w-0 flex-1 sm:min-w-[9rem]"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="203.0.113.10 or 203.0.113."
              />
              <input
                className="input min-w-0 flex-1 sm:min-w-[7rem]"
                value={ipLabel}
                onChange={(e) => setIpLabel(e.target.value)}
                placeholder="label"
              />
              <button type="submit" className="btn-secondary shrink-0">
                Allow IP
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">
              No office IPs = no blocking (open access). Add one to enforce.
            </p>
            <div className="mt-3 space-y-1">
              {ips.map((ip) => (
                <div
                  key={ip.id}
                  className="flex items-center justify-between gap-2 rounded border border-border px-3 py-1.5 font-mono text-xs"
                >
                  <span className="text-text">
                    {ip.ip}
                    {ip.label ? ` · ${ip.label}` : ""}
                  </span>
                  <button
                    type="button"
                    className="text-danger hover:underline"
                    onClick={() => void removeIp(ip.id)}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>

            {attempts.length > 0 ? (
              <div className="mt-5">
                <p className="data-label mb-2">Recent blocked logins</p>
                <div className="space-y-1">
                  {attempts
                    .filter((a) => !a.allowed)
                    .map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded border border-warning/40 px-3 py-1.5 text-xs"
                      >
                        <span className="font-mono text-muted">
                          {a.email ?? "?"} · {a.ip ?? "?"} ·{" "}
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          className="text-accent hover:underline"
                          onClick={() => void approveAttempt(a.id)}
                        >
                          approve IP
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
