import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getProfile } from "@/lib/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Prioritized call queue over the SHARED org lead pool (managers upload,
 * everyone calls). Any active staff member sees the same pool.
 * - has phone
 * - not lost / won
 * - never called OR next_call_at <= now (unless focus=opened_unreplied)
 * - exclude companies with any do_not_call log (org-wide)
 * Optional focus=opened_unreplied: opened email, no reply yet
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const nowIso = new Date().toISOString();

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const profile = await getProfile(admin, user.id);
  if (!profile || profile.active === false) {
    return NextResponse.json({ companies: [], total: 0, asOf: nowIso, focus: "all" });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit") ?? DEFAULT_LIMIT))
  );
  const focus = searchParams.get("focus")?.trim() || "all";

  const { data: dncRows } = await admin
    .from("call_logs")
    .select("company_id")
    .eq("outcome", "do_not_call");

  const dncIds = Array.from(
    new Set((dncRows ?? []).map((r) => r.company_id as string))
  );
  const dncSet = new Set(dncIds);

  let focusCompanyIds: string[] | null = null;
  if (focus === "opened_unreplied") {
    const { data: openedRows, error: openedError } = await admin
      .from("campaign_targets")
      .select("company_id")
      .eq("status", "sent")
      .not("opened_at", "is", null)
      .is("replied_at", null);

    if (openedError) {
      return NextResponse.json({ error: openedError.message }, { status: 500 });
    }

    focusCompanyIds = Array.from(
      new Set(
        (openedRows ?? [])
          .map((r) => r.company_id as string | null)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (focusCompanyIds.length === 0) {
      return NextResponse.json({
        companies: [],
        total: 0,
        asOf: nowIso,
        focus,
      });
    }
  }

  let query = admin
    .from("companies")
    .select("*")
    .not("phone", "is", null)
    .neq("phone", "")
    .not("stage", "in", '("lost","won")')
    .order("next_call_at", { ascending: true, nullsFirst: true })
    .order("call_attempts", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);

  if (focusCompanyIds) {
    query = query.in("id", focusCompanyIds);
  } else {
    query = query.or(`next_call_at.is.null,next_call_at.lte.${nowIso}`);
    if (dncIds.length > 0) {
      const list = `(${dncIds.map((id) => `"${id}"`).join(",")})`;
      query = query.not("id", "in", list);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const companies = (data ?? []).filter(
    (c) =>
      !dncSet.has(c.id) &&
      typeof c.phone === "string" &&
      c.phone.replace(/\D/g, "").length >= 10
  );

  return NextResponse.json({
    companies,
    total: companies.length,
    asOf: nowIso,
    focus,
  });
}
