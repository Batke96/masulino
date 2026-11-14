# Current implementation

`current-implementation.svg` is the running shape of this repository at main commit `6c1386d` (18 October 2026). `current-implementation.png` is a render of that SVG for review. Edit the SVG if the picture changes.

Staff open a Vinext/React workplace and call `/api` on the same origin. The public website is not in this repo. Its server calls the birthday routes with a bearer site key. That key must not be put in browser JavaScript.

Production is one Node function on Vercel in region `fra1`. Nitro is added only when `VERCEL=1`. The catch-all `app/api/[[...slug]]/route.ts` calls `handleApiRequest`. A local `pnpm build` still uses Cloudflare and Vinext. That build is not the production path. `vercel.json` sets `framework` to null and the region to `fra1`. It does not declare a cron.

The Node router in `server/` is the only code that opens Postgres. It serves Better Auth, the staff session, live sections, bookings, the IT workspace, public birthday times and submit, and the outbox handler. Domain packages have no React: contracts, core (authorize, audit, outbox), the modules, and indoor-play allocation. The operations module is in the repo and has no HTTP route.

Neon in the EU is the system of record, with row-level security. `masulino_app`, `masulino_auth`, and `masulino_worker` use the pooled endpoint. `DATABASE_URL_MIGRATE` is the direct endpoint and is not a runtime variable. Migrations `0001` through `0008` are applied by hand. A Vercel deploy does not migrate Neon.

Dashed notes are intentionally disconnected: email, SMS, and push; card payments; Ready2Order; a weather provider; the assistant; check-in persistence; and a Vercel cron entry. The outbox handler exists and writes local previews only.
