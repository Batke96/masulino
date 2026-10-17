import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadProductionOperatorEnv, loadRootEnv } from "./load-env";

loadRootEnv();
loadProductionOperatorEnv();

/**
 * Add one staff login to the existing production tenant.
 * Put Neon/Vercel URLs once in gitignored `.env.production.local`, then:
 *
 *   STAFF_ADD_CONFIRM=1 STAFF_EMAIL='user@example.test' STAFF_PASSWORD='password' STAFF_CLEAR_MFA=1 pnpm staff:add
 */
if (process.env.STAFF_ADD_CONFIRM !== "1") {
  throw new Error("Set STAFF_ADD_CONFIRM=1 to add a staff user.");
}

const email = process.env.STAFF_EMAIL;
const password = process.env.STAFF_PASSWORD;
const displayName = process.env.STAFF_NAME?.trim() || email?.split("@")[0] || "Staff";
const roleKey = process.env.STAFF_ROLE?.trim() || "tenant_owner";
const allowedRoles = new Set([
  "tenant_owner",
  "tenant_administrator",
  "location_manager",
  "shift_lead",
  "it",
  "reception",
  "employee",
]);
if (!email || !password) {
  throw new Error("STAFF_EMAIL and STAFF_PASSWORD are required.");
}
if (!allowedRoles.has(roleKey)) {
  throw new Error(`STAFF_ROLE must be one of: ${[...allowedRoles].join(", ")}`);
}

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) throw new Error("Missing DATABASE_URL_MIGRATE");

const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();

const tenant = await client.query<{ id: string; name: string }>(
  `select id, name from tenants order by created_at asc limit 1`,
);
if (!tenant.rowCount) {
  throw new Error("No tenant found. Run pnpm bootstrap:owner first.");
}
const tenantId = tenant.rows[0].id;

const { getAuth } = await import("../server/src/auth.ts");
const context = await getAuth().$context;
const hashed = await context.password.hash(password);

const prior = await client.query<{ id: string }>(`select id from identity."user" where email = $1`, [email]);
let userId: string;
if (prior.rowCount) {
  userId = prior.rows[0].id;
  await client.query(
    `update identity.account set password = $1, updated_at = now() where user_id = $2 and provider_id = 'credential'`,
    [hashed, userId],
  );
  // Testing accounts: drop TOTP so MASULINO_REQUIRE_MFA=0 stays password-only.
  if (process.env.STAFF_CLEAR_MFA === "1") {
    await client.query(`update identity."user" set two_factor_enabled = false where id = $1`, [userId]);
    await client.query(`delete from identity.two_factor where user_id = $1`, [userId]);
  }
} else {
  const user = await context.internalAdapter.createUser({
    email,
    name: displayName,
    emailVerified: true,
  });
  await context.internalAdapter.linkAccount({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: hashed,
  });
  userId = user.id;
}

await client.query("begin");
try {
  let principalId: string;
  const existingPrincipal = await client.query<{ id: string }>(
    `select id from principals where issuer = 'urn:masulino:better-auth' and subject = $1`,
    [userId],
  );
  if (existingPrincipal.rowCount) {
    principalId = existingPrincipal.rows[0].id;
    await client.query(
      `update principals set email = $1, display_name = $2 where id = $3`,
      [email, displayName, principalId],
    );
  } else {
    principalId = randomUUID();
    await client.query(
      `insert into principals (id, issuer, subject, email, display_name)
       values ($1, 'urn:masulino:better-auth', $2, $3, $4)`,
      [principalId, userId, email, displayName],
    );
  }

  let membershipId: string;
  const existingMembership = await client.query<{ id: string }>(
    `select id from memberships where tenant_id = $1 and principal_id = $2`,
    [tenantId, principalId],
  );
  if (existingMembership.rowCount) {
    membershipId = existingMembership.rows[0].id;
    await client.query(
      `update memberships set status = 'active', updated_at = now() where id = $1`,
      [membershipId],
    );
  } else {
    membershipId = randomUUID();
    await client.query(
      `insert into memberships (id, tenant_id, principal_id, status) values ($1, $2, $3, 'active')`,
      [membershipId, tenantId, principalId],
    );
  }

  const grant = await client.query(
    `select id from grants where tenant_id = $1 and membership_id = $2 and role_key = $3`,
    [tenantId, membershipId, roleKey],
  );
  if (!grant.rowCount) {
    await client.query(
      `insert into grants (tenant_id, membership_id, role_key) values ($1, $2, $3)`,
      [tenantId, membershipId, roleKey],
    );
  }

  await client.query(
    `insert into audit_events (tenant_id, actor_principal_id, action, target_type, target_id, outcome, correlation_id, changes)
     values ($1, $2, 'core.staff.add', 'principal', $3, 'success', $4, $5::jsonb)`,
    [
      tenantId,
      principalId,
      principalId,
      randomUUID(),
      JSON.stringify({ email, roleKey }),
    ],
  );
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
}

await client.end();
console.log(`Staff ready: ${email} (${roleKey}) on tenant ${tenant.rows[0].name}.`);
