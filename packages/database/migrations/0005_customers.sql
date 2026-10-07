-- Masulino migration 0005
-- Contacts and consent, campaign previews, loyalty ledger, booked-value facts, booking claims.
-- Collected payments, reportable sales, and refunds are separate from reservation price snapshots.
-- No Ready2Order rows, no card data, and no payment holds.

CREATE TABLE financial_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('collected_payment', 'reportable_sale', 'refund')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  local_date date NOT NULL,
  source text NOT NULL CHECK (
    char_length(source) BETWEEN 1 AND 80
    AND source NOT IN ('booked_value', 'reservation_snapshot')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

COMMENT ON TABLE financial_facts IS 'Tenant-owned payments, reportable sales, and refunds. Booked value is not stored in this table.';

CREATE TABLE adult_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

COMMENT ON TABLE adult_contacts IS 'Tenant-owned adults. Email is not unique. A shared address does not merge people.';

CREATE TABLE consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('marketing', 'booking_communication')),
  channel text NOT NULL CHECK (channel IN ('email')),
  wording_version text NOT NULL CHECK (char_length(wording_version) BETWEEN 1 AND 80),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  decision text NOT NULL CHECK (decision IN ('granted', 'withdrawn')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_principal_id uuid,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES adult_contacts (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

COMMENT ON TABLE consent_records IS 'Append-only. Withdrawal is a new row. Booking a birthday is not a marketing grant.';

CREATE TABLE marketing_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  birthday_outreach_enabled boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE marketing_settings IS 'Tenant-owned. Five-weeks-before-birthday outreach stays off. Not a cron and not a lawful basis.';

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'approved', 'previewed', 'failed')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  starts_on date NOT NULL,
  drafted_by_principal_id uuid NOT NULL,
  approved_by_principal_id uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CHECK (
    (status = 'draft' AND approved_by_principal_id IS NULL AND approved_at IS NULL)
    OR (
      status IN ('approved', 'previewed', 'failed')
      AND approved_by_principal_id IS NOT NULL
      AND approved_at IS NOT NULL
      AND drafted_by_principal_id IS DISTINCT FROM approved_by_principal_id
    )
  )
);

CREATE TABLE campaign_sends (
  campaign_id uuid NOT NULL,
  campaign_version integer NOT NULL CHECK (campaign_version > 0),
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, campaign_version),
  FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns (tenant_id, id)
);

CREATE TABLE campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  campaign_version integer NOT NULL CHECK (campaign_version > 0),
  contact_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('queued', 'previewed', 'failed')),
  preview_text text,
  last_error text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (campaign_id, campaign_version, contact_id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns (tenant_id, id),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES adult_contacts (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  CHECK (
    (status = 'previewed' AND preview_text IS NOT NULL)
    OR (status IN ('queued', 'failed') AND preview_text IS NULL)
  )
);

COMMENT ON TABLE campaign_messages IS 'Local preview rows. Status is queued, previewed, or failed. There is no delivered state.';

CREATE TABLE survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  principal_id uuid,
  answers jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reservation_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

COMMENT ON TABLE survey_responses IS 'One participation per booking. The reward does not depend on the answers.';

CREATE TABLE loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('contact', 'reservation')),
  subject_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subject_kind, subject_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

COMMENT ON TABLE loyalty_accounts IS 'Lock row for the append-only ledger. Units are not euro amounts.';

CREATE TABLE loyalty_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  location_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('issue', 'redeem', 'reverse')),
  units integer NOT NULL CHECK (units > 0),
  idempotency_key text NOT NULL,
  source text NOT NULL CHECK (
    source IN (
      'verified_reservation',
      'staff_verification',
      'survey_participation',
      'redemption',
      'reversal'
    )
  ),
  reservation_id uuid,
  survey_response_id uuid,
  expires_on date,
  created_by_principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES loyalty_accounts (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, survey_response_id) REFERENCES survey_responses (tenant_id, id)
);

COMMENT ON TABLE loyalty_entries IS 'Append-only issue, redeem, and reverse rows. Fixture expiry is not a retention period.';

CREATE TABLE visit_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  verified_by_principal_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reservation_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id)
);

COMMENT ON TABLE visit_verifications IS 'Staff verification of a visit. A customer cannot insert this row.';

CREATE TABLE booking_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  principal_id uuid NOT NULL REFERENCES principals (id),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reservation_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES reservations (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

COMMENT ON TABLE booking_claims IS 'One proved booking attached to one customer principal. Email is not the key.';

CREATE TRIGGER consent_records_immutable
  BEFORE UPDATE OR DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER survey_responses_immutable
  BEFORE UPDATE OR DELETE ON survey_responses
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER loyalty_entries_immutable
  BEFORE UPDATE OR DELETE ON loyalty_entries
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER visit_verifications_immutable
  BEFORE UPDATE OR DELETE ON visit_verifications
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER booking_claims_immutable
  BEFORE UPDATE OR DELETE ON booking_claims
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER financial_facts_immutable
  BEFORE UPDATE OR DELETE ON financial_facts
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

CREATE TRIGGER loyalty_accounts_immutable
  BEFORE UPDATE OR DELETE ON loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION app.reject_row_change();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'financial_facts',
    'adult_contacts',
    'consent_records',
    'marketing_settings',
    'campaigns',
    'campaign_sends',
    'campaign_messages',
    'survey_responses',
    'loyalty_accounts',
    'loyalty_entries',
    'visit_verifications',
    'booking_claims'
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

GRANT SELECT ON financial_facts TO masulino_app;
GRANT SELECT, INSERT ON
  adult_contacts,
  consent_records,
  campaign_sends,
  survey_responses,
  loyalty_entries,
  visit_verifications,
  booking_claims
  TO masulino_app;
GRANT SELECT, INSERT, UPDATE ON
  marketing_settings,
  campaigns,
  campaign_messages,
  loyalty_accounts
  TO masulino_app;
