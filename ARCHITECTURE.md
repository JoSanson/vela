# Architecture

Vela is an Electron app with three kinds of processes and one source of truth.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ main process (Node)                                                                  │
│                                                                                      │
│   Store(CoreState) ──reduce()──► subscribers: TabManager · persistLoop(SQLite)        │
│        ▲                                            · emit('state/changed') → shells │
│        │ dispatch(CoreAction)                                                        │
│   IPC handlers (ipc/handlers.ts)  ◄── ipcMain.handle('vela:*') ◄── preload bridge    │
│                                                                                      │
│   WindowManager ─ MainWindow(BrowserWindow) ─ contentView                            │
│                        ├─ [shell page: file://index.html]  (bottom)                  │
│                        ├─ WebContentsView per *visible* tab (active or split panes)  │
│                        ├─ OverlayManager view (transparent, only while open)         │
│                        └─ PeekManager view (above the overlay)                       │
│   LittleWindow(s): BrowserWindow + one WebContentsView                               │
│                                                                                      │
│   SessionManager: persist:default + persist:profile-<id>; each session gets          │
│     vela:// protocol, permission handlers, download tracking, UA cleanup             │
│   Services: TabManager · OverlayManager · PeekManager · DownloadManager ·            │
│     PermissionManager · BoostsManager · FaviconCache · UpdateManager ·               │
│     maintenance (memory saver, auto-archive) · auto PiP · find · suggest · menus     │
└──────────────────────────────────────────────────────────────────────────────────────┘
          │ typed IPC (packages/shared/src/ipc.ts)                        ▲ events
          ▼                                                               │
┌──────────────────────────┐  ┌──────────────────────────┐  ┌────────────────────────┐
│ shell renderer (React)   │  │ overlay renderer (React) │  │ tab renderers          │
│ sidebar, find bar, split │  │ command bar, switcher,   │  │ websites (no bridge)   │
│ handles, downloads panel │  │ space editor, peek chrome│  │ vela:// pages (bridge) │
│ Zustand mirror of state  │  │ permission prompt, …     │  │ history/archive/…      │
└──────────────────────────┘  └──────────────────────────┘  └────────────────────────┘
```

## Packages

- `packages/core` — the domain: `CoreState` (spaces, tabs, folders, favorites, MRU, archive, ATC
  rules, profiles), the pure `reduce(state, action)`, selectors, URL parsing, ATC matching, fuzzy
  ranking. No Electron, no Node, no DOM; 98 % covered by Vitest.
- `packages/shared` — the IPC contract (`IpcInvokeMap`, `IpcEventMap`, `VelaBridge`), prefs,
  shortcuts, and the layout geometry shared by main and renderer (`contentBounds`, `paneRects`).
- `apps/desktop` — main process, preloads, renderers, e2e, perf.

## State and data flow

1. **Main owns the model.** Every mutation is a `CoreAction` dispatched to the `Store`
   (`main/store.ts`), which runs the core reducer and bumps a revision. Subscribers react:
   `TabManager.reconcile` creates/attaches/detaches native views, the persist loop writes SQLite
   (debounced 150 ms, row-level upserts, retried with backoff, flushed on quit), and the actions of
   one tick are coalesced into a single `state/changed` delta `{fromRev, rev, actions}` for the
   shell, the overlay, every internal page and the Peek view (D019). Actions that depend on the
   archive (`archive/*`, `state/replace`) are sent as a snapshot instead; renderers never hold the
   archive (D016).
2. **Renderers mirror.** On load a renderer calls `snapshot/get` (state + revision + prefs +
   overlay state), stores it in Zustand, and replays every delta through the same pure reducer
   (`packages/core/src/delta.ts`). A revision gap triggers a fresh `snapshot/get`. Renderer-only UI
   state (sidebar width, find bar, inline edits) never leaves the renderer.
3. **The database heals itself** (`main/db/database.ts`, D023): `quick_check` at open, a backup
   before any migration and daily, quarantine + restore from the newest backup on corruption, a
   refusal to open a schema newer than the binary, and row-by-row tolerant loads.
4. **Prefs** are a JSON file (`prefs.json`, debounced, fsync'd, with a `.bak`), broadcast via
   `prefs/changed`.
5. **History (FTS5), downloads, permissions, boosts, favicons** are SQLite tables queried on demand.

## Lifecycle of a tab

```
openUrl(input) ─► resolveInput (URL vs search) ─► matchAtc (route to a space)
   ─► dispatch tab/open ─► reducer inserts in Today (top) and activates
   ─► TabManager.reconcile: ensureView → new WebContentsView(session, preload tab.js, sandbox)
        wire events (title, favicon→FaviconCache, nav, audio, focus, fullscreen, crash)
        addChildView + setBounds(contentBounds / paneRects) + setBorderRadius
activate another tab ─► reconcile: new view attached first, old view snapshotted (switcher
   preview) then detached (removed from the view tree → Chromium throttles it)
memory saver (idle N min, not visible/audible/always-active) ─► sleep(): scrollY captured,
   WebContents closed, tab marked sleeping (url/title/favicon kept) ─► wake on activate:
   view recreated, URL loaded, scroll restored
close ─► Today: tab/close → archived (reason closed/auto/manual); pinned/favorite: tab/reset
   (unloaded, returns to homeUrl) and the next MRU tab is activated
startup ─► StateRepo.load() marks every tab loaded:false; only visible tabs get views (lazy)
quit / kill -9 ─► state is already on disk (WAL); next launch restores spaces, tabs, folders,
   active tab, MRU and archive
```

## Internal pages

`vela://<page>/` is a privileged scheme registered per session. `protocol.ts` serves
`pages.html` (one React app routing on `location.hostname`) and its assets from the renderer
bundle, with a strict CSP header; `vela://favicon/<host>` serves cached icons. Internal pages
get the `window.vela` bridge (tab preload) with the `internal` IPC access level.

## Overlays

Native views cannot be covered by DOM, so anything that must float above a page lives in the
overlay view (see DECISIONS.md D010): command bar, Ctrl+Tab switcher, space editor, peek chrome,
permission prompts, update notes and the floating sidebar shown when hovering the hidden sidebar's
edge. Peek content is a separate view stacked above the overlay.

## Windows

Every main window shows exactly one Space and a Space lives in one window at a time (D024).
`WindowManager` keeps the focus order (`main` is the focused or most recently focused window),
`TabManager` attaches each live view to the window of its Space and re-parents the single overlay
and Peek views to the window being acted on. Activating a Space from a window that does not show
it swaps the two windows' Spaces rather than duplicating one.

## Safety and privacy features

`safeBrowsing.ts` loads the bundled phishing/malware lists (`resources/safebrowsing/list.json`)
and refreshes them daily; `blocker.ts` consults it for every main-frame request before the ad
engine, and `TabManager` turns the cancelled load into the `vela://error/?kind=unsafe`
interstitial (D026). `credentials.ts` is the password manager: secrets are encrypted with
`safeStorage`, login forms are detected by the tab preload in an isolated world, and the autofill
and save prompts are overlay views positioned under the field.

## Localisation

`packages/shared/src/i18n` holds typed dictionaries (English is the key set, French must cover
it) and a dependency-free ICU subset (D027). Main exposes `ctx.i18n.t` for menus and dialogs;
renderers call `useT()` from `lib/i18n.ts`, fed by the snapshot (`prefs.language` +
`systemLocale`). Changing the language in Settings rebuilds the menu and re-renders every window.

## Build & release

electron-vite bundles `main`, `preload` (shell/tab, single-file) and the multi-page renderer
(index/overlay/little/pages). electron-builder packages dmg/zip (mac arm64+x64) and nsis (win);
electron-updater checks GitHub Releases at launch and every 6 h. See
`RELEASING.md` for the pipeline and `.github/workflows/engine-watch.yml` for the automated
Electron (Chromium) bump.
