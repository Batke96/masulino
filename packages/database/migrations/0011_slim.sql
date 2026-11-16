-- Drop lists that are outside bookings, team shifts, and the till.
-- Äppelallee stays. Igstadt and its till lines do not.

DELETE FROM pos.lines WHERE site_name <> 'Äppelallee (Biebrich)';

DELETE FROM locations WHERE name = 'Igstadt (alt)';

DROP TABLE IF EXISTS
  campaign_messages,
  campaign_sends,
  consent_records,
  loyalty_entries,
  visit_verifications,
  booking_claims,
  checklist_issues,
  checklist_completions,
  punch_capabilities,
  notification_deliveries,
  preparation_sheets,
  booking_access_tokens,
  website_booking_requests,
  campaigns,
  marketing_settings,
  loyalty_accounts,
  survey_responses,
  adult_contacts,
  financial_facts,
  checklists,
  kiosk_devices,
  holiday_notices,
  published_venues
CASCADE;

DROP FUNCTION IF EXISTS app.lookup_published_venue(text);
DROP FUNCTION IF EXISTS app.lookup_booking_token(text);
DROP FUNCTION IF EXISTS app.lookup_kiosk_device(text);
DROP FUNCTION IF EXISTS app.lookup_punch_capability(text);
