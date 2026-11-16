import { randomUUID } from "node:crypto";
import pg from "pg";
import { tableSeats } from "../lib/booking/tables.ts";
import { loadRootEnv } from "./load-env";

loadRootEnv();

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl || (!migrateUrl.includes("127.0.0.1") && !migrateUrl.includes("localhost"))) {
  throw new Error("Refusing to update a non-local database");
}

const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();
await client.query("begin");

const locations = await client.query<{ tenant_id: string; location_id: string }>(
  `select distinct tenant_id, id as location_id from locations where name = 'Äppelallee (Biebrich)' and status = 'active'`,
);
const names = tableSeats.map((seat) => `Tisch ${seat.id}`);

for (const location of locations.rows) {
  const resourceIds = new Map<string, string>();
  const comboIds = new Map<string, string>();
  for (const seat of tableSeats) {
    const name = `Tisch ${seat.id}`;
    const existing = await client.query<{ id: string }>(
      `select id from resources where tenant_id = $1 and location_id = $2 and name = $3 order by created_at limit 1`,
      [location.tenant_id, location.location_id, name],
    );
    const resourceId = existing.rows[0]?.id ?? randomUUID();
    if (existing.rows[0]) {
      await client.query(
        `update resources set capacity_children = $2, status = 'active' where id = $1`,
        [resourceId, seat.seats],
      );
    } else {
      await client.query(
        `insert into resources (id, tenant_id, location_id, name, capacity_children) values ($1, $2, $3, $4, $5)`,
        [resourceId, location.tenant_id, location.location_id, name, seat.seats],
      );
    }
    resourceIds.set(name, resourceId);

    const combo = await client.query<{ id: string }>(
      `select id from combinations where tenant_id = $1 and location_id = $2 and name = $3 order by created_at limit 1`,
      [location.tenant_id, location.location_id, name],
    );
    const comboId = combo.rows[0]?.id ?? randomUUID();
    if (combo.rows[0]) {
      await client.query(
        `update combinations set min_children = 1, max_children = $2, max_adults = 40, status = 'active' where id = $1`,
        [comboId, seat.seats],
      );
    } else {
      await client.query(
        `insert into combinations (id, tenant_id, location_id, name, min_children, max_children, max_adults) values ($1, $2, $3, $4, 1, $5, 40)`,
        [comboId, location.tenant_id, location.location_id, name, seat.seats],
      );
    }
    comboIds.set(name, comboId);
    await client.query(`delete from combination_resources where combination_id = $1`, [comboId]);
    await client.query(
      `insert into combination_resources (tenant_id, combination_id, resource_id) values ($1, $2, $3)`,
      [location.tenant_id, comboId, resourceId],
    );
  }

  await client.query(
    `update combinations set status = 'inactive' where tenant_id = $1 and location_id = $2 and not (name = any($3::text[]))`,
    [location.tenant_id, location.location_id, names],
  );

  const oversized = await client.query<{
    reservation_id: string;
    children_count: number;
    occupancy: string;
  }>(
    `select res.id as reservation_id, res.children_count, a.occupancy::text as occupancy
     from reservations res
     join allocations a on a.reservation_id = res.id
     join resources r on r.id = a.resource_id
     where res.tenant_id = $1 and res.location_id = $2 and res.status <> 'cancelled'
       and res.children_count > r.capacity_children
       and (select count(*) from allocations where reservation_id = res.id) = 1`,
    [location.tenant_id, location.location_id],
  );

  for (const row of oversized.rows) {
    const target = await client.query<{ id: string; name: string }>(
      `select r.id, r.name
       from resources r
       where r.tenant_id = $1 and r.location_id = $2 and r.status = 'active' and r.capacity_children >= $3
         and not exists (
           select 1 from allocations other
           where other.resource_id = r.id
             and other.reservation_id <> $4
             and other.occupancy && $5::tstzrange
         )
       order by r.capacity_children, r.name
       limit 1`,
      [location.tenant_id, location.location_id, row.children_count, row.reservation_id, row.occupancy],
    );
    const chosen = target.rows[0];
    const comboId = chosen ? comboIds.get(chosen.name) : undefined;
    if (!chosen || !comboId) {
      throw new Error(`No free table fits reservation ${row.reservation_id}`);
    }
    await client.query(`update allocations set resource_id = $2 where reservation_id = $1`, [row.reservation_id, chosen.id]);
    await client.query(`update reservations set combination_id = $2 where id = $1`, [row.reservation_id, comboId]);
    console.log(`Moved ${row.reservation_id} to ${chosen.name}`);
  }

  await client.query(
    `update reservations res
     set combination_id = chosen.combination_id
     from (
       select res2.id as reservation_id, c.id as combination_id
       from reservations res2
       join allocations a on a.reservation_id = res2.id
       join resources r on r.id = a.resource_id
       join combinations c
         on c.tenant_id = res2.tenant_id
        and c.location_id = res2.location_id
        and c.name = r.name
        and c.status = 'active'
       where res2.tenant_id = $1
         and res2.location_id = $2
         and (select count(*) from allocations where reservation_id = res2.id) = 1
     ) chosen
     where res.id = chosen.reservation_id
       and res.combination_id is distinct from chosen.combination_id`,
    [location.tenant_id, location.location_id],
  );
}

await client.query("commit");
await client.end();
console.log("Floor tables match the drawn seats.");
