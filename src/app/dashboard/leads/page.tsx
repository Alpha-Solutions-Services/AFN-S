"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { readJsonResponse } from "@/lib/fetch-json";
import { COMPANY_STAGES, STAGE_LABELS } from "@/lib/stages";
import type { Company, CompanyStage } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function LeadsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<CompanyStage | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load in pages so pipeline is not capped at the default 100
      const all: Company[] = [];
      let offset = 0;
      const limit = 500;
      let total = Infinity;

      while (offset < total) {
        const res = await fetch(`/api/companies?limit=${limit}&offset=${offset}`);
        const data = await readJsonResponse<{
          companies?: Company[];
          total?: number;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error || "Failed to load");
        all.push(...(data.companies ?? []));
        total = data.total ?? all.length;
        offset += limit;
        if ((data.companies ?? []).length === 0) break;
      }

      setCompanies(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  async function moveCompany(companyId: string, stage: CompanyStage) {
    const prev = companies;
    setCompanies((list) =>
      list.map((c) => (c.id === companyId ? { ...c, stage } : c))
    );
    setSavingId(companyId);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await readJsonResponse<{ company?: Company; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to update stage");
      if (data.company) {
        setCompanies((list) =>
          list.map((c) => (c.id === companyId ? data.company! : c))
        );
      }
    } catch (err) {
      setCompanies(prev);
      setError(err instanceof Error ? err.message : "Failed to update stage");
    } finally {
      setSavingId(null);
    }
  }

  const byStage = COMPANY_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = companies.filter((c) => c.stage === stage);
      return acc;
    },
    {} as Record<CompanyStage, Company[]>
  );

  return (
    <DashboardShell title="Pipeline">
      <p className="mb-4 text-sm text-muted">
        Drag cards between columns to update stage.{" "}
        {companies.length > 0 ? `${companies.length.toLocaleString()} companies loaded.` : null}
      </p>

      {error ? (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COMPANY_STAGES.map((stage) => (
            <div
              key={stage}
              className={cn(
                "panel flex w-64 shrink-0 flex-col transition-colors",
                dropStage === stage && "border-accent"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDropStage(stage);
              }}
              onDragLeave={() => setDropStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/company-id") || draggingId;
                setDropStage(null);
                setDraggingId(null);
                if (id) void moveCompany(id, stage);
              }}
            >
              <div className="border-b border-border px-3 py-3">
                <p className="font-mono text-xs uppercase text-muted">
                  {STAGE_LABELS[stage]}
                </p>
                <p className="mt-1 text-sm font-medium text-text">
                  {byStage[stage].length}
                </p>
              </div>
              <div className="flex max-h-[70vh] flex-1 flex-col gap-2 overflow-y-auto p-2">
                {byStage[stage].length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted">
                    Drop here
                  </p>
                ) : (
                  byStage[stage].map((company) => (
                    <div
                      key={company.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(company.id);
                        e.dataTransfer.setData("text/company-id", company.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDropStage(null);
                      }}
                      className={cn(
                        "cursor-grab rounded-lg border border-border bg-bg p-3 active:cursor-grabbing",
                        draggingId === company.id && "opacity-50",
                        savingId === company.id && "opacity-60"
                      )}
                    >
                      <p className="text-sm font-medium text-text">{company.name}</p>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {company.email}
                      </p>
                      {company.industry ? (
                        <p className="mt-2 text-xs text-muted">{company.industry}</p>
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
