import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { computeAbOpenRates } from "@/lib/deliverability";
import { getTeam } from "@/lib/mailboxes";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit") ?? DEFAULT_LIMIT)));
  const statusFilter = searchParams.get("status");

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let targetsQuery = supabase
    .from("campaign_targets")
    .select(
      `
      *,
      companies (
        name,
        email,
        industry,
        contact_name,
        contact_title,
        website,
        notes,
        phone,
        extra,
        do_not_email
      )
    `,
      { count: "exact" }
    )
    .eq("campaign_id", id)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (statusFilter && statusFilter !== "all") {
    targetsQuery = targetsQuery.eq("status", statusFilter);
  }

  const { data: targets, error: targetsError, count } = await targetsQuery;
  if (targetsError) {
    return NextResponse.json({ error: targetsError.message }, { status: 500 });
  }

  const { data: allTargets } = await supabase
    .from("campaign_targets")
    .select(
      "status, generated_subject, generated_body, opened_at, replied_at, bounced_at, subject_variant, follow_up_step, next_follow_up_at"
    )
    .eq("campaign_id", id);

  const nowIso = new Date().toISOString();
  const stats = {
    total: allTargets?.length ?? 0,
    pending: allTargets?.filter((t) => t.status === "pending").length ?? 0,
    sent: allTargets?.filter((t) => t.status === "sent").length ?? 0,
    failed: allTargets?.filter((t) => t.status === "failed").length ?? 0,
    bounced: allTargets?.filter((t) => t.status === "bounced" || t.bounced_at).length ?? 0,
    opened: allTargets?.filter((t) => Boolean(t.opened_at)).length ?? 0,
    replied: allTargets?.filter((t) => Boolean(t.replied_at)).length ?? 0,
    followUpsDue:
      allTargets?.filter(
        (t) =>
          t.status === "sent" &&
          t.opened_at &&
          !t.replied_at &&
          !t.bounced_at &&
          (t.follow_up_step ?? 0) < 2 &&
          t.next_follow_up_at &&
          t.next_follow_up_at <= nowIso
      ).length ?? 0,
    withDraft:
      allTargets?.filter((t) => t.generated_subject && t.generated_body).length ??
      0,
    readyToSend:
      allTargets?.filter(
        (t) =>
          t.generated_subject &&
          t.generated_body &&
          (t.status === "pending" || t.status === "failed")
      ).length ?? 0,
  };

  const abStats = computeAbOpenRates(allTargets ?? []);

  return NextResponse.json({
    campaign,
    targets: targets ?? [],
    total: count ?? 0,
    offset,
    limit,
    stats,
    abStats,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = params;

  let body: { team?: string | null } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  const team = body.team && getTeam(body.team) ? body.team : null;

  const { data, error } = await supabase
    .from("campaigns")
    .update({ team })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = params;

  const { data: campaign, error: findError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, id });
}
