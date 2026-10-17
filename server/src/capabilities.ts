import type { Action } from "@masulino/contracts";
import { allowedActions, type ActorContext } from "@masulino/core";

export type StaffCapabilities = {
  bookings: boolean;
  createBooking: boolean;
  families: boolean;
  team: boolean;
  reports: boolean;
  campaigns: boolean;
  portal: boolean;
  agents: boolean;
  it: boolean;
};

export function staffCapabilities(actor: ActorContext, locationId: string | null): StaffCapabilities {
  const granted = new Set<Action>(allowedActions({ ...actor, locationId }));
  const has = (action: Action) => granted.has(action);
  const team =
    has("workforce.schedule.read") ||
    has("workforce.availability.read") ||
    has("workforce.time.record");
  return {
    bookings: has("reservations.booking.read"),
    createBooking: has("reservations.booking.create"),
    families: has("loyalty.ledger.read") || has("contacts.consent.read"),
    team,
    reports: has("reporting.booked_value.read"),
    campaigns: has("marketing.audience.read"),
    portal: has("content.notice.read"),
    // The agent inbox is still a fixture. Keep it out of a signed-in workplace.
    agents: false,
    it: has("core.users.invite") || has("core.records.manage"),
  };
}
