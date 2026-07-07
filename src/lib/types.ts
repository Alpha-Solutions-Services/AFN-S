export type CompanyStage =
  | "not_contacted"
  | "emailed"
  | "opened"
  | "replied"
  | "in_pipeline"
  | "won"
  | "lost";

export type CampaignStatus = "draft" | "sending" | "completed" | "paused";

export type TargetStatus = "pending" | "sent" | "failed" | "skipped";

export interface Company {
  id: string;
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
