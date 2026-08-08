import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getClientIp, isIpAllowed } from "@/lib/office-ip";
import { ensureProfile } from "@/lib/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * Called right after login. Enforces office-IP policy and opens an attendance
 * session. If the IP is not allowed, the login is BLOCKED (client signs out)
 * and a pending login_attempt is recorded for a manager to approve.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getServiceRoleClient();
  if (!admin) {
    // Not configured (no service role) → don't block usage
    return NextResponse.json({ ok: true, blocked: false, configured: false });
  }

  const ip = getClientIp(request.headers);
  const ua = request.headers.get("user-agent")?.slice(0, 240) ?? null;

  let profile = null;
  try {
    profile = await ensureProfile(admin, { id: user.id, email: user.email });
  } catch {
    // profiles table missing (pre-migration) → fail open
    return NextResponse.json({ ok: true, blocked: false, configured: false });
  }

  const { allowed, configured } = await isIpAllowed(admin, ip);

  if (configured && !allowed) {
    try {
      await admin.from("login_attempts").insert({
        user_id: user.id,
        email: user.email?.toLowerCase() ?? null,
        ip,
        user_agent: ua,
        allowed: false,
      });
    } catch {
      // ignore logging failure
    }
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: "off_office_ip",
        message:
          "Login blocked: you are not on an approved office network. A manager must approve this IP.",
        ip,
      },
      { status: 403 }
    );
  }

  let sessionId: string | null = null;
  try {
    const { data } = await admin
      .from("attendance_sessions")
      .insert({ user_id: user.id, ip, user_agent: ua })
      .select("id")
      .single();
    sessionId = (data as { id?: string } | null)?.id ?? null;
  } catch {
    // attendance is best-effort
  }

  return NextResponse.json({ ok: true, blocked: false, configured, sessionId, profile });
}
