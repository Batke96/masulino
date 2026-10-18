-- Birthday form fields collected from the website.
-- Payment stays off the reservation: the family pays at the venue on the day.
-- adult_flat_unit_minor is a snapshot of the 2,50 € adult flat rate (0 when declined).

ALTER TABLE packages
  ADD COLUMN public_code text;

ALTER TABLE packages
  ADD CONSTRAINT packages_public_code_format
  CHECK (public_code IS NULL OR public_code ~ '^[a-z0-9]([a-z0-9-]{0,40})$');

CREATE UNIQUE INDEX packages_public_code_uidx
  ON packages (tenant_id, location_id, public_code)
  WHERE public_code IS NOT NULL;

ALTER TABLE reservations
  ADD COLUMN honoree_age integer CHECK (honoree_age IS NULL OR honoree_age BETWEEN 1 AND 17),
  ADD COLUMN organizer_given_name text CHECK (
    organizer_given_name IS NULL OR char_length(organizer_given_name) BETWEEN 1 AND 80
  ),
  ADD COLUMN organizer_family_name text CHECK (
    organizer_family_name IS NULL OR char_length(organizer_family_name) BETWEEN 1 AND 80
  ),
  ADD COLUMN adult_flat_rate boolean NOT NULL DEFAULT false,
  ADD COLUMN adult_flat_unit_minor integer NOT NULL DEFAULT 0 CHECK (adult_flat_unit_minor >= 0),
  ADD COLUMN adult_flat_total_minor integer NOT NULL DEFAULT 0 CHECK (adult_flat_total_minor >= 0),
  ADD COLUMN referral_source text NOT NULL DEFAULT '' CHECK (char_length(referral_source) <= 80);

COMMENT ON COLUMN reservations.honoree_age IS 'Age in years at booking. Not a date of birth, and not a marketing consent.';
COMMENT ON COLUMN reservations.referral_source IS 'Optional how-did-you-hear answer. Not a consent record.';
COMMENT ON COLUMN reservations.adult_flat_total_minor IS 'Snapshot of adult flat rate times adult count, in euro cents.';
