# Deploying Masulino

The staff UI and the Node API deploy together. Vercel must not use its Next.js builder: Vinext does not write `.next/routes-manifest.json`. `vercel.json` sets `"framework": null`. When `VERCEL=1`, the Vite build adds Nitro’s Vercel preset and writes the Build Output API to `.vercel/output`. The function region in that output is `fra1`. A local `pnpm build` still uses the Cloudflare plugin and does not call Nitro.

The system of record is Postgres. The Node router in `server/` is the only code that may open it. Vercel hosts that router and can cron it. It is not the user directory and not the role system.

Nothing in this repository publishes itself. The steps below are the ones that need accounts, secrets, and business decisions from you.

## What you need to provide

| Item | Why |
| --- | --- |
| A private Git remote | This export has no hosting identity. Push the repository yourself. |
| Neon Postgres in the EU, close to Frankfurt | Four connection strings, one per role. The migration URL is the direct endpoint. The other three use the pooled endpoint. |
| Role passwords | `masulino_app`, `masulino_auth`, and `masulino_worker` are `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`. The app role must not own the tables. Create them from `scripts/roles.ts` and store only the URLs. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`. Rotating it invalidates sessions and TOTP secrets. |
| `CRON_SECRET` | At least 16 characters from a generator. Vercel cron sends it as `Authorization: Bearer`. |
| `BETTER_AUTH_URL` | The public origin of the staff UI, for example `https://staff.example.tld`. Auth cookies are set for that origin. |
| Vercel project | Connect the Git branch that contains `vercel.json`. Leave the framework preset unset so the file’s `"framework": null` is used. The build command stays `pnpm run build`. Do not set an output directory; Nitro writes `.vercel/output`. Set the function region to `fra1` if the dashboard overrides the file. Do not put `DATABASE_URL_MIGRATE` on the runtime. |
| First owner | Public sign-up is disabled. Bootstrap one owner against the EU database. That Inhaber then creates IT and every later account under IT → Benutzer. Do not run `pnpm db:seed` against Neon. |

Apply `packages/database/migrations/0001_platform.sql` through `0007_birthday_intake.sql` with the direct migration URL before the first request. Run the integration tests against the `masulino_app` role on that database so row-level security is proven there, not only on a laptop.

## Runtime variables

Set these on the API, not in the browser bundle:

- `DATABASE_URL`
- `DATABASE_URL_AUTH`
- `DATABASE_URL_WORKER`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `CRON_SECRET`
- `MASULINO_SITE_KEY` (website server only; the birthday form sends it as `Authorization: Bearer`)
- `MASULINO_PUBLIC_VENUE_SLUG` (the published venue the form books)
- `NODE_ENV=production`

Leave `MASULINO_DEV_SESSION` unset. Production refuses that bypass. Leave `DATABASE_URL_MIGRATE` off the runtime.

Leave `MASULINO_REQUIRE_MFA` unset. Password sign-in is the default for every role, including a production deploy and including people who already enrolled an authenticator. Set `MASULINO_REQUIRE_MFA=1` only when that deployment should ask for a second factor again. `0` is the same as unset.

The UI build does not need a database URL. Signed-in requests call `/api` on the same origin, and the Vercel function runs the Node router for that path. `VITE_MASULINO_FIXTURES` must not be set in production; that flag skips login and shows the demonstration.

`BETTER_AUTH_URL` has to be the origin staff open in the browser, including the `https://` scheme. Preview hostnames are accepted as extra trusted origins from `VERCEL_URL`. They do not replace `BETTER_AUTH_URL`.

Add a Vercel cron for `GET /api/cron/outbox` once the project plan allows the schedule you want. Vercel sends `Authorization: Bearer $CRON_SECRET`. The handler is safe to run twice. It writes local delivery previews. It does not send email, SMS, or push.

## What stays off until you decide

- Venue hours, prices, deposits, cancellation wording, and guest-edit deadlines. Production refuses to confirm a booking on a fixture rule. Record the decisions in `docs/business-decisions.md` before publishing a rule.
- A mailbox, SMS gateway, push provider, card processor, and Ready2Order. Campaign send and booking reminders stay previews. Booked value is not cash received.
- A weather provider. The signed-in workplace does not show the sample forecast.
- A second factor, until you set `MASULINO_REQUIRE_MFA=1`. There is no phishing-resistant key and no helpdesk reset.

## Sign-in

Staff open the workplace with email and password. Inhaber, Verwaltung, IT, Standortleitung, Empfang, Schichtleitung, and Team follow that path. Better Auth stays mounted. The TOTP plugin, the enroll screen, and the code screen run only when `MASULINO_REQUIRE_MFA=1`. While the flag is off, an existing authenticator does not ask for a code or a backup code.

Synthetic `@example.test` accounts have their authenticator rows removed on the next sign-in, through the auth database role. That clears the current IT and owner logins without a backup-code step. Other people’s authenticator secrets stay stored, and they are used again only after the flag is turned on.

When the flag is on, backup codes are shown once at enrollment and stored hashed. The first request after enrollment revokes other sessions that were created before the second factor existed.

A tenant needs at least one active `locations` row. `pnpm bootstrap:owner` creates `hauptstandort`. If an older bootstrap omitted it, run `DATABASE_URL_MIGRATE='…' pnpm db:ensure-location` once.

The next person is created in the signed-in app, not from a laptop. The bootstrapped Inhaber opens IT → Benutzer, enters name, email, role, location when the role needs one, and a password. The account is written to the database this deployment already uses. The password is shown once and stored as a hash. IT can then create IT, Verwaltung, Standortleitung, Schichtleitung, Empfang, and Team. IT cannot create or remove an Inhaber. The last active Inhaber cannot be removed.

`pnpm staff:add` remains only for the case where nobody can sign in. It needs the gitignored migration URL and is not the way to add each person:

```sh
STAFF_ADD_CONFIRM=1 STAFF_EMAIL='user@example.test' STAFF_PASSWORD='password' STAFF_CLEAR_MFA=1 pnpm staff:add
```

Default role is `tenant_owner`. Do not put Neon URLs or passwords in tracked files. Local `pnpm dev:workspace` seeds synthetic logins into the embedded database only. Those rows are not copied to Neon.

## What this hosting still is not

The shell is still the Vinext prototype. Domain packages stay the source of the business rules. Mail, SMS, cards, Ready2Order, and weather stay off. The birthday form routes are on: `GET /api/public/birthdays/times` and `POST /api/public/birthdays` on the same Vercel origin. They write to Neon only after `MASULINO_SITE_KEY`, `MASULINO_PUBLIC_VENUE_SLUG`, migration `0007`, a published non-fixture venue rule, and the Comfort and Deluxe packages are in place. The contract is in the README. The build machine region in the Vercel log is separate from the function region: `fra1` is where the function runs, not necessarily where the build logs say the compiler ran.
