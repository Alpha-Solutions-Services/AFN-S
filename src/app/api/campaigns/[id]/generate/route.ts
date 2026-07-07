import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import {
  generateEmailDraft,
  isRateLimitError,
  parseRetrySeconds,
} from "@/lib/ai-email";
import { sleep } from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 60;

async function generateWithRetry(
  company: Parameters<typeof generateEmailDraft>[0]["company"],
  offerDescription: string
) {
  try {
    return await generateEmailDraft({ company, offerDescription });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    if (!isRateLimitError(message)) throw err;

    const waitSec = parseRetrySeconds(message) ?? 30;
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
    // ignore
  }

  if (!body.targetId) {
    return NextResponse.json(
      { error: "targetId is required — generate one target per request" },
      { status: 400 }
    );
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: target, error: targetError } = await supabase
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
    .eq("campaign_id", campaignId)
    .eq("id", body.targetId)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  const company = Array.isArray(target.companies)
    ? target.companies[0]
    : target.companies;

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
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
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      generated: 1,
      failed: 0,
      target: {
        id: target.id,
        generated_subject: draft.subject,
        generated_body: draft.body,
        error_message: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const friendly = isRateLimitError(message)
      ? "AI rate limit hit — wait a minute and try again."
      : message;

    await supabase
      .from("campaign_targets")
      .update({ error_message: friendly })
      .eq("id", target.id);

    return NextResponse.json({
      generated: 0,
      failed: 1,
      error: friendly,
      rateLimited: isRateLimitError(message),
      target: { id: target.id, error_message: friendly },
    });
  }
}
