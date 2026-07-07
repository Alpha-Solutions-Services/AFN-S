"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { StageBadge } from "@/components/StageBadge";
import type { Company } from "@/lib/types";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load companies");
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

  async function handleUpload(file: File) {
    setUploading(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/companies/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setMessage(`Imported ${data.imported} companies`);
      await loadCompanies();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <DashboardShell title="Companies">
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {companies.length} companies in your list
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
            {uploading ? "Uploading..." : "Upload Excel"}
          </button>
        </div>
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

      <div className="panel overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted">Loading...</p>
        ) : companies.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            No companies yet. Upload an Excel sheet to get started.
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
    </DashboardShell>
  );
}
