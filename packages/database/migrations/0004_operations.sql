-- Masulino migration 0004
-- Workforce availability, schedules, time capture, and operations checklists.
-- publication_weekday 0 is Sunday. Fixture coverage and break numbers are not working-time law.

CREATE TABLE workforce_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  publication_weekday smallint NOT NULL DEFAULT 0 CHECK (publication_weekday BETWEEN 0 AND 6),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE workforce_settings IS 'Tenant-owned. Weekday the weekly plan is meant to be ready. 0 = Sunday. Not a cron.';

CREATE TABLE availability_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (location_id, principal_id, version),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
  FOREIGN KEY (tenant_id, revision_id) REFERENCES availability_revisions (tenant_id, id)
);

CREATE TABLE leave_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('requested', 'recorded')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  previous_id uuid,
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, previous_id) REFERENCES leave_entries (tenant_id, id)
);

CREATE TABLE schedule_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  week_starts_on date NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  publication_weekday smallint NOT NULL CHECK (publication_weekday BETWEEN 0 AND 6),
  warnings jsonb NOT NULL,
  created_by_principal_id uuid NOT NULL,
  published_by_principal_id uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (location_id, week_starts_on, version),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE schedule_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  location_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  local_date date NOT NULL,
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, plan_id) REFERENCES schedule_plans (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  punched_at timestamptz NOT NULL,
  local_date date NOT NULL,
  recorded_by_principal_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('phone', 'kiosk')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE time_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  punch_id uuid NOT NULL,
  requested_by_principal_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  proposed_punched_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status text NOT NULL CHECK (status IN ('requested', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, punch_id) REFERENCES time_punches (tenant_id, id)
);

CREATE TABLE time_effective_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  punch_id uuid NOT NULL,
  correction_request_id uuid,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  effective_at timestamptz NOT NULL,
  local_date date NOT NULL,
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, punch_id) REFERENCES time_punches (tenant_id, id),
  FOREIGN KEY (tenant_id, correction_request_id) REFERENCES time_correction_requests (tenant_id, id)
);

CREATE TABLE kiosk_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE punch_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  principal_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('closing', 'cleaning', 'maintenance')),
  local_date date NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  assignee_principal_id uuid,
  assignee_role_key text,
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (num_nonnulls(assignee_principal_id, assignee_role_key) = 1),
  CHECK (
    assignee_role_key IS NULL
    OR assignee_role_key IN (
      'tenant_owner', 'tenant_administrator', 'location_manager', 'shift_lead', 'reception', 'employee'
    )
  ),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE checklist_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  checklist_id uuid NOT NULL UNIQUE,
  actor_principal_id uuid NOT NULL,
  completed_at timestamptz NOT NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 500),
  FOREIGN KEY (tenant_id, checklist_id) REFERENCES checklists (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

CREATE TABLE checklist_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  checklist_id uuid,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  status text NOT NULL CHECK (status IN ('open', 'resolved')),
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by_principal_id uuid,
  resolved_at timestamptz,
  CHECK (
    (status = 'open' AND resolved_at IS NULL AND resolved_by_principal_id IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by_principal_id IS NOT NULL)
  ),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, checklist_id) REFERENCES checklists (tenant_id, id)
);

CREATE OR REPLACE FUNCTION app.reject_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'row_immutable';
END;
$$;

CREATE TRIGGER time_punches_immutable
  BEFORE UPDATE OR DELETE ON time_punches
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER time_effective_entries_immutable
  BEFORE UPDATE OR DELETE ON time_effective_entries
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER checklist_completions_immutable
  BEFORE UPDATE OR DELETE ON checklist_completions
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE OR REPLACE FUNCTION app.approve_correction_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'correction_immutable';
  END IF;
  IF OLD.status <> 'requested' OR NEW.status <> 'approved' THEN
    RAISE EXCEPTION 'correction_immutable';
  END IF;
  IF NEW.punch_id IS DISTINCT FROM OLD.punch_id
     OR NEW.requested_by_principal_id IS DISTINCT FROM OLD.requested_by_principal_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.proposed_punched_at IS DISTINCT FROM OLD.proposed_punched_at
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.location_id IS DISTINCT FROM OLD.location_id THEN
    RAISE EXCEPTION 'correction_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER time_correction_requests_approve_only
  BEFORE UPDATE OR DELETE ON time_correction_requests
  FOR EACH ROW EXECUTE FUNCTION app.approve_correction_only();

CREATE OR REPLACE FUNCTION app.resolve_issue_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'issue_immutable';
  END IF;
  IF OLD.status <> 'open' OR NEW.status <> 'resolved' THEN
    RAISE EXCEPTION 'issue_immutable';
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.checklist_id IS DISTINCT FROM OLD.checklist_id
     OR NEW.created_by_principal_id IS DISTINCT FROM OLD.created_by_principal_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.resolved_at IS NULL
     OR NEW.resolved_by_principal_id IS NULL THEN
    RAISE EXCEPTION 'issue_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checklist_issues_resolve_only
  BEFORE UPDATE OR DELETE ON checklist_issues
  FOR EACH ROW EXECUTE FUNCTION app.resolve_issue_only();

CREATE OR REPLACE FUNCTION app.lookup_kiosk_device(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  location_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, location_id, expires_at, revoked_at
  FROM kiosk_devices
  WHERE token_hash = p_token_hash
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.lookup_punch_capability(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  location_id uuid,
  principal_id uuid,
  kind text,
  expires_at timestamptz,
  consumed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, tenant_id, location_id, principal_id, kind, expires_at, consumed_at
  FROM punch_capabilities
  WHERE token_hash = p_token_hash
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.publish_plan_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'plan_immutable';
  END IF;
  IF OLD.status <> 'draft' OR NEW.status <> 'published' THEN
    RAISE EXCEPTION 'plan_immutable';
  END IF;
  IF NEW.week_starts_on IS DISTINCT FROM OLD.week_starts_on
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.warnings IS DISTINCT FROM OLD.warnings
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.publication_weekday IS DISTINCT FROM OLD.publication_weekday
     OR NEW.created_by_principal_id IS DISTINCT FROM OLD.created_by_principal_id
     OR NEW.published_at IS NULL
     OR NEW.published_by_principal_id IS NULL THEN
    RAISE EXCEPTION 'plan_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_plans_publish_only
  BEFORE UPDATE OR DELETE ON schedule_plans
  FOR EACH ROW EXECUTE FUNCTION app.publish_plan_only();

REVOKE ALL ON FUNCTION app.reject_row_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.approve_correction_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_issue_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.publish_plan_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lookup_kiosk_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lookup_punch_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reject_row_change() TO masulino_app;
GRANT EXECUTE ON FUNCTION app.approve_correction_only() TO masulino_app;
GRANT EXECUTE ON FUNCTION app.resolve_issue_only() TO masulino_app;
GRANT EXECUTE ON FUNCTION app.publish_plan_only() TO masulino_app;
GRANT EXECUTE ON FUNCTION app.lookup_kiosk_device(text) TO masulino_app;
GRANT EXECUTE ON FUNCTION app.lookup_punch_capability(text) TO masulino_app;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workforce_settings',
    'availability_revisions',
    'availability_windows',
    'leave_entries',
    'schedule_plans',
    'schedule_shifts',
    'time_punches',
    'time_correction_requests',
    'time_effective_entries',
    'kiosk_devices',
    'punch_capabilities',
    'checklists',
    'checklist_completions',
    'checklist_issues'
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

GRANT SELECT, INSERT, UPDATE ON workforce_settings TO masulino_app;
GRANT SELECT, INSERT ON
  availability_revisions,
  availability_windows,
  leave_entries,
  schedule_plans,
  schedule_shifts,
  time_punches,
  time_effective_entries,
  kiosk_devices,
  punch_capabilities,
  checklists,
  checklist_completions
  TO masulino_app;
GRANT SELECT, INSERT, UPDATE ON time_correction_requests, checklist_issues, schedule_plans TO masulino_app;
GRANT UPDATE (revoked_at) ON kiosk_devices TO masulino_app;
GRANT UPDATE (consumed_at) ON punch_capabilities TO masulino_app;
