import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import {
  GENERATION_DELAY_MS,
  generateEmailDraft,
  isRateLimitError,
  parseRetrySeconds,
} from "@/lib/ai-email";
import { sleep } from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 300;

async function generateWithRetry(
  company: Parameters<typeof generateEmailDraft>[0]["company"],
  offerDescription: string
) {
  try {
    return await generateEmailDraft({ company, offerDescription });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    if (!isRateLimitError(message)) throw err;

    const waitSec = parseRetrySeconds(message) ?? 60;
    await sleep(waitSec * 1000);
    return await generateEmailDraft({ company, offerDescription });
  }
}

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

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const company = Array.isArray(target.companies)
      ? target.companies[0]
      : target.companies;

    if (!company) {
      failed++;
      errors.push({ targetId: target.id, error: "Company not found" });
      continue;
    }

    try {
      const draft = await generateWithRetry(company, campaign.offer_description);

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
      const friendly = isRateLimitError(message)
        ? "AI rate limit hit. Add GROQ_API_KEY (free at console.groq.com) or wait and retry."
        : message;
      errors.push({ targetId: target.id, error: friendly });

      await supabase
        .from("campaign_targets")
        .update({ error_message: friendly })
        .eq("id", target.id);

      if (isRateLimitError(message)) {
        break;
      }
    }

    if (i < targets.length - 1) {
      await sleep(GENERATION_DELAY_MS);
    }
  }

  return NextResponse.json({ generated, failed, errors });
}
