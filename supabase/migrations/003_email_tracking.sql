-- Email open / reply tracking

ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS tracking_token UUID UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;

-- Backfill tokens for existing rows
UPDATE campaign_targets
SET tracking_token = gen_random_uuid()
WHERE tracking_token IS NULL;

CREATE INDEX IF NOT EXISTS campaign_targets_tracking_token_idx
  ON campaign_targets (tracking_token);

CREATE INDEX IF NOT EXISTS campaign_targets_opened_at_idx
  ON campaign_targets (campaign_id, opened_at);

CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_target_id UUID REFERENCES campaign_targets(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open', 'click', 'reply')),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_events_target_idx ON email_events (campaign_target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_events_owner_idx ON email_events (owner_id, created_at DESC);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_events_owner ON email_events
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
