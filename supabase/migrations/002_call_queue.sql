-- Call queue: call_logs, company dial fields, pipeline stages for dialing

-- Extend company_stage (email stages kept)
ALTER TYPE company_stage ADD VALUE IF NOT EXISTS 'attempted';
ALTER TYPE company_stage ADD VALUE IF NOT EXISTS 'callback';

CREATE TYPE call_outcome AS ENUM (
  'no_answer',
  'voicemail',
  'not_interested',
  'callback',
  'interested',
  'wrong_number',
  'do_not_call',
  'won'
);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_attempts INT NOT NULL DEFAULT 0;

-- Phone-only FMCSA imports: email may be null (synthetic preferred in app)
ALTER TABLE companies ALTER COLUMN email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS companies_next_call_at_idx
  ON companies (owner_id, next_call_at);

CREATE INDEX IF NOT EXISTS companies_call_queue_idx
  ON companies (owner_id, stage)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  outcome call_outcome NOT NULL,
  notes TEXT,
  duration_seconds INT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX call_logs_owner_id_idx ON call_logs (owner_id);
CREATE INDEX call_logs_company_id_idx ON call_logs (company_id);
CREATE INDEX call_logs_called_at_idx ON call_logs (owner_id, called_at DESC);

CREATE TRIGGER call_logs_updated_at
  BEFORE UPDATE ON call_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY call_logs_owner ON call_logs
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
