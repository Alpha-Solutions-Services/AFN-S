"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { useUi } from "@/components/ui/UiProvider";
import { readJsonResponse } from "@/lib/fetch-json";
import { SALES_TEAMS } from "@/lib/mailboxes";
import { DEFAULT_CAMPAIGN_OFFER } from "@/lib/talk-track";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<Campaign["status"], string> = {
  draft: "text-muted border-border",
  sending: "text-warning border-warning/40",
  completed: "text-success border-success/40",
  paused: "text-danger border-danger/40",
};

function CampaignsForm() {
  const ui = useUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(
    companyId ? "Follow-up: interested carrier" : ""
  );
  const [offerDescription, setOfferDescription] = useState(
    companyId ? DEFAULT_CAMPAIGN_OFFER : ""
  );
  const [targetFilter, setTargetFilter] = useState<"not_contacted" | "all">(
    "not_contacted"
  );
  const [team, setTeam] = useState<string>("");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
      setCampaigns(data.campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  async function handleDelete(id: string, name: string) {
    const ok = await ui.confirm({
      title: "Delete campaign?",
      message: `Delete campaign “${name}”?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      const data = await readJsonResponse<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          offer_description: offerDescription,
          target_filter: targetFilter,
          team: team || null,
          ...(companyId ? { company_ids: [companyId] } : {}),
        }),
      });
      const data = await readJsonResponse<{
        campaign?: Campaign;
        targets?: number;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");

      if (data.campaign?.id) {
        router.push(`/dashboard/campaigns/${data.campaign.id}`);
        return;
      }

      setName("");
      setOfferDescription("");
      setTargetFilter("not_contacted");
      setTeam("");
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DashboardShell title="Campaigns">
      {companyId ? (
        <p className="mb-4 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-text">
          Creating a campaign for the interested carrier from Call Queue (single
          target).
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-sm font-medium text-text">New campaign</h2>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div>
              <label className="data-label mb-1 block">Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Q1 freight carriers outreach"
                required
              />
            </div>
            <div>
              <label className="data-label mb-1 block">Offer description</label>
              <textarea
                className="input min-h-[120px] resize-y"
                value={offerDescription}
                onChange={(e) => setOfferDescription(e.target.value)}
                placeholder="Describe what you're pitching — this feeds the AI prompt."
                required
              />
            </div>
            {!companyId ? (
              <div>
                <label className="data-label mb-2 block">Target companies</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="radio"
                      name="target_filter"
                      checked={targetFilter === "not_contacted"}
                      onChange={() => setTargetFilter("not_contacted")}
                    />
                    Not contacted
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="radio"
                      name="target_filter"
                      checked={targetFilter === "all"}
                      onChange={() => setTargetFilter("all")}
                    />
                    All companies
                  </label>
                </div>
              </div>
            ) : null}
            <div>
              <label className="data-label mb-1 block">Sending team (Force)</label>
              <select
                className="input"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">Round-robin — spread across all 10 Forces</option>
                {SALES_TEAMS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.emoji} {t.name} — {t.email}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Emails send from the team mailbox and CC the AFN hub
                (sales.afn.alpha). Each mailbox has its own daily cap.
              </p>
            </div>
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? "Creating..." : "Create campaign"}
            </button>
            {error ? (
              <p className="font-mono text-xs text-danger">{error}</p>
            ) : null}
          </form>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-medium text-text">Your campaigns</h2>
          {loading ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : campaigns.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              No campaigns yet. Create one to generate and send outreach.
            </p>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((c) => (
                <li
                  key={c.id}
                  className="panel flex items-center justify-between gap-3 px-4 py-3"
                >
                  <Link
                    href={`/dashboard/campaigns/${c.id}`}
                    className="min-w-0 flex-1 transition-colors hover:text-accent"
                  >
                    <p className="text-sm font-medium text-text">{c.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 font-mono text-xs uppercase",
                        STATUS_COLORS[c.status]
                      )}
                    >
                      {c.status}
                    </span>
                    <button
                      type="button"
                      className="rounded border border-danger/40 px-2 py-1 font-mono text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                      disabled={deletingId === c.id}
                      onClick={() => void handleDelete(c.id, c.name)}
                    >
                      {deletingId === c.id ? "..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell title="Campaigns">
          <p className="text-sm text-muted">Loading...</p>
        </DashboardShell>
      }
    >
      <CampaignsForm />
    </Suspense>
  );
}
