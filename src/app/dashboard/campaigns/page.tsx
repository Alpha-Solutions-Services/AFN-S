"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<Campaign["status"], string> = {
  draft: "text-muted border-border",
  sending: "text-warning border-warning/40",
  completed: "text-success border-success/40",
  paused: "text-danger border-danger/40",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [targetFilter, setTargetFilter] = useState<"not_contacted" | "all">(
    "not_contacted"
  );

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");

      setName("");
      setOfferDescription("");
      setTargetFilter("not_contacted");
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DashboardShell title="Campaigns">
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
                  Not yet contacted
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
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? "Creating..." : "Create campaign"}
            </button>
          </form>
          {error ? (
            <p className="mt-4 font-mono text-xs text-danger">{error}</p>
          ) : null}
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium text-text">All campaigns</h2>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted">Loading...</p>
          ) : campaigns.length === 0 ? (
            <p className="p-4 text-sm text-muted">No campaigns yet.</p>
          ) : (
            <ul>
              {campaigns.map((campaign) => (
                <li
                  key={campaign.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <Link
                    href={`/dashboard/campaigns/${campaign.id}`}
                    className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-bg"
                  >
                    <div>
                      <p className="font-medium text-text">{campaign.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 font-mono text-xs uppercase",
                        STATUS_COLORS[campaign.status]
                      )}
                    >
                      {campaign.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
