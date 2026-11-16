-- Masulino migration 0010
-- Till positions for the reports view. Bookings and financial_facts stay untouched.
-- Jahr, Monat and Wochentag are derived from business_date and are not stored.

CREATE SCHEMA IF NOT EXISTS pos;

REVOKE ALL ON SCHEMA pos FROM PUBLIC;
GRANT USAGE ON SCHEMA pos TO masulino_app;

CREATE TABLE pos.lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('csv', 'ready2order')),
  external_invoice_id text,
  external_item_id text,
  import_key text NOT NULL,
  z_bon date,
  booked_on date NOT NULL,
  booked_at time,
  invoice_number text NOT NULL,
  payment_method text NOT NULL,
  product_name text NOT NULL,
  product_group text NOT NULL,
  quantity numeric NOT NULL,
  unit_gross numeric NOT NULL,
  unit_net numeric NOT NULL,
  discount_gross numeric NOT NULL,
  discount_net numeric NOT NULL,
  line_gross numeric NOT NULL,
  line_net numeric NOT NULL,
  vat_rate numeric NOT NULL,
  vat_amount numeric NOT NULL,
  business_date date NOT NULL,
  site_name text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, import_key),
  FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id)
);

COMMENT ON TABLE pos.lines IS 'One till line. Revenue and quantity for reports. Not a reservation and not a financial_facts row.';

CREATE INDEX pos_lines_day_idx
  ON pos.lines (tenant_id, location_id, business_date);

CREATE INDEX pos_lines_category_idx
  ON pos.lines (tenant_id, location_id, category);

CREATE TABLE pos.product_categories (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  product_name text NOT NULL,
  category text NOT NULL,
  group_key text NOT NULL,
  role text NOT NULL,
  count_in_quantity boolean NOT NULL,
  count_in_revenue boolean NOT NULL,
  PRIMARY KEY (tenant_id, product_name)
);

COMMENT ON TABLE pos.product_categories IS 'Maps a till product name to the report category. New API products stay unmapped until classified.';

ALTER TABLE pos.lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.lines FORCE ROW LEVEL SECURITY;
ALTER TABLE pos.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos.product_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY lines_tenant ON pos.lines
  FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

CREATE POLICY product_categories_tenant ON pos.product_categories
  FOR ALL
  USING (app.context() = 'tenant' AND tenant_id = app.current_tenant_id())
  WITH CHECK (app.context() = 'tenant' AND tenant_id = app.current_tenant_id());

GRANT SELECT ON pos.lines, pos.product_categories TO masulino_app;
