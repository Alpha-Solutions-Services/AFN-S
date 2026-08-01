import type { CallOutcome, CompanyStage } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDaysIso(days: number, from = new Date()): string {
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

/** Map dial outcome → company stage / next_call_at updates. */
export function companyUpdateForOutcome(
  outcome: CallOutcome,
  opts?: { nextCallAt?: string | null; notes?: string | null }
): {
  stage: CompanyStage;
  next_call_at: string | null;
} {
  switch (outcome) {
    case "no_answer":
      return { stage: "attempted", next_call_at: addDaysIso(1) };
    case "voicemail":
      return { stage: "attempted", next_call_at: addDaysIso(2) };
    case "callback":
      return {
        stage: "callback",
        next_call_at: opts?.nextCallAt ?? addDaysIso(1),
      };
    case "interested":
      return { stage: "in_pipeline", next_call_at: null };
    case "won":
      return { stage: "won", next_call_at: null };
    case "not_interested":
    case "wrong_number":
    case "do_not_call":
      return { stage: "lost", next_call_at: null };
    default:
      return { stage: "attempted", next_call_at: addDaysIso(1) };
  }
}
