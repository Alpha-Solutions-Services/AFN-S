-- Bounce, unsubscribe, follow-ups, A/B subjects, click counts

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

ALTER TABLE campaign_targets
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_step INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subject_variant TEXT,
  ADD COLUMN IF NOT EXISTS click_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS campaign_targets_follow_up_idx
  ON campaign_targets (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND replied_at IS NULL AND bounced_at IS NULL;

CREATE INDEX IF NOT EXISTS companies_do_not_email_idx
  ON companies (owner_id, do_not_email)
  WHERE do_not_email = true;

-- Expand email_events types
ALTER TABLE email_events DROP CONSTRAINT IF EXISTS email_events_event_type_check;
ALTER TABLE email_events
  ADD CONSTRAINT email_events_event_type_check
  CHECK (event_type IN ('open', 'click', 'reply', 'bounce', 'unsubscribe'));

-- Optional target status for bounced (keeps UI clear)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'target_status' AND e.enumlabel = 'bounced'
  ) THEN
    ALTER TYPE target_status ADD VALUE 'bounced';
  END IF;
END $$;
