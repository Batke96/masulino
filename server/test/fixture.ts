import { randomUUID } from "node:crypto";
import pg from "pg";
import type { ActorContext } from "@masulino/core";

export const hours = {
  mon: { startMinute: 600, endMinute: 1080 },
  tue: { startMinute: 600, endMinute: 1080 },
  wed: { startMinute: 600, endMinute: 1080 },
  thu: { startMinute: 600, endMinute: 1080 },
  fri: { startMinute: 600, endMinute: 1080 },
  sat: { startMinute: 600, endMinute: 1080 },
  sun: { startMinute: 600, endMinute: 1080 },
};

export type Fixture = {
  tenantA: string;
  tenantB: string;
  locationA: string;
  principalA: string;
  packageId: string;
};

export async function admin() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATE });
  await client.connect();
  return client;
}

const LOCK_KEY = 874521;
const lockState = ((globalThis as { __masulinoFixtureLock?: { clients: pg.Client[] } }).__masulinoFixtureLock ??= {
  clients: [],
});

/** Serializes fixture reset across Vitest workers that share one Postgres. */
export async function lockFixture(): Promise<void> {
  const client = await admin();
  await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
  lockState.clients.push(client);
}

export async function unlockFixture(): Promise<void> {
  const client = lockState.clients.pop();
  if (!client) return;
  try {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
  } finally {
    await client.end();
  }
}

export async function reset(): Promise<void> {
  const client = await admin();
  await client.query(`
    truncate table
      booking_claims, loyalty_entries, visit_verifications, loyalty_accounts, survey_responses,
      campaign_messages, campaign_sends, campaigns, marketing_settings, consent_records, adult_contacts,
      financial_facts,
      checklist_issues, checklist_completions, checklists, punch_capabilities, kiosk_devices,
      time_effective_entries, time_correction_requests, time_punches, schedule_shifts, schedule_plans,
      leave_entries, availability_windows, availability_revisions, workforce_settings,
      booking_access_tokens, notification_deliveries, preparation_sheets, holiday_notices,
      published_venues, allocations, reservation_tasks, reservations, idempotency_keys,
      notification_previews, rate_buckets, outbox_jobs, combination_resources, combinations,
      packages, venue_rules, closures, resources, staff_invitations, grants, memberships,
      module_entitlements, locations, audit_events, security_events, principals, tenants
    restart identity cascade
  `);
  await client.end();
}

export async function seed(): Promise<Fixture> {
  const client = await admin();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const locationA = randomUUID();
  const principalA = randomUUID();
  const packageId = randomUUID();
  const resourceA = randomUUID();
  const resourceB = randomUUID();
  const combo = randomUUID();
  const ruleId = randomUUID();
  await client.query(`insert into tenants (id, slug, name) values ($1, 'a', 'A'), ($2, 'b', 'B')`, [
    tenantA,
    tenantB,
  ]);
  await client.query(
    `insert into locations (id, tenant_id, slug, name, timezone) values ($1, $2, 'berlin', 'Berlin', 'Europe/Berlin')`,
    [locationA, tenantA],
  );
  await client.query(
    `insert into principals (id, issuer, subject, email, display_name) values ($1, 'urn:masulino:better-auth', 'subject-a', 'a@example.test', 'A')`,
    [principalA],
  );
  await client.query(
    `insert into resources (id, tenant_id, location_id, name, capacity_children) values
      ($1, $2, $3, 'Tisch 1', 8), ($4, $2, $3, 'Tisch 2', 8)`,
    [resourceA, tenantA, locationA, resourceB],
  );
  await client.query(
    `insert into combinations (id, tenant_id, location_id, name, min_children, max_children, max_adults)
     values ($1, $2, $3, 'Nur Tisch 1', 1, 8, 20)`,
    [combo, tenantA, locationA],
  );
  await client.query(
    `insert into combination_resources (tenant_id, combination_id, resource_id) values ($1, $2, $3)`,
    [tenantA, combo, resourceA],
  );
  await client.query(
    `insert into packages (id, tenant_id, location_id, name, duration_minutes, price_minor, currency, min_children, max_children, fixture)
     values ($1, $2, $3, 'Fixture', 120, 10000, 'EUR', 1, 8, true)`,
    [packageId, tenantA, locationA],
  );
  await client.query(
    `insert into venue_rules (
      id, tenant_id, location_id, version, status, timezone, buffer_before_minutes, buffer_after_minutes,
      slot_minutes, horizon_days, opening_hours, adult_seating, fixture, published_at
    ) values ($1, $2, $3, 1, 'published', 'Europe/Berlin', 30, 30, 30, 30, $4::jsonb, 'not_required', true, now())`,
    [ruleId, tenantA, locationA, JSON.stringify(hours)],
  );
  await client.query(
    `insert into module_entitlements (tenant_id, module_id, enabled) values
      ($1, 'core', true), ($1, 'reservations', true), ($1, 'content', true)`,
    [tenantA],
  );
  await client.query(
    `insert into published_venues (tenant_id, location_id, public_slug, status) values ($1, $2, 'a-berlin', 'published')`,
    [tenantA, locationA],
  );
  await client.end();
  return { tenantA, tenantB, locationA, principalA, packageId };
}

export function staff(fixture: Fixture): ActorContext {
  return {
    principalId: fixture.principalA,
    tenantId: fixture.tenantA,
    membershipStatus: "active",
    grants: [{ roleKey: "reception", locationId: fixture.locationA }],
    entitlements: { core: true, reservations: true, content: true },
    mfaSatisfied: true,
  };
}

export function manager(fixture: Fixture): ActorContext {
  return {
    ...staff(fixture),
    grants: [{ roleKey: "location_manager", locationId: fixture.locationA }],
    mfaSatisfied: true,
  };
}
