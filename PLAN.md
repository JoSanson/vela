# PLAN

Phases are sequential; tasks inside a phase may run in parallel when independent.
Checkboxes here mirror PROGRESS.md (PROGRESS.md is the source of truth with commit hashes).

## Phase 0 — Pilotage
- [x] CLAUDE.md, PLAN.md, DECISIONS.md, PROGRESS.md, git init

## Phase 1 — Skeleton that runs
- [x] 1.1 Monorepo: pnpm workspace, TS strict base config, ESLint flat config, Prettier, .npmrc hoisted
- [x] 1.2 `packages/shared`: IPC contract types + channel names
- [x] 1.3 `apps/desktop`: electron-vite (main/preload/renderer), BrowserWindow shell with strict CSP
- [x] 1.4 TabManager v0: create/activate/close `WebContentsView`, bounds follow sidebar width
- [x] 1.5 Renderer: sidebar (Today list), URL bar, back/forward/reload; `window.vela` preload API
- [x] 1.6 Security baseline: sandbox, contextIsolation, setWindowOpenHandler, permission handler, will-navigate guard, certificate interstitial
- [x] 1.7 Playwright _electron smoke test + screenshot; vitest wired

## Phase 2 — Core model (packages/core, no Electron)
- [x] 2.1 Types: Space, Tab (today/pinned), Folder (nested), Favorite, Profile, SplitLayout, Archive entry
- [x] 2.2 Reducer + actions: spaces CRUD, tabs CRUD, pin/unpin, folders, move/reorder (DnD semantics), favorites
- [x] 2.3 Auto-archive policy (12h/24h/7d/30d) + archive search/restore
- [x] 2.4 MRU ordering, split layouts (2–4 panes) per space
- [x] 2.5 ATC rules matcher (URL pattern → space/profile)
- [x] 2.6 Command ranking (fuzzy over tabs/archive/history/favorites/commands) < 30 ms for 10k items
- [x] 2.7 Persistence adapters: SQLite schema + versioned migrations (main), JSON prefs
- [x] 2.8 Coverage > 85 %

## Phase 3 — Navigation UX
- [x] 3.1 Sidebar full: Favorites grid, Pinned (rename, emoji, folders), Today, resize, hide (Cmd/Ctrl+S) + hover reveal, 60 fps
- [x] 3.2 Spaces UI: create/edit (name, emoji, theme gradient+grain, light/dark), dots, Ctrl+1..9, trackpad swipe
- [x] 3.3 Command bar (Cmd/Ctrl+T, Cmd/Ctrl+L): URL/search/suggestions/fuzzy/commands
- [x] 3.4 Tab switcher Ctrl+Tab MRU with previews
- [x] 3.5 Shortcuts: Cmd/Ctrl+W, Shift+T, R, zoom, fullscreen, back/forward buttons + gesture, find in page
- [x] 3.6 Split view 2–4 panes, resizable, DnD into pane, persisted per space
- [x] 3.7 Peek modal for favorites/pinned links + "open as tab"
- [x] 3.8 Little Vela: open-url / second-instance → floating window + "send to main → space"
- [x] 3.9 Drag & drop everywhere (reorder, folder, favorites, between spaces, into split)

## Phase 4 — Pages, media, lightness, comfort
- [ ] 4.1 DevTools, favicons, titles, audio badge + mute, notifications
- [ ] 4.2 Downloads panel with progress; vela://downloads
- [ ] 4.3 History (SQLite) + vela://history
- [ ] 4.4 Permissions manager per site + vela://settings/permissions
- [ ] 4.5 Auto PiP on tab switch (and return)
- [ ] 4.6 Memory saver (sleep after N min, exceptions, indicator) + lazy session restore
- [ ] 4.7 Boosts: per-domain CSS/JS, Zap element picker, presets, export/import
- [ ] 4.8 Air Traffic Control rules editor
- [ ] 4.9 Profiles (session partitions) attached to spaces
- [ ] 4.10 Import Chrome/Brave/Edge (bookmarks + history) at first run; JSON export/import of all state
- [ ] 4.11 Onboarding 3 screens, empty states, vela://shortcuts

## Phase 5 — Polish
- [ ] 5.1 Animations (transform/opacity, motion), theming across shell, grain
- [ ] 5.2 Accessibility: keyboard everywhere, focus visible, ARIA roles (sidebar tree, command bar combobox)
- [ ] 5.3 Error states (net errors, cert interstitial), tray/dock niceties

## Phase 6 — Perf
- [ ] 6.1 `pnpm perf`: cold start → sidebar interactive, shell RSS, tab switch, command bar open, bundle size, tracing for jank
- [ ] 6.2 Meet budgets, commit PERF.md

## Phase 7 — CI/CD & autonomy
- [ ] 7.1 GitHub repo (private), Actions: ci (lint/typecheck/unit/e2e xvfb/build matrix)
- [ ] 7.2 release.yml on tag → electron-builder → GitHub Releases; codeql.yml; audit.yml daily
- [ ] 7.3 engine-watch.yml every 6 h (bump Electron → CI → automerge → tag → release / issue on red)
- [ ] 7.4 renovate.json (Electron prioritised, automerge minor/patch)
- [ ] 7.5 electron-updater: check at launch + 6 h, silent download, install on quit, release notes UI
- [ ] 7.6 RELEASING.md (signing secrets), `pnpm ci:local`
- [ ] 7.7 v0.1.0 release; v0.1.1 auto-update proof script

## Phase 8 — P1
- [ ] 8.1 Content blocker (@ghostery/adblocker-electron, per-site toggle, counter)
- [ ] 8.2 Site Control Center popover
- [ ] 8.3 Advanced themes (palette from image, glass)
- [ ] 8.4 Reader mode (@mozilla/readability)
- [ ] 8.5 Unpacked Chrome extensions (MV3 subset doc + 2 extensions tested)

## Phase 9 — Final review (2 passes minimum)
- [ ] 9.1 Senior Chromium-engineer review pass 1 → tasks → fix → full DoD
- [ ] 9.2 Pass 2 → full DoD
- [ ] 9.3 Docs: README (GIF), ARCHITECTURE, SECURITY, RELEASING, CHANGELOG
