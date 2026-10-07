import { randomUUID } from "node:crypto";
import { AppError } from "@masulino/contracts";
import { insertAudit } from "@masulino/core";
import { pgCode, rows, withIdentity, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { requireGuestSession } from "./access";

const CLAIM_ISSUER = "urn:masulino:booking-claim";

async function ensureClaimPrincipal(reservationId: string): Promise<string> {
  return withIdentity({ issuer: CLAIM_ISSUER, subject: reservationId }, async (tx) => {
    const existing = await rows<{ id: string }>(
      tx,
      sql`select id from principals where issuer = ${CLAIM_ISSUER} and subject = ${reservationId}`,
    );
    const found = existing[0];
    if (found) return found.id;
    const id = randomUUID();
    await tx.execute(sql`
      insert into principals (id, issuer, subject, email, display_name)
      values (${id}, ${CLAIM_ISSUER}, ${reservationId}, null, 'Gast')
    `);
    return id;
  });
}

export async function claimBooking(sessionToken: string, correlationId: string): Promise<{ references: string[] }> {
  const session = await requireGuestSession(sessionToken);
  const principalId = await ensureClaimPrincipal(session.reservation_id);
  try {
    await withTenant(session.tenant_id, async (tx) => {
      const existing = await rows<{ id: string }>(
        tx,
        sql`select id from booking_claims where reservation_id = ${session.reservation_id}`,
      );
      if (existing[0]) throw new AppError("conflict", "replay");
      const id = randomUUID();
      await tx.execute(sql`
        insert into booking_claims (id, tenant_id, location_id, reservation_id, principal_id)
        values (
          ${id}, ${session.tenant_id}, ${session.location_id}, ${session.reservation_id}, ${principalId}
        )
      `);
      await insertAudit(tx, {
        tenantId: session.tenant_id,
        locationId: session.location_id,
        actorPrincipalId: principalId,
        action: "reservations.booking.claim",
        targetType: "reservation",
        targetId: session.reservation_id,
        outcome: "success",
        correlationId,
        changes: { claimed: true },
      });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (pgCode(error) === "23505") throw new AppError("conflict", "replay");
    throw error;
  }
  return { references: await readClaimedReferences(sessionToken) };
}

export async function readClaimedReferences(sessionToken: string): Promise<string[]> {
  const session = await requireGuestSession(sessionToken);
  return withTenant(session.tenant_id, async (tx) => {
    const claim = await rows<{ principal_id: string }>(
      tx,
      sql`select principal_id from booking_claims where reservation_id = ${session.reservation_id}`,
    );
    const principalId = claim[0]?.principal_id;
    if (!principalId) return [];
    const found = await rows<{ reference: string }>(
      tx,
      sql`
        select r.reference
        from booking_claims c
        join reservations r on r.id = c.reservation_id
        where c.principal_id = ${principalId}
        order by r.reference
      `,
    );
    return found.map((row) => row.reference);
  });
}
