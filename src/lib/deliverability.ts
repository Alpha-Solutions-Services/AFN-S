import { getSiteUrl } from "@/lib/site-url";

export type SubjectVariant = "A" | "B";

export function assignSubjectVariant(seed: string): SubjectVariant {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? "A" : "B";
}

export function buildUnsubscribeUrl(token: string): string {
  const base = getSiteUrl();
  return `${base}/api/track/unsubscribe/${encodeURIComponent(token)}`;
}

export function daysFromNow(days: number, from = new Date()): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** After initial send → day-3 follow-up. After day-3 → day-7. Then stop. */
export function nextFollowUpAfterSend(step: number, from = new Date()): {
  follow_up_step: number;
  next_follow_up_at: string | null;
} {
  if (step <= 0) {
    return {
      follow_up_step: 0,
      next_follow_up_at: daysFromNow(3, from).toISOString(),
    };
  }
  if (step === 1) {
    return {
      follow_up_step: 1,
      next_follow_up_at: daysFromNow(4, from).toISOString(), // ~day 7 from first send
    };
  }
  return { follow_up_step: 2, next_follow_up_at: null };
}

export function followUpSubject(
  originalSubject: string,
  step: number
): string {
  const base = originalSubject.replace(/^(re:\s*)+/i, "").trim();
  if (step === 1) return `Quick follow-up — ${base}`.slice(0, 120);
  if (step === 2) return `Checking in — ${base}`.slice(0, 120);
  return base;
}

export function followUpOpener(companyName: string, step: number): string {
  if (step === 1) {
    return `Hi — following up on my note to ${companyName}.\n\nCurious whether dispatch support or steadier freight coverage is still useful for your lanes. Happy to keep this short — reply here or call/text our Google Voice if you want to talk.`;
  }
  return `Hi again — last quick check-in for ${companyName}.\n\nIf timing is better later, no worries. If you want help with rate negotiation or back-office dispatch, I'm easy to reach by reply or Google Voice.`;
}

export type AbVariantStats = {
  variant: SubjectVariant;
  sent: number;
  opened: number;
  openRate: number;
};

export function computeAbOpenRates(
  rows: Array<{
    subject_variant?: string | null;
    status: string;
    opened_at?: string | null;
    bounced_at?: string | null;
  }>
): AbVariantStats[] {
  const variants: SubjectVariant[] = ["A", "B"];
  return variants.map((variant) => {
    const sentPool = rows.filter((r) => {
      const v = (r.subject_variant as SubjectVariant) || "A";
      return v === variant && (r.status === "sent" || r.status === "bounced");
    });
    const sent = sentPool.length;
    const opened = sentPool.filter((r) => Boolean(r.opened_at)).length;
    return {
      variant,
      sent,
      opened,
      openRate: sent > 0 ? Math.round((opened / sent) * 1000) / 10 : 0,
    };
  });
}
