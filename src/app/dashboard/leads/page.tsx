"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import type { Company, CompanyStage } from "@/lib/types";

const STAGES: CompanyStage[] = [
  "not_contacted",
  "emailed",
  "opened",
  "replied",
  "in_pipeline",
  "won",
  "lost",
];

const STAGE_LABELS: Record<CompanyStage, string> = {
  not_contacted: "Not contacted",
  emailed: "Emailed",
  opened: "Opened",
  replied: "Replied",
  in_pipeline: "In pipeline",
  won: "Won",
  lost: "Lost",
};

export default function LeadsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCompanies(data.companies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const byStage = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = companies.filter((c) => c.stage === stage);
      return acc;
    },
    {} as Record<CompanyStage, Company[]>
  );

  return (
    <DashboardShell title="Pipeline">
      {error ? (
        <p className="mb-4 font-mono text-xs text-danger">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="panel flex w-64 shrink-0 flex-col"
            >
              <div className="border-b border-border px-3 py-3">
                <p className="font-mono text-xs uppercase text-muted">
                  {STAGE_LABELS[stage]}
                </p>
                <p className="mt-1 text-sm font-medium text-text">
                  {byStage[stage].length}
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {byStage[stage].length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted">
                    Empty
                  </p>
                ) : (
                  byStage[stage].map((company) => (
                    <div
                      key={company.id}
                      className="rounded-lg border border-border bg-bg p-3"
                    >
                      <p className="text-sm font-medium text-text">
                        {company.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {company.email}
                      </p>
                      {company.industry ? (
                        <p className="mt-2 text-xs text-muted">
                          {company.industry}
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
