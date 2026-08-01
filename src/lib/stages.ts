import type { CompanyStage } from "@/lib/types";

export const COMPANY_STAGES: CompanyStage[] = [
  "not_contacted",
  "attempted",
  "callback",
  "emailed",
  "opened",
  "replied",
  "in_pipeline",
  "won",
  "lost",
];

export const STAGE_LABELS: Record<CompanyStage, string> = {
  not_contacted: "Not contacted",
  attempted: "Attempted",
  callback: "Callback",
  emailed: "Emailed",
  opened: "Opened",
  replied: "Replied",
  in_pipeline: "In pipeline",
  won: "Won",
  lost: "Lost",
};

export function isCompanyStage(value: string): value is CompanyStage {
  return COMPANY_STAGES.includes(value as CompanyStage);
}
