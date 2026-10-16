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

Inhaber, Verwaltung and Standortleitung stop on the second-factor screen until they enroll an authenticator. Empfang and Team do not. The one-time recovery codes are shown only during enrollment. `user@example.test` is also an owner, so that account follows the same step.

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
| `docs/birthday-form.md` | Website API: free times for a day, then save the birthday form |
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

## What is simulated

The screens are implemented in React. The sample bookings, families, staff, metrics, weather and notifications are fixtures. The chatbot returns prepared, keyword-selected responses. Approvals and reminders change in-memory client state only; reload resets the demo. No email/push is sent, no real payment is processed, and no production ERP/database/weather service is connected.

The full architecture from the earlier planning conversation was unavailable when this prototype was created. The visible project context included booking access, customer accounts and loyalty points. Other modules and numerical thresholds are design proposals, not confirmed business requirements.

## Recommended development path

1. Preserve this snapshot and capture desktop/mobile reference screenshots locally.
2. Refactor the existing UI into components and feature modules, preserving its appearance and interactions.
3. Move fixtures and simulated operations behind typed service interfaces.
4. Confirm the ERP's backend and frontend architecture, then connect one real workflow at a time.
5. Enforce permissions, capacity, contact eligibility, approval state and audit history on the server before enabling external actions.

Keep this runtime initially to make the first iteration reproducible. The dependency set pins `vinext` to `1.0.0-beta.5`. For the production ERP, review that choice separately against the agreed architecture; the UI components and styling can be ported to another React setup without redesigning the screens. Do not mix a framework migration, visual redesign and backend integration into the first change.

Upstream runtime documentation: https://github.com/cloudflare/vinext . Consult documentation for the pinned version before applying instructions from newer releases.
