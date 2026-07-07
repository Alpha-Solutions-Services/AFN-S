import type { CompanyStage } from "@/lib/types";

export const IMPORT_BATCH_SIZE = 250;

export interface ImportRowPayload {
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
  stage: CompanyStage;
}

export interface ImportBatchResult {
  imported: number;
  skipped: number;
  totalRows?: number;
  batches?: number;
}
