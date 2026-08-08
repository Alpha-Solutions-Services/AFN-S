import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { isCompanyStage } from "@/lib/stages";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // Companies are one shared org lead pool. Read it via the service role so
  // team leads (and other staff) can view the whole Pipeline, not just rows
  // they own. Editing stays manager-only (enforced in the [id] route).
  const admin = getServiceRoleClient();
  const db = admin ?? supabase;

  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit") ?? DEFAULT_LIMIT))
  );
  const q = searchParams.get("q")?.trim() ?? "";
  const stage = searchParams.get("stage")?.trim() ?? "";

  let query = db
    .from("companies")
    .select("*", { count: "exact" })
    .order("name", { ascending: true });

  if (stage && isCompanyStage(stage)) {
    query = query.eq("stage", stage);
  }

  if (q) {
    const escaped = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(
      `name.ilike.%${escaped}%,email.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,industry.ilike.%${escaped}%`
    );
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    companies: data ?? [],
    total: count ?? 0,
    offset,
    limit,
  });
}
