-- Alpha Sales CRM — full schema migration
-- Run in Supabase SQL Editor or via supabase db push

-- Enums
CREATE TYPE company_stage AS ENUM (
  'not_contacted',
  'emailed',
  'opened',
  'replied',
  'in_pipeline',
  'won',
  'lost'
);

CREATE TYPE campaign_status AS ENUM (
  'draft',
  'sending',
  'completed',
  'paused'
);

CREATE TYPE target_status AS ENUM (
  'pending',
  'sent',
  'failed',
  'skipped'
);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  industry TEXT,
  contact_name TEXT,
  contact_title TEXT,
  website TEXT,
  phone TEXT,
  notes TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage company_stage NOT NULL DEFAULT 'not_contacted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, email)
);

CREATE INDEX companies_owner_id_idx ON companies (owner_id);
CREATE INDEX companies_stage_idx ON companies (owner_id, stage);

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  offer_description TEXT NOT NULL DEFAULT '',
  status campaign_status NOT NULL DEFAULT 'draft',
  target_filter TEXT NOT NULL DEFAULT 'not_contacted' CHECK (target_filter IN ('not_contacted', 'all')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX campaigns_owner_id_idx ON campaigns (owner_id);

-- Campaign targets
CREATE TABLE campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  generated_subject TEXT,
  generated_body TEXT,
  status target_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, company_id)
);

CREATE INDEX campaign_targets_campaign_id_idx ON campaign_targets (campaign_id);

-- Email logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_target_id UUID REFERENCES campaign_targets(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  success BOOLEAN NOT NULL DEFAULT false,
  gmail_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_logs_owner_id_idx ON email_logs (owner_id);

-- Google tokens — NO RLS policies (service role only)
CREATE TABLE google_tokens (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  gmail_address TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — only service role can access

-- Updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER campaign_targets_updated_at
  BEFORE UPDATE ON campaign_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_owner ON companies
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY campaigns_owner ON campaigns
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY campaign_targets_owner ON campaign_targets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_targets.campaign_id
        AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_targets.campaign_id
        AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY email_logs_owner ON email_logs
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
