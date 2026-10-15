# Domain handover

This file is the portable contract for the Masulino ERP that already exists in this repository. It describes identity, authorization, tenancy, persistence, and the business invariants through Stage 4. Take it, together with the framework-free packages named below, into the repository that owns the staff interface.

The visual system, navigation, German copy, and interaction patterns stay with that interface. This repository’s pages, workspace shell, demo screens, and theme package are not part of the move.

Last aligned with the code on 7 October 2026. Where this file and the code disagree, the code wins: `packages/core/src/authz/policy.ts`, the SQL migrations under `packages/database/migrations`, and the application services under `packages/modules`.

## What to carry

Lift these packages as they are. They do not import React.

| Package | Keep because |
| --- | --- |
| `packages/contracts` | Action keys, role keys, module registry, Zod inputs, money, `AppError` |
| `packages/core` | `authorize`, invitations, actor loading, audit, outbox drain |
| `packages/database` | Pools, transaction-local tenant context, reviewed SQL |
| `packages/modules/reservations` | Booking, guest links, delivery, daily read model, booked value |
| `packages/modules/contacts` | Adult contacts and append-only consent |
| `packages/modules/marketing` | Audience, draft, approval, local send preview |
| `packages/modules/loyalty` | Survey reward and append-only ledger |
| `packages/modules/workforce` | Availability, plans, punches, kiosk capabilities |
| `packages/modules/operations` | Assigned checklists and open issues |
| `packages/modules/notices` | Holiday notices and HTML sanitizing |
| `packages/verticals/indoor-play` | Deterministic table allocation. Injected into reservations. Reservations does not import it |
| `packages/i18n` | Translation keys only, if the new shell wants the same German strings |

Leave behind `apps/web/src/app`, `apps/web/src/workspace`, `packages/ui`, and `packages/theme`. The new shell calls the same services. It does not reimplement pricing, allocation, consent, or permissions in components.

`masulino-source/` in this repository is a snapshot of the interface prototype (Vite, Vinext, shadcn, client-side demo state). Its `AGENT_HANDOFF.md` describes screens and sample numbers. Those numbers are fixtures. They are not venue rules, campaign rules, or permissions.

## Shape on the new interface

```text
Browser (existing React shell)
  → server adapter (route handler, server action, or a small Node API)
      → application service in packages/modules or packages/core
          → authorize()
          → withTenant() / withPublic() / withIdentity()
          → Neon Postgres
      → transactional outbox row
  → cron drain reads the outbox and calls the same services
```

The browser never opens Neon, never evaluates the permission matrix, and never treats a demo button as a committed booking, campaign, schedule, or redemption.

The interface prototype can keep running on its current frontend toolchain. The domain services need a Node.js process that can hold one Postgres transaction. That is the existing Next.js server on Vercel, region `fra1`, or another Node adapter that imports the same packages. Cloudflare Workers and the prototype’s unused D1 schema are not the system of record. A worker runtime can render the shell. It should call the Node adapter for anything that writes or reads tenant data.

Vercel in the accepted ADR (`docs/adr/0001-nextjs-vercel-composition-root.md`) is hosting and cron. It is not the user directory and not the role system.

## What already works

Stages 0–3 are complete against synthetic data. Stage 4 has contacts, consent, campaigns, loyalty, booked value, and a proved booking claim. Ready2Order is not connected. No live email or SMS is sent. Production confirmation refuses a fixture rule set.

Two synthetic tenants exist. The pilot tenant has the later modules enabled. The second tenant does not. Cross-tenant reads return no rows. A revoked membership cannot act. A reception user can book. An employee cannot. Guests book without an account. A booking reference or an email address never authorizes a read or a change.

## 1. Three separate controls

Enterprise behavior in this codebase is three checks that never collapse into one flag.

| Control | Question it answers | Where it lives |
| --- | --- | --- |
| Membership | Is this person still allowed into this tenant? | `memberships.status` is `active`, `suspended`, or `revoked` |
| Entitlement | Did this business buy or enable the module? | `module_entitlements`, default off except `core` and `reservations` |
| Permission | May this role do this action at this location? | `authorize()` and `permissionMatrix` |

An enabled module does not authorize a user. A role grant does not enable a module. A feature flag, a hidden nav item, or a demo toggle never replaces either check. UI visibility is a reflection of `allowedActions(actor)` after the server has loaded the actor. Every mutation calls `requirePermission` again inside the application service.

Module dependencies are declared, not implied:

```75:87:packages/contracts/src/permissions.ts
export const moduleRegistry: readonly ModuleDefinition[] = [
  { id: "core", dependencies: [], defaultEnabled: true },
  { id: "reservations", dependencies: ["core"], defaultEnabled: true },
  { id: "contacts", dependencies: ["core"], defaultEnabled: false },
  { id: "notifications", dependencies: ["core"], defaultEnabled: false },
  { id: "workforce", dependencies: ["core"], defaultEnabled: false },
  { id: "marketing", dependencies: ["contacts"], defaultEnabled: false },
  { id: "loyalty", dependencies: ["contacts"], defaultEnabled: false },
  { id: "operations", dependencies: ["core"], defaultEnabled: false },
  { id: "purchasing", dependencies: ["core"], defaultEnabled: false },
  { id: "content", dependencies: ["core"], defaultEnabled: false },
];
```

Disabling a module rejects new work inside the tenant transaction and leaves existing rows in place. A disabled `reservations` module fails queued delivery jobs and does not write a preview.

## 2. Identity is a login. Authorization is a grant.

Better Auth stores users, sessions, password hashes, and TOTP in the Postgres schema `identity`. Public sign-up is disabled. Staff enter through an invitation. The issuer for mapped users is the constant `urn:masulino:better-auth`.

A principal is `(issuer, subject)`. Email is an attribute on the principal and on the invitation. It is not the authorization key. The same human can hold memberships in more than one tenant. Switching tenants clears the previous tenant context. It does not reuse a cached actor.

Better Auth organization tables (`identity.organization`, `identity.member`, roles `owner` / `admin` / `member`) exist because the library creates them. Masulino never consults them. Roles live in `grants.role_key`.

Privileged roles are `tenant_owner`, `tenant_administrator`, and `location_manager`. `authorize` returns `mfa` for any of their actions until the session has a completed second factor. A sign-in that still needs that factor stays on the second-factor step. Recovery codes and phishing-resistant methods are not built yet. Do not bypass the MFA check to make a manager screen reachable.

Sessions are server-managed HttpOnly cookies from Better Auth. Privileged bearer tokens do not go in `localStorage`. The new shell should keep that. A shared tablet is a kiosk device cookie, described below, and is a different cookie from the staff session.

### Invitation rules

- The token is 32 random bytes, base64url. The database stores SHA-256 only.
- Lookup goes through `app.lookup_invitation(hash)`, a `SECURITY DEFINER` function that returns one unaccepted, unrevoked, unexpired row.
- Acceptance checks that the signed-in email matches the invitation email, inserts one membership if needed, inserts the grant, and stamps `accepted_at` only when it is still null.
- Location roles require a location. Owner and administrator grants are tenant-wide (`location_id` null).
- An administrator may invite only `shift_lead`, `reception`, and `employee`. An administrator cannot grant owner, administrator, or location manager.
- Revoking the last active owner is rejected (`last_owner`).

`canAssignRole` is the grant boundary. It is separate from `authorize(..., "core.users.invite")`.

## 3. The authorization decision

`authorize` is deny-by-default and pure. It has no database access. The service loads an `ActorContext` once per request and passes it in. That keeps permission checks off the critical query path: after the load, every button and every mutation is an in-memory decision.

Order of failure, which the interface can show as distinct states:

1. `membership` — suspended or revoked.
2. `entitlement` — module off for this tenant.
3. `mfa` — privileged role without a second factor.
4. `permission` — no grant covers the action.
5. `location` — the grant is for another location, or the caller omitted a location.

```269:307:packages/core/src/authz/policy.ts
export function authorize(input: AuthzInput, action: Action): AuthzDecision {
  if (input.membershipStatus !== "active") {
    return { allow: false, reason: "membership" };
  }

  const moduleId = moduleForAction(action);
  if (input.entitlements[moduleId] !== true) {
    return { allow: false, reason: "entitlement" };
  }

  if (holdsPrivilegedRole(input.grants) && !input.mfaSatisfied) {
    return { allow: false, reason: "mfa" };
  }

  const matching = input.grants.filter(
    (grant) => permissionMatrix[grant.roleKey][action] !== "none",
  );
  if (matching.length === 0) {
    return { allow: false, reason: "permission" };
  }

  const tenantWide = matching.some(
    (grant) =>
      permissionMatrix[grant.roleKey][action] === "tenant" && grant.locationId === null,
  );
  if (tenantWide) return { allow: true };

  if (!input.locationId) {
    return { allow: false, reason: "location" };
  }

  const atLocation = matching.some(
    (grant) =>
      permissionMatrix[grant.roleKey][action] === "location" &&
      grant.locationId === input.locationId,
  );
  if (atLocation) return { allow: true };
  return { allow: false, reason: "location" };
}
```

Scope values in the matrix are `tenant`, `location`, or `none`. A tenant-wide allow requires a grant whose `locationId` is null. A location allow requires the grant’s location to equal the location on the call. A person with two grants is evaluated across all of them. There is no `isAdmin`.

Services call this, and then throw a stable error:

```20:25:packages/core/src/platform.ts
export function requirePermission(actor: ActorContext, action: Action, locationId?: string | null): void {
  const decision = authorize({ ...actor, locationId: locationId ?? null }, action);
  if (!decision.allow) {
    throw new AppError("forbidden", decision.reason);
  }
}
```

The route slug, a client header, and a form field choose the tenant and location. They do not prove them. `loadActor` reads membership, grants, and entitlements only after `withTenant(tenantId)` has set the database context, and only for a principal the session already mapped.

### Role matrix

Scope in the table: **T** tenant-wide, **L** the granted location, blank means denied. Privileged roles still need MFA before any allow. The full matrix and its tests are `packages/core/src/authz/policy.ts` and `policy.test.ts`. `docs/permissions.md` matches them.

| Action | Owner | Admin | Manager | Shift lead | Reception | Employee |
| --- | --- | --- | --- | --- | --- | --- |
| Booking read | T | T | L | L | L | |
| Booking create, update, cancel | T | T | L | | L | |
| `resources.manage` | T | T | L | | | |
| Invite users | T | T | | | | |
| Manage roles | T | | | | | |
| Read memberships, settings | T | T | L | | | |
| Read audit | T | | | | | |
| Notice read | T | T | L | L | L | |
| Notice manage, publish | T | T | L | | | |
| Availability read | T | | L | | | L |
| Availability write | T | | | | | L |
| Schedule read | T | | L | L | | L |
| Schedule propose, publish | T | | L | | | |
| Time read | T | | L | L | | L |
| Time record, correct | T | | | | | L |
| Time approve | T | | L | | | |
| Compensation read | T | | | | | |
| Checklist read, complete | T | | L | L | | L |
| Checklist manage | T | | L | | | |
| Consent read, write | T | | | | | |
| Audience read, campaign draft | T | | L | | | |
| Campaign approve, send | T | | | | | |
| Loyalty read, issue, redeem | T | | | | | |
| Booked value read | T | | L | | | |

Administrators do not receive workforce, checklist, consent, marketing, loyalty, or booked-value actions in the default templates. Compensation is the owner template only. No hourly rate is stored, so a compensation screen shows an estimate label and no amount.

### Rules the matrix does not express

The matrix is the action gate. These record rules live in the services and in SQL. The new interface must call the service and render the result. It must not loosen them in the client.

- An employee writes availability and time only for themselves. Schedule read for an employee returns that employee’s published shifts. Draft plans stay with propose or publish.
- Time punches are insert-only. A correction is a new request. Approval requires `workforce.time.approve` and a different principal from the requester. The original punch remains.
- Publishing a weekly plan is its own audited action. A rejected publish leaves the previous published plan. Publishing the same version twice writes one audit row.
- A campaign approver is a different principal from the drafter. Audience membership is recomputed at send time from the latest marketing consent row. Withdrawal wins. Historical contacts stay out until a granted marketing row exists. Booking consent does not qualify. A send writes a local preview. It never records `delivered`.
- A loyalty issue requires `loyalty.reward.issue` plus a completed reservation or a staff verification row. A guest cannot insert that verification. Redemption locks the account row and appends one ledger entry.
- A booking claim attaches the one reservation proved by a live session token. A second claim of the same token fails. Another reservation with the same email is not attached.
- Guest edits apply only to phone and notes. Date, party size, package, email, and cancellation become staff tasks and do not release the table. `guestMayMoveReservation()` returns false.
- Booked value is the sum of confirmed reservation price snapshots for a location and a venue-local date range. Payments, reportable sales, and refunds are separate rows in `financial_facts`. With no payment source those totals stay absent. The screen shows no invented amount.

## 4. Actors that are not staff

The permission matrix covers staff principals. Four other capabilities exist. Each is narrow, hashed, expiring, and checked on the server.

| Actor | Secret | What it may do |
| --- | --- | --- |
| Guest booking capability | HttpOnly cookie, scoped to the public booking path | Create one booking at one published venue. Idempotency is scoped to this cookie, not to the email |
| Booking exchange token | 32 random bytes in the link. SHA-256 stored. Purpose `exchange`. Seven days | `GET` previews and does not consume it. `POST` consumes it once and issues a session token |
| Booking session | HttpOnly cookie. Purpose `session`. Thirty minutes | Read that booking and apply the narrow guest patch |
| Kiosk device | HttpOnly cookie, hashed, revocable | Submit one punch capability. No bookings, contacts, or wages |
| Punch capability | Single-use, five minutes, issued by the employee’s phone session | One clock-in or clock-out, then the tablet returns to locked |

A booking reference such as `MS-…` is a human label. It is unique per tenant and is not a lookup secret. Email is not a lookup secret. Guessed, expired, revoked, replayed, and wrong-purpose tokens fail closed.

Public reads that must happen before a tenant is known go through `withPublic` and a `SECURITY DEFINER` function that returns one row: `app.lookup_published_venue`, `app.lookup_booking_token`, `app.lookup_kiosk_device`, `app.lookup_punch_capability`. Writes then continue inside `withTenant`. The raw token is the secret. The function receives the hash.

Availability responses contain no other guest’s name, contact, or booking reference. Availability is advisory until the confirmation transaction commits.

## 5. Neon as the system of record

Deployment database: Neon Postgres in the EU, close to Vercel `fra1` (Frankfurt). Development and integration tests use local Postgres on `127.0.0.1:54329`. The SQL is ordinary Postgres. Neon-specific behavior is the connection, not a second schema.

### Four credentials

| Env var | Role | Neon endpoint | Used by |
| --- | --- | --- | --- |
| `DATABASE_URL` | `masulino_app` | Pooled (`-pooler` host) | Request path |
| `DATABASE_URL_AUTH` | `masulino_auth` | Pooled | Better Auth, schema `identity` only |
| `DATABASE_URL_WORKER` | `masulino_worker` | Pooled | Outbox claim and status updates |
| `DATABASE_URL_MIGRATE` | Database owner | Direct, not pooled | Migrations and seed. Never on the Next.js runtime |

Create the three runtime roles as `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`. The local helper is `scripts/roles.ts`. On Neon, create the same roles with generated passwords and put each connection string in the matching env var. The app role must not own the tables. Table ownership stays with the migration role so a bug in application SQL cannot drop schema.

`FORCE ROW LEVEL SECURITY` is on every tenant table. Missing `app.context` matches no policy, so the query returns no rows. That is the fail-closed behavior. Test it with the real `masulino_app` role. A superuser connection or an ORM that bypasses RLS does not count as evidence.

The request pool is one connection per serverless instance:

```28:36:packages/database/src/client.ts
export function getPool(role: DatabaseRole): Pool {
  const existing = pools.get(role);
  if (existing) return existing;
  const pool = new Pool({
    connectionString: databaseUrl(role),
    max: process.env.VERCEL ? 1 : 8,
  });
  pools.set(role, pool);
  return pool;
}
```

`max: 1` on Vercel keeps a Fluid or serverless instance from opening a pile of Neon connections. Locally, 8 is enough for the app and the integration tests. Neon’s pooled endpoint already multiplexes. Do not also point the app at the direct endpoint, or autoscaling instances will exhaust connections.

Neon’s pooler is transaction-mode. Session state dies when the transaction ends, and a later request may land on another server connection. Tenant context is therefore transaction-local (`set_config` third argument `true`). Session-level `SET` is unsafe here and is not used.

```49:58:packages/database/src/context.ts
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(tenantId, "tenant id");
  return getAppDb().transaction(async (tx) => {
    await applySettings(tx, {
      ...cleared,
      "app.context": "tenant",
      "app.tenant_id": tenantId,
    });
    return fn(tx);
  });
}
```

Every entry point clears `app.context`, `app.tenant_id`, `app.principal_id`, `app.subject`, `app.issuer`, and `app.worker_purpose` before setting the ones it needs. Contexts are `tenant`, `identity`, `public`, and `worker`. The worker context only sets `app.worker_purpose = outbox_drain` and uses the worker role, which can select and update `outbox_jobs` and cannot read reservations.

Drizzle is the query layer. Constraints, RLS, exclusion constraints, and append-only triggers are reviewed SQL in `packages/database/migrations`. Do not let a generated migration drop or rewrite those policies. Never edit a migration that has already been applied to a shared database.

If the new server uses `node-postgres` against the Neon pooler, keep each use case inside one `withTenant` transaction so prepared statements and `set_config` share one server connection for that transaction. Do not open a transaction, call an external API, and then write. External work belongs in the outbox after commit.

### Tables and constraints that carry the business

Every tenant-owned row has a non-null `tenant_id`. Location-owned rows also have `location_id`. Foreign keys that point at tenant data use the composite `(tenant_id, id)`, so a reservation cannot reference another tenant’s location, package, or table. Identity tables in schema `identity` are global and are readable only by `masulino_auth`.

Platform tables from `0001_platform.sql`: `principals`, `tenants`, `locations`, `memberships`, `grants`, `module_entitlements`, `staff_invitations`, `audit_events`, `security_events`, `outbox_jobs`.

Audit and security logs have a `BEFORE UPDATE OR DELETE` trigger that raises `append-only table`. The app role may insert audit rows and may select them inside the tenant. It cannot update or delete them. Security events allow a null tenant so a failed login can be recorded before a tenant is known. Changes stored in audit JSON pass through `redactChanges`, which replaces values whose keys match email, phone, password, token, secret, cookie, authorization, or notes.

Reservation occupancy is a half-open `tstzrange` (`[)`). One exclusion constraint is the concurrency control for the last table:

```151:156:packages/database/migrations/0002_reservations.sql
  CONSTRAINT allocations_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    location_id WITH =,
    resource_id WITH =,
    occupancy WITH &&
  )
```

`btree_gist` must be available (it is on Neon and on the local image). The application also checks occupancy before insert. That check is an optimization so the user can see alternatives. The constraint is what makes two concurrent confirms produce one winner. Postgres error `23P01` is mapped back to a conflict response with suggested slots. The loser does not keep a partial allocation, because the insert of the reservation, its allocations, the audit row, and the outbox rows is one transaction.

Customer-facing `starts_at` / `ends_at` and the buffered occupancy interval are different columns. Buffers live in the published rule snapshot used for that booking. Editing the current rule does not rewrite old reservations.

Other integrity patterns already in the migrations:

- Idempotency: `UNIQUE (tenant_id, actor_key, idempotency_key)` plus a payload hash. The same key and the same hash returns the original booking. The same key and a different hash is `idempotency_mismatch`.
- Optimistic edits: `reservations.version` is checked in the `UPDATE`. A stale staff or guest edit returns `stale` and leaves the row unchanged.
- Punches, consent rows, and loyalty entries are append-only. Corrections, withdrawals, and reversals are new rows.
- Loyalty redemption does `SELECT … FOR UPDATE` on the account, then reads the balance, then inserts. Two concurrent redemptions cannot both spend the same units.
- Outbox claim is `FOR UPDATE SKIP LOCKED LIMIT 10`, then a status update to `claimed`. Retry uses exponential backoff from `attempts`. The handler rechecks reservation status and version before writing a preview.

Money is integer minor units and a currency code. The pilot currency is EUR. There is no floating-point money math. Prices on a booking are snapshots (`price_minor_snapshot`, `currency_snapshot`, `rule_version_snapshot`, `package_name_snapshot`).

Time is stored as `timestamptz` in UTC. Each location has an IANA timezone. The pilot default is `Europe/Berlin`. Local calendar dates, opening hours, and the reminder instant (09:00 on the previous local day) are computed with Luxon in `packages/modules/reservations/src/time.ts`. Test a daylight-saving date when changing that code. A booking that would cross local midnight is rejected.

### Read paths that stay fast

The daily plan is one indexed read, not a per-booking round trip:

```sql
CREATE INDEX reservations_daily_idx
  ON reservations (tenant_id, location_id, local_date, starts_at);
```

Load the actor once. `allowedActions` then filters the navigation in memory. Do not issue a permission query per tile.

Public availability is safe to cache for a few seconds, keyed by published slug, local date, and party size, because it contains no personal data. The confirm path ignores that cache and takes the exclusion constraint. Staff pages, booking detail, audiences, and the ledger are not public cache entries. Do not put them on a shared CDN cache.

Neon suspends idle compute. The first request after a quiet period pays a cold start. Keep the shell paintable from the session, and load the day list as its own request, so a cold database delays the list and not the whole frame. Keep transactions short: authorize, read the rows you will lock, write, audit, outbox, commit. The indoor-play allocator is a pure function over data already loaded in that transaction, so it does not add a network hop.

Rate limits for guest and staff booking are rows in `rate_buckets`, incremented inside the same transaction. They do not need Redis for the current volume.

## 6. Booking invariants to preserve

`createStaffBooking` and `createGuestBooking` share `createReservation`. Staff must pass `requirePermission(..., "reservations.booking.create", locationId)`. A guest must present a capability whose location matches the input, with source channel `guest_web` and mode `confirm`.

Inside one `withTenant` transaction the service:

1. Replays or rejects the idempotency key.
2. Checks the module and, for a guest, the published venue.
3. Loads the package, the published rule, combinations, and current occupancy.
4. Rejects a party size outside the package.
5. For `confirm`, calls the injected `allocate` function. Failure returns alternatives and writes nothing.
6. Inserts the reservation with snapshots and version 1.
7. Inserts one allocation row per table in the chosen combination, using `tstzrange(..., '[)')`.
8. Inserts preparation tasks and the confirmation plus reminder outbox rows when status is `confirmed`.
9. For a guest, inserts the exchange-token hash and returns the raw token once.
10. Inserts the idempotency row and the audit row.

A `requested` booking is not a confirmation and does not hold tables. Confirmed status requires the allocations. Payment state is not on the reservation. There is no card data and no deposit capture.

The allocator is deterministic and has no I/O. Hard constraints are opening hours, closures, party size, active resources, child capacity, configured adult seating, and existing occupancy including buffers. Feasible combinations sort by least unused child capacity, then name, then id. Soft preferences never override a hard constraint. The composition root passes `allocate` from `packages/verticals/indoor-play` into the reservations service. Reservations must not import the vertical. Core must not import either.

Production publication of a rule calls `assertCanUsePublishedRule`. In `NODE_ENV=production` the rule needs `businessDecisionsConfirmed`, a cancellation policy, and `fixture = false`. Development fixtures may confirm. A live venue may not, until those decisions are recorded in `docs/business-decisions.md`.

Reschedule locks the reservation (`FOR UPDATE`), checks version and permission, computes a new allocation, and replaces rows in the same transaction. A failed move, including an exclusion-constraint failure, rolls back. The original reservation and its allocations stay. Cancel and reschedule cancel the queued reminder. The reminder job is bound to the reservation version. The delivery handler writes a German local preview. Statuses are `queued`, `previewed`, `failed`, and `cancelled`. A provider accept is not a status this system records, because no provider is called.

The preparation sheet is a snapshot of the daily read model without email, created by `POST`. A later reservation version marks that snapshot stale. A `GET` does not regenerate it.

## 7. How modules talk

A module does not read another module’s tables. The composition root wires a small function:

| Port | From | To | Why |
| --- | --- | --- | --- |
| `Allocate` | indoor-play | reservations | Table choice stays industry-specific |
| `BookingFactsLoader` | reservations read | workforce | A weekly plan sees confirmed booking counts and does not allocate tables |
| `EligibilityReader` | contacts | marketing | Send-time audience without a marketing import of contact tables |
| `ReservationLookup` | reservations read | loyalty | A reward requires a real reservation status |
| `BookingProofReader` | guest session | loyalty claim | A claim requires the proved booking, not a shared email |

Cross-module writes that must succeed together share the `Tx` argument. Side effects after commit are outbox jobs. The cron route is `GET /api/cron/outbox` with `Authorization: Bearer $CRON_SECRET`. The handler is idempotent. Draining twice does not write two previews.

## 8. Errors the interface should render

`AppError` codes are the whole vocabulary. Map them to German copy in the shell. Do not parse English exception text.

| Code | Meaning for the screen |
| --- | --- |
| `unauthenticated` | Session missing or expired. Send the person to login |
| `forbidden` | `details` is the authz reason: membership, mfa, entitlement, permission, location |
| `validation` | Field-level problem. Keep the form values |
| `conflict` | Capacity, replayed token, or insufficient loyalty balance. Bookings include `alternatives` |
| `not_found` | Hidden on purpose for bad links, so guests cannot tell expired from unknown |
| `incomplete_rules` | Staff configuration is not publishable. List `missing` |
| `idempotency_mismatch` | The same submit key was reused with different fields |
| `stale` | Someone else saved first. Reload the version the server returns |
| `last_owner` | The tenant would have no owner |
| `rate_limited` | Ask them to wait. Do not queue a silent retry that creates a second booking |

Generate the idempotency key once, in the browser, when the person opens the form. Send that same key on every retry of that submit. A double click and a lost response then return the original booking with `replayed: true`.

Do not show a success state for a booking, a published plan, a sent campaign, a redemption, or a permission change before the server responds. Disable the button when the request is in flight so the interface feels immediate, and treat the response as the truth. On `conflict`, put the alternatives next to the fields the person already typed.

`allowedActions` drives which apps and buttons render. A direct URL to a denied action still hits `requirePermission` and renders the access-denied state. Deep links in the new shell need the same server check. Client-side route state in the prototype does not.

## 9. Suggested build order on the new shell

Keep the prototype’s components and tokens. Replace demo state one workflow at a time. Leave the other tiles on fixtures until their service exists.

1. Stand up Neon in EU. Create the three runtime roles and the migration role. Apply `0001` through `0005` with the direct URL. Run the existing integration tests against `masulino_app` so RLS and the last-slot race are proven on Neon, not only on local Postgres.
2. Mount Better Auth on the Node adapter. Map the session to a principal. Load memberships. Require MFA before any privileged `allowedActions` entry is non-empty.
3. Render the shell’s navigation from `allowedActions`. Wire tenant and location selection to `loadActor`. A revoked user and the other tenant’s URL must fail.
4. Replace the demo booking list and create flow with `dailyView`, `readReservation`, and `createStaffBooking`. Pass `allocate` from indoor-play. Keep the idempotency key and the conflict alternatives.
5. Add the public booking path and the exchange-token POST as separate routes from the staff shell, with separate cookies.
6. Add delivery status and the preparation-sheet POST when the daily view is real.
7. Add workforce and checklists only after bookings are stable. The kiosk stays a separate cookie and a locked screen.
8. Add contacts, campaign preview, loyalty, and booked value last. They already have services. Their rules are still proposed, and the screens must say so. Do not connect a campaign button to a real mailbox.

Each step keeps the package boundary check (`pnpm boundaries`), the policy unit tests, and a Postgres integration test for the invariant you touched. A mocked database does not prove tenant isolation or the exclusion constraint.

## 10. Still open

These are real gaps. The new interface should not paper over them with sample copy.

- Neon is not provisioned. Vercel production deploy still needs the GitHub Actions secrets in `docs/deploy.md`.
- Venue tables, hours, prices, deposits, cancellation wording, and guest edit deadlines are proposed. Fixtures demonstrate them. Production must keep rejecting them until a decision is confirmed.
- MFA recovery beyond one-time backup codes is not designed. Privileged roles must enroll TOTP before `mfaSatisfied` is true. Phishing-resistant keys and a helpdesk reset do not exist.
- Content-Security-Policy still allows inline scripts. Production should move to a nonce when the new shell’s framework supports it.
- Combined-table overlap has unit coverage and the exclusion constraint, and still wants a dedicated integration test.
- There is no staff screen to edit resources and packages. Seed SQL creates the fixture venue.
- Ready2Order is not integrated. Do not invent endpoints. Booked value, payments, sales, and refunds stay separate facts.
- No live email, SMS, push, or card payment exists. A preview is not delivery.
- Purchasing suggestions, weather-driven campaigns, and AI actions are not built. When they are, a model may draft a proposal. The service rechecks permission, entitlement, consent, and capacity at approval time and again before a delayed send, and writes an audit row. The model does not grant roles, publish, price, approve time, refund, or order.

## Source map

| Concern | File |
| --- | --- |
| Decision function and matrix | `packages/core/src/authz/policy.ts` |
| Actor load, invite, audit, outbox | `packages/core/src/platform.ts` |
| Transaction context | `packages/database/src/context.ts` |
| Pools and roles | `packages/database/src/client.ts`, `scripts/roles.ts` |
| SQL | `packages/database/migrations/0001_platform.sql` through `0005_customers.sql` |
| Booking transaction | `packages/modules/reservations/src/booking.ts` |
| Guest tokens | `packages/modules/reservations/src/access.ts` |
| Allocation policy | `packages/verticals/indoor-play/src/allocate.ts` |
| Consent eligibility | `packages/modules/contacts/src/consent.ts` |
| Ledger lock | `packages/modules/loyalty/src/ledger.ts` |
| Human-readable matrix | `docs/permissions.md` |
| Threats and residual risk | `docs/threat-model.md` |
| Hosting decision | `docs/adr/0001-nextjs-vercel-composition-root.md` |
