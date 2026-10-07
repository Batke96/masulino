-- Masulino migration 0003
-- Guest booking, access tokens, local delivery, preparation sheets, holiday notices.

ALTER TABLE reservations
  ALTER COLUMN created_by_principal_id DROP NOT NULL;

CREATE TABLE published_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  public_slug text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('published', 'unpublished')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, location_id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE booking_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('exchange', 'session')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE INDEX booking_access_tokens_reservation_idx
  ON booking_access_tokens (tenant_id, reservation_id);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('confirmation', 'reminder', 'cancellation')),
  status text NOT NULL CHECK (status IN ('queued', 'previewed', 'failed', 'cancelled')),
  reservation_version integer NOT NULL CHECK (reservation_version > 0),
  scheduled_for timestamptz NOT NULL,
  preview_text text,
  last_error text,
  job_idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_idempotency_key),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE INDEX notification_deliveries_reservation_idx
  ON notification_deliveries (tenant_id, reservation_id, kind);

CREATE TABLE preparation_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  local_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  lines jsonb NOT NULL,
  UNIQUE (tenant_id, location_id, local_date),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE holiday_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'preview', 'approved', 'published')),
  created_by_principal_id uuid,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (char_length(title) BETWEEN 1 AND 120),
  CHECK (char_length(body) BETWEEN 1 AND 2000),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE OR REPLACE FUNCTION app.lookup_published_venue(p_slug text)
RETURNS TABLE (
  tenant_id uuid,
  location_id uuid,
  location_name text,
  timezone text,
  tenant_name text,
  public_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.tenant_id, l.id, l.name, l.timezone, t.name, v.public_slug
  FROM published_venues v
  JOIN locations l ON l.tenant_id = v.tenant_id AND l.id = v.location_id
  JOIN tenants t ON t.id = v.tenant_id
  WHERE v.public_slug = p_slug
    AND v.status = 'published'
    AND l.status = 'active'
    AND t.status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.lookup_booking_token(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  location_id uuid,
  reservation_id uuid,
  purpose text,
  expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, location_id, reservation_id, purpose, expires_at, consumed_at, revoked_at
  FROM booking_access_tokens
  WHERE token_hash = p_token_hash
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.lookup_published_venue(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lookup_booking_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_published_venue(text) TO masulino_app;
GRANT EXECUTE ON FUNCTION app.lookup_booking_token(text) TO masulino_app;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'published_venues',
    'booking_access_tokens',
    'notification_deliveries',
    'preparation_sheets',
    'holiday_notices'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (app.context() = ''tenant'' AND tenant_id = app.current_tenant_id()) WITH CHECK (app.context() = ''tenant'' AND tenant_id = app.current_tenant_id())',
      table_name || '_tenant',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  published_venues,
  booking_access_tokens,
  notification_deliveries,
  preparation_sheets,
  holiday_notices
  TO masulino_app;
