import type { Tx } from "@masulino/database";

export type ReservationFact = {
  locationId: string;
  status: string;
};

/** The composition root reads reservation state. Loyalty does not. */
export type ReservationLookup = (tx: Tx, reservationId: string) => Promise<ReservationFact | null>;

export type ProvedBooking = {
  tenantId: string;
  locationId: string;
  reservationId: string;
  principalId: string | null;
};

export type BookingProofReader = (token: string) => Promise<ProvedBooking | null>;
