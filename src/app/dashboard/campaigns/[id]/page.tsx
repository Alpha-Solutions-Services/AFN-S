"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { readJsonResponse } from "@/lib/fetch-json";
import type { Campaign, CampaignTarget, TargetStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TARGET_STATUS_COLORS: Record<CampaignTarget["status"], string> = {
  pending: "text-muted border-border",
  sent: "text-success border-success/40",
  failed: "text-danger border-danger/40",
  skipped: "text-warning border-warning/40",
};

const GENERATE_PAUSE_MS = 2500;
const RATE_LIMIT_WAIT_MS = 65_000;
const RATE_LIMIT_RETRIES = 3;

type StatusFilter = "all" | "ready" | "needs_draft" | TargetStatus;

function needsDraft(target: CampaignTarget) {
  return (
    !target.generated_subject &&
    (target.status === "pending" || target.status === "failed")
  );
}

function isSendable(target: CampaignTarget) {
  return (
    Boolean(target.generated_subject && target.generated_body) &&
    (target.status === "pending" || target.status === "failed")
  );
}

export default function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [targets, setTargets] = useState<CampaignTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sendLimit, setSendLimit] = useState<number | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${params.id}`);
      const data = await readJsonResponse<{
        campaign?: Campaign;
        targets?: CampaignTarget[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load campaign");
      setCampaign(data.campaign ?? null);
      setTargets(data.targets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  const counts = useMemo(() => {
    const ready = targets.filter(isSendable).length;
    const withDraft = targets.filter(
      (t) => t.generated_subject && t.generated_body
    ).length;
    const needs = targets.filter(needsDraft).length;
    const sent = targets.filter((t) => t.status === "sent").length;
    const failed = targets.filter((t) => t.status === "failed").length;
    return { ready, withDraft, needs, sent, failed, total: targets.length };
  }, [targets]);

  const filteredTargets = useMemo(() => {
    return targets.filter((t) => {
      switch (statusFilter) {
        case "all":
          return true;
        case "ready":
          return isSendable(t);
        case "needs_draft":
          return needsDraft(t);
        default:
          return t.status === statusFilter;
      }
    });
  }, [targets, statusFilter]);

  const selectedSendable = useMemo(
    () => filteredTargets.filter((t) => selected.has(t.id) && isSendable(t)),
    [filteredTargets, selected]
  );

  const canSend =
    counts.ready > 0 && !sending && !generating && campaign?.status !== "sending";

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisibleReady() {
    setSelected(
      new Set(filteredTargets.filter(isSendable).map((t) => t.id))
    );
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function generateOneTarget(targetId: string) {
    const res = await fetch(`/api/campaigns/${params.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId }),
    });
    const data = await readJsonResponse<{
      generated?: number;
      failed?: number;
      error?: string;
      rateLimited?: boolean;
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
    }

    if (!res.ok || (data.failed ?? 0) > 0) {
      throw new Error(data.error || "Generation failed");
    }

    return data;
  }

  async function handleGenerateAll() {
    const queue = targets.filter(needsDraft);
    if (queue.length === 0) {
      setMessage("All targets already have drafts.");
      return;
    }

    setGenerating(true);
    setMessage(null);
    setError(null);
    setGenerateProgress({ done: 0, total: queue.length });

    let generated = 0;
    let failed = 0;

    try {
      for (let i = 0; i < queue.length; i++) {
        let attempts = 0;
        let done = false;

        while (!done) {
          try {
            await generateOneTarget(queue[i].id);
            generated++;
            done = true;
            setError(null);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Generation failed";
            if (/rate limit/i.test(msg) && attempts < RATE_LIMIT_RETRIES) {
              attempts++;
              setError(
                `AI rate limit — waiting 65s then continuing (${generated.toLocaleString()} drafts so far)…`
              );
              await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
              continue;
            }
            failed++;
            done = true;
            if (/rate limit/i.test(msg)) {
              setError(
                `${msg} Skipping one target; continuing (${generated.toLocaleString()} done).`
              );
            }
          }
        }

        setGenerateProgress({ done: i + 1, total: queue.length });

        if (i < queue.length - 1) {
          await new Promise((r) => setTimeout(r, GENERATE_PAUSE_MS));
        }
      }

      setMessage(
        `Generated ${generated.toLocaleString()} drafts` +
          (failed > 0 ? ` (${failed.toLocaleString()} failed)` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
      setGenerateProgress(null);
    }
  }

  async function handleRegenerate(targetId: string) {
    setRegeneratingId(targetId);
    setError(null);
    try {
      await generateOneTarget(targetId);
      setMessage("Draft regenerated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegeneratingId(null);
    }
  }

  function startEdit(target: CampaignTarget) {
    setEditingId(target.id);
    setEditSubject(target.generated_subject ?? "");
    setEditBody(target.generated_body ?? "");
  }

  async function saveDraft(targetId: string) {
    setSavingId(targetId);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${params.id}/targets/${targetId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject: editSubject, body: editBody }),
        }
      );
      const data = await readJsonResponse<{
        target?: CampaignTarget;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to save draft");
      if (data.target) {
        setTargets((prev) =>
          prev.map((t) =>
            t.id === targetId
              ? {
                  ...t,
                  generated_subject: data.target!.generated_subject,
                  generated_body: data.target!.generated_body,
                  status: data.target!.status,
                  error_message: null,
                }
              : t
          )
        );
      }
      setEditingId(null);
      setMessage("Draft saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function handleSend(opts?: { selectedOnly?: boolean }) {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const payload: { targetIds?: string[]; limit?: number } = {};
      if (opts?.selectedOnly) {
        if (selectedSendable.length === 0) {
          throw new Error("Select at least one ready draft to send");
        }
        payload.targetIds = selectedSendable.map((t) => t.id);
      }
      if (typeof sendLimit === "number" && sendLimit > 0) {
        payload.limit = sendLimit;
      }

      const res = await fetch(`/api/campaigns/${params.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse<{
        sent?: number;
        failed?: number;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Send failed");
      setMessage(`Sent ${data.sent} emails (${data.failed} failed)`);
      setSelected(new Set());
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
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

  const filters: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.total },
    { id: "ready", label: "Ready", count: counts.ready },
    { id: "needs_draft", label: "Needs draft", count: counts.needs },
    { id: "pending", label: "Pending", count: targets.filter((t) => t.status === "pending").length },
    { id: "sent", label: "Sent", count: counts.sent },
    { id: "failed", label: "Failed", count: counts.failed },
  ];

  return (
    <DashboardShell title={campaign.name}>
      <div className="mb-4">
        <Link
          href="/dashboard/campaigns"
          className="text-sm text-muted transition-colors hover:text-accent"
        >
          Back to campaigns
        </Link>
      </div>

      <div className="panel mb-6 p-6">
        <p className="data-label">Offer</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-text">
          {campaign.offer_description}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={generating || sending}
            onClick={() => void handleGenerateAll()}
          >
            {generating ? "Generating..." : "Generate all drafts"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            {sending ? "Sending..." : "Send all ready"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!canSend || selectedSendable.length === 0}
            onClick={() => void handleSend({ selectedOnly: true })}
          >
            Send selected ({selectedSendable.length})
          </button>
          <div>
            <label className="data-label mb-1 block">Max to send</label>
            <input
              className="input w-28"
              type="number"
              min={1}
              placeholder="All"
              value={sendLimit}
              onChange={(e) =>
                setSendLimit(e.target.value ? Number(e.target.value) : "")
              }
            />
          </div>
        </div>

        <p className="mt-3 font-mono text-xs text-muted">
          {counts.withDraft.toLocaleString()} of {counts.total.toLocaleString()}{" "}
          drafts · {counts.ready.toLocaleString()} ready to send ·{" "}
          {counts.sent.toLocaleString()} sent · {counts.failed.toLocaleString()}{" "}
          failed
        </p>
      </div>

      {generateProgress ? (
        <div className="mb-4 panel p-4">
          <p className="font-mono text-xs text-muted">
            Generating {generateProgress.done.toLocaleString()} /{" "}
            {generateProgress.total.toLocaleString()} drafts
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${(generateProgress.done / generateProgress.total) * 100}%`,
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={cn(
              "rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors",
              statusFilter === f.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-text"
            )}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label} ({f.count})
          </button>
        ))}
        <button
          type="button"
          className="btn-secondary ml-auto text-xs"
          onClick={selectVisibleReady}
        >
          Select visible ready
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={clearSelection}
        >
          Clear
        </button>
      </div>

      <div className="space-y-4">
        {filteredTargets.length === 0 ? (
          <p className="text-sm text-muted">No targets match this filter.</p>
        ) : (
          filteredTargets.map((target) => {
            const sendable = isSendable(target);
            const editing = editingId === target.id;
            return (
              <div key={target.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(target.id)}
                      disabled={!sendable}
                      onChange={() => toggleSelect(target.id)}
                      title={sendable ? "Select for send" : "Not ready to send"}
                    />
                    <div>
                      <p className="font-medium text-text">
                        {target.companies?.name || "Unknown"}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {target.companies?.email}
                      </p>
                    </div>
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
                    {target.generated_subject && target.status !== "sent" ? (
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        disabled={sending || generating || editing}
                        onClick={() => startEdit(target)}
                      >
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={
                        regeneratingId === target.id || sending || generating
                      }
                      onClick={() => void handleRegenerate(target.id)}
                    >
                      {regeneratingId === target.id ? "..." : "Regenerate"}
                    </button>
                  </div>
                </div>

                {editing ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="data-label mb-1 block">Subject</label>
                      <input
                        className="input"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="data-label mb-1 block">Body</label>
                      <textarea
                        className="input min-h-[140px] resize-y"
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        disabled={savingId === target.id}
                        onClick={() => void saveDraft(target.id)}
                      >
                        {savingId === target.id ? "Saving..." : "Save draft"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : target.generated_subject ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="data-label">Subject</p>
                      <p className="mt-1 text-sm text-text">
                        {target.generated_subject}
                      </p>
                    </div>
                    <div>
                      <p className="data-label">Body</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
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
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
