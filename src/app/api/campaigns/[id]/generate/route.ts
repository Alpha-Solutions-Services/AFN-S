import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { generateEmailDraft } from "@/lib/gemini";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id: campaignId } = params;

  let body: { targetId?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // empty body is fine for generate-all
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let targetsQuery = supabase
    .from("campaign_targets")
    .select(
      `
      id,
      status,
      companies (
        name,
        email,
        industry,
        contact_name,
        contact_title,
        website,
        notes
      )
    `
    )
    .eq("campaign_id", campaignId);

  if (body.targetId) {
    targetsQuery = targetsQuery.eq("id", body.targetId);
  } else {
    targetsQuery = targetsQuery.in("status", ["pending", "failed"]);
  }

  const { data: targets, error: targetsError } = await targetsQuery;
  if (targetsError) {
    return NextResponse.json({ error: targetsError.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ generated: 0, failed: 0 });
  }

  let generated = 0;
  let failed = 0;
  const errors: Array<{ targetId: string; error: string }> = [];

  for (const target of targets) {
    const company = Array.isArray(target.companies)
      ? target.companies[0]
      : target.companies;

    if (!company) {
      failed++;
      errors.push({ targetId: target.id, error: "Company not found" });
      continue;
    }

    try {
      const draft = await generateEmailDraft({
        company,
        offerDescription: campaign.offer_description,
      });

      const { error: updateError } = await supabase
        .from("campaign_targets")
        .update({
          generated_subject: draft.subject,
          generated_body: draft.body,
          error_message: null,
        })
        .eq("id", target.id);

      if (updateError) {
        failed++;
        errors.push({ targetId: target.id, error: updateError.message });
      } else {
        generated++;
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Generation failed";
      errors.push({ targetId: target.id, error: message });

      await supabase
        .from("campaign_targets")
        .update({ error_message: message })
        .eq("id", target.id);
    }
  }

  return NextResponse.json({ generated, failed, errors });
}
