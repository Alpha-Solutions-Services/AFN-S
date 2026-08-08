-- Make the auth.users -> profiles trigger resilient so it can NEVER block
-- user creation. If profile auto-provisioning fails for any reason, the
-- auth.users insert still succeeds; the app upserts the profile afterwards.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE c RECORD;
BEGIN
  BEGIN
    SELECT * INTO c FROM classify_profile(NEW.email);
    INSERT INTO profiles (id, email, role, team, agent_number)
    VALUES (NEW.id, lower(NEW.email), c.role, c.team, c.agent_number)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never abort the auth.users insert because of profile provisioning.
    NULL;
  END;
  RETURN NEW;
END $$;
