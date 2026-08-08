import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getTeamQuotas } from "@/lib/mailboxes";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/** List the 10 Forces, which are configured, and today's per-mailbox usage. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  try {
    const teams = await getTeamQuotas(admin);
    return NextResponse.json({ teams });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
