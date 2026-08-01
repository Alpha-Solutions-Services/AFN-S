import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

/** Manual reply mark (auto-reply detection comes later via Gmail poll). */
export async function POST(
  _request: Request,
  { params }: { params: { id: string; targetId: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: campaignId, targetId } = params;

  const { data: target, error } = await supabase
    .from("campaign_targets")
    .select("id, company_id, campaign_id")
    .eq("id", targetId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("campaign_targets")
    .update({
      replied_at: now,
      last_event_at: now,
    })
    .eq("id", targetId)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (target.company_id) {
    await supabase
      .from("companies")
      .update({ stage: "replied" })
      .eq("id", target.company_id)
      .in("stage", ["emailed", "opened", "not_contacted", "attempted", "callback"]);
  }

  const admin = getServiceRoleClient();
  if (admin) {
    await admin.from("email_events").insert({
      owner_id: user.id,
      campaign_id: campaignId,
      campaign_target_id: targetId,
      company_id: target.company_id,
      event_type: "reply",
      meta: { source: "manual" },
    });
  }

  return NextResponse.json({ target: updated });
}
