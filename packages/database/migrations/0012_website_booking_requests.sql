-- Website intake again. 0011 removed the table with the other unused lists.

CREATE TABLE website_booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('geburtstag', 'kita')),
  status text NOT NULL CHECK (status IN ('angefragt', 'bearbeitet', 'angenommen', 'abgelehnt')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  received_at timestamptz NOT NULL DEFAULT now(),
  reservation_id uuid,
  rejection_reason text NOT NULL DEFAULT '' CHECK (char_length(rejection_reason) <= 500),
  decided_at timestamptz,
  decided_by_principal_id uuid,
  CHECK (
    (status = 'angenommen' AND reservation_id IS NOT NULL)
    OR (status <> 'angenommen' AND reservation_id IS NULL)
  ),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id)
);

CREATE INDEX website_booking_requests_open_idx
  ON website_booking_requests (tenant_id, location_id, received_at DESC);

COMMENT ON TABLE website_booking_requests IS 'Website intake. Status angefragt is not a confirmed reservation.';

ALTER TABLE website_booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_booking_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY website_booking_requests_tenant ON website_booking_requests
  FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON website_booking_requests TO masulino_app;

CREATE OR REPLACE FUNCTION app.lookup_intake_location()
RETURNS TABLE (
  tenant_id uuid,
  location_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH active AS (
    SELECT l.tenant_id, l.id AS location_id
    FROM locations l
    JOIN tenants t ON t.id = l.tenant_id
    WHERE l.status = 'active'
      AND t.status = 'active'
  )
  SELECT tenant_id, location_id
  FROM active
  WHERE (SELECT count(*) FROM active) = 1
$$;

REVOKE ALL ON FUNCTION app.lookup_intake_location() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_intake_location() TO masulino_app;
