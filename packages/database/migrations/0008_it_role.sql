-- Masulino migration 0008
-- IT is a checklist assignee. Package public codes are added in 0007.

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
