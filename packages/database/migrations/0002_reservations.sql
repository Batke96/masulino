-- Masulino migration 0002
-- Reservations, indoor-play resources, and allocation constraints.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'table',
  capacity_children integer NOT NULL CHECK (capacity_children >= 0),
  capacity_adults integer NOT NULL DEFAULT 0 CHECK (capacity_adults >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE combinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  name text NOT NULL,
  min_children integer NOT NULL CHECK (min_children >= 0),
  max_children integer NOT NULL CHECK (max_children >= min_children),
  min_adults integer NOT NULL DEFAULT 0 CHECK (min_adults >= 0),
  max_adults integer NOT NULL CHECK (max_adults >= min_adults),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE combination_resources (
  tenant_id uuid NOT NULL,
  combination_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  PRIMARY KEY (combination_id, resource_id),
  FOREIGN KEY (tenant_id, combination_id) REFERENCES combinations (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES resources (tenant_id, id)
);

CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL,
  min_children integer NOT NULL CHECK (min_children >= 0),
  max_children integer NOT NULL CHECK (max_children >= min_children),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE venue_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  timezone text NOT NULL,
  buffer_before_minutes integer NOT NULL CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes integer NOT NULL CHECK (buffer_after_minutes >= 0),
  slot_minutes integer NOT NULL CHECK (slot_minutes > 0),
  horizon_days integer NOT NULL CHECK (horizon_days > 0),
  opening_hours jsonb NOT NULL,
  adult_seating text NOT NULL CHECK (adult_seating IN ('not_required', 'required', 'unconfigured')),
  cancellation_policy text,
  business_decisions_confirmed boolean NOT NULL DEFAULT false,
  fixture boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, version),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE UNIQUE INDEX venue_rules_one_published_idx
  ON venue_rules (location_id)
  WHERE status = 'published';

CREATE TABLE closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text NOT NULL,
  CHECK (ends_on >= starts_on),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reference text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('draft', 'requested', 'confirmed', 'completed', 'cancelled', 'no_show')
  ),
  organizer_name text NOT NULL,
  organizer_email text NOT NULL,
  organizer_phone text NOT NULL,
  honoree_first_name text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  local_date date NOT NULL,
  children_count integer NOT NULL CHECK (children_count >= 0),
  adult_count integer NOT NULL CHECK (adult_count >= 0),
  package_id uuid NOT NULL,
  package_name_snapshot text NOT NULL,
  price_minor_snapshot integer NOT NULL CHECK (price_minor_snapshot >= 0),
  currency_snapshot char(3) NOT NULL,
  rule_id uuid NOT NULL,
  rule_version_snapshot integer NOT NULL,
  combination_id uuid,
  source_channel text NOT NULL,
  notes text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (tenant_id, reference),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, package_id) REFERENCES packages (tenant_id, id),
  FOREIGN KEY (tenant_id, combination_id) REFERENCES combinations (tenant_id, id)
);

CREATE INDEX reservations_daily_idx
  ON reservations (tenant_id, location_id, local_date, starts_at);

CREATE TABLE allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  occupancy tstzrange NOT NULL,
  CHECK (lower_inc(occupancy) AND NOT upper_inc(occupancy)),
  CHECK (lower(occupancy) < upper(occupancy)),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id),
  FOREIGN KEY (tenant_id, resource_id) REFERENCES resources (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CONSTRAINT allocations_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    location_id WITH =,
    resource_id WITH =,
    occupancy WITH &&
  )
);

CREATE TABLE reservation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'done')),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_key text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  reservation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, actor_key, idempotency_key)
);

CREATE TABLE notification_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id uuid NOT NULL UNIQUE,
  reservation_id uuid NOT NULL,
  kind text NOT NULL,
  preview_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_buckets (
  tenant_id uuid NOT NULL,
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL CHECK (count >= 0),
  PRIMARY KEY (tenant_id, bucket_key, window_start)
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'resources',
    'combinations',
    'combination_resources',
    'packages',
    'venue_rules',
    'closures',
    'reservations',
    'allocations',
    'reservation_tasks',
    'idempotency_keys',
    'notification_previews',
    'rate_buckets'
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
  resources,
  combinations,
  combination_resources,
  packages,
  venue_rules,
  closures,
  reservations,
  allocations,
  reservation_tasks,
  idempotency_keys,
  notification_previews,
  rate_buckets
  TO masulino_app;
