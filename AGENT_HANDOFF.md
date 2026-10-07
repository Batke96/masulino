# Masulino — coding agent handoff

## Product goal

A modern, calm staff entry point for an indoor children's playground ERP. Apps provide stable navigation. Specialized agents prepare concrete suggestions based on weather, demand and customer history. The staff member reviews evidence and makes the decision. A contextual assistant finds information and exposes useful actions.

Audience: staff and management. Language: German. Demo user: Peed, Betriebsleitung. The displayed operating day is a fixed sample snapshot (29 September 2026), not the current date.

## Preserve the visual direction

White workspace, cool gray background, coral/orange accents, dark navy weather briefing, soft app icon colors, strong typographic hierarchy, compact agent inbox. Keep apps in a predictable order. Agent priority should change with context; app navigation should remain stable. Existing responsive rules and reduced-motion preferences are part of the design.

## Implemented prototype surfaces

- Overview: day briefing, sample KPIs, weather scenario selector, app launcher, agent inbox, sample check-ins.
- Apps: bookings, check-in/POS, families & club, birthdays, staffing, reports, campaigns, bistro and a portal roadmap card.
- Agents: pending suggestions, history, deferred/approved entries, notification switches and demo rules.
- Campaign review: audience explanation, email/push choice, timing, editable subject/body, incentive preview, review step, simulated approval and undo.
- Assistant: prepared answers for weather, lapsed visitors, staffing, birthdays, points and daily briefing; source labels and relevant action cards; explicit fallback for unsupported questions.
- Global search: Cmd/Ctrl+K finds apps, demo bookings and knowledge cards.
- Knowledge and Concept pages: example rules, UX rationale, references and a proposed implementation roadmap.

## Scenario logic and its limits

| Scenario | Current sample behavior | Production work still required |
| --- | --- | --- |
| Rain | 90% rain, 58% morning occupancy, 92% afternoon occupancy; invite only for 09–12 | Live forecast, geography, forecast confidence, capacity model, walk-ins and booking changes |
| Sunshine | 24°C and 32% occupancy; propose a quiet 16–18 window | Estimate incremental demand, offer economics and audience fit |
| Full venue | 96% expected occupancy; suppress weather campaign and suggest staffing | Enforce capacity checks across every campaign channel and action |
| Lapsed families | 78 candidates minus 18 without contact permission, 9 recently contacted and 4 with future bookings = 47 email contacts; 31 with push permission | Compute segments from records, deduplicate campaigns, evaluate permissions and recheck before sending |
| Staffing | Illustrative availability and a proposed extra shift; no message or assignment is made | Staff availability, qualifications, confirmation and scheduling rules |

These are designed examples. The counts, exclusions, capacity thresholds, 60-day inactivity rule and 14-day campaign pause are currently fixtures/copy, not a production segmentation engine. Campaigns and staffing suggestions must not become operational merely by connecting a frontend button to a send endpoint.

## Known implementation limits

- Most UI and all demo state live in `app/page.tsx`. This is intentionally a prototype-sized composition, not the target production structure.
- `app/globals.css` includes successive responsive/readability overrides. Preserve the resulting appearance before consolidating them.
- App switching uses client state in one route; deep links, browser history and route-level authorization are not implemented.
- State resets on reload. There is no durable approval workflow, schedule, payment processing, user management or backend RBAC.
- The assistant is deterministic, with a short simulated delay. It does not call an LLM, search the business's real documents or retrieve live records.
- Existing Cloudflare connector/auth/database scaffolding came with the starter. The prototype does not depend on an actual connector account or configured database.
- Two optional WebMCP tools are registered when the browser exposes `document.modelContext`: `masulino_read_demo_state` and `masulino_set_demo_scenario`. Supported-context validation was unavailable. They are not the future ERP's backend API.
- Browser visual/interaction QA was unavailable in the original environment. Compile/build and initial React server rendering were checked. Establish a browser-tested baseline locally.
- The complete earlier architecture document was not available. Do not infer that the displayed modules and numerical rules were approved by the founders.

## Proposed refactor sequence

1. Run the supplied snapshot. Capture desktop and mobile screenshots, including the campaign dialog and assistant.
2. Extract typed models and fixtures into `lib/demo/` or the existing project's equivalent.
3. Extract the shell (sidebar, header, search) and shared visual elements.
4. Extract feature modules: dashboard, apps, bookings, families, agents, campaigns, assistant and knowledge.
5. Introduce service interfaces for bookings, customer segments, forecasts, agent suggestions and approvals. Initially supply in-memory demo adapters.
6. Add route-based navigation when needed, preserving shared state and URLs during transitions.
7. Connect the first approved ERP workflow end-to-end; retain a deliberate demo mode for design review.

Suggested feature boundaries, not files that already exist:

| Area | Example responsibilities |
| --- | --- |
| `components/workspace/` | Sidebar, header, command search, app launcher |
| `features/dashboard/` | Day summary, weather briefing, activity overview |
| `features/agents/` | Suggestion cards, filters, history and agent preferences |
| `features/campaigns/` | Audience/evidence, editor, preview, review and approval |
| `features/assistant/` | Conversation, source cards and actions |
| `features/bookings/` | Booking list, details, demo check-in |
| `lib/domain/` | Business types and rules independent of React |
| `lib/services/` | Typed interfaces with separate demo and live adapters |

## Acceptance checks for the first iteration

- Load the overview with no runtime errors and no required keys or sign-in.
- Open every app and navigate back to the overview.
- Switch rain → sunshine → full venue. Ensure weather, copy, capacity and agent recommendations agree; full venue offers no additional weather campaign.
- Open a campaign; change channel, incentive, subject and message; verify the preview and recipient count match.
- Review then approve. Verify the agent inbox and activity history update; verify undo restores the suggestion.
- Defer a suggestion and inspect it under activity. Pause/re-enable agent notifications.
- Ask the assistant about weather, families, birthdays and an unsupported subject; inspect the associated actions and source labels.
- Use keyboard search to open an app, a booking and a knowledge card.
- Create a demo booking and check it in. Check that booking details agree with the list.
- Verify dialogs and sheets with keyboard navigation, focus return and Escape.
- Check narrow mobile, wide desktop, enlarged text and reduced motion; confirm no unintended horizontal scrolling.
- Run TypeScript and production build checks after the refactor.

## Real-agent architecture direction

A production agent should read authoritative services, prepare a typed proposal and attach evidence, assumptions, data timestamps and an expiration. The user reviews the proposal. The backend revalidates eligibility and capacity when approval is applied and again before any delayed dispatch, handles idempotency and writes an audit event. Delivery outcomes should feed the next recommendation. An LLM may help draft or explain; authoritative permissions, limits and transactions remain in the domain services.

For the first real assistant, return well-defined components from trusted tool results. Preserve citation links to actual records, and keep sensitive data scoped to the signed-in user's permissions.

## Research references

- Agent UX: https://microsoft.design/articles/ux-design-for-agents/
- Generative UI: https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces
- A2UI: https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/
- View Transitions: https://developer.chrome.com/docs/web-platform/view-transitions
- Vinext runtime: https://github.com/cloudflare/vinext

## Suggested opening task for another coding agent

Read README.md, AGENTS.md, AGENT_HANDOFF.md and SOURCE_SNAPSHOT.md. Run this Masulino prototype locally using the pinned dependencies. Establish browser screenshots and check the main flows. Then refactor app/page.tsx into reusable components and feature modules, keeping the current German UI and behavior. Keep integrations in demo mode. Report the changes and validation results. Consult the approved ERP architecture before choosing production backend services or changing frameworks.
