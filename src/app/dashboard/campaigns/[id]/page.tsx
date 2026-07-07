"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import type { Campaign, CampaignTarget } from "@/lib/types";
import { cn } from "@/lib/utils";

const TARGET_STATUS_COLORS: Record<CampaignTarget["status"], string> = {
  pending: "text-muted border-border",
  sent: "text-success border-success/40",
  failed: "text-danger border-danger/40",
  skipped: "text-warning border-warning/40",
};

export default function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [targets, setTargets] = useState<CampaignTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${params.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load campaign");
      setCampaign(data.campaign);
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

  const readyDrafts = targets.filter(
    (t) => t.generated_subject && t.generated_body
  ).length;
  const canSend = readyDrafts > 0 && !sending && campaign?.status !== "sending";

  async function handleGenerateAll() {
    setGenerating(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${params.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setMessage(`Generated ${data.generated} drafts (${data.failed} failed)`);
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate(targetId: string) {
    setRegeneratingId(targetId);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${params.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleSend() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${params.id}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setMessage(`Sent ${data.sent} emails (${data.failed} failed)`);
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
        <div className="mt-4 flex flex-wrap gap-3">
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
            {sending ? "Sending..." : "Send campaign"}
          </button>
        </div>
        {!canSend && readyDrafts === 0 ? (
          <p className="mt-3 text-xs text-muted">
            Generate at least one draft before sending.
          </p>
        ) : null}
      </div>

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

      <div className="space-y-4">
        {targets.length === 0 ? (
          <p className="text-sm text-muted">No targets in this campaign.</p>
        ) : (
          targets.map((target) => (
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
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 font-mono text-xs uppercase",
                      TARGET_STATUS_COLORS[target.status]
                    )}
                  >
                    {target.status}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={regeneratingId === target.id || sending}
                    onClick={() => void handleRegenerate(target.id)}
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
    </DashboardShell>
  );
}
