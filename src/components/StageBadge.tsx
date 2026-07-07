import type { CompanyStage } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGE_STYLES: Record<CompanyStage, string> = {
  not_contacted: "text-muted border-border",
  emailed: "text-accent border-accent/40",
  opened: "text-warning border-warning/40",
  replied: "text-success border-success/40",
  in_pipeline: "text-accent border-accent/40",
  won: "text-success border-success/40",
  lost: "text-danger border-danger/40",
};

export function StageBadge({ stage }: { stage: CompanyStage }) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-2 py-0.5 font-mono text-xs uppercase",
        STAGE_STYLES[stage]
      )}
    >
      {stage.replace(/_/g, " ")}
    </span>
  );
}
