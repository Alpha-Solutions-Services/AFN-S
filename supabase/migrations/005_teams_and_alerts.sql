-- Teams (10 Forces), per-mailbox send logging, in-app notifications

-- Which AFN team/force + mailbox a campaign sends from (null = round-robin)
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS team TEXT;

-- Track which mailbox actually sent (for per-mailbox daily caps + reporting)
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS mailbox TEXT;

ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS sent_mailbox TEXT,
  ADD COLUMN IF NOT EXISTS open_alerted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS email_logs_mailbox_day_idx
  ON email_logs (mailbox, created_at)
  WHERE success = true;

-- In-app notifications (open alerts, replies, bounces)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_target_id UUID REFERENCES campaign_targets(id) ON DELETE CASCADE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_owner_idx
  ON notifications (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (owner_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_owner ON notifications;
CREATE POLICY notifications_owner ON notifications
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
