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
};

export function staffCapabilities(actor: ActorContext, locationId: string): StaffCapabilities {
  const granted = new Set<Action>(allowedActions({ ...actor, locationId }));
  const has = (action: Action) => granted.has(action);
  const campaigns = has("marketing.audience.read");
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
    campaigns,
    portal: has("content.notice.read"),
    agents: campaigns || has("workforce.schedule.propose"),
  };
}
