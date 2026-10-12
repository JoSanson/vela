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

## D003 — Package manager layout (revised)
Context: pnpm + electron-builder + native module (`better-sqlite3`).
Options: default isolated `node_modules` vs `node-linker=hoisted`.
Choice: **default isolated layout** (initially hoisted, reverted in 7.7).
Why: electron-builder 26 collects production dependencies through `pnpm list --prod --json`, whose
paths point into `node_modules/.pnpm`; with `node-linker=hoisted` that store does not exist, the
collector logs "cannot find path for dependency better-sqlite3@undefined" and ships an app.asar
without `better-sqlite3`/`electron-updater` (the packaged app cannot start). The isolated layout
packages correctly (verified by listing app.asar) and `@electron/rebuild` still rebuilds the
native module from `postinstall`.

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

## D010 — Overlay view for everything that must float above web content
Context: tab views are native `WebContentsView`s stacked above the shell page, so the shell cannot
draw on top of pages. Options: shrink the active view; a transparent window; a dedicated view.
Choice: one always-loaded transparent `WebContentsView` ("overlay") attached only while an overlay
(command bar, switcher, space editor, peek chrome, permission prompt, floating sidebar) is open.
Peek content is a second view added above the overlay so clicks reach the page.
Why: instant (< 16 ms, the page is pre-rendered), no window juggling, one React app.

## D011 — Single main window in v1
Context: a `WebContentsView` can only live in one window; `activeSpaceId` is global state.
Choice: one main window; Cmd+N opens a Little window instead. Multi-window is deferred.

## D012 — Peek trigger heuristic
Choice: only cross-registrable-domain navigations that start < 600 ms after a mouse click in a
pinned/favorite tab open Peek, and never for URLs that look like auth flows (oauth/login/sso…).
Why: avoids breaking SSO redirects while matching Arc's behaviour for ordinary links.

## D013 — GitHub push needs the `workflow` scope
Context: `gh repo create --push` was rejected ("refusing to allow an OAuth App to create or update
workflow … without `workflow` scope"). Re-authentication is interactive.
Choice: repo created (private, empty); everything is ready locally; the owner runs once:
`gh auth refresh -h github.com -s workflow && git -C ~/dev/vela push -u origin main --tags`.
Auto-update is proven locally with a generic feed server instead of GitHub Releases.

## D014 — Reserved vs unreserved shortcuts
Context: menu accelerators always win, so ⌘S/⌘D/Ctrl+1…9 never reached pages (Docs, Figma…).
Choice: `ShortcutDef.reserved`. Reserved shortcuts stay menu accelerators. Unreserved ones have no
accelerator; the tab preload listens for them on `window` and forwards the id to main *after*
dispatch, only if the page did not `preventDefault()`. The shell handles them itself when focused.
Why: matches Chrome's behaviour; keeps the sandboxed preload exposing nothing to pages (it only
sends a fixed id that main validates against the unreserved set).

## D015 — window.open popups are child windows
Context: returning `{action:'deny'}` + opening a tab makes `window.open()` return `null`, which
breaks OAuth/payment popups relying on `window.opener`/`postMessage`. A `createWindow` returning a
`WebContentsView` left the renderer waiting forever in Electron 44.
Choice: `disposition === 'new-window'` → `action: 'allow'` with hardened
`overrideBrowserWindowOptions`; the child window gets the tab guards in `did-create-window`.
Plain links (`target=_blank`, middle-click) still open as tabs.

## D016 — Broadcast state without the archive
Context: every navigation tick (title/favicon/loading) re-sent the whole state, including up to
5000 archive entries, to three renderers.
Choice: `state/changed` carries `archive: []`; the archive page and the command bar fetch
`archive/search` on demand. Native layout/re-stacking happens only when the visible panes change.

## D017 — Favicon URLs carry a per-launch token

A `Referer` check alone does not protect `vela://favicon/<host>` (review pass 2): a hostile page
can load it with `referrerpolicy="no-referrer"` and learn, through `onload`/`onerror`, which hosts
the user visited. The served path is now `vela://favicon/<token>/<host>` with a random 128-bit
token per launch. Persisted URLs (tab state, history) stay tokenless; the renderer inserts the
current token (from `snapshot/get`) when it renders an `<img>`. Icons that cannot be cached are
not shown rather than loaded from the remote URL, so the shell genuinely never contacts websites.

## D018 — Peek promotion hands the view over before the dispatch

"Open as tab" from Peek used to dispatch `tab/open` and then adopt the peek view; `reconcile` ran
in between and created a second renderer for the same URL (leaked, never attached). The view is now
registered in `TabManager` first (`openWithView`), then the tab is opened: reconcile finds the
existing view and attaches it. Same ordering rule for "unloading" a pinned tab: the active tab
changes before `tab/reset`, so no throw-away renderer is spawned.

## D019 — Renderers replay actions, main broadcasts deltas

Every state tick used to ship the whole `CoreState` to the shell, the overlay and each internal
page (95 KB at 200 tabs, ~1 MB at 2000, several times per navigation). Main now coalesces the
actions of one tick into a single `state/changed` delta `{fromRev, rev, actions}`; renderers run
them through the same pure reducer (`packages/core/src/delta.ts`) and keep the archive empty
(D016). Actions whose result depends on the archive (`archive/*`, `state/replace`) are sent as a
snapshot. A revision gap triggers a `snapshot/get` resync, so a renderer that loads late or drops
a message heals itself.

## D020 — Private browsing is a Space with an ephemeral profile

Rather than a separate window kind (D011 keeps one main window), a private space uses a profile
whose partition has no `persist:` prefix: Chromium keeps cookies and storage in memory, main
records no history and caches no favicons for it, the reducer never archives its tabs, the state
repository never writes them, and `dropEphemeralTabs` removes them at the next start. The space
itself (name, theme) survives so the user keeps their "Private" entry point.

## D021 — HTTPS-first with silent fallback

Typed hosts already defaulted to https. Now every plain `http://` main-frame navigation to a
non-local host is upgraded; if the https attempt fails (connection or certificate error) the
original http URL loads and the host is remembered for the session. Local hosts (localhost,
RFC 1918 ranges, `*.local`) are never upgraded. Chrome calls this HTTPS-Upgrades.

## D022 — External-app links ask once per scheme

`zoommtg:`, `slack:`, `vscode:`… were silently dropped by the window-open and navigation guards.
They now go through `ExternalLinkManager`: an overlay prompt ("Open in app?") with a remembered
per-scheme answer in prefs. `javascript:`, `file:` and `vela:` stay blocked unconditionally.

## D023 — The state database heals itself

`openDatabase` runs `quick_check`, refuses a schema newer than the binary (so a downgrade never
destroys data), takes a `VACUUM INTO` backup before any migration and daily, and on corruption
quarantines the file and restores the newest backup (or starts fresh) with a toast. Rows that fail
to parse are skipped individually. Saves are diff-based upserts and retried with backoff instead of
being dropped when the disk is full.

## D024 — Windows show Spaces; a Space lives in one window at a time

Multi-window replaces D011. Every main window displays exactly one Space; opening a Space that
another window already shows swaps the two windows' Spaces, so a tab's native view only ever has
one parent. `WindowManager.main` is "the window to act on" (focused, else most recently focused):
menus, ⌘T and prompts target it. The overlay (command bar, switcher, prompts) and Peek are single
views re-parented to the acting window, like a system sheet. Each renderer sees `activeSpaceId`
as the Space of its own window (`window/space`), while main's global `activeSpaceId` follows
focus. ⌘N opens a window on the first Space no window displays, creating one if needed.


## D025 — Browser import: Arc keeps its structure, Safari goes through XML plists

Arc's `StorableSidebar.json` is mapped 1:1 instead of being flattened into bookmarks: each Arc
space becomes a Vela Space (name, emoji, theme derived from `primaryColorPalette.midTone` with the
"to" stop pulled 55% towards `tintedLight`, else a preset), the pinned container becomes pinned
tabs and nested folders in order, the unpinned container becomes today tabs, every top-apps
container feeds the global favorites. Split views are flattened into their parent. URLs are
deduplicated per space and across favorites. Imported today tabs keep Arc's `createdAt` but get
`lastActiveAt = now` so auto-archive does not sweep them before the user has seen them. Arc has
no bookmarks of its own, so its row offers "Recreate Spaces, pinned tabs and favorites" and
history (the Chromium `User Data/Default/History`). Arc profiles are not mapped to Vela profiles.

Safari's `Bookmarks.plist` is converted with `plutil -convert xml1` and read by a small XML plist
parser rather than `-convert json`: plutil refuses to emit JSON for plists containing `<date>` or
`<data>`, and the Reading List carries both. `~/Library/Safari` is TCC-protected: `stat` succeeds
but `open` fails with EPERM, so detection opens the files and reports "Grant Vela Full Disk
Access…" instead of listing Safari as available. Firefox uses the most recently modified
`places.sqlite` across profiles; `profiles.ini` is not consulted. Every sqlite read goes through a
temp copy including `-wal`/`-shm`/`-journal` siblings.

## D026 — Safe browsing from local lists, not a remote lookup API

Known phishing and malware URLs are checked against lists kept on disk (URLhaus hosts and the
OpenPhish feed, bundled at build time by `scripts/fetch-safebrowsing.mjs` and refreshed daily
into `userData/safebrowsing.json`). Google Safe Browsing's Update API would be more complete but
needs an API key, quota and a privacy story for hash prefixes; the local lists cost nothing, never
send a URL anywhere and are good enough to stop the bulk of what people actually click. The check
runs in the content blocker's always-on `onBeforeRequest` for main frames: the request is
cancelled, and the tab's `did-fail-load` turns that failure into the interstitial (racing
`loadURL` against Chromium's own error page proved order-dependent). "Visit anyway" allows the
host until restart only.

## D027 — Localisation with a 90-line ICU subset and typed dictionaries

Strings live in `packages/shared/src/i18n/{en,fr}/<area>.ts` as flat objects; the French file
`satisfies Record<keyof typeof en, string>` so a missing translation is a type error, and the unit
test refuses empty strings. The runtime supports `{name}` and `{n, plural, …}` only, resolved with
`Intl.PluralRules`; i18next/FormatJS would add ~100 kB to each renderer for features a browser
shell does not need. The locale is `prefs.language` ('system' | 'en' | 'fr') resolved against
`app.getLocale()` (pinned by `VELA_LOCALE` in tests); main rebuilds the application menu on change
and every renderer re-renders through `useT()`. English messages are byte-identical to the
previous hard-coded strings so the e2e suite doubles as a regression test for the extraction.

## D028 — Arc migration reads the browser's own encrypted stores, with the user's keychain consent

Arc, Chrome, Brave and Edge keep passwords (`Login Data`) and cookies (`Cookies`) in SQLite,
encrypted with AES-128-CBC under a key derived from a random password stored in the OS keychain
("Arc Safe Storage"). Vela decrypts them locally: on macOS the `security` CLI asks the user once
to allow Vela to read that keychain item; on Linux the basic backend's fixed password is used;
Windows (DPAPI) is not supported yet. Cookies land in the Vela profile that matches the Chromium
profile directory (names from `Local State`), so sessions never mix; passwords go through the
same `safeStorage` store as the password manager. Nothing leaves the machine, and importing again
reuses spaces and profiles instead of duplicating them (folders of the same name are refilled,
not twinned). The grid folds beyond twelve with a "+N" tile.

## D029 — Favorites belong to a profile, not to a Space nor to the whole browser

Arc attaches favorites (top apps) to a profile: every Space that uses the profile shows the same
row, and two Spaces on different profiles show different ones. Vela had a single global grid, so
an owner with one Arc profile per Space saw one merged, wrong grid everywhere. A favorite now
carries `profileId` (null = the default profile), `favoriteTabs(state, spaceId)` returns the ones
of that Space's profile, a tab favorited from a Space takes the Space's profile, and the favorite
browses with that profile's session (cookies, logins) exactly like the Space's own tabs. Arc import
writes each top-apps container into the Vela profile its Arc profile maps to, and adopts the
profile-less favorites of an earlier import rather than duplicating them. Changing a Space's
profile does not move favorites along, as in Arc. Spaces stay 100 % independent: one profile per
Space gives separate cookies, passwords, history partitions and favorites.

## D030 — Spaces are sealed: tabs, archive and history never cross over

The owner's model is one Space = one world. Beyond cookies and logins (the profile, D029), the
command bar used to list every open tab, archived tab and history entry of the browser, and the
history was a single list. Now: the command bar indexes only the current Space's tabs (plus the
favorites of its profile), its archive and its history; a page's history row stays unique (full-text
index, favicon) but each Space keeps its own presence and visit counts in `history_spaces`, written
by the tab, Peek and Little Vela that visited it (a favorite files under the Space it is open in).
Arc import writes each Arc profile's history into every Space mapped to that profile. The history
page (vela://history) still shows everything, for search and deletion. Visits recorded before this
change carry no Space and therefore only appear on the history page.

## D031 — One Spaces palette instead of an endless row of dots

With a dozen Spaces the bottom row overflowed and gave no clue which dot was which. The row now
scrolls (the active Space is always brought into view) and a palette (⌘⇧S, the layers button, the
Spaces menu) shows every Space as a card: colour, emoji, name, profile, tab count, ⌃n shortcut, with
instant search over names and profiles and full keyboard navigation. Space management (rename,
colour, profile, delete) stays in the Space editor, one right-click away from each card.

## D033 — Sidebar motion follows a spring, with Arc's measured parameters

Ghidra on Arc 1.167.0 (study of 2026-10-11, tools under `~/dev/tools`) shows the sidebar's
collection-view transitions driven by a Motion spring with two regimes, response 0.3 s / damping
ratio 0.99 (programmatic) and 0.55 s / 0.94 (gesture), settle epsilon 0.001, and an
`EdgeFeedbackView` of 30 pt sliding from −35 px to +12 px as a spring-driven progress. Vela's
sidebar slide used a 220 ms ease-out-quint; it now integrates a damped spring (`@vela/shared`
`Spring`, SwiftUI parametrisation) with the crisp regime for both directions, clamped to the
travel so no pixel ever shows past the edge, and an `EdgeHint` tab peeks out of the left edge as
the pointer comes within 40 px while the sidebar is hidden. The gesture regime is exported for the
floating sidebar once it moves off CSS keyframes. Animations stay on transform/opacity only.

## D032 — Pages see a Chromium browser, not an Electron shell

Google's sign-in rejected Vela after the e-mail step ("this browser or app may not be secure").
Probing from hidden windows (fresh sessions, fake e-mail) showed what matters: stripping the
`Electron/` and `Vela/` tokens is not enough, the full `Chrome/152.0.7977.130` build number is a
tell (Chrome sends `152.0.0.0` since its user-agent reduction), and above all Electron leaves
`window.chrome` empty while every Chromium browser (Chrome, Edge, Brave, Arc) exposes `chrome.app`,
`chrome.runtime`, `chrome.csi` and `chrome.loadTimes`. The tab preload now installs those stubs in
the main world at document-start on http(s) pages; the client-hint brands stay honest
(`Chromium` only, no "Google Chrome"), and `Sec-CH-UA` is left alone because Chromium refuses
requests whose client-hint headers were rewritten. The probe scripts live outside the repo; the
behaviour is covered by the user-agent unit test and by hand on accounts.google.com.


## D034 — The README names Arc (nominative use)
Context: the launch positions Vela as the open-source Arc alternative; the earlier rule banned the
Arc name everywhere.
Choice: Arc is named in docs, the README, repo topics and the benchmark, only to describe
compatibility and compare, with a "not affiliated with The Browser Company or Atlassian" notice.
No Arc logo, screenshot of Arc's UI or asset anywhere; the app's branding and UI stay Vela-only
(the importer's source list is the one place the UI says "Arc").
Why: comparative, nominative use is what every "X alternative" project does and is what people
search for; the notice and the absence of marks keep it from implying endorsement.

## D035 — GPL-3.0-or-later, with the name and logo reserved
Context: the owner does not want Vela forked into a closed, paid product; Chrome extension APIs
that Electron lacks are best covered by electron-chrome-extensions, which is GPL-3.0 (or a paid
proprietary licence). The repository had never been published and has a single author, so the
licence could change at no cost.
Choice: the whole project moves from MIT to GPL-3.0-or-later. TRADEMARKS.md reserves the "Vela"
name and logo: forks must rebrand. Contributions are accepted under the same licence
(inbound = outbound, stated in CONTRIBUTING.md).
Why: copyleft keeps every distributed fork open source, which removes the business case for a
closed commercial copy while staying OSI open source (the positioning and contributors need that).
The trademark policy, not the licence, is what stops a look-alike "Vela" from riding the brand.
