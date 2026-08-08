-- Employee/role management, attendance, office-IP gating, team-aware visibility
-- Additive. Apply after review. Does not drop business data.

-- ---------- Roles & profiles ----------
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('manager', 'team_lead', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'agent',
  team TEXT,
  agent_number INT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles (role);
CREATE INDEX IF NOT EXISTS profiles_team_idx ON profiles (team);

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Classify an email into (role, team, agent_number)
CREATE OR REPLACE FUNCTION classify_profile(p_email TEXT)
RETURNS TABLE(role app_role, team TEXT, agent_number INT)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  e TEXT := lower(trim(p_email));
  local TEXT;
  base TEXT;
  plus TEXT;
  t TEXT;
  forces TEXT[] := ARRAY['patriot','liberty','ranger','eagle','hawk','titan','frontier','sentinel','valor','vanguard'];
BEGIN
  IF e IN ('sales.afn.alpha@gmail.com', 'mikran.dispatch@gmail.com') THEN
    RETURN QUERY SELECT 'manager'::app_role, NULL::TEXT, NULL::INT; RETURN;
  END IF;

  local := split_part(e, '@', 1);
  base := split_part(local, '+', 1);
  plus := split_part(local, '+', 2);
  t := CASE WHEN base LIKE 'sales.afn.%' THEN split_part(base, '.', 3) ELSE NULL END;

  IF t IS NOT NULL AND t = ANY(forces) THEN
    IF plus <> '' AND plus ~ '^[0-9]+$' THEN
      RETURN QUERY SELECT 'agent'::app_role, t, plus::INT; RETURN;
    ELSE
      RETURN QUERY SELECT 'team_lead'::app_role, t, NULL::INT; RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT 'agent'::app_role, NULL::TEXT, NULL::INT;
END $$;

-- Auto-provision a profile when an auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM classify_profile(NEW.email);
  INSERT INTO profiles (id, email, role, team, agent_number)
  VALUES (NEW.id, lower(NEW.email), c.role, c.team, c.agent_number)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill existing users
INSERT INTO profiles (id, email, role, team, agent_number)
SELECT u.id, lower(u.email), c.role, c.team, c.agent_number
FROM auth.users u
CROSS JOIN LATERAL classify_profile(u.email) c
ON CONFLICT (id) DO NOTHING;

-- profiles locked to service role + SECURITY DEFINER helpers only
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ---------- Role helpers (bypass RLS) ----------
CREATE OR REPLACE FUNCTION app_role(uid UUID)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = uid AND active = true;
$$;

CREATE OR REPLACE FUNCTION app_team(uid UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT team FROM profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION app_is_manager(uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role = 'manager' AND active = true);
$$;

-- True when `viewer` may see rows owned by `owner` (self, manager, or same-team lead)
CREATE OR REPLACE FUNCTION app_can_view(viewer UUID, owner UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    viewer = owner
    OR app_is_manager(viewer)
    OR (
      app_role(viewer) = 'team_lead'
      AND app_team(viewer) IS NOT NULL
      AND app_team(viewer) = app_team(owner)
    );
$$;

-- ---------- Attendance, office IPs, blocked logins ----------
CREATE TABLE IF NOT EXISTS allowed_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  label TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ip)
);
ALTER TABLE allowed_ips ENABLE ROW LEVEL SECURITY; -- service role only

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_user_idx ON attendance_sessions (user_id, login_at DESC);
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY; -- service role only

CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  ip TEXT,
  user_agent TEXT,
  allowed BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (created_at DESC);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY; -- service role only

-- Attribute activity to a team on call logs for reporting
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS team TEXT;

-- ---------- Team-aware RLS on business tables ----------
DROP POLICY IF EXISTS companies_owner ON companies;
CREATE POLICY companies_rw ON companies
  FOR ALL
  USING (app_can_view(auth.uid(), owner_id))
  WITH CHECK (auth.uid() = owner_id OR app_is_manager(auth.uid()));

DROP POLICY IF EXISTS campaigns_owner ON campaigns;
CREATE POLICY campaigns_rw ON campaigns
  FOR ALL
  USING (app_can_view(auth.uid(), owner_id))
  WITH CHECK (auth.uid() = owner_id OR app_is_manager(auth.uid()));

DROP POLICY IF EXISTS campaign_targets_owner ON campaign_targets;
CREATE POLICY campaign_targets_rw ON campaign_targets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_targets.campaign_id
        AND app_can_view(auth.uid(), c.owner_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_targets.campaign_id
        AND (auth.uid() = c.owner_id OR app_is_manager(auth.uid()))
    )
  );

DROP POLICY IF EXISTS email_logs_owner ON email_logs;
CREATE POLICY email_logs_rw ON email_logs
  FOR ALL
  USING (app_can_view(auth.uid(), owner_id))
  WITH CHECK (auth.uid() = owner_id OR app_is_manager(auth.uid()));

DROP POLICY IF EXISTS call_logs_owner ON call_logs;
CREATE POLICY call_logs_rw ON call_logs
  FOR ALL
  USING (app_can_view(auth.uid(), owner_id))
  WITH CHECK (auth.uid() = owner_id OR app_is_manager(auth.uid()));
