import { AppError } from "@masulino/contracts";
import { insertAudit, requirePermission, type ActorContext } from "@masulino/core";
import { rows, withTenant } from "@masulino/database";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { dailyView, type DailyRow } from "./booking";

export type PrintLine = {
  id: string;
  version: number;
  reference: string;
  localTime: string;
  organizerName: string;
  organizerPhone: string;
  childrenCount: number;
  adultCount: number;
  packageName: string;
  tables: string[];
  status: string;
  tasks: string[];
};

export type PreparationSheet = {
  generatedAt: string;
  stale: boolean;
  lines: PrintLine[];
};

function toLine(row: DailyRow): PrintLine {
  return {
    id: row.id,
    version: row.version,
    reference: row.reference,
    localTime: row.localTime,
    organizerName: row.organizerName,
    organizerPhone: row.organizerPhone,
    childrenCount: row.childrenCount,
    adultCount: row.adultCount,
    packageName: row.packageName,
    tables: row.tables,
    status: row.status,
    tasks: row.tasks.filter((task) => task.status === "open").map((task) => task.title),
  };
}

function parseLines(value: unknown): PrintLine[] {
  const raw = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return [];
  return raw as PrintLine[];
}

function isStale(stored: PrintLine[], current: PrintLine[]): boolean {
  if (stored.length !== current.length) return true;
  const versions = new Map(current.map((line) => [line.id, line.version]));
  return stored.some((line) => versions.get(line.id) !== line.version);
}

async function timezoneFor(actor: ActorContext, locationId: string): Promise<string> {
  const found = await withTenant(actor.tenantId, async (tx) =>
    rows<{ timezone: string }>(tx, sql`select timezone from locations where id = ${locationId}`),
  );
  return found[0]?.timezone ?? "Europe/Berlin";
}

export async function readPreparationSheet(args: {
  actor: ActorContext;
  locationId: string;
  localDate: string;
}): Promise<PreparationSheet | null> {
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  const current = (await dailyView(args)).map(toLine);
  const timezone = await timezoneFor(args.actor, args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const found = await rows<{ generated_at: Date; lines: unknown }>(
      tx,
      sql`
        select generated_at, lines
        from preparation_sheets
        where location_id = ${args.locationId} and local_date = ${args.localDate}::date
      `,
    );
    const row = found[0];
    if (!row) return null;
    const lines = parseLines(row.lines);
    return {
      generatedAt: DateTime.fromJSDate(new Date(row.generated_at)).setZone(timezone).toFormat("dd.MM.yyyy, HH:mm"),
      stale: isStale(lines, current),
      lines,
    };
  });
}

export async function generatePreparationSheet(args: {
  actor: ActorContext;
  locationId: string;
  localDate: string;
  correlationId: string;
}): Promise<PreparationSheet> {
  requirePermission(args.actor, "reservations.booking.read", args.locationId);
  const lines = (await dailyView(args)).map(toLine);
  const timezone = await timezoneFor(args.actor, args.locationId);
  return withTenant(args.actor.tenantId, async (tx) => {
    const saved = await rows<{ generated_at: Date }>(
      tx,
      sql`
        insert into preparation_sheets (tenant_id, location_id, local_date, lines)
        values (${args.actor.tenantId}, ${args.locationId}, ${args.localDate}::date, ${JSON.stringify(lines)}::jsonb)
        on conflict (tenant_id, location_id, local_date)
        do update set lines = excluded.lines, generated_at = now()
        returning generated_at
      `,
    );
    const generated = saved[0];
    if (!generated) throw new AppError("conflict", "sheet");
    await insertAudit(tx, {
      tenantId: args.actor.tenantId,
      locationId: args.locationId,
      actorPrincipalId: args.actor.principalId,
      action: "reservations.preparation.generate",
      targetType: "preparation_sheet",
      targetId: args.locationId,
      outcome: "success",
      correlationId: args.correlationId,
      changes: { localDate: args.localDate, versions: lines.map((line) => ({ id: line.id, version: line.version })) },
    });
    return {
      generatedAt: DateTime.fromJSDate(new Date(generated.generated_at)).setZone(timezone).toFormat("dd.MM.yyyy, HH:mm"),
      stale: false,
      lines,
    };
  });
}
