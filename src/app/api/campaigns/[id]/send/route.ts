import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { ensureSalesSignature } from "@/lib/email-signature";
import { isSalesMailConfigured, sendSalesEmail } from "@/lib/mail";
import { isSyntheticEmail } from "@/lib/phone";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id: campaignId } = params;

  let body: { targetId?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  if (!body.targetId) {
    return NextResponse.json(
      { error: "targetId is required — send one email per request" },
      { status: 400 }
    );
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  if (!isSalesMailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Sales mailbox not configured. Add SALES_MAIL_APP_PASSWORD for sales.afn.alpha@gmail.com in Vercel env.",
      },
      { status: 503 }
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
      company_id,
      generated_subject,
      generated_body,
      status,
      companies ( email )
    `
    )
    .eq("campaign_id", campaignId)
    .eq("id", body.targetId)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  if (target.status === "sent") {
    return NextResponse.json({ error: "Already sent", skipped: true }, { status: 409 });
  }

  const company = Array.isArray(target.companies)
    ? target.companies[0]
    : target.companies;
  const recipientEmail = company?.email?.trim().toLowerCase() ?? "";

  if (
    !recipientEmail ||
    isSyntheticEmail(recipientEmail) ||
    !target.generated_subject ||
    !target.generated_body
  ) {
    const message = !recipientEmail || isSyntheticEmail(recipientEmail)
      ? "Missing real email (phone-only contact)"
      : "Missing draft content";
    await supabase
      .from("campaign_targets")
      .update({ status: "failed", error_message: message })
      .eq("id", target.id);
    return NextResponse.json(
      {
        sent: 0,
        failed: 1,
        error: message,
        target: { id: target.id, status: "failed" as const, error_message: message },
      },
      { status: 400 }
    );
  }

  try {
    const bodyWithSignature = ensureSalesSignature(target.generated_body);
    const { messageId } = await sendSalesEmail({
      to: recipientEmail,
      subject: target.generated_subject,
      body: bodyWithSignature,
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

    try {
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
    } catch {
      // sent — don't fail if logging fails
    }

    return NextResponse.json({
      sent: 1,
      failed: 0,
      target: { id: target.id, status: "sent" as const },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";

    await supabase
      .from("campaign_targets")
      .update({ status: "failed", error_message: message })
      .eq("id", target.id);

    try {
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
    } catch {
      // ignore log failure
    }

    return NextResponse.json({
      sent: 0,
      failed: 1,
      error: message,
      target: { id: target.id, status: "failed" as const, error_message: message },
    });
  }
}
