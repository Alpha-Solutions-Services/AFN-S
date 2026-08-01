export type CompanyStage =
  | "not_contacted"
  | "attempted"
  | "callback"
  | "emailed"
  | "opened"
  | "replied"
  | "in_pipeline"
  | "won"
  | "lost";

export type CampaignStatus = "draft" | "sending" | "completed" | "paused";

export type TargetStatus = "pending" | "sent" | "failed" | "skipped";

export type CallOutcome =
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "callback"
  | "interested"
  | "wrong_number"
  | "do_not_call"
  | "won";

export interface Company {
  id: string;
  owner_id: string;
  name: string;
  email: string | null;
  industry: string | null;
  contact_name: string | null;
  contact_title: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  extra: Record<string, unknown>;
  stage: CompanyStage;
  last_called_at: string | null;
  next_call_at: string | null;
  call_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  offer_description: string;
  status: CampaignStatus;
  target_filter: "not_contacted" | "all";
  created_at: string;
  updated_at: string;
}

export interface CampaignTarget {
  id: string;
  campaign_id: string;
  company_id: string;
  generated_subject: string | null;
  generated_body: string | null;
  status: TargetStatus;
  error_message: string | null;
  sent_at: string | null;
  tracking_token?: string | null;
  opened_at?: string | null;
  open_count?: number;
  replied_at?: string | null;
  last_event_at?: string | null;
  created_at: string;
  updated_at: string;
  companies?: Pick<
    Company,
    "name" | "email" | "industry" | "contact_name" | "contact_title" | "website" | "notes"
  >;
}

export interface EmailLog {
  id: string;
  owner_id: string;
  campaign_id: string | null;
  campaign_target_id: string | null;
  company_id: string | null;
  recipient_email: string;
  subject: string;
  success: boolean;
  gmail_message_id: string | null;
  error_message: string | null;
  created_at: string;
}

export interface GoogleToken {
  owner_id: string;
  refresh_token: string;
  gmail_address: string;
  updated_at: string;
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface CallLog {
  id: string;
  owner_id: string;
  company_id: string;
  outcome: CallOutcome;
  notes: string | null;
  duration_seconds: number | null;
  called_at: string;
  created_at: string;
  updated_at: string;
}

export const CALL_OUTCOMES: CallOutcome[] = [
  "no_answer",
  "voicemail",
  "callback",
  "interested",
  "not_interested",
  "wrong_number",
  "do_not_call",
  "won",
];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_answer: "No answer",
  voicemail: "Voicemail",
  not_interested: "Not interested",
  callback: "Callback",
  interested: "Interested",
  wrong_number: "Wrong number",
  do_not_call: "Do not call",
  won: "Won",
};
