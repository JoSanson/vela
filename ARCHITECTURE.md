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
   (`main/store.ts`), which runs the core reducer. Subscribers react: `TabManager.reconcile`
   creates/attaches/detaches native views, the persist loop writes SQLite (debounced 150 ms,
   flushed on quit), and the shell/overlay receive the full new snapshot via `state/changed`.
2. **Renderers mirror.** On load a renderer calls `snapshot/get` (state + prefs + overlay state),
   stores it in Zustand, and applies every `state/changed`. Renderer-only UI state (sidebar width,
   find bar, inline edits) never leaves the renderer.
3. **Prefs** are a JSON file (`prefs.json`), broadcast via `prefs/changed`.
4. **History, downloads, permissions, boosts, favicons** are SQLite tables queried on demand.

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

## Build & release

electron-vite bundles `main`, `preload` (shell/tab, single-file) and the multi-page renderer
(index/overlay/little/pages). electron-builder packages dmg/zip (mac arm64+x64), nsis (win) and
AppImage/deb (linux); electron-updater checks GitHub Releases at launch and every 6 h. See
`RELEASING.md` for the pipeline and `.github/workflows/engine-watch.yml` for the automated
Electron (Chromium) bump.
