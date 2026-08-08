import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireLeadOrManager, requireManager } from "@/lib/admin-auth";
import { classifyEmail, FORCES } from "@/lib/roles";

export const runtime = "nodejs";

/** Look up an existing auth user id by email (paged). */
async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** List people. Managers see everyone; team leads see their team. */
export async function GET() {
  const gate = await requireLeadOrManager();
  if ("error" in gate) return gate.error;
  const { admin, profile } = gate;

  let query = admin
    .from("profiles")
    .select("id, email, full_name, role, team, agent_number, active, created_at")
    .order("role", { ascending: true })
    .order("team", { ascending: true })
    .order("agent_number", { ascending: true });

  if (profile.role === "team_lead") {
    query = query.eq("team", profile.team ?? "__none__");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ people: data ?? [] });
}

/** Create an agent (or team lead) account. Managers only. */
export async function POST(request: Request) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { admin, user } = gate;

  let body: {
    team?: string;
    agent_number?: number;
    full_name?: string;
    password?: string;
    role?: "agent" | "team_lead";
  } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const team = (body.team ?? "").trim().toLowerCase();
  const role = body.role === "team_lead" ? "team_lead" : "agent";
  const password = (body.password ?? "").trim();

  if (!(FORCES as readonly string[]).includes(team)) {
    return NextResponse.json({ error: "Valid team (Force) is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  let email: string;
  let agentNumber: number | null = null;
  if (role === "team_lead") {
    email = `sales.afn.${team}@gmail.com`;
  } else {
    const n = Number(body.agent_number);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: "Agent number must be a positive integer" }, { status: 400 });
    }
    agentNumber = n;
    email = `sales.afn.${team}+${n}@gmail.com`;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name ?? null },
  });

  let userId = created?.user?.id ?? null;

  // If the login already exists, reuse it (idempotent) instead of failing.
  if (!userId) {
    const existing = await findUserIdByEmail(admin, email);
    if (existing) {
      userId = existing;
      if (password) {
        await admin.auth.admin.updateUserById(existing, { password });
      }
    }
  }

  if (!userId) {
    const raw = createError?.message?.trim();
    const message =
      raw && raw !== "{}"
        ? raw
        : `Could not create ${email}. It may already exist, or the email format was rejected.`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const classified = classifyEmail(email);
  const { data: profileRow, error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email: email.toLowerCase(),
        full_name: body.full_name ?? null,
        role: role,
        team: classified.team ?? team,
        agent_number: agentNumber,
        created_by: user.id,
        active: true,
      },
      { onConflict: "id" }
    )
    .select("id, email, full_name, role, team, agent_number, active")
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ person: profileRow, email });
}

/** Update a person (active flag, name, team, role) or reset password. Managers only. */
export async function PATCH(request: Request) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  let body: {
    id?: string;
    active?: boolean;
    full_name?: string;
    team?: string;
    role?: "agent" | "team_lead" | "manager";
    password?: string;
  } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (body.password && body.password.trim().length >= 8) {
    const { error } = await admin.auth.admin.updateUserById(body.id, {
      password: body.password.trim(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.full_name === "string") patch.full_name = body.full_name;
  if (typeof body.team === "string") patch.team = body.team.toLowerCase();
  if (body.role) patch.role = body.role;

  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from("profiles").update(patch).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = await admin
    .from("profiles")
    .select("id, email, full_name, role, team, agent_number, active")
    .eq("id", body.id)
    .maybeSingle();

  return NextResponse.json({ person: data });
}
