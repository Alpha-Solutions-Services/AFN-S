import type { CompanyStage } from "@/lib/types";

export const IMPORT_BATCH_SIZE = 250;

export interface UpsertCompanyRow {
  owner_id: string;
  name: string;
  email: string;
  industry: string | null;
  contact_name: string | null;
  contact_title: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  extra: Record<string, unknown>;
}

/** @deprecated use UpsertCompanyRow — stage is set by DB default on insert only */
export interface ImportRowPayload extends UpsertCompanyRow {
  stage: CompanyStage;
}

export function dedupePayload(rows: UpsertCompanyRow[]): UpsertCompanyRow[] {
  const byEmail = new Map<string, UpsertCompanyRow>();
  for (const row of rows) {
    byEmail.set(row.email.toLowerCase(), row);
  }
  return Array.from(byEmail.values());
}

export interface ImportBatchResult {
  imported: number;
  skipped: number;
  totalRows?: number;
  batches?: number;
}
