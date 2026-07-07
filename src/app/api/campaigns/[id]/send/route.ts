import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getGoogleTokens } from "@/lib/google-tokens";
import { getGmailAccessToken, sendGmailMessage, sleep } from "@/lib/gmail";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const SEND_DELAY_MS = 4000;

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: campaignId } = params;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const tokens = await getGoogleTokens(user.id);
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      { error: "Gmail not connected. Sign out and sign in again with Google." },
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

  await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaignId);

  const { data: targets, error: targetsError } = await supabase
    .from("campaign_targets")
    .select(
      `
      id,
      company_id,
      generated_subject,
      generated_body,
      status,
      companies ( email )
    `
    )
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .not("generated_subject", "is", null)
    .not("generated_body", "is", null);

  if (targetsError) {
    await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
    return NextResponse.json({ error: targetsError.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaignId);
    return NextResponse.json({ sent: 0, failed: 0 });
  }

  let accessToken: string;
  try {
    accessToken = await getGmailAccessToken(tokens.refresh_token);
  } catch (err) {
    await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
    const message = err instanceof Error ? err.message : "Token refresh failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const company = Array.isArray(target.companies)
      ? target.companies[0]
      : target.companies;
    const recipientEmail = company?.email;

    if (!recipientEmail || !target.generated_subject || !target.generated_body) {
      failed++;
      await supabase
        .from("campaign_targets")
        .update({
          status: "failed",
          error_message: "Missing email or draft content",
        })
        .eq("id", target.id);
      continue;
    }

    try {
      const { messageId } = await sendGmailMessage({
        accessToken,
        from: tokens.gmail_address,
        to: recipientEmail,
        subject: target.generated_subject,
        body: target.generated_body,
      });

      await supabase
        .from("campaign_targets")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", target.id);

      await supabase
        .from("companies")
        .update({ stage: "emailed" })
        .eq("id", target.company_id);

      await admin.from("email_logs").insert({
        owner_id: user.id,
        campaign_id: campaignId,
        campaign_target_id: target.id,
        company_id: target.company_id,
        recipient_email: recipientEmail,
        subject: target.generated_subject,
        success: true,
        gmail_message_id: messageId,
      });

      sent++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Send failed";

      await supabase
        .from("campaign_targets")
        .update({
          status: "failed",
          error_message: message,
        })
        .eq("id", target.id);

      await admin.from("email_logs").insert({
        owner_id: user.id,
        campaign_id: campaignId,
        campaign_target_id: target.id,
        company_id: target.company_id,
        recipient_email: recipientEmail,
        subject: target.generated_subject,
        success: false,
        error_message: message,
      });
    }

    if (i < targets.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  const finalStatus = failed > 0 && sent === 0 ? "paused" : "completed";
  await supabase.from("campaigns").update({ status: finalStatus }).eq("id", campaignId);

  return NextResponse.json({ sent, failed });
}
