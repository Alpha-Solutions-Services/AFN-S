"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { StageBadge } from "@/components/StageBadge";
import { dedupeByEmail, parseExcelBuffer } from "@/lib/excel-import";
import { readJsonResponse } from "@/lib/fetch-json";
import { IMPORT_BATCH_SIZE } from "@/lib/import-batch";
import type { Company } from "@/lib/types";

const PAGE_SIZE = 100;

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
    phase: "parsing" | "importing";
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCompanies = useCallback(async (pageOffset = offset) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/companies?limit=${PAGE_SIZE}&offset=${pageOffset}`
      );
      const data = await readJsonResponse<{
        companies?: Company[];
        total?: number;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to load companies");
      setCompanies(data.companies ?? []);
      setTotal(data.total ?? 0);
      setOffset(pageOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    void loadCompanies(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setMessage(null);
    setError(null);
    setImportProgress({ done: 0, total: 0, phase: "parsing" });

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcelBuffer(buffer);
      const { rows, duplicates: parseDuplicates } = dedupeByEmail(parsed);

      if (rows.length === 0) {
        throw new Error("No valid rows with email addresses found in file");
      }

      setImportProgress({ done: 0, total: rows.length, phase: "importing" });

      let imported = 0;
      let skipped = parseDuplicates;
      const batches = Math.ceil(rows.length / IMPORT_BATCH_SIZE);

      for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
        const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
        const res = await fetch("/api/companies/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
        });
        const data = await readJsonResponse<{
          imported?: number;
          skipped?: number;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error || "Import failed");

        imported += data.imported ?? batch.length;
        skipped += data.skipped ?? 0;
        setImportProgress({
          done: Math.min(i + batch.length, rows.length),
          total: rows.length,
          phase: "importing",
        });
      }

      setMessage(
        `Imported ${imported.toLocaleString()} companies` +
          (skipped > 0 ? ` (${skipped.toLocaleString()} duplicate emails skipped)` : "") +
          ` across ${batches.toLocaleString()} batches`
      );
      await loadCompanies(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
      setImportProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardShell title="Companies">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {total.toLocaleString()} companies total
          {total > 0 ? ` · showing ${offset + 1}–${offset + companies.length}` : ""}
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Importing..." : "Upload CSV / Excel"}
          </button>
        </div>
      </div>

      {importProgress ? (
        <div className="mb-4 panel p-4">
          <p className="font-mono text-xs text-muted">
            {importProgress.phase === "parsing"
              ? "Parsing file in browser..."
              : `Importing ${importProgress.done.toLocaleString()} / ${importProgress.total.toLocaleString()} rows`}
          </p>
          {importProgress.phase === "importing" && importProgress.total > 0 ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${(importProgress.done / importProgress.total) * 100}%`,
                }}
              />
            </div>
          ) : null}
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

      <div className="panel overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted">Loading...</p>
        ) : companies.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            No companies yet. Upload a CSV or Excel file to get started. Large FMCSA
            exports are parsed locally and imported in batches.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-xs uppercase text-muted">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Stage</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium">{company.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {company.email}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {company.industry || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {company.contact_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={company.stage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            className="btn-secondary"
            disabled={offset === 0 || loading}
            onClick={() => void loadCompanies(Math.max(0, offset - PAGE_SIZE))}
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
            onClick={() => void loadCompanies(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      ) : null}
    </DashboardShell>
  );
}
