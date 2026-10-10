# Chrome extensions in Vela

Vela loads **unpacked Manifest V3 extensions** through Electron's `session.extensions.loadExtension`
(Settings → Extensions → *Load unpacked…*). Extensions are loaded into every tab session (the default
profile and every space profile) and remembered across launches (`prefs.extensionPaths`).

There is no Web Store integration: download or build the extension, unzip it, and pick the folder
that contains `manifest.json`.

## Supported subset (Electron 44 / Chromium 152)

Electron implements a subset of the Chrome extension platform. What works in Vela today:

| Area | Status | Notes |
| --- | --- | --- |
| `manifest_version: 3` | ✅ | MV2 extensions also load but are deprecated upstream. |
| Content scripts (`content_scripts`, `run_at`, `all_frames`, `match_about_blank`) | ✅ | Injected in every tab, Little and Peek views. `world: "MAIN"` is supported. |
| Background service worker (`background.service_worker`) | ✅ | Started lazily by Chromium; `chrome.runtime` messaging between worker, content scripts and pages works. |
| `chrome.runtime` (`sendMessage`, `onMessage`, `connect`, `getURL`, `getManifest`, `id`) | ✅ | |
| `chrome.storage` (`local`, `sync`\*, `session`) | ✅ | `sync` is backed by local storage (no cloud). |
| `chrome.tabs` (`query`, `get`, `sendMessage`, `reload`, `update`, `create`, `remove`, `onUpdated`…) | ✅ | Tab ids are WebContents ids. `windowId` is best-effort. |
| `chrome.scripting` (`executeScript`, `insertCSS`, `removeCSS`, `registerContentScripts`) | ✅ | |
| `chrome.i18n`, `chrome.extension` basics | ✅ | |
| `chrome.webRequest` / `webRequestBlocking` | ✅ (MV2 style) | Electron supports it; MV3 extensions rarely use it. |
| `chrome.commands` (keyboard shortcuts) | ⚠️ | Declared commands load, but Vela does not bind their accelerators. |
| Action popup (`action.default_popup`) | ✅ (Vela UI) | Vela has no toolbar: open popups from Settings → Extensions → *Popup* or the site control center. The popup renders in a Peek-style view with the extension's own origin and APIs. |
| Options page (`options_ui` / `options_page`) | ✅ | Open `chrome-extension://<id>/<options>.html` via the popup button or the command bar. |
| `declarativeNetRequest` | ❌ | Not implemented by Electron. Blocking-style extensions (uBlock Origin Lite) load, show their UI, but their static rulesets do not filter traffic. Vela's built-in blocker covers this. |
| `chrome.webNavigation`, `chrome.cookies`, `chrome.history`, `chrome.bookmarks`, `chrome.downloads` | ❌ | Not implemented by Electron. |
| `chrome.identity`, `chrome.management`, `chrome.permissions` | ❌ | Not implemented. |
| `chrome.offscreen`, `chrome.userScripts`, `chrome.alarms` | ❌ | Not implemented (extensions must tolerate their absence). |
| `devtools_page` | ❌ | Electron does not load extension DevTools panels. |
| Web Store install / updates / CRX | ❌ | Unpacked folders only; update them by replacing the folder contents and relaunching. |

\* Electron maps `chrome.storage.sync` onto local storage.

## Tested extensions

The e2e suite (`apps/desktop/e2e/p1.spec.ts`, "extensions" block) downloads two popular open-source releases
and loads them:

1. **Dark Reader** (`darkreader-chrome-mv3.zip`) — loads, is listed with its version, its popup URL
   resolves and Chromium starts its service worker. **Limitation:** the worker calls
   `chrome.permissions.onRemoved`, which Electron does not implement, so it throws during start-up
   and the dark theme is never pushed to the content scripts. The content scripts themselves are
   injected (the pipeline works — see the local extension below); the extension needs the
   `permissions` API to be useful.
2. **uBlock Origin Lite** (`uBOLite_*.chromium.zip`) — loads (manifest, locales, popup, options
   page), is listed with its version and its popup URL resolves. Its `declarativeNetRequest`
   rules are *not* applied (see the table); Vela's built-in blocker is the supported way to block
   ads.
3. **Vela Marker** (`apps/desktop/e2e/fixtures/ext-marker`, a 4-file MV3 extension) proves the
   supported subset end to end: content script injected on an http page, `chrome.runtime`
   messaging to the service worker, `chrome.storage.local` writes, and the action popup opened in
   a Peek view.

## Security notes

- Extensions run with their declared `host_permissions` in the tab sessions only; the shell,
  overlay and `vela://` pages are not extension-accessible (`will-attach-webview` and navigation
  guards still apply).
- `allowFileAccess` is disabled: extensions cannot read `file://` URLs.
- Remove an extension from Settings → Extensions; its folder is left untouched.
