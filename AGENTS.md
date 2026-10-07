# Masulino project instructions

Read `README.md`, `AGENT_HANDOFF.md`, and `SOURCE_SNAPSHOT.md` first.

## Current task boundary

This is a local source export of an interactive UI prototype. Preserve the German Masulino design and the existing interactions unless the user requests a change. It is not a production ERP. Do not represent fixtures or prepared assistant responses as live data or AI.

## Development

- Use Node >=22.13.0 and the declared pnpm 11.25.0. Preserve `pnpm-lock.yaml` and dependency versions during initial extraction/refactoring.
- Install with `pnpm install --frozen-lockfile`; develop with `pnpm dev`.
- The clean checkout selects the portable runtime automatically. Do not recreate managed-host directories or depend on the original workspace paths.
- Reuse the existing UI primitives in `components/ui` and visual tokens in `app/globals.css`.
- Refactor feature by feature. Keep state shared where a scenario, approval or check-in appears in more than one surface.
- Treat the current CSS as the visual baseline. Consolidate duplicate rules incrementally only after comparing screenshots at relevant viewport sizes.
- Validate changed flows and run `pnpm exec tsc --noEmit` and `pnpm build`. Initial browser QA is still needed; see the handoff.
- Preserve third-party license files.

## Domain and integration

- The architecture and thresholds in this prototype are proposals; consult the actual approved ERP architecture before selecting production services or schemas.
- Keep domain rules outside display components. Server-side rules must be the source of truth for real permissions and external actions.
- The current campaign actions, reminders, payments and check-ins are simulations. Do not silently enable email, push, payment, real customer imports or background jobs.
- Add real integrations only within the user's requested scope. Surface data freshness, failure, empty and loading states when connecting services.
- The exported hosting manifest has no project identity. Do not infer credentials, reconnect to the original hosted Site, or publish externally without a user request.

## First recommended assignment

Establish that this snapshot runs locally; capture reference screenshots; then split the large page into reusable feature modules without changing the UI. See `AGENT_HANDOFF.md` for the proposed boundaries and manual acceptance checks.
