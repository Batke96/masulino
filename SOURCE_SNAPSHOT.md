# Source snapshot

- Export prepared: 2026-10-02.
- Original source commit: `8b493264bc309c2f3dbc8bcd9891cbe5ac71a4a2`.
- Published prototype: https://masulino-workspace.batke13.chatgpt.site . Access remains subject to its existing private sharing policy.
- The original committed source contains 118 files. This export preserves the complete tracked application, components, runtime scaffolding, assets, dependency lockfile and license notices.

## Deliberate export-only changes

- Added this file, `AGENTS.md`, `AGENT_HANDOFF.md`, and the local-development README.
- Moved the original starter README to `docs/STARTER_README.md` for reference.
- Changed the package display name to `masulino-ui-prototype`.
- Made `install:ci` use `pnpm install --frozen-lockfile` instead of the managed Linux installer.
- Removed the hosted project's identity from `.openai/hosting.json`; retained the configuration fields required by the existing Vite config. This copy is not wired to publish back to the original Site.
- No changes to the UI, application logic, dependencies, or lockfile.

## Excluded

Git history/remotes, Git credentials, node_modules, environment files, caches, local execution profiles, generated builds and runtime data are not included. This is a source export, not a bundled offline installation. Third-party code retains its supplied license notices.

## Verification

The original published source passed TypeScript, production build and an initial React server render. The export is checked for required files, unchanged UI and lockfile hashes, archive integrity and absence of excluded runtime files.

Export build results are recorded below after validation. Any reused dependency installation is a verification convenience, not part of this ZIP. A fresh dependency installation and browser behavior on your own operating system still need to be checked locally.

Export validation on 2026-10-02: TypeScript passed; the portable Vinext production build passed using the existing locked dependency installation. No dependency or UI source changes were required. Fresh installation and browser QA on another machine were not performed.
