import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Prioritized call queue:
 * - has phone
 * - not lost / won
 * - never called OR next_call_at <= now
 * - exclude companies with a do_not_call log
 * Sort: next_call_at ASC nulls first, then fewest attempts, then name
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit") ?? DEFAULT_LIMIT))
  );

  const nowIso = new Date().toISOString();

  const { data: dncRows } = await supabase
    .from("call_logs")
    .select("company_id")
    .eq("owner_id", user.id)
    .eq("outcome", "do_not_call");

  const dncIds = Array.from(
    new Set((dncRows ?? []).map((r) => r.company_id as string))
  );

  let query = supabase
    .from("companies")
    .select("*")
    .eq("owner_id", user.id)
    .not("phone", "is", null)
    .neq("phone", "")
    .not("stage", "in", '("lost","won")')
    .or(`next_call_at.is.null,next_call_at.lte.${nowIso}`)
    .order("next_call_at", { ascending: true, nullsFirst: true })
    .order("call_attempts", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);

  if (dncIds.length > 0) {
    const list = `(${dncIds.map((id) => `"${id}"`).join(",")})`;
    query = query.not("id", "in", list);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dncSet = new Set(dncIds);
  // Extra guard: dialable phone + never DNC
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
  });
}
