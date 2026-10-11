# Security

Vela embeds Chromium through Electron. The shell (sidebar, overlays, internal pages) is a privileged
web app; every website runs in its own sandboxed `WebContentsView`. This document audits the
Electron security checklist point by point against the code, and describes the trust boundaries.

## Trust boundaries

| Context | Process | Preload | IPC access | Notes |
| --- | --- | --- | --- | --- |
| Shell (`index.html`), overlay, Little bar | renderer, `sandbox: true` | `preload/shell.ts` | **shell** (all channels) | Trusted by `WebContents.id` registered at creation (`trustShell`). |
| Internal pages (`vela://…`) | tab renderer, `sandbox: true` | `preload/tab.ts` | **internal** subset | Bridge is only exposed when `location.protocol === 'vela:'`; main re-checks `senderFrame.url` and that the frame is top-level. |
| Websites (`http(s)://`) | tab renderer, `sandbox: true` | `preload/tab.ts` (exposes nothing) | none | Any `vela:` invoke from a web origin is rejected in `ipc/typed.ts`. |

## Checklist (Electron security recommendations)

| # | Item | Status | Where |
| --- | --- | --- | --- |
| 1 | Only load secure content | ✅ | Tabs may load http/https; the shell is `file://` / dev server only. `allowRunningInsecureContent: false` everywhere. |
| 2 | Disable Node integration in renderers | ✅ | `nodeIntegration: false` in `windows/mainWindow.ts`, `tabs/tabManager.ts` (`webPreferences()`), `overlay.ts`, `windows/littleWindow.ts`. |
| 3 | Enable context isolation | ✅ | `contextIsolation: true` in all four places above. |
| 4 | Process sandboxing | ✅ | `sandbox: true` in all four places. Preloads are single-file bundles with no `require` beyond `electron` (`isolatedEntries`-style, see `electron.vite.config.ts` + inlined `channel()`). |
| 5 | Handle session permission requests | ✅ | `security.ts::hardenSession` → `setPermissionRequestHandler` / `setPermissionCheckHandler` / `setDevicePermissionHandler` (deny) / Bluetooth pairing (deny) / `setDisplayMediaRequestHandler` (prompt, then primary screen). Unknown permissions are denied; `notifications`, `geolocation`, `camera`, `microphone` (decided separately), `display-capture`, … prompt the user through `permissions.ts` and are persisted per origin in SQLite. A pending prompt is denied automatically when the requesting document navigates or closes. The default session (shell) is hardened too. |
| 6 | Do not disable `webSecurity` | ✅ | `webSecurity: true` explicitly; never set to false anywhere (`grep -r "webSecurity" apps`). |
| 7 | Define a Content Security Policy | ✅ | Shell/overlay/little HTML carry a strict `<meta http-equiv="Content-Security-Policy">` (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-src 'none'`). Internal `vela://` responses set the same policy as a header in `protocol.ts`. `style-src 'unsafe-inline'` is required by Vite's dev injection and CSS-in-JS-free runtime styles; scripts stay strict. |
| 8 | Do not enable `allowRunningInsecureContent` | ✅ | Explicitly `false`. |
| 9 | Do not enable experimental features | ✅ | Not set anywhere. |
| 10 | Do not use `enableBlinkFeatures` | ✅ | Not set. |
| 11 | `<webview>`: do not use / `will-attach-webview` | ✅ | `webviewTag: false`; `will-attach-webview` is prevented for every `WebContents` in `security.ts::installAppSecurity`. Tabs are `WebContentsView`s managed by main. |
| 12 | Verify WebView options before creation | ✅ | N/A (no webviews). |
| 13 | Disable or limit navigation | ✅ | Shell/overlay/little: `will-navigate` → `preventDefault`. Tabs: `will-navigate`/`will-redirect` block `file:` and `vela:` targets (web pages cannot open internal pages). Peek/Little views same rule. |
| 14 | Disable or limit creation of new windows | ✅ | `setWindowOpenHandler` on every `WebContents`: shell/overlay/little deny; tabs route `http(s)` links to a new tab and let `window.open()` popups (OAuth/payment flows that need `window.opener`) open as child windows created with the same hardened `webPreferences` (`did-create-window` wires their guards); `mailto:`/`tel:` → `shell.openExternal`; everything else dropped. |
| 15 | Do not use `shell.openExternal` with untrusted content | ✅ | Only `https?:`/`mailto:` URLs reach `openExternal` (`handlers.ts`, `tabManager.ts`, `contextMenu.ts`). |
| 16 | Use a current version of Electron | ✅ | Pinned exact (`44.7.0`), bumped automatically by `engine-watch.yml` and Renovate within 24 h of a stable release. |
| 17 | Validate the `sender` of all IPC messages | ✅ | `ipc/typed.ts::handle` checks `trustedShell` ids or (`internal` access) `senderFrame.url.startsWith('vela://') && senderFrame.parent === null`. Untrusted senders throw. |
| 18 | Avoid usage of the `file://` protocol, prefer custom protocols | ✅ | Internal pages use the privileged `vela://` scheme (`standard`, `secure`, `supportFetchAPI`); only Vela's own shells (main window, overlay, Little bar) are `file://` in production (read-only bundle, `will-navigate` blocked). |
| 19 | Check which fuses you want to change | ⚠️ | Default Electron fuses. `RunAsNode`/`EnableNodeCliInspectArguments` are left enabled so `ELECTRON_RUN_AS_NODE` tooling works; flipping them in `electron-builder.yml` afterPack is a one-liner once signing is in place. |
| 20 | Do not expose Electron APIs to untrusted web content | ✅ | `contextBridge` exposes only typed `invoke/send/on` wrappers over `vela:`-prefixed channels; `ipcRenderer` itself is never exposed. |

## Additional hardening

- **Certificate errors** are never auto-accepted: `app.on('certificate-error')` denies, loads
  `vela://error/?kind=cert` with issuer/subject/validity, and the user may proceed only for the
  exact fingerprint (session-scoped allow list `tabs.trustedCertificates`).
- **User agent**: the `Electron/…` and `Vela/…` tokens are stripped (`sessions.ts`) so sites apply
  their Chrome code paths; no extra identifying headers are added.
- **Favicons** are fetched by main through the tab's own session and served from SQLite as
  `vela://favicon/<token>/<host>`; icons that cannot be cached (too large, non-image, network error)
  are simply not shown, so the shell never contacts websites. `<token>` is a 128-bit per-launch
  secret handed only to Vela's documents through `snapshot/get` (persisted URLs are tokenless and
  the renderer inserts it): a web page cannot probe visited hosts even with `referrerpolicy=no-referrer`.
  Requests with a web `Referer` are refused as well.
- **Certificate errors on subresources** (images, iframes, XHR) are simply blocked; only a failing
  main-frame navigation (including the target of a redirect) shows the interstitial. Both cases
  are covered by e2e tests against a local self-signed server.
- **Internal pages** never receive file contents or paths: imports go through `import/fromFile`
  (main opens the dialog and reads the file itself) and `extensions/load` ignores paths coming
  from pages.
- **Zap selectors** returned by the page are validated (must be a string, no `{}`/`;`/comments,
  length-capped) before being compiled into user CSS.
- **Keyboard shortcuts**: reserved ones (⌘T/W/L, Ctrl+Tab, …) are menu accelerators; unreserved
  ones (⌘S, ⌘D, ⌘F, zoom, Ctrl+1…9, …) reach the page first and only act when the page did not
  `preventDefault()`, like Chrome (the preload listens in the capture phase so `stopPropagation()`
  cannot hide the key).
- **Permission prompts** never replace an overlay the user is interacting with (command bar,
  switcher…): they wait for it to close. Camera and microphone are decided separately, stopping at
  the first denial. System-audio loopback for screen sharing is only requested on Windows.
- **Import** of a JSON export backs up the database (`VACUUM INTO`, last three kept) and sanitises
  the state (string ids, only `http(s)`/`vela://` URLs, dangling references dropped, prefs
  shape-checked key by key, no extension paths or window geometry from the file).
- **Downloads** are written to `~/Downloads` (or the folder chosen in Settings) with unique names,
  or through a save dialog when "Ask where to save" is on; no automatic opening.
- **HTTP authentication** challenges (`app.on('login')`) are answered through an overlay prompt
  tied to the requesting tab; a navigation or close cancels the challenge.
- **External-app links** (custom URL schemes) never navigate; the user is asked per scheme and
  the answer can be remembered. `javascript:`, `file:` and `vela:` are always refused.
- **Private spaces** use in-memory partitions: no cookies, history, favicons or tab rows reach the
  disk, and their tabs are dropped at the next start (D020).
- **HTTPS-first**: plain `http://` navigations to public hosts are upgraded; a failing upgrade
  falls back to http once per host and session (D021). Every request carries `Sec-GPC: 1`.
- **Crash reports** are minidumps kept locally (`crashReporter` with `uploadToServer: false`);
  nothing is sent anywhere.
- **IPC boundary**: internal pages may not dispatch `state/replace` and may only open or update
  tabs with `http(s)`, `vela`, `about` or `view-source` URLs.
- **Boosts** (user CSS/JS) are injected only on the host the user configured, with `cssOrigin: 'user'`.
- **Zap picker** runs in the page's main world but only returns a selector string.
- **Profiles** are isolated `persist:profile-<id>` partitions; every session (default and profile)
  goes through the same `hardenSession` configurator.
- **Persistence**: SQLite in `userData` with WAL; prefs JSON written atomically (tmp + rename).
- **Updates**: electron-updater verifies the sha512 of downloaded artifacts; on macOS/Windows a
  code signature is required for installation (see `RELEASING.md`).

- **Safe browsing** never sends a URL anywhere: lists are downloaded whole and matched locally;
  a blocked site shows an interstitial and "Visit anyway" is per host, per session.
- **Password manager**: secrets are encrypted with Electron `safeStorage` (Keychain / DPAPI /
  libsecret) before they reach SQLite; the login form detector runs in the preload's isolated
  world and only reports field positions, and fill values travel main → preload, never through the
  page's JavaScript. Private spaces never offer to save.
- **Shortcut overrides** are validated accelerators (`acceleratorFromEvent`) and may not take a
  reserved chord of another command; the page-first delivery of unreserved chords is unchanged.

## Reporting

Open a private security advisory on the GitHub repository (`Security` → `Advisories`).
