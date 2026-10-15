import { randomUUID, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { loadRootEnv } from "./load-env";

loadRootEnv();

const expected = process.env.BOOTSTRAP_TOKEN;
const provided = process.env.BOOTSTRAP_TOKEN_CONFIRM;
if (!expected || !provided || expected.length < 16 || !safeEqual(expected, provided)) {
  throw new Error("Set BOOTSTRAP_TOKEN and BOOTSTRAP_TOKEN_CONFIRM to the same one-time secret.");
}
const email = process.env.BOOTSTRAP_OWNER_EMAIL;
const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
const tenantName = process.env.BOOTSTRAP_TENANT_NAME;
if (!email || !password || password.length < 12 || !tenantName) {
  throw new Error("BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD and BOOTSTRAP_TENANT_NAME are required.");
}
const migrateUrl = process.env.DATABASE_URL_MIGRATE;
if (!migrateUrl) throw new Error("Missing DATABASE_URL_MIGRATE");

const client = new pg.Client({ connectionString: migrateUrl });
await client.connect();
const existing = await client.query(`select id from grants where role_key = 'tenant_owner' limit 1`);
if (existing.rowCount) {
  throw new Error("An owner grant already exists. Bootstrap is single-use.");
}
const { getAuth } = await import("../server/src/auth.ts");
const context = await getAuth().$context;
const hashed = await context.password.hash(password);

// A previous failed run may have created the auth user before the domain txn committed.
const prior = await client.query<{ id: string }>(`select id from identity."user" where email = $1`, [email]);
let userId: string;
if (prior.rowCount) {
  userId = prior.rows[0].id;
  await client.query(
    `update identity.account set password = $1, updated_at = now() where user_id = $2 and provider_id = 'credential'`,
    [hashed, userId],
  );
} else {
  const user = await context.internalAdapter.createUser({ email, name: email, emailVerified: true });
  await context.internalAdapter.linkAccount({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: hashed,
  });
  userId = user.id;
}

const tenantId = randomUUID();
const principalId = randomUUID();
const membershipId = randomUUID();
const correlationId = randomUUID();
await client.query("begin");
try {
  await client.query(`insert into tenants (id, slug, name) values ($1, $2, $3)`, [
    tenantId,
    slugify(tenantName),
    tenantName,
  ]);
  await client.query(
    `insert into principals (id, issuer, subject, email, display_name) values ($1, 'urn:masulino:better-auth', $2, $3, $3)`,
    [principalId, userId, email],
  );
  await client.query(
    `insert into memberships (id, tenant_id, principal_id, status) values ($1, $2, $3, 'active')`,
    [membershipId, tenantId, principalId],
  );
  await client.query(
    `insert into grants (tenant_id, membership_id, role_key) values ($1, $2, 'tenant_owner')`,
    [tenantId, membershipId],
  );
  await client.query(
    `insert into module_entitlements (tenant_id, module_id, enabled) values ($1, 'core', true), ($1, 'reservations', true)`,
    [tenantId],
  );
  // target_id is text; tenant_id is uuid — reuse of $1 makes Postgres reject the statement.
  await client.query(
    `insert into audit_events (tenant_id, actor_principal_id, action, target_type, target_id, outcome, correlation_id, changes)
     values ($1, $2, 'core.bootstrap.owner', 'tenant', $3, 'success', $4, '{}'::jsonb)`,
    [tenantId, principalId, tenantId, correlationId],
  );
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
}
await client.end();
console.log(`Bootstrapped owner ${email}. Unset BOOTSTRAP_TOKEN.`);

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant";
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
