import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import {
  buildUnsubscribeUrl,
  nextFollowUpAfterSend,
} from "@/lib/deliverability";
import { ensureSalesSignature } from "@/lib/email-signature";
import { validateOutboundEmailWithMx } from "@/lib/email-validate";
import { isSalesMailConfigured, sendSalesEmail } from "@/lib/mail";
import { getSendQuota } from "@/lib/send-quota";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { buildClickTrackingUrl, buildOpenTrackingUrl } from "@/lib/tracking";

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

  let quota;
  try {
    quota = await getSendQuota(supabase, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quota check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (quota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `Daily send cap reached (${quota.sentToday}/${quota.cap}). Try again tomorrow or raise DAILY_SEND_CAP.`,
        quota,
      },
      { status: 429 }
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
      tracking_token,
      subject_variant,
      follow_up_step,
      companies ( email, do_not_email, name )
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

  if (company && (company as { do_not_email?: boolean }).do_not_email) {
    const message = "Company unsubscribed / do-not-email";
    await supabase
      .from("campaign_targets")
      .update({ status: "skipped", error_message: message })
      .eq("id", target.id);
    return NextResponse.json(
      {
        sent: 0,
        failed: 0,
        skipped: true,
        error: message,
        target: { id: target.id, status: "skipped" as const, error_message: message },
      },
      { status: 400 }
    );
  }

  const validation = await validateOutboundEmailWithMx(company?.email);
  if (!validation.ok || !target.generated_subject || !target.generated_body) {
    const message = !validation.ok
      ? validation.reason || "Invalid email"
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

  const recipientEmail = validation.email;

  let trackingToken = (target as { tracking_token?: string | null }).tracking_token;
  if (!trackingToken) {
    trackingToken = crypto.randomUUID();
    await supabase
      .from("campaign_targets")
      .update({ tracking_token: trackingToken })
      .eq("id", target.id);
  }

  try {
    const bodyWithSignature = ensureSalesSignature(target.generated_body);
    const { messageId } = await sendSalesEmail({
      to: recipientEmail,
      subject: target.generated_subject,
      body: bodyWithSignature,
      openTrackingUrl: buildOpenTrackingUrl(trackingToken),
      freightClickUrl: buildClickTrackingUrl(trackingToken),
      unsubscribeUrl: buildUnsubscribeUrl(trackingToken),
    });

    const now = new Date();
    const follow = nextFollowUpAfterSend(0, now);

    await supabase
      .from("campaign_targets")
      .update({
        status: "sent",
        sent_at: now.toISOString(),
        error_message: null,
        tracking_token: trackingToken,
        follow_up_step: follow.follow_up_step,
        next_follow_up_at: follow.next_follow_up_at,
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
      quota: {
        ...quota,
        sentToday: quota.sentToday + 1,
        remaining: Math.max(0, quota.remaining - 1),
      },
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
