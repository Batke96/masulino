-- Masulino migration 0007
-- Public package codes for the fixed venue catalog, and the IT role as a checklist assignee key.

ALTER TABLE packages
  ADD COLUMN public_code text;

ALTER TABLE packages
  ADD CONSTRAINT packages_public_code_format
  CHECK (public_code IS NULL OR public_code ~ '^[a-z0-9]([a-z0-9-]{0,40})$');

CREATE UNIQUE INDEX packages_public_code_uidx
  ON packages (tenant_id, location_id, public_code)
  WHERE public_code IS NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'checklists'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%assignee_role_key IN%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE checklists DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE checklists
  ADD CONSTRAINT checklists_assignee_role_key_known
  CHECK (
    assignee_role_key IS NULL
    OR assignee_role_key IN (
      'tenant_owner', 'tenant_administrator', 'it', 'location_manager', 'shift_lead', 'reception', 'employee'
    )
  );
