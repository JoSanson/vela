# Decisions

Format: context → options → choice → why. Newest at the bottom.

## D001 — Name
Context: need a short original name, MIT, no Arc trademark.
Options: Vela, Kite, Fjord, Halo.
Choice: **Vela** (the Sails constellation). Internal scheme `vela://`, app id `app.vela.browser`.
Why: short, pronounceable, no major browser uses it, evokes navigation.

## D002 — Shell window type
Context: tabs must be `WebContentsView`s managed by main. The shell UI needs its own web contents.
Options: (a) `BaseWindow` + one `WebContentsView` for the shell + one per tab; (b) `BrowserWindow`
(whose own `webContents` renders the shell) + tab `WebContentsView`s added to `win.contentView`.
Choice: **(b)**.
Why: `BrowserWindow` extends `BaseWindow` and exposes `contentView`; Playwright `_electron`
`firstWindow()` resolves the shell page directly; native title-bar/traffic-light options are richer.
Tab views are layered above the shell view and positioned to the content area.

## D003 — Package manager layout
Context: pnpm + electron-builder + native module (`better-sqlite3`).
Options: default isolated `node_modules` vs `node-linker=hoisted`.
Choice: **`node-linker=hoisted`** in `.npmrc`.
Why: electron-builder's file collection and `@electron/rebuild` are most reliable with a flat
`node_modules`; avoids symlink edge cases in asar packaging. Still pnpm lockfile + workspaces.

## D004 — TypeScript version
Context: `npm view typescript version` returns 7.x (Go-based compiler). ESLint/typescript-eslint and
electron-vite/esbuild ecosystems target 5.x.
Choice: **TypeScript 5.9.x** pinned.
Why: avoids ecosystem breakage; strictness flags identical.

## D005 — Renderer state model
Context: tabs/spaces live in main (they own `WebContents`). Renderer must render them at 60 fps.
Options: renderer owns the model and asks main to mirror; main owns, renderer mirrors.
Choice: **main owns the model** (`packages/core` reducer run in main); renderer receives full
snapshot on connect then incremental patches, stored in a Zustand store.
Why: single source of truth, survives renderer reload, lets `kill -9` restore from SQLite written
by main on every mutation (debounced 150 ms + flush on quit).

## D006 — Internal pages
Context: history, downloads, settings, shortcuts, archive, onboarding, error interstitials.
Choice: `vela://` privileged scheme registered via `protocol.registerSchemesAsPrivileged` and served
with `protocol.handle` from the renderer bundle (multi-page vite build). Each internal page is a
normal tab (`WebContentsView`) with `sandbox: true` and the internal preload.
Why: same security posture as web tabs, no special-casing in TabManager, testable in e2e.

## D007 — Memory saver implementation
Context: sleeping tabs must free ~all memory.
Choice: destroy the `WebContents` (`view.webContents.close()` + remove child view). Keep
`{url,title,favicon,scrollY,navigationHistory}` in core state; recreate on activate; restore scroll via
`executeJavaScript` after `did-finish-load`. Never sleep tabs that are audible, pinned-always-active,
or currently in a visible split pane.
Why: `webContents.setBackgroundThrottling` alone keeps the renderer process alive; destroying is the
only way to reach ≈0 MB.

## D008 — Background tab load reduction
Choice: non-active visible-less views get `setBackgroundThrottling(true)` (default), are removed from
the window's view tree (`removeChildView`) rather than hidden, so Chromium treats them as occluded
and throttles timers/rAF; media-playing tabs keep playing (audio continues when occluded).
Why: `setVisible(false)` on a child view keeps compositor resources; detaching from the tree releases them.

## D009 — e2e runner on macOS
Context: spec asks for `xvfb-run` when no display. Dev machine is macOS with a display.
Choice: `pnpm e2e` runs headed on macOS; CI linux job wraps with `xvfb-run -a`. Script detects
`process.platform === 'linux' && !process.env.DISPLAY`.
