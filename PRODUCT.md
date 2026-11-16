# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Staff of Masulino Spielwelt, a German indoor children's playground. They sign in and open the workplace their role allows: reception handles bookings and birthdays, employees see the team, managers run location operations, owners see reports, campaigns, families and team, and IT manages users, evaluations and master data. Work happens at the counter and on a back-office screen, in German.

## Product Purpose

Give each staff role one workplace for the day: bookings, birthdays, families, team, reports, campaigns and notices. Success is that a signed-in person can finish the task their role allows, and that the screen stays the existing Masulino workspace.

This repository is a local interactive prototype of that workplace, plus a proposed domain layer. It is not the production ERP.

## Positioning

The workplace is role-scoped and German, built around one venue's day rather than a generic admin shell. Booking, birthday and family flows share state where the same scenario appears on more than one surface.

## Operating Context

`pnpm dev:workspace` runs embedded Postgres, the API on port 8787, and the UI on `http://localhost:5173`. `pnpm dev` is the UI only and expects that API. The first screen is staff login. Signed-in sections load from Postgres when the role may see them. Kasse, Bistro, the assistant and weather campaigns stay out of the signed-in workplace. Campaign approve/send writes a local preview only. The public birthday form is a separate server-to-server API; families pay at the venue, and the page takes no card data.

## Capabilities and Constraints

- UI language is German (`html lang="de"`). Keep existing interactions unless a change is explicitly requested.
- Reuse `components/ui` and the tokens in `app/globals.css`. Domain rules stay outside display components. Server-side rules are the source of truth for real permissions and external actions.
- Campaign actions, reminders, payments and check-ins in the current UI are simulations. Do not enable email, push, payment, real customer imports or background jobs unless that is the requested scope.
- New service connections must show freshness, failure, empty and loading states.
- Do not infer hosting credentials or publish the exported site.
- Node >= 22.13.0 and the declared pnpm version. Keep `pnpm-lock.yaml` and third-party license files.
- The second factor stays off until `MASULINO_REQUIRE_MFA=1`.

## Brand Commitments

- The product name is Masulino. The document title is "Masulino · Dein Spielraum".
- The visual baseline is the current CSS. Do not add colors, radii or typefaces as a side effect of a polish pass.
- UI icons come from `lucide-react` only, stroke `1.8`, sized like the neighboring icons. Sort columns use `ArrowUp` and `ArrowDown`. Diagrams, `public/favicon.svg`, and the color fields on the floor plan are not icons.

## Evidence on Hand

- Role map and local run steps: `README.md`.
- Task boundary and domain limits: `AGENTS.md`.
- Refactor notes and acceptance checks: `AGENT_HANDOFF.md`.
- Staff accounts in the local database are synthetic. Do not present fixtures, demo copy or prepared assistant replies as live data, live customers or a live model.

## Product Principles

- One workplace per role. Hide sections the role cannot use.
- The German Masulino workspace and its current interactions stay until a change is requested.
- Show the real state of a task: empty, loading, failed, or a clearly marked simulation.
- Shared scenarios stay shared. A booking, approval or check-in that appears twice uses the same state.
- Domain truth lives in the server and packages, not in the display component.

## Accessibility & Inclusion

The working UI is German, keyboard focus is visible, and motion collapses under `prefers-reduced-motion`. Operating text on the working surfaces is kept at least 14px. No separate conformance claim is recorded.
