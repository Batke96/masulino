-- Masulino migration 0001
-- Identity schema (Better Auth) and platform tables.
-- Reviewed SQL: roles, grants, and row-level security are intentional.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS app;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA identity FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;

GRANT USAGE ON SCHEMA identity TO masulino_auth;
GRANT USAGE ON SCHEMA public TO masulino_app, masulino_worker;
GRANT USAGE ON SCHEMA app TO masulino_app;

CREATE OR REPLACE FUNCTION app.context() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.context', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw text;
BEGIN
  raw := nullif(current_setting('app.tenant_id', true), '');
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_principal_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw text;
BEGIN
  raw := nullif(current_setting('app.principal_id', true), '');
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.current_subject() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.subject', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_issuer() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.issuer', true), '')
$$;

CREATE OR REPLACE FUNCTION app.worker_purpose() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.worker_purpose', true), '')
$$;

REVOKE ALL ON FUNCTION app.context() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_principal_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_subject() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_issuer() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.worker_purpose() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.context() TO masulino_app, masulino_worker;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO masulino_app, masulino_worker;
GRANT EXECUTE ON FUNCTION app.current_principal_id() TO masulino_app;
GRANT EXECUTE ON FUNCTION app.current_subject() TO masulino_app;
GRANT EXECUTE ON FUNCTION app.current_issuer() TO masulino_app;
GRANT EXECUTE ON FUNCTION app.worker_purpose() TO masulino_worker;

CREATE TABLE identity."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  two_factor_enabled boolean DEFAULT false
);

CREATE TABLE identity.session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
  active_organization_id text
);

CREATE TABLE identity.account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);

CREATE TABLE identity.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.two_factor (
  id text PRIMARY KEY,
  secret text NOT NULL,
  backup_codes text NOT NULL,
  user_id text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
  verified boolean DEFAULT true,
  failed_verification_count integer DEFAULT 0,
  locked_until timestamptz
);

CREATE TABLE identity.organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata text
);

CREATE TABLE identity.member (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE identity.invitation (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES identity.organization(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  inviter_id text NOT NULL REFERENCES identity."user"(id) ON DELETE CASCADE
);

CREATE INDEX session_user_id_idx ON identity.session (user_id);
CREATE INDEX account_user_id_idx ON identity.account (user_id);
CREATE INDEX two_factor_user_id_idx ON identity.two_factor (user_id);
CREATE INDEX verification_identifier_idx ON identity.verification (identifier);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO masulino_auth;

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'identity' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE identity.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE identity.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY identity_auth_only ON identity.%I USING (current_user = %L) WITH CHECK (current_user = %L)',
      table_name,
      'masulino_auth',
      'masulino_auth'
    );
  END LOOP;
END $$;

COMMENT ON SCHEMA identity IS 'Global identity tables for Better Auth. Not tenant business data.';

CREATE TABLE principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);

COMMENT ON TABLE principals IS 'Global identity map. Email is an attribute, not the authorization identifier.';

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  slug text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug),
  UNIQUE (tenant_id, id)
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  principal_id uuid NOT NULL REFERENCES principals(id),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, principal_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role_key text NOT NULL,
  location_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE UNIQUE INDEX grants_tenant_wide_uidx
  ON grants (membership_id, role_key)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX grants_location_uidx
  ON grants (membership_id, role_key, location_id)
  WHERE location_id IS NOT NULL;

CREATE TABLE module_entitlements (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  module_id text NOT NULL,
  enabled boolean NOT NULL,
  PRIMARY KEY (tenant_id, module_id)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid,
  actor_principal_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  outcome text NOT NULL,
  correlation_id uuid NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  actor_principal_id uuid,
  action text NOT NULL,
  outcome text NOT NULL,
  correlation_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE security_events IS 'Append-only security log. Nullable tenant for unauthenticated failures.';

CREATE TABLE staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL,
  role_key text NOT NULL,
  location_id uuid,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE outbox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'claimed', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION app.prevent_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table';
END;
$$;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_mutation();

CREATE TRIGGER security_events_append_only
  BEFORE UPDATE OR DELETE ON security_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_mutation();

CREATE OR REPLACE FUNCTION app.lookup_invitation(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  role_key text,
  location_id uuid,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, email, role_key, location_id, expires_at
  FROM staff_invitations
  WHERE token_hash = p_token_hash
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.lookup_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_invitation(text) TO masulino_app;

ALTER TABLE principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE principals FORCE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants FORCE ROW LEVEL SECURITY;
ALTER TABLE module_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY principals_select ON principals FOR SELECT
  USING (
    (
      app.context() = 'identity'
      AND subject = app.current_subject()
      AND issuer = app.current_issuer()
    )
    OR (
      app.context() = 'tenant'
      AND id IN (
        SELECT principal_id FROM memberships WHERE tenant_id = app.current_tenant_id()
      )
    )
  );

CREATE POLICY principals_insert ON principals FOR INSERT
  WITH CHECK (
    app.context() = 'identity'
    AND subject = app.current_subject()
    AND issuer = app.current_issuer()
  );

CREATE POLICY principals_update ON principals FOR UPDATE
  USING (
    app.context() = 'identity'
    AND subject = app.current_subject()
    AND issuer = app.current_issuer()
  )
  WITH CHECK (
    app.context() = 'identity'
    AND subject = app.current_subject()
    AND issuer = app.current_issuer()
  );

CREATE POLICY tenants_select ON tenants FOR SELECT
  USING (
    (app.context() = 'tenant' AND id = app.current_tenant_id())
    OR (
      app.context() = 'identity'
      AND id IN (
        SELECT tenant_id FROM memberships
        WHERE principal_id = app.current_principal_id()
      )
    )
  );

CREATE POLICY tenants_write ON tenants FOR ALL
  USING (app.context() = 'tenant' AND id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND id = app.current_tenant_id());

CREATE POLICY locations_tenant ON locations FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY memberships_select ON memberships FOR SELECT
  USING (
    (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
    OR (
      app.context() = 'identity'
      AND principal_id = app.current_principal_id()
    )
  );

CREATE POLICY memberships_write ON memberships FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY grants_tenant ON grants FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY entitlements_tenant ON module_entitlements FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY invitations_tenant ON staff_invitations FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY audit_select ON audit_events FOR SELECT
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY audit_insert ON audit_events FOR INSERT
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY security_insert ON security_events FOR INSERT
  WITH CHECK (app.context() IN ('tenant', 'identity'));

CREATE POLICY outbox_tenant ON outbox_jobs FOR ALL
  USING (
    current_user = 'masulino_app'
    AND app.context() = 'tenant'
    AND tenant_id = app.current_tenant_id()
  )
  WITH CHECK (
    current_user = 'masulino_app'
    AND app.context() = 'tenant'
    AND tenant_id = app.current_tenant_id()
  );

CREATE POLICY outbox_worker_select ON outbox_jobs FOR SELECT
  USING (current_user = 'masulino_worker');

CREATE POLICY outbox_worker_update ON outbox_jobs FOR UPDATE
  USING (current_user = 'masulino_worker')
  WITH CHECK (current_user = 'masulino_worker');

GRANT SELECT, INSERT, UPDATE, DELETE ON
  principals, tenants, locations, memberships, grants, module_entitlements, staff_invitations
  TO masulino_app;

GRANT SELECT, INSERT ON audit_events TO masulino_app;
GRANT INSERT ON security_events TO masulino_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox_jobs TO masulino_app;
GRANT SELECT, UPDATE ON outbox_jobs TO masulino_worker;
