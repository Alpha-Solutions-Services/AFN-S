import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** Close an attendance session on sign-out / tab close. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: { sessionId?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: true });

  const nowIso = new Date().toISOString();
  try {
    if (body.sessionId) {
      await admin
        .from("attendance_sessions")
        .update({ logout_at: nowIso })
        .eq("id", body.sessionId)
        .eq("user_id", user.id)
        .is("logout_at", null);
    } else {
      // Close any dangling open sessions for this user
      await admin
        .from("attendance_sessions")
        .update({ logout_at: nowIso })
        .eq("user_id", user.id)
        .is("logout_at", null);
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
