"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { GENERATION_DELAY_MS } from "@/lib/ai-email";
import { readJsonResponse } from "@/lib/fetch-json";
import { sendDelayWithJitter, cn } from "@/lib/utils";
import type { Campaign, CampaignTarget, TargetStatus } from "@/lib/types";

const TARGET_STATUS_COLORS: Record<CampaignTarget["status"], string> = {
  pending: "text-muted border-border",
  sent: "text-success border-success/40",
  failed: "text-danger border-danger/40",
  skipped: "text-warning border-warning/40",
  bounced: "text-danger border-danger/40",
};

const PAGE_SIZE = 50;
const BATCH_SIZES = [10, 25, 50, 100] as const;

type StatusFilter = "all" | TargetStatus | "ready";

function needsDraft(target: CampaignTarget) {
  return (
    (!target.generated_subject || !target.generated_body) &&
    (target.status === "pending" || target.status === "failed")
  );
}

function canSendTarget(target: CampaignTarget) {
  return Boolean(
    target.generated_subject &&
      target.generated_body &&
      (target.status === "pending" || target.status === "failed")
  );
}

export default function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [targets, setTargets] = useState<CampaignTarget[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    withDraft: 0,
    readyToSend: 0,
    opened: 0,
    replied: 0,
    followUpsDue: 0,
  });
  const [abStats, setAbStats] = useState<
    Array<{ variant: string; sent: number; opened: number; openRate: number }>
  >([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{
    ready: boolean;
    ai: string;
    gmail: boolean;
  } | null>(null);
  const [automationPhase, setAutomationPhase] = useState<
    "idle" | "generating" | "sending"
  >("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [batchSize, setBatchSize] = useState<number | "all">(25);
  const [deleting, setDeleting] = useState(false);
  const [syncingReplies, setSyncingReplies] = useState(false);
  const [sendingFollowUps, setSendingFollowUps] = useState(false);
  const [quota, setQuota] = useState<{
    cap: number;
    sentToday: number;
    remaining: number;
    warmupDay: number | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readyToSend = stats.readyToSend;

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusParam =
        statusFilter !== "all" && statusFilter !== "ready"
          ? `&status=${statusFilter}`
          : "";
      const res = await fetch(
        `/api/campaigns/${params.id}?limit=${PAGE_SIZE}&offset=${offset}${statusParam}`
      );
      const data = await readJsonResponse<{
        campaign?: Campaign;
        targets?: CampaignTarget[];
        total?: number;
        stats?: typeof stats;
        abStats?: typeof abStats;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load campaign");
      let nextTargets = data.targets ?? [];
      if (statusFilter === "ready") {
        nextTargets = nextTargets.filter(canSendTarget);
      }
      setCampaign(data.campaign ?? null);
      setTargets(nextTargets);
      setTotal(data.total ?? 0);
      if (data.stats) setStats(data.stats);
      if (data.abStats) setAbStats(data.abStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [params.id, offset, statusFilter]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/health");
        const data = await readJsonResponse<{
          ready?: boolean;
          ai?: string;
          gmail?: boolean;
        }>(res);
        setHealth({
          ready: Boolean(data.ready),
          ai: data.ai ?? "none",
          gmail: Boolean(data.gmail),
        });
      } catch {
        setHealth({ ready: false, ai: "none", gmail: false });
      }
    })();
  }, []);

  const loadQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/emails/quota");
      const data = await readJsonResponse<{
        cap?: number;
        sentToday?: number;
        remaining?: number;
        warmupDay?: number | null;
        error?: string;
      }>(res);
      if (!res.ok) return;
      if (
        typeof data.cap === "number" &&
        typeof data.sentToday === "number" &&
        typeof data.remaining === "number"
      ) {
        setQuota({
          cap: data.cap,
          sentToday: data.sentToday,
          remaining: data.remaining,
          warmupDay: data.warmupDay ?? null,
        });
      }
    } catch {
      // ignore — send API still enforces
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  async function generateOneTarget(targetId: string, variationIndex: number) {
    const res = await fetch(`/api/campaigns/${params.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, variationIndex }),
    });
    const data = await readJsonResponse<{
      generated?: number;
      failed?: number;
      error?: string;
      target?: {
        id: string;
        generated_subject?: string;
        generated_body?: string;
        error_message?: string | null;
      };
    }>(res);

    if (data.target) {
      setTargets((prev) =>
        prev.map((t) =>
          t.id === data.target!.id
            ? {
                ...t,
                generated_subject:
                  data.target!.generated_subject ?? t.generated_subject,
                generated_body: data.target!.generated_body ?? t.generated_body,
                error_message: data.target!.error_message ?? null,
              }
            : t
        )
      );
      setStats((s) => ({
        ...s,
        withDraft: data.generated ? s.withDraft + 1 : s.withDraft,
        readyToSend: data.generated ? s.readyToSend + 1 : s.readyToSend,
      }));
    }

    if (!res.ok || (data.failed ?? 0) > 0) {
      throw new Error(data.error || "Generation failed");
    }
    return data;
  }

  async function sendOneTarget(targetId: string) {
    const res = await fetch(`/api/campaigns/${params.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId }),
    });
    const data = await readJsonResponse<{
      sent?: number;
      failed?: number;
      error?: string;
      skipped?: boolean;
      quota?: {
        cap: number;
        sentToday: number;
        remaining: number;
        warmupDay: number | null;
      };
      target?: { id: string; status: TargetStatus; error_message?: string };
    }>(res);

    if (data.quota) setQuota(data.quota);

    if (data.skipped) return data;

    if (data.target) {
      setTargets((prev) =>
        prev.map((t) =>
          t.id === data.target!.id
            ? {
                ...t,
                status: data.target!.status,
                error_message: data.target!.error_message ?? null,
                sent_at:
                  data.target!.status === "sent"
                    ? new Date().toISOString()
                    : t.sent_at,
              }
            : t
        )
      );
      if (data.target.status === "sent") {
        setStats((s) => ({
          ...s,
          sent: s.sent + 1,
          pending: Math.max(0, s.pending - 1),
          readyToSend: Math.max(0, s.readyToSend - 1),
        }));
      } else if (data.target.status === "failed") {
        setStats((s) => ({
          ...s,
          failed: s.failed + 1,
        }));
      }
    }

    if (!res.ok || (data.failed ?? 0) > 0) {
      const err = new Error(data.error || "Send failed") as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function fetchAllTargetIds(filter: "draft" | "send"): Promise<string[]> {
    const res = await fetch(`/api/campaigns/${params.id}?limit=1&offset=0`);
    const data = await readJsonResponse<{ stats?: typeof stats }>(res);
    const totalCount = data.stats?.total ?? 0;
    const ids: string[] = [];

    for (let off = 0; off < totalCount; off += 200) {
      const batchRes = await fetch(
        `/api/campaigns/${params.id}?limit=200&offset=${off}`
      );
      const batchData = await readJsonResponse<{
        targets?: CampaignTarget[];
      }>(batchRes);
      for (const t of batchData.targets ?? []) {
        if (filter === "draft" && needsDraft(t)) ids.push(t.id);
        if (filter === "send" && canSendTarget(t)) ids.push(t.id);
      }
    }
    return ids;
  }

  async function handleGenerateAll() {
    const toGenerate = await fetchAllTargetIds("draft");
    if (toGenerate.length === 0) {
      setMessage("All targets already have drafts.");
      return;
    }

    setAutomationPhase("generating");
    setMessage(null);
    setError(null);
    setProgress({ done: 0, total: toGenerate.length });

    let generated = 0;
    let failed = 0;

    try {
      for (let i = 0; i < toGenerate.length; i++) {
        try {
          await generateOneTarget(toGenerate[i], i);
          generated++;
        } catch {
          failed++;
        }
        setProgress({ done: i + 1, total: toGenerate.length });
        if (i < toGenerate.length - 1) {
          await new Promise((r) => setTimeout(r, GENERATION_DELAY_MS));
        }
      }
      setMessage(`Generated ${generated} drafts (${failed} failed)`);
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAutomationPhase("idle");
      setProgress({ done: 0, total: 0 });
    }
  }

  async function handleSendBatch(limit: number | "all") {
    if (!health?.gmail) {
      setError(
        "Sales mailbox not configured. Add SALES_MAIL_APP_PASSWORD for sales.afn.alpha@gmail.com."
      );
      return;
    }

    let liveQuota = quota;
    try {
      const qRes = await fetch("/api/emails/quota");
      const qData = await readJsonResponse<{
        cap?: number;
        sentToday?: number;
        remaining?: number;
        warmupDay?: number | null;
      }>(qRes);
      if (
        qRes.ok &&
        typeof qData.cap === "number" &&
        typeof qData.sentToday === "number" &&
        typeof qData.remaining === "number"
      ) {
        liveQuota = {
          cap: qData.cap,
          sentToday: qData.sentToday,
          remaining: qData.remaining,
          warmupDay: qData.warmupDay ?? null,
        };
        setQuota(liveQuota);
      }
    } catch {
      // send API still enforces
    }

    const allReady = await fetchAllTargetIds("send");
    const remaining = liveQuota?.remaining ?? Infinity;
    const capped =
      Number.isFinite(remaining) && remaining < allReady.length
        ? allReady.slice(0, Math.max(0, remaining as number))
        : allReady;
    const toSend =
      limit === "all" ? capped : capped.slice(0, Math.max(1, limit));

    if (toSend.length === 0) {
      setMessage(
        remaining === 0
          ? `Daily send cap reached (${liveQuota?.sentToday}/${liveQuota?.cap}).`
          : "No drafts ready to send."
      );
      return;
    }

    setAutomationPhase("sending");
    setMessage(null);
    setError(null);
    setProgress({ done: 0, total: toSend.length });

    let sent = 0;
    let failed = 0;
    let stoppedForQuota = false;

    try {
      for (let i = 0; i < toSend.length; i++) {
        try {
          await sendOneTarget(toSend[i]);
          sent++;
        } catch (err) {
          const status = (err as { status?: number })?.status;
          if (status === 429) {
            stoppedForQuota = true;
            setError(err instanceof Error ? err.message : "Daily cap reached");
            break;
          }
          failed++;
        }
        setProgress({ done: i + 1, total: toSend.length });
        if (i < toSend.length - 1) {
          await new Promise((r) => setTimeout(r, sendDelayWithJitter()));
        }
      }
      setMessage(
        `Batch done: ${sent} sent, ${failed} failed` +
          (stoppedForQuota ? " (stopped at daily cap)" : "") +
          (limit !== "all" && allReady.length > toSend.length
            ? ` (${allReady.length - toSend.length} still waiting)`
            : "")
      );
      await loadCampaign();
      await loadQuota();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setAutomationPhase("idle");
      setProgress({ done: 0, total: 0 });
    }
  }

  async function handleSendOne(targetId: string) {
    if (!health?.gmail) {
      setError(
        "Sales mailbox not configured. Add SALES_MAIL_APP_PASSWORD for sales.afn.alpha@gmail.com."
      );
      return;
    }
    setSendingId(targetId);
    setError(null);
    try {
      await sendOneTarget(targetId);
      setMessage("Email sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendingId(null);
    }
  }

  async function handleRegenerate(targetId: string, index: number) {
    setRegeneratingId(targetId);
    setError(null);
    try {
      await generateOneTarget(targetId, index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleMarkReplied(targetId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${params.id}/targets/${targetId}/reply`,
        { method: "POST" }
      );
      const data = await readJsonResponse<{
        target?: CampaignTarget;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to mark replied");
      if (data.target) {
        setTargets((prev) =>
          prev.map((t) => (t.id === targetId ? { ...t, ...data.target } : t))
        );
        setStats((s) => ({ ...s, replied: (s.replied ?? 0) + 1 }));
      }
      setMessage("Marked as replied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mark replied failed");
    }
  }

  async function handleSyncReplies() {
    setSyncingReplies(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/emails/sync-replies", { method: "POST" });
      const data = await readJsonResponse<{
        scannedReplies?: number;
        scannedBounces?: number;
        matched?: number;
        bounced?: number;
        scanned?: number;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMessage(
        `Inbox sync: ${data.matched ?? 0} replies, ${data.bounced ?? 0} bounces` +
          ` (scanned ${data.scannedReplies ?? data.scanned ?? 0} msgs / ${data.scannedBounces ?? 0} bounce notices).`
      );
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync replies failed");
    } finally {
      setSyncingReplies(false);
    }
  }

  async function handleSendFollowUps() {
    if (!health?.gmail) {
      setError("Sales mailbox not configured.");
      return;
    }
    setSendingFollowUps(true);
    setError(null);
    setMessage(null);
    try {
      const listRes = await fetch(
        `/api/emails/follow-ups?campaignId=${params.id}`
      );
      const listData = await readJsonResponse<{
        targets?: Array<{ id: string }>;
        error?: string;
      }>(listRes);
      if (!listRes.ok) throw new Error(listData.error || "Failed to load follow-ups");
      const due = listData.targets ?? [];
      if (due.length === 0) {
        setMessage("No due follow-ups (opened + unreplied + day 3/7).");
        return;
      }

      let sent = 0;
      let failed = 0;
      for (const t of due) {
        try {
          const res = await fetch("/api/emails/follow-ups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetId: t.id }),
          });
          const data = await readJsonResponse<{
            sent?: number;
            error?: string;
            quota?: typeof quota;
          }>(res);
          if (data.quota) setQuota(data.quota);
          if (!res.ok) {
            if (res.status === 429) {
              setError(data.error || "Daily cap reached");
              break;
            }
            failed++;
          } else {
            sent += data.sent ?? 1;
          }
        } catch {
          failed++;
        }
      }
      setMessage(`Follow-ups: ${sent} sent, ${failed} failed (${due.length} due).`);
      await loadCampaign();
      await loadQuota();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow-up send failed");
    } finally {
      setSendingFollowUps(false);
    }
  }

  async function handleDeleteCampaign() {
    if (
      !window.confirm(
        `Delete campaign "${campaign?.name}"? This removes all drafts and targets. Sent email logs stay.`
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${params.id}`, { method: "DELETE" });
      const data = await readJsonResponse<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Delete failed");
      router.push("/dashboard/campaigns");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  const isRunning = automationPhase !== "idle";
  const quotaBlocks = Boolean(quota && quota.remaining <= 0);
  const canSend =
    readyToSend > 0 && !isRunning && Boolean(health?.gmail) && !quotaBlocks;

  if (loading && !campaign) {
    return (
      <DashboardShell title="Campaign">
        <p className="text-sm text-muted">Loading...</p>
      </DashboardShell>
    );
  }

  if (!campaign) {
    return (
      <DashboardShell title="Campaign">
        <p className="text-sm text-danger">Campaign not found.</p>
        <Link href="/dashboard/campaigns" className="mt-4 text-sm text-accent">
          Back to campaigns
        </Link>
      </DashboardShell>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const batchLabel =
    batchSize === "all" ? `Send all ready (${readyToSend})` : `Send next ${batchSize}`;

  return (
    <DashboardShell title={campaign.name}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/campaigns"
          className="text-sm text-muted transition-colors hover:text-accent"
        >
          Back to campaigns
        </Link>
        <button
          type="button"
          className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          disabled={deleting || isRunning}
          onClick={() => void handleDeleteCampaign()}
        >
          {deleting ? "Deleting..." : "Delete campaign"}
        </button>
      </div>

      {health && !health.ready ? (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Setup required:{" "}
          {!health.gmail
            ? "Sales mailbox not configured (SALES_MAIL_APP_PASSWORD for sales.afn.alpha@gmail.com). "
            : ""}
          {health.ai === "none" ? "Add GROQ_API_KEY to environment variables. " : ""}
        </div>
      ) : health?.gmail ? (
        <p className="mb-4 font-mono text-xs text-muted">
          Sending as Alpha Freight Network via sales.afn.alpha@gmail.com · CC
          kevin.afn.dispatch@gmail.com · replies to mikran.dispatch@gmail.com
        </p>
      ) : null}

      <div className="panel mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="data-label">Offer</p>
          <span className="font-mono text-xs uppercase text-muted">
            {campaign.status}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-text">
          {campaign.offer_description}
        </p>

        <div className="mt-4 grid gap-2 font-mono text-xs text-muted sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          <span>{stats.total.toLocaleString()} targets</span>
          <span>{stats.withDraft.toLocaleString()} drafts</span>
          <span>{readyToSend.toLocaleString()} ready</span>
          <span>{stats.sent.toLocaleString()} sent</span>
          <span>{(stats.opened ?? 0).toLocaleString()} opened</span>
          <span>{(stats.replied ?? 0).toLocaleString()} replied</span>
          <span>{(stats.bounced ?? 0).toLocaleString()} bounced</span>
          <span>{(stats.followUpsDue ?? 0).toLocaleString()} follow-ups due</span>
        </div>

        {abStats.length > 0 ? (
          <p className="mt-3 font-mono text-xs text-muted">
            Subject A/B:{" "}
            {abStats
              .map(
                (v) =>
                  `${v.variant} ${v.openRate}% open (${v.opened}/${v.sent})`
              )
              .join(" · ")}
          </p>
        ) : null}

        {quota ? (
          <p className="mt-3 font-mono text-xs text-muted">
            Daily send quota: {quota.sentToday}/{quota.cap} used ·{" "}
            {quota.remaining} left
            {quota.warmupDay != null ? ` · warm-up day ${quota.warmupDay}` : ""}
            {!quota.warmupDay
              ? " · set SEND_WARMUP_START in Vercel to ramp safely"
              : ""}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={isRunning}
            onClick={() => void handleGenerateAll()}
          >
            {automationPhase === "generating"
              ? "Generating..."
              : "Generate drafts"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={isRunning || syncingReplies || !health?.gmail}
            onClick={() => void handleSyncReplies()}
          >
            {syncingReplies ? "Syncing..." : "Sync inbox"}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={
              isRunning ||
              sendingFollowUps ||
              !health?.gmail ||
              (stats.followUpsDue ?? 0) <= 0 ||
              quotaBlocks
            }
            onClick={() => void handleSendFollowUps()}
          >
            {sendingFollowUps
              ? "Sending follow-ups..."
              : `Send follow-ups (${stats.followUpsDue ?? 0})`}
          </button>

          <div>
            <label className="data-label mb-1 block">Batch size</label>
            <select
              className="input w-auto min-w-[8rem]"
              value={batchSize === "all" ? "all" : String(batchSize)}
              disabled={isRunning}
              onChange={(e) => {
                const v = e.target.value;
                setBatchSize(v === "all" ? "all" : Number(v));
              }}
            >
              {BATCH_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="all">All ready ({readyToSend})</option>
            </select>
          </div>

          <button
            type="button"
            className="btn-primary"
            disabled={!canSend}
            onClick={() => void handleSendBatch(batchSize)}
          >
            {automationPhase === "sending" ? "Sending..." : batchLabel}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Sync inbox pulls replies + Mailer-Daemon bounces. Follow-ups only go to
          opened, unreplied contacts on day 3 / day 7. Emails include a stop link.
        </p>
      </div>

      {isRunning && progress.total > 0 ? (
        <div className="mb-4 panel p-4">
          <p className="font-mono text-xs text-muted">
            {automationPhase === "generating" ? "Generating" : "Sending"}{" "}
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${Math.min(100, (progress.done / progress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mb-4 rounded-lg border border-success/40 bg-success/10 px-3 py-2 font-mono text-xs text-success">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            "all",
            "ready",
            "pending",
            "sent",
            "failed",
          ] as StatusFilter[]
        ).map((s) => (
          <button
            key={s}
            type="button"
            className={cn(
              "rounded-lg border px-3 py-1 font-mono text-xs uppercase",
              statusFilter === s
                ? "border-accent text-accent"
                : "border-border text-muted hover:text-text"
            )}
            onClick={() => {
              setOffset(0);
              setStatusFilter(s);
            }}
          >
            {s === "ready" ? `ready (${readyToSend})` : s}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {targets.length === 0 ? (
          <p className="text-sm text-muted">No targets match this filter.</p>
        ) : (
          targets.map((target, idx) => (
            <div key={target.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text">
                    {target.companies?.name || "Unknown"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {target.companies?.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 font-mono text-xs uppercase",
                      TARGET_STATUS_COLORS[target.status]
                    )}
                  >
                    {target.status}
                  </span>
                  {target.opened_at ? (
                    <span className="rounded border border-accent/40 px-2 py-0.5 font-mono text-xs uppercase text-accent">
                      opened{target.open_count && target.open_count > 1 ? ` ×${target.open_count}` : ""}
                    </span>
                  ) : null}
                  {target.replied_at ? (
                    <span className="rounded border border-success/40 px-2 py-0.5 font-mono text-xs uppercase text-success">
                      replied
                    </span>
                  ) : null}
                  {target.bounced_at || target.status === "bounced" ? (
                    <span className="rounded border border-danger/40 px-2 py-0.5 font-mono text-xs uppercase text-danger">
                      bounced
                    </span>
                  ) : null}
                  {target.subject_variant ? (
                    <span className="rounded border border-border px-2 py-0.5 font-mono text-xs uppercase text-muted">
                      subj {target.subject_variant}
                    </span>
                  ) : null}
                  {(target.click_count ?? 0) > 0 ? (
                    <span className="rounded border border-accent/40 px-2 py-0.5 font-mono text-xs uppercase text-accent">
                      clicked ×{target.click_count}
                    </span>
                  ) : null}
                  {target.companies?.do_not_email ? (
                    <span className="rounded border border-warning/40 px-2 py-0.5 font-mono text-xs uppercase text-warning">
                      unsubscribed
                    </span>
                  ) : null}
                  {canSendTarget(target) ? (
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      disabled={sendingId === target.id || isRunning}
                      onClick={() => void handleSendOne(target.id)}
                    >
                      {sendingId === target.id ? "Sending..." : "Send"}
                    </button>
                  ) : null}
                  {target.status === "sent" && !target.replied_at ? (
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={isRunning}
                      onClick={() => void handleMarkReplied(target.id)}
                    >
                      Mark replied
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={regeneratingId === target.id || isRunning}
                    onClick={() =>
                      void handleRegenerate(target.id, offset + idx)
                    }
                  >
                    {regeneratingId === target.id ? "..." : "Regenerate"}
                  </button>
                </div>
              </div>

              {target.generated_subject ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="data-label">Subject</p>
                    <p className="mt-1 font-mono text-sm text-text">
                      {target.generated_subject}
                    </p>
                  </div>
                  <div>
                    <p className="data-label">Body</p>
                    <p className="mt-1 whitespace-pre-wrap font-mono text-sm text-muted">
                      {target.generated_body}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted">No draft yet.</p>
              )}

              {target.error_message ? (
                <p className="mt-3 font-mono text-xs text-danger">
                  {target.error_message}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>

      {total > PAGE_SIZE && statusFilter !== "ready" ? (
        <div className="mt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            className="btn-secondary"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </button>
          <p className="font-mono text-xs text-muted">
            Page {page} of {totalPages}
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      ) : null}
    </DashboardShell>
  );
}
