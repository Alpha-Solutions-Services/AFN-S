import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getProfile } from "@/lib/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Per-person sales + call stats (last 30 days). Role-aware scope. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service role not configured" }, { status: 503 });

  const me = await getProfile(admin, user.id);
  if (!me) return NextResponse.json({ rows: [], scope: "none" });

  const { data: peopleRows } = await admin
    .from("profiles")
    .select("id, email, full_name, role, team")
    .in("role", ["agent", "team_lead"]);
  let people = peopleRows ?? [];

  if (me.role === "team_lead") people = people.filter((p) => p.team === me.team);
  else if (me.role === "agent") people = people.filter((p) => p.id === user.id);

  const ids = people.map((p) => p.id);
  if (ids.length === 0) return NextResponse.json({ rows: [], scope: me.role });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: emailRows } = await admin
    .from("email_logs")
    .select("owner_id")
    .eq("success", true)
    .gte("created_at", since)
    .in("owner_id", ids);

  const { data: callRows } = await admin
    .from("call_logs")
    .select("owner_id, outcome")
    .gte("called_at", since)
    .in("owner_id", ids);

  const emailByUser = new Map<string, number>();
  for (const r of emailRows ?? []) {
    emailByUser.set(r.owner_id, (emailByUser.get(r.owner_id) ?? 0) + 1);
  }
  const callByUser = new Map<string, { total: number; interested: number; won: number }>();
  for (const r of callRows ?? []) {
    const cur = callByUser.get(r.owner_id) ?? { total: 0, interested: 0, won: 0 };
    cur.total += 1;
    if (r.outcome === "interested") cur.interested += 1;
    if (r.outcome === "won") cur.won += 1;
    callByUser.set(r.owner_id, cur);
  }

  const rows = people
    .map((p) => {
      const c = callByUser.get(p.id) ?? { total: 0, interested: 0, won: 0 };
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: p.role,
        team: p.team,
        emailsSent: emailByUser.get(p.id) ?? 0,
        calls: c.total,
        interested: c.interested,
        won: c.won,
      };
    })
    .sort((a, b) => b.won - a.won || b.interested - a.interested || b.calls - a.calls);

  return NextResponse.json({ rows, scope: me.role });
}
