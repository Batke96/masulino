import { randomUUID } from "node:crypto";
import type { SurveyAnswersInput } from "@masulino/contracts";
import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { pgCode, rows, withTenant, type Tx } from "@masulino/database";
import { sql } from "drizzle-orm";
import { requireLocation, requireModule } from "./db";
import type { BookingProofReader, ReservationLookup } from "./port";
import { fixtureRewardExpiresOn, fixtureRewardUnits } from "./rules";

export type LedgerEntryView = {
  id: string;
  kind: "issue" | "redeem" | "reverse";
  units: number;
  source: string;
};

export type LedgerAccountView = {
  accountId: string;
  subjectKind: string;
  subjectId: string;
  balanceUnits: number;
  entries: LedgerEntryView[];
};

async function balanceOf(tx: Tx, accountId: string, timezone: string): Promise<number> {
  const found = await rows<{ balance: number }>(
    tx,
    sql`
      select coalesce(sum(
        case
          when kind = 'issue' and (expires_on is null or expires_on >= (timezone(${timezone}, now()))::date) then units
          when kind in ('redeem', 'reverse') then -units
          else 0
        end
      ), 0)::int as balance
      from loyalty_entries
      where account_id = ${accountId}
    `,
  );
  return found[0]?.balance ?? 0;
}

async function ensureAccount(
  tx: Tx,
  tenantId: string,
  locationId: string,
  subjectKind: "contact" | "reservation",
  subjectId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.execute(sql`
    insert into loyalty_accounts (id, tenant_id, location_id, subject_kind, subject_id)
    values (${id}, ${tenantId}, ${locationId}, ${subjectKind}, ${subjectId})
    on conflict (tenant_id, subject_kind, subject_id) do nothing
  `);
  const found = await rows<{ id: string }>(
    tx,
    sql`
      select id from loyalty_accounts
      where subject_kind = ${subjectKind} and subject_id = ${subjectId}
    `,
  );
  const account = found[0];
  if (!account) throw new AppError("not_found", "account");
  return account.id;
}

async function insertIssue(
  tx: Tx,
  args: {
    tenantId: string;
    accountId: string;
    locationId: string;
    units: number;
    idempotencyKey: string;
    source: string;
    reservationId: string | null;
    surveyResponseId: string | null;
    expiresOn: string | null;
    actorId: string;
  },
): Promise<{ id: string; replayed: boolean }> {
  const id = randomUUID();
  const inserted = await rows<{ id: string }>(
    tx,
    sql`
      insert into loyalty_entries (
        id, tenant_id, account_id, location_id, kind, units, idempotency_key, source,
        reservation_id, survey_response_id, expires_on, created_by_principal_id
      ) values (
        ${id}, ${args.tenantId}, ${args.accountId}, ${args.locationId}, 'issue', ${args.units},
        ${args.idempotencyKey}, ${args.source}, ${args.reservationId}, ${args.surveyResponseId},
        ${args.expiresOn}::date, ${args.actorId}
      )
      on conflict (tenant_id, idempotency_key) do nothing
      returning id
    `,
  );
  if (inserted[0]) return { id: inserted[0].id, replayed: false };
  const existing = await rows<{ id: string }>(
    tx,
    sql`select id from loyalty_entries where idempotency_key = ${args.idempotencyKey}`,
  );
  const row = existing[0];
  if (!row) throw new AppError("conflict", "ledger");
  return { id: row.id, replayed: true };
}

export async function listLedger(actor: ActorContext, locationId: string): Promise<LedgerAccountView[]> {
  requirePermission(actor, "loyalty.ledger.read", locationId);
  return withTenant(actor.tenantId, async (tx) => {
    const timezone = await requireLocation(tx, locationId);
    const accounts = await rows<{ id: string; subject_kind: string; subject_id: string }>(
      tx,
      sql`
        select id, subject_kind, subject_id from loyalty_accounts
        where location_id = ${locationId}
        order by created_at
      `,
    );
    const views: LedgerAccountView[] = [];
    for (const account of accounts) {
      const entries = await rows<LedgerEntryView & { source: string }>(
        tx,
        sql`
          select id, kind, units, source
          from loyalty_entries
          where account_id = ${account.id}
          order by created_at
        `,
      );
      views.push({
        accountId: account.id,
        subjectKind: account.subject_kind,
        subjectId: account.subject_id,
        balanceUnits: await balanceOf(tx, account.id, timezone),
        entries: entries.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          units: entry.units,
          source: entry.source,
        })),
      });
    }
    return views;
  });
}

export async function submitSurvey(args: {
  proofToken: string;
  answers: SurveyAnswersInput;
  resolveProof: BookingProofReader;
}): Promise<{ id: string }> {
  const proof = await args.resolveProof(args.proofToken);
  if (!proof) throw new AppError("not_found", "link");
  const id = randomUUID();
  try {
    await withTenant(proof.tenantId, async (tx) => {
      await requireModule(tx, "loyalty");
      await requireLocation(tx, proof.locationId);
      await tx.execute(sql`
        insert into survey_responses (
          id, tenant_id, location_id, reservation_id, principal_id, answers
        ) values (
          ${id}, ${proof.tenantId}, ${proof.locationId}, ${proof.reservationId},
          ${proof.principalId}, ${JSON.stringify(args.answers)}::jsonb
        )
      `);
    });
  } catch (error) {
    if (pgCode(error) === "23505") throw new AppError("conflict", "survey");
    throw error;
  }
  return { id };
}

export async function issueSurveyReward(args: {
  actor: ActorContext;
  surveyId: string;
  correlationId: string;
}): Promise<{ id: string; replayed: boolean }> {
  return withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "loyalty");
    const found = await rows<{ id: string; location_id: string; reservation_id: string }>(
      tx,
      sql`select id, location_id, reservation_id from survey_responses where id = ${args.surveyId}`,
    );
    const survey = found[0];
    if (!survey) throw new AppError("not_found", "survey");
    requirePermission(args.actor, "loyalty.reward.issue", survey.location_id);
    const accountId = await ensureAccount(
      tx,
      args.actor.tenantId,
      survey.location_id,
      "reservation",
      survey.reservation_id,
    );
    const issued = await insertIssue(tx, {
      tenantId: args.actor.tenantId,
      accountId,
      locationId: survey.location_id,
      units: fixtureRewardUnits,
      idempotencyKey: `loyalty.survey:${survey.id}`,
      source: "survey_participation",
      reservationId: survey.reservation_id,
      surveyResponseId: survey.id,
      expiresOn: fixtureRewardExpiresOn,
      actorId: args.actor.principalId,
    });
    if (!issued.replayed) {
      await insertAudit(tx, {
        tenantId: args.actor.tenantId,
        locationId: survey.location_id,
        actorPrincipalId: args.actor.principalId,
        action: "loyalty.reward.issue",
        targetType: "loyalty_entry",
        targetId: issued.id,
        outcome: "success",
        correlationId: args.correlationId,
        changes: { source: "survey_participation", units: fixtureRewardUnits },
      });
    }
    return issued;
  });
}

export async function recordVisitVerification(args: {
  actor: ActorContext;
  reservationId: string;
  correlationId: string;
  lookupReservation: ReservationLookup;
}): Promise<{ id: string }> {
  return withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "loyalty");
    const reservation = await args.lookupReservation(tx, args.reservationId);
    if (!reservation) throw new AppError("not_found", "reservation");
    requirePermission(args.actor, "loyalty.reward.issue", reservation.locationId);
    const existing = await rows<{ id: string }>(
      tx,
      sql`select id from visit_verifications where reservation_id = ${args.reservationId}`,
    );
    if (existing[0]) return { id: existing[0].id };
    const id = randomUUID();
    await tx.execute(sql`
      insert into visit_verifications (
        id, tenant_id, location_id, reservation_id, verified_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${reservation.locationId}, ${args.reservationId},
        ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: reservation.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "loyalty.visit.verify",
      targetType: "visit_verification",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { reservationId: args.reservationId },
    });
    return { id };
  });
}

export async function issueVisitCredit(args: {
  actor: ActorContext;
  reservationId: string;
  correlationId: string;
  lookupReservation: ReservationLookup;
}): Promise<{ id: string; replayed: boolean }> {
  return withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "loyalty");
    const reservation = await args.lookupReservation(tx, args.reservationId);
    if (!reservation) throw new AppError("not_found", "reservation");
    requirePermission(args.actor, "loyalty.reward.issue", reservation.locationId);
    const verified = await rows<{ id: string }>(
      tx,
      sql`select id from visit_verifications where reservation_id = ${args.reservationId}`,
    );
    const completed = reservation.status === "completed";
    if (!completed && !verified[0]) throw new AppError("forbidden", "unverified");
    const accountId = await ensureAccount(
      tx,
      args.actor.tenantId,
      reservation.locationId,
      "reservation",
      args.reservationId,
    );
    const issued = await insertIssue(tx, {
      tenantId: args.actor.tenantId,
      accountId,
      locationId: reservation.locationId,
      units: fixtureRewardUnits,
      idempotencyKey: `loyalty.visit:${args.reservationId}`,
      source: completed ? "verified_reservation" : "staff_verification",
      reservationId: args.reservationId,
      surveyResponseId: null,
      expiresOn: fixtureRewardExpiresOn,
      actorId: args.actor.principalId,
    });
    if (!issued.replayed) {
      await insertAudit(tx, {
        tenantId: args.actor.tenantId,
        locationId: reservation.locationId,
        actorPrincipalId: args.actor.principalId,
        action: "loyalty.reward.issue",
        targetType: "loyalty_entry",
        targetId: issued.id,
        outcome: "success",
        correlationId: args.correlationId,
        changes: { source: completed ? "verified_reservation" : "staff_verification", units: fixtureRewardUnits },
      });
    }
    return issued;
  });
}

export async function redeemReward(args: {
  actor: ActorContext;
  locationId: string;
  accountId: string;
  units: number;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "loyalty.reward.redeem", args.locationId);
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "loyalty");
    const timezone = await requireLocation(tx, args.locationId);
    const locked = await rows<{ id: string; location_id: string }>(
      tx,
      sql`
        select id, location_id from loyalty_accounts
        where id = ${args.accountId}
        for update
      `,
    );
    const account = locked[0];
    if (!account || account.location_id !== args.locationId) throw new AppError("not_found", "account");
    const balance = await balanceOf(tx, account.id, timezone);
    if (args.units > balance) throw new AppError("conflict", "balance");
    await tx.execute(sql`
      insert into loyalty_entries (
        id, tenant_id, account_id, location_id, kind, units, idempotency_key, source, created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${account.id}, ${args.locationId}, 'redeem', ${args.units},
        ${`loyalty.redeem:${id}`}, 'redemption', ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "loyalty.reward.redeem",
      targetType: "loyalty_entry",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { units: args.units },
    });
  });
  return { id };
}

export async function reverseIssue(args: {
  actor: ActorContext;
  locationId: string;
  accountId: string;
  units: number;
  correlationId: string;
}): Promise<{ id: string }> {
  requirePermission(args.actor, "loyalty.reward.issue", args.locationId);
  const id = randomUUID();
  await withTenant(args.actor.tenantId, async (tx) => {
    await requireModule(tx, "loyalty");
    const timezone = await requireLocation(tx, args.locationId);
    const locked = await rows<{ id: string; location_id: string }>(
      tx,
      sql`select id, location_id from loyalty_accounts where id = ${args.accountId} for update`,
    );
    const account = locked[0];
    if (!account || account.location_id !== args.locationId) throw new AppError("not_found", "account");
    const balance = await balanceOf(tx, account.id, timezone);
    if (args.units > balance) throw new AppError("conflict", "balance");
    await tx.execute(sql`
      insert into loyalty_entries (
        id, tenant_id, account_id, location_id, kind, units, idempotency_key, source, created_by_principal_id
      ) values (
        ${id}, ${args.actor.tenantId}, ${account.id}, ${args.locationId}, 'reverse', ${args.units},
        ${`loyalty.reverse:${id}`}, 'reversal', ${args.actor.principalId}
      )
    `);
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "loyalty.reward.reverse",
      targetType: "loyalty_entry",
      targetId: id,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { units: args.units },
    });
  });
  return { id };
}
