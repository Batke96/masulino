-- One-time marker so pre-enrollment staff sessions can be revoked after TOTP is verified.
-- Better Auth does not record which session completed the second factor.

ALTER TABLE identity.two_factor
  ADD COLUMN session_rotated boolean NOT NULL DEFAULT false;
