import type { Tx } from "@masulino/database";

export type EligibleAdult = {
  contactId: string;
  displayName: string;
};

/** Narrow consent read. The composition root supplies it. Marketing does not read contact tables. */
export type EligibilityReader = (tx: Tx, locationId: string) => Promise<EligibleAdult[]>;
