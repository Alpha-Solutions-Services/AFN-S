import { NextResponse } from "next/server";
import { requireManager } from "@/lib/admin-auth";

export const runtime = "nodejs";

/** Recent blocked/allowed login attempts for manager review. */
export async function GET() {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { admin } = gate;

  const { data, error } = await admin
    .from("login_attempts")
    .select("id, email, ip, user_agent, allowed, approved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attempts: data ?? [] });
}

/** Approve a blocked attempt → adds its IP to the office allowlist. */
export async function POST(request: Request) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { admin, user } = gate;

  let body: { id?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: attempt } = await admin
    .from("login_attempts")
    .select("id, ip, email")
    .eq("id", body.id)
    .maybeSingle();
  if (!attempt?.ip) {
    return NextResponse.json({ error: "Attempt or IP not found" }, { status: 404 });
  }

  await admin
    .from("allowed_ips")
    .upsert(
      { ip: attempt.ip, label: `Approved for ${attempt.email ?? "user"}`, created_by: user.id },
      { onConflict: "ip" }
    );

  await admin
    .from("login_attempts")
    .update({ allowed: true, approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", body.id);

  return NextResponse.json({ ok: true, ip: attempt.ip });
}
