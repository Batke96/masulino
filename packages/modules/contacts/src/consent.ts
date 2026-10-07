import { randomUUID } from "node:crypto";
import type { ConsentEventInput } from "@masulino/contracts";
import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { requireLocation, requireModule } from "./db";

export type EligibleAdult = {
  contactId: string;
  displayName: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function recordConsent(args: {
  actor: ActorContext;
  input: ConsentEventInput;
  correlationId: string;
}): Promise<{ contactId: string; consentId: string }> {
  requirePermission(args.actor, "contacts.consent.write", args.input.locationId);
  if (args.input.decision === "withdrawn" && !args.input.contactId) {
    throw new AppError("validation", "contact");
  }
  if (!args.input.contactId && (!args.input.displayName || !args.input.email)) {
    throw new AppError("validation", "adult");
  }
  const consentId = randomUUID();
  let contactId = args.input.contactId ?? randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "contacts");
    await requireLocation(tx, args.input.locationId);
    if (args.input.contactId) {
      const found = await rows<{ id: string }>(
        tx,
        sql`
          select id from adult_contacts
          where id = ${args.input.contactId} and location_id = ${args.input.locationId}
        `,
      );
      if (!found[0]) throw new AppError("not_found", "contact");
      contactId = found[0].id;
    } else {
      await tx.execute(sql`
        insert into adult_contacts (id, tenant_id, location_id, display_name, email)
        values (
          ${contactId}, ${args.actor.tenantId}, ${args.input.locationId},
          ${args.input.displayName ?? ""}, ${normalizeEmail(args.input.email ?? "")}
        )
      `);
    }
    await tx.execute(sql`
      insert into consent_records (
        id, tenant_id, location_id, contact_id, purpose, channel, wording_version, source,
        decision, recorded_by_principal_id
      ) values (
        ${consentId}, ${args.actor.tenantId}, ${args.input.locationId}, ${contactId},
        ${args.input.purpose}, ${args.input.channel}, ${args.input.wordingVersion}, ${args.input.source},
        ${args.input.decision}, ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.input.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "contacts.consent.write",
      targetType: "consent_record",
      targetId: consentId,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { purpose: args.input.purpose, decision: args.input.decision, contactId },
    });
  });
  return { contactId, consentId };
}

export type LocationAdult = {
  contactId: string;
  displayName: string;
  marketingDecision: "granted" | "withdrawn" | "none";
};

/** Adults at the location with the latest marketing decision, if any. */
export async function listLocationAdults(args: {
  actor: ActorContext;
  locationId: string;
}): Promise<LocationAdult[]> {
  requirePermission(args.actor, "contacts.consent.read", args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "contacts");
    await requireLocation(tx, args.locationId);
    const found = await rows<{
      id: string;
      display_name: string;
      decision: string | null;
    }>(
      tx,
      sql`
        select c.id, c.display_name, (
          select r.decision
          from consent_records r
          where r.contact_id = c.id and r.purpose = 'marketing'
          order by r.recorded_at desc, r.id desc
          limit 1
        ) as decision
        from adult_contacts c
        where c.location_id = ${args.locationId}
        order by c.display_name, c.id
      `,
    );
    return found.map((row) => ({
      contactId: row.id,
      displayName: row.display_name,
      marketingDecision:
        row.decision === "granted" || row.decision === "withdrawn" ? row.decision : "none",
    }));
  });
}

/** Latest marketing decision per adult. A withdrawal wins. Booking consent does not qualify. */
export async function eligibleAdults(tx: Tx, locationId: string): Promise<EligibleAdult[]> {
  await requireModule(tx, "contacts");
  const found = await rows<{ id: string; display_name: string; decision: string }>(
    tx,
    sql`
      select distinct on (c.id) c.id, c.display_name, r.decision
      from adult_contacts c
      join consent_records r on r.contact_id = c.id and r.purpose = 'marketing'
      where c.location_id = ${locationId}
      order by c.id, r.recorded_at desc, r.id desc
    `,
  );
  return found
    .filter((row) => row.decision === "granted")
    .map((row) => ({ contactId: row.id, displayName: row.display_name }));
}
