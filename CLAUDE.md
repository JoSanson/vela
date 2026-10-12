# Vela — project rules (read this first, then PROGRESS.md)

Vela is an Arc-inspired desktop browser: Chromium via Electron, one `WebContentsView` per tab,
React 19 shell. MIT. No Arc / The Browser Company logo or assets anywhere, and no Arc name in the
product's branding or UI (the importer may say "Arc"). Docs and the README may name Arc to describe
compatibility and compare (D034), always with the non-affiliation notice.

## Resume protocol
1. Read this file, then `PROGRESS.md`. Resume at the first unchecked box. Never redo a checked box.
2. Every task is done only when: (a) automated test green, (b) app launched + Playwright screenshot
   inspected, (c) box checked in `PROGRESS.md` with the commit hash.
3. Ambiguity → pick the most standard/robust option, log it in `DECISIONS.md`.
4. Blocked > 30 min → simplest DoD-compliant workaround, log in `DECISIONS.md`, move on.

## Hard rules
- Electron (latest stable, see `apps/desktop/package.json`), no fork, no `<webview>`, no `BrowserView`, no iframe for tabs.
- Security defaults everywhere: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
  typed IPC via `contextBridge` only, strict CSP on the shell, `setWindowOpenHandler`,
  `setPermissionRequestHandler`, `will-navigate` guard on the shell, custom certificate interstitial.
  Never `webSecurity: false`.
- TypeScript strict + `noUncheckedIndexedAccess`, zero `any`, zero lint warnings.
- `packages/core` never imports Electron, Node built-ins or the DOM. 100% unit-testable, coverage > 85%.
- Animations: `transform` / `opacity` only. CSS modules + CSS variables. No heavy CSS framework.
- No money spent. Nothing touched outside this folder.
- Conventional commits, one commit per verified step. Tags `v0.x.y`.

## Layout
```
packages/core            pure domain: spaces, tabs, folders, archive, ATC rules, command ranking
packages/shared          IPC contract types shared by main/preload/renderer (type-only)
apps/desktop/src/main    Electron main: windows, TabManager, sessions, persistence, IPC handlers
apps/desktop/src/preload contextBridge API (`window.vela`)
apps/desktop/src/renderer React shell (sidebar, command bar, overlays, internal pages)
apps/desktop/e2e         Playwright _electron tests
apps/desktop/perf        perf harness (`pnpm perf`) → PERF.md
.github/workflows        ci, release, engine-watch, codeql, audit
```

## Commands
```
pnpm install           # installs + rebuilds better-sqlite3 for Electron
pnpm dev               # electron-vite dev (HMR)
pnpm build             # typecheck + electron-vite build + electron-builder for current OS
pnpm test              # vitest (core + main unit)
pnpm e2e               # playwright _electron (build first)
pnpm lint / typecheck / format
pnpm perf              # startup / memory / tab-switch budgets → PERF.md
pnpm ci:local          # lint + typecheck + format:check + coverage + build + e2e + perf, same as CI
```

## Conventions
- IPC channel names live in `packages/shared/src/ipc.ts`; renderer never calls `ipcRenderer` directly.
- State: main process is the source of truth for tabs/spaces; renderer gets snapshots + patches
  through `vela.state.subscribe`. Renderer-only UI state lives in Zustand.
- Internal pages use the `vela://` scheme (privileged, standard, secure, CORS-enabled).
- Persistence: SQLite via `better-sqlite3` (`state.db`, migrations in `main/db/migrations`), JSON for prefs.
- Tests: `*.test.ts` next to the code for core; e2e in `apps/desktop/e2e/*.spec.ts`.
- Comments only for non-obvious WHY.
