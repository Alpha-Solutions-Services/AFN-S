import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import {
  buildUnsubscribeUrl,
  followUpOpener,
  followUpSubject,
  nextFollowUpAfterSend,
} from "@/lib/deliverability";
import { ensureSalesSignature } from "@/lib/email-signature";
import { validateOutboundEmailWithMx } from "@/lib/email-validate";
import { sendSalesEmail } from "@/lib/mail";
import {
  getMailboxQuota,
  pickRoundRobinMailbox,
  resolveMailboxByEmail,
  resolveMailboxByTeam,
  type ResolvedMailbox,
} from "@/lib/mailboxes";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { buildClickTrackingUrl, buildOpenTrackingUrl } from "@/lib/tracking";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * List due follow-ups: opened, unreplied, not bounced, next_follow_up_at <= now, step < 2
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("campaign_targets")
    .select(
      `
      id,
      campaign_id,
      company_id,
      generated_subject,
      follow_up_step,
      next_follow_up_at,
      opened_at,
      sent_at,
      companies ( name, email ),
      campaigns!inner ( owner_id, name )
    `
    )
    .eq("status", "sent")
    .not("opened_at", "is", null)
    .is("replied_at", null)
    .is("bounced_at", null)
    .lt("follow_up_step", 2)
    .lte("next_follow_up_at", nowIso)
    .eq("campaigns.owner_id", user.id)
    .order("next_follow_up_at", { ascending: true })
    .limit(100);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ targets: data ?? [], asOf: nowIso });
}

/**
 * Send one due follow-up (step 1 = day 3, step 2 = day 7).
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  let body: { targetId?: string } = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    // ignore
  }
  if (!body.targetId) {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data: target, error } = await supabase
    .from("campaign_targets")
    .select(
      `
      id,
      campaign_id,
      company_id,
      generated_subject,
      tracking_token,
      follow_up_step,
      next_follow_up_at,
      opened_at,
      replied_at,
      bounced_at,
      status,
      sent_mailbox,
      companies ( name, email, do_not_email ),
      campaigns!inner ( owner_id, team )
    `
    )
    .eq("id", body.targetId)
    .eq("campaigns.owner_id", user.id)
    .single();

  if (error || !target) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  // Reuse the original sending mailbox for thread consistency, else team, else round-robin.
  const campaignForTarget = Array.isArray(target.campaigns)
    ? target.campaigns[0]
    : target.campaigns;
  const teamKey = (campaignForTarget as { team?: string | null } | null)?.team ?? null;
  let mailbox: ResolvedMailbox | null =
    resolveMailboxByEmail((target as { sent_mailbox?: string | null }).sent_mailbox) ||
    (teamKey ? resolveMailboxByTeam(teamKey) : null);
  if (!mailbox) {
    mailbox = await pickRoundRobinMailbox(admin);
  }
  if (!mailbox) {
    return NextResponse.json(
      { error: "No team mailbox has quota left today (or none configured)." },
      { status: 429 }
    );
  }

  const mailboxQuota = await getMailboxQuota(admin, mailbox.email);
  if (mailboxQuota.remaining <= 0) {
    return NextResponse.json(
      {
        error: `${mailbox.name} daily cap reached (${mailboxQuota.sentToday}/${mailboxQuota.cap}).`,
        quota: mailboxQuota,
      },
      { status: 429 }
    );
  }
  const quota = { ...mailboxQuota, warmupDay: null as number | null };

  if (
    target.status !== "sent" ||
    !target.opened_at ||
    target.replied_at ||
    target.bounced_at ||
    (target.follow_up_step ?? 0) >= 2 ||
    !target.next_follow_up_at ||
    target.next_follow_up_at > nowIso
  ) {
    return NextResponse.json(
      { error: "Target not due for follow-up (needs opened, unreplied, due date)." },
      { status: 409 }
    );
  }

  const company = Array.isArray(target.companies)
    ? target.companies[0]
    : target.companies;

  if ((company as { do_not_email?: boolean } | null)?.do_not_email) {
    await supabase
      .from("campaign_targets")
      .update({ next_follow_up_at: null })
      .eq("id", target.id);
    return NextResponse.json({ error: "Unsubscribed", skipped: true }, { status: 400 });
  }

  const validation = await validateOutboundEmailWithMx(company?.email);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reason || "Invalid email" },
      { status: 400 }
    );
  }

  let trackingToken = target.tracking_token;
  if (!trackingToken) {
    trackingToken = crypto.randomUUID();
  }

  const nextStep = (target.follow_up_step ?? 0) + 1;
  const companyName =
    (company as { name?: string } | null)?.name || "your team";
  const subject = followUpSubject(
    target.generated_subject || "Alpha Freight Network",
    nextStep
  );
  const opener = followUpOpener(companyName, nextStep);

  try {
    const { messageId } = await sendSalesEmail({
      to: validation.email,
      subject,
      body: ensureSalesSignature(opener),
      openTrackingUrl: buildOpenTrackingUrl(trackingToken),
      freightClickUrl: buildClickTrackingUrl(trackingToken),
      unsubscribeUrl: buildUnsubscribeUrl(trackingToken),
      mailbox: {
        email: mailbox.email,
        appPassword: mailbox.appPassword,
        name: mailbox.name,
      },
    });

    const follow = nextFollowUpAfterSend(nextStep);
    await supabase
      .from("campaign_targets")
      .update({
        tracking_token: trackingToken,
        follow_up_step: nextStep,
        next_follow_up_at: follow.next_follow_up_at,
        last_event_at: nowIso,
        sent_mailbox: mailbox.email,
      })
      .eq("id", target.id);

    await admin.from("email_logs").insert({
      owner_id: user.id,
      campaign_id: target.campaign_id,
      campaign_target_id: target.id,
      company_id: target.company_id,
      recipient_email: validation.email,
      subject,
      success: true,
      gmail_message_id: messageId,
      mailbox: mailbox.email,
    });

    return NextResponse.json({
      sent: 1,
      step: nextStep,
      quota: {
        ...quota,
        sentToday: quota.sentToday + 1,
        remaining: Math.max(0, quota.remaining - 1),
      },
      target: {
        id: target.id,
        follow_up_step: nextStep,
        next_follow_up_at: follow.next_follow_up_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Follow-up send failed";
    return NextResponse.json({ error: message, sent: 0 }, { status: 500 });
  }
}
