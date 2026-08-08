import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { companyUpdateForOutcome } from "@/lib/call-outcomes";
import { getProfile } from "@/lib/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import type { CallOutcome } from "@/lib/types";
import { CALL_OUTCOMES } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }
  const profile = await getProfile(admin, user.id);
  if (!profile || profile.active === false) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: {
    company_id?: string;
    outcome?: string;
    notes?: string | null;
    duration_seconds?: number | null;
    next_call_at?: string | null;
    called_at?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyId = body.company_id?.trim();
  const outcome = body.outcome as CallOutcome | undefined;

  if (!companyId) {
    return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  }
  if (!outcome || !CALL_OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, call_attempts")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) {
    return NextResponse.json({ error: companyError.message }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const calledAt = body.called_at ? new Date(body.called_at).toISOString() : new Date().toISOString();
  const updates = companyUpdateForOutcome(outcome, {
    nextCallAt: body.next_call_at ?? undefined,
  });

  const { data: log, error: logError } = await admin
    .from("call_logs")
    .insert({
      owner_id: user.id,
      company_id: companyId,
      team: profile.team,
      outcome,
      notes: body.notes?.trim() || null,
      duration_seconds:
        typeof body.duration_seconds === "number" ? body.duration_seconds : null,
      called_at: calledAt,
    })
    .select("*")
    .single();

  if (logError || !log) {
    return NextResponse.json(
      { error: logError?.message || "Failed to log call" },
      { status: 500 }
    );
  }

  const { data: updated, error: updateError } = await admin
    .from("companies")
    .update({
      stage: updates.stage,
      last_called_at: calledAt,
      next_call_at: updates.next_call_at,
      call_attempts: (company.call_attempts ?? 0) + 1,
    })
    .eq("id", companyId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message || "Call logged but company update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ call_log: log, company: updated });
}
