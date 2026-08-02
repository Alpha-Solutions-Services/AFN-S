import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fetchRecentBounces, fetchRecentInboxReplies } from "@/lib/imap-replies";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sync Gmail inbox: replies + Mailer-Daemon bounces.
 */
export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const admin = getServiceRoleClient();

  let replyHits;
  let bounceHits;
  try {
    [replyHits, bounceHits] = await Promise.all([
      fetchRecentInboxReplies({ sinceDays: 21, maxMessages: 300 }),
      fetchRecentBounces({ sinceDays: 21, maxMessages: 150 }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP sync failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const { data: waiting, error } = await supabase
    .from("campaign_targets")
    .select(
      `
      id,
      campaign_id,
      company_id,
      generated_subject,
      replied_at,
      bounced_at,
      status,
      companies ( email, name ),
      campaigns!inner ( owner_id )
    `
    )
    .in("status", ["sent", "bounced"])
    .eq("campaigns.owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mine = waiting ?? [];
  const byEmail = new Map<string, typeof mine>();
  for (const t of mine) {
    const company = Array.isArray(t.companies) ? t.companies[0] : t.companies;
    const email = company?.email?.trim().toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email) ?? [];
    list.push(t);
    byEmail.set(email, list);
  }

  const now = new Date().toISOString();
  const matchedReplies: Array<{ targetId: string; fromEmail: string; subject: string }> =
    [];
  const matchedBounces: Array<{ targetId: string; email: string; subject: string }> =
    [];

  for (const hit of replyHits) {
    const candidates = byEmail.get(hit.fromEmail)?.filter((c) => !c.replied_at && !c.bounced_at);
    if (!candidates?.length) continue;

    const subjectNorm = hit.subject.replace(/^re:\s*/i, "").trim().toLowerCase();
    const target =
      candidates.find((c) => {
        const sub = (c.generated_subject || "").trim().toLowerCase();
        return sub && (subjectNorm.includes(sub) || sub.includes(subjectNorm));
      }) ?? candidates[0];

    await supabase
      .from("campaign_targets")
      .update({
        replied_at: hit.date ?? now,
        last_event_at: now,
        next_follow_up_at: null,
      })
      .eq("id", target.id);

    if (target.company_id) {
      await supabase
        .from("companies")
        .update({ stage: "replied" })
        .eq("id", target.company_id)
        .in("stage", [
          "emailed",
          "opened",
          "not_contacted",
          "attempted",
          "callback",
        ]);
    }

    if (admin) {
      await admin.from("email_events").insert({
        owner_id: user.id,
        campaign_id: target.campaign_id,
        campaign_target_id: target.id,
        company_id: target.company_id,
        event_type: "reply",
        meta: {
          source: "imap",
          from: hit.fromEmail,
          subject: hit.subject,
          messageId: hit.messageId,
        },
      });
    }

    matchedReplies.push({
      targetId: target.id,
      fromEmail: hit.fromEmail,
      subject: hit.subject,
    });

    const remaining = (byEmail.get(hit.fromEmail) ?? []).filter(
      (c) => c.id !== target.id
    );
    if (remaining.length) byEmail.set(hit.fromEmail, remaining);
    else byEmail.delete(hit.fromEmail);
  }

  for (const bounce of bounceHits) {
    const candidates = byEmail
      .get(bounce.recipientEmail)
      ?.filter((c) => !c.bounced_at && c.status === "sent");
    if (!candidates?.length) continue;
    const target = candidates[0];

    await supabase
      .from("campaign_targets")
      .update({
        status: "bounced",
        bounced_at: bounce.date ?? now,
        last_event_at: now,
        next_follow_up_at: null,
        error_message: `Bounced: ${bounce.subject.slice(0, 160)}`,
      })
      .eq("id", target.id);

    if (target.company_id) {
      const company = Array.isArray(target.companies)
        ? target.companies[0]
        : target.companies;
      const noteLine = `[${(bounce.date ?? now).slice(0, 10)}] Email bounced (${bounce.recipientEmail})`;
      const prevNotes = (company as { name?: string } | null)
        ? (
            await supabase
              .from("companies")
              .select("notes")
              .eq("id", target.company_id)
              .maybeSingle()
          ).data?.notes
        : null;
      const notes =
        prevNotes && !prevNotes.includes(noteLine)
          ? `${prevNotes}\n${noteLine}`
          : prevNotes || noteLine;
      await supabase
        .from("companies")
        .update({ notes })
        .eq("id", target.company_id);
    }

    if (admin) {
      await admin.from("email_events").insert({
        owner_id: user.id,
        campaign_id: target.campaign_id,
        campaign_target_id: target.id,
        company_id: target.company_id,
        event_type: "bounce",
        meta: {
          email: bounce.recipientEmail,
          subject: bounce.subject,
          snippet: bounce.snippet.slice(0, 200),
        },
      });
    }

    matchedBounces.push({
      targetId: target.id,
      email: bounce.recipientEmail,
      subject: bounce.subject,
    });

    const remaining = (byEmail.get(bounce.recipientEmail) ?? []).filter(
      (c) => c.id !== target.id
    );
    if (remaining.length) byEmail.set(bounce.recipientEmail, remaining);
    else byEmail.delete(bounce.recipientEmail);
  }

  return NextResponse.json({
    scannedReplies: replyHits.length,
    scannedBounces: bounceHits.length,
    matched: matchedReplies.length,
    bounced: matchedBounces.length,
    replies: matchedReplies,
    bounces: matchedBounces,
  });
}
