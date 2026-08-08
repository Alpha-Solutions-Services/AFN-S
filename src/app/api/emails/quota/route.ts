import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getTeamQuotas } from "@/lib/mailboxes";
import { getWarmupDayIndex } from "@/lib/send-quota";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * Aggregate send quota across all configured team mailboxes (10 Forces).
 * cap/sentToday/remaining are the SUM across mailboxes that have an app password.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  try {
    const teams = await getTeamQuotas(admin);
    const configured = teams.filter((t) => t.configured);
    const cap = configured.reduce((s, t) => s + t.cap, 0);
    const sentToday = configured.reduce((s, t) => s + t.sentToday, 0);
    const remaining = configured.reduce((s, t) => s + t.remaining, 0);

    return NextResponse.json({
      cap,
      sentToday,
      remaining,
      warmupDay: getWarmupDayIndex(),
      mailboxes: configured.length,
      teams,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quota check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
