import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import {
  buildUnsubscribeUrl,
  nextFollowUpAfterSend,
} from "@/lib/deliverability";
import { ensureSalesSignature } from "@/lib/email-signature";
import { validateOutboundEmailWithMx } from "@/lib/email-validate";
import { sendSalesEmail } from "@/lib/mail";
import {
  getMailboxQuota,
  pickRoundRobinMailbox,
  resolveMailboxByTeam,
  type ResolvedMailbox,
} from "@/lib/mailboxes";
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

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Resolve the sending mailbox: assigned team, else round-robin across the
  // configured 10 Forces. The hub (sales.afn.alpha) never auto-sends.
  const teamKey = (campaign as { team?: string | null }).team ?? null;
  let mailbox: ResolvedMailbox | null;
  if (teamKey) {
    mailbox = resolveMailboxByTeam(teamKey);
    if (!mailbox) {
      return NextResponse.json(
        {
          error: `Team "${teamKey}" mailbox not configured. Add its Gmail App Password in Vercel env.`,
        },
        { status: 503 }
      );
    }
  } else {
    mailbox = await pickRoundRobinMailbox(admin);
    if (!mailbox) {
      return NextResponse.json(
        {
          error:
            "No team mailbox has quota left today (or none configured). Add SALES_MAIL_<TEAM>_APP_PASSWORD or wait for the daily reset.",
        },
        { status: 429 }
      );
    }
  }

  const mailboxQuota = await getMailboxQuota(admin, mailbox.email);
  if (mailboxQuota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `${mailbox.name} daily cap reached (${mailboxQuota.sentToday}/${mailboxQuota.cap}). Assign another team or wait for reset.`,
        quota: mailboxQuota,
      },
      { status: 429 }
    );
  }
  const quota = { ...mailboxQuota, warmupDay: null as number | null };

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
      mailbox: {
        email: mailbox.email,
        appPassword: mailbox.appPassword,
        name: mailbox.name,
      },
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
        sent_mailbox: mailbox.email,
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
        mailbox: mailbox.email,
      });
    } catch {
      // sent — don't fail if logging fails
    }

    return NextResponse.json({
      sent: 1,
      failed: 0,
      mailbox: mailbox.email,
      team: mailbox.team,
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
        mailbox: mailbox.email,
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
