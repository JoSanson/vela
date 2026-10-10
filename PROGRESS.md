# PROGRESS (source of truth)

A box is checked only with: test green + app launched & screenshot inspected + commit hash.

## Phase 0
- [x] Pilotage docs + git init — 5c4380d

## Phase 1 — Skeleton
- [x] 1.1 Monorepo tooling — 7dda31e
- [x] 1.2 packages/shared IPC contract — 7dda31e
- [x] 1.3 electron-vite app + shell window + CSP — 7dda31e
- [x] 1.4 TabManager v0 — 7dda31e
- [x] 1.5 Renderer v0 (sidebar, url bar, nav) — 7dda31e
- [x] 1.6 Security baseline — 7dda31e
- [x] 1.7 e2e smoke + screenshot + vitest — 7dda31e

## Phase 2 — Core model
- [x] 2.1 Types — aaee214
- [x] 2.2 Reducer/actions — aaee214
- [x] 2.3 Auto-archive — aaee214
- [x] 2.4 MRU + split layouts — aaee214
- [x] 2.5 ATC matcher — aaee214
- [x] 2.6 Command ranking — aaee214
- [x] 2.7 Persistence + migrations — aaee214
- [x] 2.8 Coverage > 85 % — aaee214

## Phase 3 — Navigation UX
- [x] 3.1 Sidebar full — d7bd570
- [x] 3.2 Spaces UI — d7bd570
- [x] 3.3 Command bar — d7bd570
- [x] 3.4 Tab switcher — d7bd570
- [x] 3.5 Shortcuts + find in page — d7bd570
- [x] 3.6 Split view — d7bd570
- [x] 3.7 Peek — d7bd570
- [x] 3.8 Little Vela — d7bd570
- [x] 3.9 Drag & drop — d7bd570

## Phase 4
- [x] 4.1 DevTools/favicons/audio/notifications — 2e3065d
- [x] 4.2 Downloads — 2e3065d
- [x] 4.3 History — 2e3065d
- [x] 4.4 Permissions manager — 2e3065d
- [x] 4.5 Auto PiP — 2e3065d
- [x] 4.6 Memory saver + lazy restore — 2e3065d
- [x] 4.7 Boosts + Zap — 2e3065d
- [x] 4.8 ATC editor — 2e3065d
- [x] 4.9 Profiles — 2e3065d
- [x] 4.10 Import + JSON export/import — 2e3065d
- [x] 4.11 Onboarding/empty states/shortcuts page — 2e3065d

## Phase 5
- [x] 5.1 Animations/theming — 6b6d2e9
- [x] 5.2 Accessibility — 6b6d2e9
- [x] 5.3 Error states — 6b6d2e9

## Phase 6
- [x] 6.1 perf harness — 2e3065d
- [x] 6.2 budgets met, PERF.md — 073e86b

## Phase 7
- [x] 7.1 GitHub + ci.yml — repo JoSanson/vela created (private); push blocked by missing `workflow` scope (D013); ci.yml in 289e50c
- [x] 7.2 release/codeql/audit — 289e50c (runs once pushed)
- [x] 7.3 engine-watch — 289e50c (+ engine-release.yml; `force_version` input for the simulated bump)
- [x] 7.4 renovate — 289e50c
- [x] 7.5 auto-update — 6b6d2e9
- [x] 7.6 RELEASING + ci:local — 289e50c / package.json ci:local
- [x] 7.7 v0.1.0 + v0.1.1 proof — tag `v0.1.0` on this commit; auto-update proven locally (UPDATE-PROOF.md, generic feed v0.1.0→v0.1.1); GitHub release runs once pushed (D013)

## Phase 8 — P1
- [x] 8.1 Content blocker — 2e3065d
- [x] 8.2 Site Control Center — 6b6d2e9
- [x] 8.3 Advanced themes — 6b6d2e9
- [x] 8.4 Reader mode — 2e3065d
- [x] 8.5 Extensions — 6b6d2e9

## Phase 9
- [x] 9.1 Review pass 1 — f83f6b0 (36 findings fixed)
- [x] 9.2 Review pass 2 — f11bbab (3 HIGH, 6 MEDIUM, 11 LOW + docs fixed; e2e 53/53 ×3, perf all ✅, coverage 98.5 %)
- [x] 9.3 Docs complete — f11bbab (README install status, SECURITY/ARCHITECTURE/EXTENSIONS accuracy, D017/D018, CHANGELOG)

## DoD checklist
See PLAN.md §DoD mirror below; all boxes must be ticked at the end.
- [x] e2e suite green 3× in a row — 150/150 (`--repeat-each 3`), 10/10 13:5x
- [x] install/dev/build/test/e2e/lint/typecheck green — `pnpm ci:local` exit 0 (2723534)
- [x] kill -9 session restore — restore.spec.ts
- [x] perf budgets (PERF.md) — 073e86b
- [x] zero any / zero warnings / core coverage > 85 % — eslint --max-warnings 0, core 98 % lines
- [x] SECURITY.md audit — 20-point checklist
- [x] accessibility — roving tree focus, ARIA tree/combobox/dialog roles, focus-visible
- [~] CI green on main, engine watch + renovate tested, v0.1.0 released, auto-update proven — workflows + Renovate ready, auto-update proven locally (UPDATE-PROOF.md); GitHub run requires the owner's push (D013)
- [x] docs complete — README (GIF), ARCHITECTURE, DECISIONS, SECURITY, RELEASING, CHANGELOG, docs/EXTENSIONS, PERF, UPDATE-PROOF
- [x] two review passes — f83f6b0 (pass 1, 36 findings), f11bbab (pass 2, 20 findings + docs)
