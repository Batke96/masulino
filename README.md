# Masulino UI prototype

The editable source of the Masulino staff workspace: a German-language ERP concept for an indoor children's playground. Start here, then read `AGENT_HANDOFF.md` and `AGENTS.md` before changing the code.

## Run locally

Prerequisites: Node.js **22.13.0 or newer**, and **pnpm 11.25.0** (the version declared in `package.json`). The existing project requires network access to the package registry for the first installation. Keep the supplied lockfile.

If pnpm is missing, install the pinned version using your Node installation:

```sh
npm install --global pnpm@11.25.0
```

From the extracted `masulino-source` directory:

```sh
pnpm install --frozen-lockfile
pnpm dev:workspace
```

Open the local URL printed by the development server, normally `http://localhost:5173`. Copy `.env.example` to `.env` before the first run. The first screen is the staff login. Every synthetic password is `Synthetic-Staff-1`.

| Email | What opens after login |
| --- | --- |
| `user@example.test` | Full admin for Masulino Spielwelt. Password is `password`. |
| `reception.masulino@example.test` | Buchungen and Geburtstage. |
| `employee.masulino@example.test` | Team only. No booking list. |
| `manager.masulino@example.test` | Location operations. |
| `owner.masulino@example.test` | Reports, campaigns, families and team, after a second factor is enrolled. |
| `it.masulino@example.test` | IT. Benutzer, Auswertungen and Stammdaten, after a second factor is enrolled. |

Inhaber, Verwaltung, IT and Standortleitung stop on the second-factor screen until they enroll an authenticator. Empfang and Team do not. The one-time recovery codes are shown only during enrollment. `user@example.test` is also an owner, so that account follows the same step.

`pnpm dev:workspace` starts Postgres, applies migrations, seeds synthetic tenants, and starts the API and the UI. If Postgres is already running, it is reused.

`pnpm dev` is only the UI. It still shows the login and proxies `/api` to `127.0.0.1:8787`, so `pnpm db:up` and `pnpm dev:api` must already be running. `VITE_MASULINO_FIXTURES=1 pnpm dev` keeps the original fixture walkthrough with no login.

Signed-in sections follow the role. Buchungen, Geburtstage, Familien, Team, Auswertungen, Kampagnen and Portal notices load from Postgres when that role may see them. Kasse, Bistro, the assistant and weather campaigns stay out of the signed-in workplace. Campaign approve/send writes a local preview only.

Useful commands:

```sh
pnpm exec tsc --noEmit
pnpm boundaries
pnpm test
pnpm test:integration
pnpm build
pnpm start
```

`pnpm start` previews the built Cloudflare Worker locally; it is not a deployment command. It prints its own local URL. Use `pnpm dev` for ordinary editing.

A clean checkout automatically uses the portable development/build path. Do not copy `.sites-runtime`, `node_modules`, `.wrangler`, or build output from the original hosted workspace. `pnpm run install:ci` is also portable in this export and runs the same frozen pnpm install.

## Make this your repository

After checking that it opens locally:

```sh
git init
git add .
git commit -m "Import Masulino UI prototype"
git tag ui-prototype-baseline
git switch -c refactor/ui-components
```

You can then create a private repository on your chosen Git host and push it there. No repository has been created in your external accounts by this export. Open this folder in your editor or give it to your coding agent, with `AGENTS.md` as the entry point. Future edits should happen in one canonical repository.

## What is in the code

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Current workspace, nine app previews, weather scenarios, campaign review, assistant, demo data and client state |
| `lib/workspace/client.ts` | Optional live client for the Node domain adapter (`VITE_MASULINO_WORKSPACE=1`) |
| `server/` | Node composition root: Better Auth, section handlers, outbox drain |
| `packages/` | Framework-free domain packages from the ERP handover (`contracts`, `core`, `database`, modules, indoor-play) |
| `docs/domain-handover.md` | Portable contract for identity, authorization, tenancy and booking invariants |
| `docs/birthday-form.md` | Same birthday API contract as the section below, for sharing |
| `app/globals.css` | Visual tokens, layouts, responsive behavior, component styling and reduced-motion support |
| `app/layout.tsx` | German document language, page metadata and global styles |
| `components/ui/` | Existing shadcn/Radix UI primitives; dialogs, sheets, tabs, command palette, sidebar and other controls |
| `hooks/` and `lib/utils.ts` | Shared helpers used by the UI |
| `public/favicon.svg` | Masulino mark |
| `vendor/` | Vendored stylesheet and its license |
| `vite.config.ts`, `build/`, `scripts/`, `.openai/hosting.json` | Vinext and Cloudflare/Sites scaffolding; keep together while running this export |
| `AGENT_HANDOFF.md` | Product context, known limits, proposed refactor and acceptance checklist |
| `SOURCE_SNAPSHOT.md` | Exact source commit, export changes and verification scope |
| `docs/STARTER_README.md` | Original starter reference; this README takes precedence for local setup |

## Birthday form API

The public website asks which times are free, then sends the birthday form. Masulino stores a confirmed reservation. The family pays at the venue on the day. No card data is taken.

Call these routes from the website server. The key must not appear in browser JavaScript. A browser on another domain cannot call them directly: there is no cross-origin header, and the key would be public if it were in the page.

| Setting | Value |
| --- | --- |
| Local base URL | `http://127.0.0.1:8787` |
| Production base URL | `https://<vercel-host>` (same origin as the staff app) |
| Header on every call | `Authorization: Bearer <MASULINO_SITE_KEY>` |

The key is at least 16 characters. The API uses the venue in `MASULINO_PUBLIC_VENUE_SLUG`. The website does not send a tenant id or a location id.

### Free times

```
GET /api/public/birthdays/times?date=2026-11-14&children=8&adults=4
```

| Query | Required | Rule |
| --- | --- | --- |
| `date` | yes | `yyyy-mm-dd` |
| `children` | no | Integer 1–40. Default 8. |
| `adults` | no | Integer 0–40. Default 4. |
| `package` | no | `comfort` or `deluxe`. Without it, a time is returned only when both packages can take that group. |

```sh
curl -sS \
  -H "Authorization: Bearer $MASULINO_SITE_KEY" \
  "$MASULINO_API_URL/api/public/birthdays/times?date=2026-11-14&children=8&adults=4"
```

```json
{ "date": "2026-11-14", "closed": false, "times": ["10:00", "10:30", "14:00"] }
```

`closed: true` means the venue is shut that day. `times: []` with `closed: false` means no table fits that group. Ask again when the guest changes the number of children or adults. The form’s `dd.mm.yyyy` value has to be sent as `yyyy-mm-dd`.

Both packages last 120 minutes, so the time list is the same for Comfort and Deluxe while those durations stay equal.

### Save the form

```
POST /api/public/birthdays
Content-Type: application/json
```

Create `idempotencyKey` once, with `crypto.randomUUID()`, when the form opens. Send that same value on every retry of that submit. A double click returns the original booking with `replayed: true`. The same key with different answers returns `idempotency_mismatch`. A header `Idempotency-Key` is used when the JSON field is absent.

```sh
curl -sS -X POST \
  -H "Authorization: Bearer $MASULINO_SITE_KEY" \
  -H "Content-Type: application/json" \
  "$MASULINO_API_URL/api/public/birthdays" \
  -d '{
    "idempotencyKey": "8f1c0e2a-7b34-4e5d-9a10-6c2d0e1f4a77",
    "date": "2026-11-14",
    "time": "14:00",
    "package": "comfort",
    "childName": "Mia",
    "childAge": 7,
    "children": 8,
    "adults": 4,
    "adultFlatRate": true,
    "givenName": "Anna",
    "familyName": "Keller",
    "email": "anna@example.test",
    "phone": "015112345678",
    "message": "",
    "referral": "instagram"
  }'
```

| Form | JSON | Rule |
| --- | --- | --- |
| Datum | `date` | `yyyy-mm-dd` |
| Zeitfenster | `time` | `HH:mm`, one of the times from the first call |
| Comfort / Deluxe | `package` | `comfort` or `deluxe` |
| Name des Geburtstagskindes | `childName` | 1–80 characters |
| Alter | `childAge` | Integer 1–17. This is an age, not a date of birth. |
| Anzahl Kinder | `children` | Integer 1–40 |
| Anzahl Erwachsene | `adults` | Integer 0–40 |
| Getränkeflat & Tischdeko, 2,50 € | `adultFlatRate` | `true` or `false`. Default `false`. |
| Vorname / Nachname | `givenName` / `familyName` | 1–80 characters each |
| E-Mail | `email` | Address |
| Telefon | `phone` | 3–40 characters |
| Nachricht | `message` | Optional, up to 500 characters |
| Aufmerksam geworden | `referral` | Optional, up to 80 characters. This is not marketing consent. |
| — | `idempotencyKey` | 8–80 characters, created once per form |

A new booking responds with `201`. A retry of the same submit responds with `200`.

```json
{
  "reference": "MS-AB12CD34EF",
  "date": "2026-11-14",
  "time": "14:00",
  "package": "comfort",
  "children": 8,
  "adults": 4,
  "adultFlatRate": true,
  "pricePerChildMinor": 1480,
  "adultFlatMinor": 1000,
  "totalMinor": 12840,
  "currency": "EUR",
  "payment": "on_site",
  "replayed": false
}
```

Money is integer euro cents. `1480` is 14,80 € per child. `adultFlatMinor` is 2,50 € times the adults (`4 × 250 = 1000`). `totalMinor` is `children × pricePerChildMinor + adultFlatMinor`. `payment` is always `on_site`. Show `reference` on the thank-you page. Prices are copied onto the booking, so a later price change does not rewrite it.

The adult flat rate is fixed at 250 cents in the API. The package price is whatever is stored for that `public_code`.

### Errors

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `validation` | A field is missing or the wrong shape. `details` names the fields. Keep what the guest typed. |
| 400 | `idempotency_mismatch` | That `idempotencyKey` was already used with different answers. Create a new key. |
| 400 | `incomplete_rules` | The live venue is not allowed to confirm yet. `missing` lists what is still open. |
| 401 | `unauthorized` | The bearer key is wrong. |
| 404 | `not_found` | The venue slug or the package code is not published. |
| 409 | `conflict` | That time was just taken. `times` lists others that still work. |
| 429 | `rate_limited` | More than 30 saves per minute for this key, or too many time lookups. Wait, then retry with the same `idempotencyKey`. |
| 503 | `unavailable` | `MASULINO_SITE_KEY` or `MASULINO_PUBLIC_VENUE_SLUG` is missing on the API. |

A save is limited to 30 requests per minute for the whole website key. Time lookups share a higher limit of a few hundred per minute for the venue.

### What is stored

The row is a normal reservation. Staff see it under Geburtstage. Stored with it: child name and age, both contact names, email, phone, message, referral, package code, party size, and the price snapshot including the adult flat rate. Nothing is written to payments. A confirmation email is not sent; the outbox keeps a local preview until a mailbox is chosen.

### Production

The routes run on the Vercel Node function in `fra1` and write to the Neon database that is already running, through `DATABASE_URL` (the pooled `masulino_app` role). `NODE_ENV=production` still refuses to confirm on a fixture rule. On that live database, check the items below. Skip any that are already there.

1. Deploy the API that contains these routes.
2. Set `MASULINO_SITE_KEY` and `MASULINO_PUBLIC_VENUE_SLUG` on Vercel. Leave `DATABASE_URL_MIGRATE` off the runtime.
3. Apply migrations through `packages/database/migrations/0007_birthday_intake.sql` with the direct Neon URL.
4. Publish the venue: a `published_venues` row whose `public_slug` matches the env var, active tables, and a published rule with `fixture = false`, a cancellation policy, and `business_decisions_confirmed = true`. Record those decisions in `docs/business-decisions.md` first.
5. Insert Comfort and Deluxe once: `MASULINO_PUBLIC_VENUE_SLUG=your-slug pnpm db:birthday-packages`. That command does not change a price that is already stored.

Until step 4 is done, a save returns `incomplete_rules` or `not_found` even when the key is correct.

## What is simulated

The screens are implemented in React. The sample bookings, families, staff, metrics, weather and notifications are fixtures. The chatbot returns prepared, keyword-selected responses. Approvals and reminders change in-memory client state only; reload resets the demo. No email, push, or card payment is sent. The birthday form API is separate: when the API is running against Postgres, a successful POST stores a real reservation. See the section above.

The full architecture from the earlier planning conversation was unavailable when this prototype was created. The visible project context included booking access, customer accounts and loyalty points. Other modules and numerical thresholds are design proposals, not confirmed business requirements.

## Recommended development path

1. Preserve this snapshot and capture desktop/mobile reference screenshots locally.
2. Refactor the existing UI into components and feature modules, preserving its appearance and interactions.
3. Move fixtures and simulated operations behind typed service interfaces.
4. Confirm the ERP's backend and frontend architecture, then connect one real workflow at a time.
5. Enforce permissions, capacity, contact eligibility, approval state and audit history on the server before enabling external actions.

Keep this runtime initially to make the first iteration reproducible. The dependency set pins `vinext` to `1.0.0-beta.5`. For the production ERP, review that choice separately against the agreed architecture; the UI components and styling can be ported to another React setup without redesigning the screens. Do not mix a framework migration, visual redesign and backend integration into the first change.

Upstream runtime documentation: https://github.com/cloudflare/vinext . Consult documentation for the pinned version before applying instructions from newer releases.
