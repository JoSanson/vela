# PROGRESS (source of truth)

A box is checked only with: test green + app launched & screenshot inspected + commit hash.

## Phase 0
- [x] Pilotage docs + git init — (first commit)

## Phase 1 — Skeleton
- [ ] 1.1 Monorepo tooling
- [ ] 1.2 packages/shared IPC contract
- [ ] 1.3 electron-vite app + shell window + CSP
- [ ] 1.4 TabManager v0
- [ ] 1.5 Renderer v0 (sidebar, url bar, nav)
- [ ] 1.6 Security baseline
- [ ] 1.7 e2e smoke + screenshot + vitest

## Phase 2 — Core model
- [ ] 2.1 Types
- [ ] 2.2 Reducer/actions
- [ ] 2.3 Auto-archive
- [ ] 2.4 MRU + split layouts
- [ ] 2.5 ATC matcher
- [ ] 2.6 Command ranking
- [ ] 2.7 Persistence + migrations
- [ ] 2.8 Coverage > 85 %

## Phase 3 — Navigation UX
- [ ] 3.1 Sidebar full
- [ ] 3.2 Spaces UI
- [ ] 3.3 Command bar
- [ ] 3.4 Tab switcher
- [ ] 3.5 Shortcuts + find in page
- [ ] 3.6 Split view
- [ ] 3.7 Peek
- [ ] 3.8 Little Vela
- [ ] 3.9 Drag & drop

## Phase 4
- [ ] 4.1 DevTools/favicons/audio/notifications
- [ ] 4.2 Downloads
- [ ] 4.3 History
- [ ] 4.4 Permissions manager
- [ ] 4.5 Auto PiP
- [ ] 4.6 Memory saver + lazy restore
- [ ] 4.7 Boosts + Zap
- [ ] 4.8 ATC editor
- [ ] 4.9 Profiles
- [ ] 4.10 Import + JSON export/import
- [ ] 4.11 Onboarding/empty states/shortcuts page

## Phase 5
- [ ] 5.1 Animations/theming
- [ ] 5.2 Accessibility
- [ ] 5.3 Error states

## Phase 6
- [ ] 6.1 perf harness
- [ ] 6.2 budgets met, PERF.md

## Phase 7
- [ ] 7.1 GitHub + ci.yml
- [ ] 7.2 release/codeql/audit
- [ ] 7.3 engine-watch
- [ ] 7.4 renovate
- [ ] 7.5 auto-update
- [ ] 7.6 RELEASING + ci:local
- [ ] 7.7 v0.1.0 + v0.1.1 proof

## Phase 8 — P1
- [ ] 8.1 Content blocker
- [ ] 8.2 Site Control Center
- [ ] 8.3 Advanced themes
- [ ] 8.4 Reader mode
- [ ] 8.5 Extensions

## Phase 9
- [ ] 9.1 Review pass 1
- [ ] 9.2 Review pass 2
- [ ] 9.3 Docs complete

## DoD checklist
See PLAN.md §DoD mirror below; all boxes must be ticked at the end.
- [ ] e2e suite green 3× in a row
- [ ] install/dev/build/test/e2e/lint/typecheck green
- [ ] kill -9 session restore
- [ ] perf budgets (PERF.md)
- [ ] zero any / zero warnings / core coverage > 85 %
- [ ] SECURITY.md audit
- [ ] accessibility
- [ ] CI green on main, engine watch + renovate tested, v0.1.0 released, auto-update proven
- [ ] docs complete
- [ ] two review passes
