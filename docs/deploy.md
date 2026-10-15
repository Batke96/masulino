# Deploying Masulino

The staff UI can be built with the current Vite toolchain. Tenant data does not live in that build. The system of record is Postgres, and the Node API in `server/` is the only process that may open it. Vercel can host that Node API and a cron drain. It is not the user directory and not the role system.

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
| Vercel project in region `fra1` | Host the Node API. Do not put `DATABASE_URL_MIGRATE` on the runtime. |
| First owner invitation | Public sign-up is disabled. Bootstrap one owner against the EU database, then invite everyone else. Do not run `pnpm db:seed` against Neon. |

Apply `packages/database/migrations/0001_platform.sql` through `0006_mfa_session.sql` with the direct migration URL before the first request. Run the integration tests against the `masulino_app` role on that database so row-level security is proven there, not only on a laptop.

## Runtime variables

Set these on the API, not in the browser bundle:

- `DATABASE_URL`
- `DATABASE_URL_AUTH`
- `DATABASE_URL_WORKER`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `CRON_SECRET`
- `NODE_ENV=production`

Leave `MASULINO_DEV_SESSION` unset. Production refuses that bypass. Leave `DATABASE_URL_MIGRATE` off the runtime.

The UI build does not need a database URL. It calls `/api` on the same origin. Point that path at the Node API. `VITE_MASULINO_FIXTURES` must not be set in production; that flag skips login and shows the demonstration.

Cron calls `GET /api/cron/outbox` with the bearer secret. The handler is safe to run twice. It writes local delivery previews. It does not send email, SMS, or push.

## What stays off until you decide

- Venue hours, prices, deposits, cancellation wording, and guest-edit deadlines. Production refuses to confirm a booking on a fixture rule. Record the decisions in `docs/business-decisions.md` before publishing a rule.
- A mailbox, SMS gateway, push provider, card processor, and Ready2Order. Campaign send and booking reminders stay previews. Booked value is not cash received.
- A weather provider. The signed-in workplace does not show the sample forecast.
- MFA recovery beyond the one-time backup codes shown at enrollment. There is no phishing-resistant key and no helpdesk reset.

## Second factor

Inhaber, Verwaltung, and Standortleitung cannot open the workplace until they enroll TOTP. Empfang, Schichtleitung, and Team do not. Backup codes are shown once and stored hashed. The first request after enrollment revokes other sessions that were created before the second factor existed.

## Still not production hosting

This tree still builds through Vinext for the interactive shell. That is a prototype runtime. The domain packages are what you keep. A later move of the shell onto the Next.js app that Vercel already expects is a separate change from connecting a real workflow.
