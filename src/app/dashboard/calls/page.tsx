"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { StageBadge } from "@/components/StageBadge";
import { readJsonResponse } from "@/lib/fetch-json";
import { isSyntheticEmail, normalizeUsPhone } from "@/lib/phone";
import { DEFAULT_CAMPAIGN_OFFER, DISPATCH_TALK_TRACK } from "@/lib/talk-track";
import type { CallOutcome, Company } from "@/lib/types";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIMARY_OUTCOMES: CallOutcome[] = [
  "no_answer",
  "voicemail",
  "callback",
  "interested",
];
const SECONDARY_OUTCOMES: CallOutcome[] = CALL_OUTCOMES.filter(
  (o) => !PRIMARY_OUTCOMES.includes(o)
);

export default function CallQueuePage() {
  const [queue, setQueue] = useState<Company[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastInterestedId, setLastInterestedId] = useState<string | null>(null);
  const [lastInterestedName, setLastInterestedName] = useState<string | null>(
    null
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calls/queue?limit=50");
      const data = await readJsonResponse<{
        companies?: Company[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load queue");
      setQueue(data.companies ?? []);
      setIndex(0);
      setNotes("");
      setCallbackAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const current = queue[index] ?? null;
  const phone = useMemo(
    () => (current ? normalizeUsPhone(current.phone) : null),
    [current]
  );

  async function logOutcome(outcome: CallOutcome) {
    if (!current) return;
    setLogging(true);
    setError(null);
    setMessage(null);
    setLastInterestedId(null);
    setLastInterestedName(null);

    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: current.id,
          outcome,
          notes: notes.trim() || null,
          next_call_at:
            outcome === "callback" && callbackAt
              ? new Date(callbackAt).toISOString()
              : undefined,
        }),
      });
      const data = await readJsonResponse<{
        company?: Company;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to log call");

      setMessage(`${CALL_OUTCOME_LABELS[outcome]} — logged`);
      if (outcome === "interested") {
        setLastInterestedId(current.id);
        setLastInterestedName(current.name);
      }

      setQueue((prev) => prev.filter((c) => c.id !== current.id));
      setNotes("");
      setCallbackAt("");
      // index stays; next company slides into place
    } catch (err) {
      setError(err instanceof Error ? err.message : "Log failed");
    } finally {
      setLogging(false);
    }
  }

  function skip() {
    if (index < queue.length - 1) {
      setIndex((i) => i + 1);
      setNotes("");
      setCallbackAt("");
      setMessage(null);
    } else {
      setMessage("End of loaded queue — refresh for more.");
    }
  }

  async function createFollowUpCampaign() {
    if (!lastInterestedId) return;

    setLogging(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Follow-up: ${lastInterestedName ?? "Interested carrier"}`,
          offer_description: DEFAULT_CAMPAIGN_OFFER,
          company_ids: [lastInterestedId],
        }),
      });
      const data = await readJsonResponse<{
        campaign?: { id: string };
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      if (data.campaign?.id) {
        window.location.href = `/dashboard/campaigns/${data.campaign.id}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign create failed");
      setLogging(false);
    }
  }

  return (
    <DashboardShell title="Call Queue">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Free dialer — use <span className="font-mono text-xs">Call</span> for
          your phone, or <span className="font-mono text-xs">Open in Google
          Voice</span> if Voice is on another Google account / Chrome profile.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void loadQueue()}
          disabled={loading}
        >
          Refresh queue
        </button>
      </div>

      {error ? (
        <p className="mb-4 font-mono text-xs text-danger">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 font-mono text-xs text-success">{message}</p>
      ) : null}

      {lastInterestedId ? (
        <div className="panel mb-6 flex flex-wrap items-center justify-between gap-3 border-accent/40 p-4">
          <p className="text-sm text-text">
            Marked interested — create an email campaign draft for this carrier.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={logging}
              onClick={() => void createFollowUpCampaign()}
            >
              Email campaign
            </button>
            <Link
              href={`/dashboard/campaigns?companyId=${lastInterestedId}`}
              className="btn-secondary"
            >
              Open campaigns
            </Link>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading queue...</p>
      ) : !current ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-text">Queue is empty</p>
          <p className="mt-2 text-sm text-muted">
            Import carriers with phone numbers, or wait until callbacks are due.
          </p>
          <Link href="/dashboard/companies" className="btn-primary mt-6 inline-flex">
            Go to Companies
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="data-label">
                  {index + 1} of {queue.length} loaded
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-text">
                  {current.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StageBadge stage={current.stage} />
                  <span className="font-mono text-xs text-muted">
                    {current.call_attempts ?? 0} attempt
                    {(current.call_attempts ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={skip}>
                Skip
              </button>
            </div>

            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="data-label">Phone</dt>
                <dd className="mt-1 text-lg font-medium text-text">
                  {phone?.display ?? current.phone ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="data-label">Email</dt>
                <dd className="mt-1 text-sm text-muted">
                  {current.email && !isSyntheticEmail(current.email)
                    ? current.email
                    : "No email (phone-only)"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="data-label">MC / DOT / notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-text">
                  {current.notes || "—"}
                </dd>
              </div>
              {current.industry ? (
                <div>
                  <dt className="data-label">Industry</dt>
                  <dd className="mt-1 text-sm text-text">{current.industry}</dd>
                </div>
              ) : null}
              {current.contact_name ? (
                <div>
                  <dt className="data-label">Contact</dt>
                  <dd className="mt-1 text-sm text-text">
                    {current.contact_name}
                    {current.contact_title ? ` · ${current.contact_title}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-8">
              {phone ? (
                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={phone.telHref}
                    className="btn-primary inline-flex min-h-[52px] min-w-[140px] text-base"
                  >
                    Call {phone.display}
                  </a>
                  <a
                    href={`https://voice.google.com/u/${process.env.NEXT_PUBLIC_GOOGLE_VOICE_ACCOUNT || "0"}/calls?a=nc,${encodeURIComponent(phone.e164)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary inline-flex min-h-[52px] text-base"
                  >
                    Open in Google Voice
                  </a>
                </div>
              ) : (
                <p className="mt-8 font-mono text-xs text-danger">
                  Phone number could not be normalized for dialing.
                </p>
              )}
              <p className="mt-3 text-xs text-muted">
                Tip: keep Google Voice logged in on a second Chrome profile/window.
                Set NEXT_PUBLIC_GOOGLE_VOICE_ACCOUNT to 0, 1, or 2 to match
                voice.google.com/u/N/…
              </p>
            </div>

            <div className="mt-6">
              <label className="data-label mb-1 block">Call notes</label>
              <textarea
                className="input min-h-[80px] resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What they said, lanes, authority status…"
              />
            </div>

            <div className="mt-4">
              <label className="data-label mb-1 block">
                Callback time (optional)
              </label>
              <input
                type="datetime-local"
                className="input max-w-xs"
                value={callbackAt}
                onChange={(e) => setCallbackAt(e.target.value)}
              />
            </div>

            <div className="mt-6">
              <p className="data-label mb-2">Outcome</p>
              <div className="flex flex-wrap gap-2">
                {PRIMARY_OUTCOMES.map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    disabled={logging}
                    onClick={() => void logOutcome(outcome)}
                    className={cn(
                      "btn-secondary",
                      outcome === "interested" && "border-accent text-accent"
                    )}
                  >
                    {CALL_OUTCOME_LABELS[outcome]}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {SECONDARY_OUTCOMES.map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    disabled={logging}
                    onClick={() => void logOutcome(outcome)}
                    className="btn-secondary text-xs"
                  >
                    {CALL_OUTCOME_LABELS[outcome]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="panel p-6">
            <p className="data-label">Talk track</p>
            <h3 className="mt-1 text-sm font-semibold text-text">
              Alpha dispatch pitch
            </h3>
            <ul className="mt-4 space-y-4 text-sm text-muted">
              <li>
                <span className="font-medium text-text">Who: </span>
                {DISPATCH_TALK_TRACK.who}
              </li>
              <li>
                <span className="font-medium text-text">What: </span>
                {DISPATCH_TALK_TRACK.what}
              </li>
              <li>
                <span className="font-medium text-text">Fee: </span>
                {DISPATCH_TALK_TRACK.fee}
              </li>
              <li>
                <span className="font-medium text-text">Ask: </span>
                {DISPATCH_TALK_TRACK.ask}
              </li>
              <li>
                <span className="font-medium text-text">Google Voice: </span>
                {DISPATCH_TALK_TRACK.googleVoice} (call / text — primary)
              </li>
              <li>
                <span className="font-medium text-text">Close: </span>
                {DISPATCH_TALK_TRACK.close}
              </li>
            </ul>
          </aside>
        </div>
      )}
    </DashboardShell>
  );
}
