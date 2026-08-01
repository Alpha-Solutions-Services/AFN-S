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
    withDraft: 0,
    readyToSend: 0,
  });
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
      target?: { id: string; status: TargetStatus; error_message?: string };
    }>(res);

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
      throw new Error(data.error || "Send failed");
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

    const allReady = await fetchAllTargetIds("send");
    const toSend =
      limit === "all" ? allReady : allReady.slice(0, Math.max(1, limit));

    if (toSend.length === 0) {
      setMessage("No drafts ready to send.");
      return;
    }

    setAutomationPhase("sending");
    setMessage(null);
    setError(null);
    setProgress({ done: 0, total: toSend.length });

    let sent = 0;
    let failed = 0;

    try {
      for (let i = 0; i < toSend.length; i++) {
        try {
          await sendOneTarget(toSend[i]);
          sent++;
        } catch {
          failed++;
        }
        setProgress({ done: i + 1, total: toSend.length });
        if (i < toSend.length - 1) {
          await new Promise((r) => setTimeout(r, sendDelayWithJitter()));
        }
      }
      setMessage(
        `Batch done: ${sent} sent, ${failed} failed` +
          (limit !== "all" && allReady.length > toSend.length
            ? ` (${allReady.length - toSend.length} still waiting)`
            : "")
      );
      await loadCampaign();
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
  const canSend = readyToSend > 0 && !isRunning && Boolean(health?.gmail);

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
          Sending as Muhammad Mikran via sales.afn.alpha@gmail.com · CC
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

        <div className="mt-4 grid gap-2 font-mono text-xs text-muted sm:grid-cols-5">
          <span>{stats.total.toLocaleString()} targets</span>
          <span>{stats.withDraft.toLocaleString()} drafts</span>
          <span>{readyToSend.toLocaleString()} ready to send</span>
          <span>{stats.sent.toLocaleString()} sent</span>
          <span>{stats.failed.toLocaleString()} failed</span>
        </div>

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
          Drafts stay until you send. Use batch size to send 10 / 25 / 50 / 100
          at a time, or all ready. Each row also has its own Send button.
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
