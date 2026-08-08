import { NextResponse } from "next/server";
import { requireLeadOrManager } from "@/lib/admin-auth";

export const runtime = "nodejs";

type Session = {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  ip: string | null;
};

function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

/** Attendance summary. Managers see all; team leads see their team. */
export async function GET() {
  const gate = await requireLeadOrManager();
  if ("error" in gate) return gate.error;
  const { admin, profile } = gate;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
  const nowIso = now.toISOString();

  const { data: peopleRows } = await admin
    .from("profiles")
    .select("id, email, full_name, role, team")
    .in("role", ["agent", "team_lead"]);

  let people = peopleRows ?? [];
  if (profile.role === "team_lead") {
    people = people.filter((p) => p.team === profile.team);
  }
  const idSet = new Set(people.map((p) => p.id));

  const { data: sessionRows } = await admin
    .from("attendance_sessions")
    .select("id, user_id, login_at, logout_at, ip")
    .gte("login_at", weekAgo)
    .order("login_at", { ascending: false });

  const sessions = (sessionRows ?? []).filter((s) => idSet.has(s.user_id)) as Session[];

  const summary = people.map((p) => {
    const mine = sessions.filter((s) => s.user_id === p.id);
    const online = mine.some((s) => !s.logout_at);
    let todayMin = 0;
    let weekMin = 0;
    for (const s of mine) {
      const end = s.logout_at ?? nowIso;
      const mins = minutesBetween(s.login_at, end);
      weekMin += mins;
      if (s.login_at >= startOfToday) todayMin += mins;
    }
    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      team: p.team,
      online,
      todayMinutes: todayMin,
      weekMinutes: weekMin,
      lastLoginAt: mine[0]?.login_at ?? null,
      lastIp: mine[0]?.ip ?? null,
    };
  });

  return NextResponse.json({ summary, recent: sessions.slice(0, 50) });
}
