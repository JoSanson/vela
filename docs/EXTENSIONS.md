# Chrome extensions in Vela

## Installing

**From the Chrome Web Store.** Settings → Extensions → **Chrome Web Store** (or open
[chromewebstore.google.com](https://chromewebstore.google.com/) in any tab), pick an extension and
click **Add to Vela**. Vela shows what the extension will be able to do, in the same words Chrome
uses ("Read and change all your data on all websites"…), and installs it only if you agree.

- Installed extensions are available in **every Space and profile**.
- They **update themselves** (checked at launch and every 5 hours).
- Their buttons appear in the **extension bar** of the sidebar, between the address field and the
  favorites: click one for its popup; badges and icons update live. New extensions are pinned
  there; the puzzle tile lists them all to pin, unpin or reorder.
- Remove them from Settings → Extensions or from their Web Store page.

**Unpacked.** Settings → Extensions → *Load unpacked…* and pick the folder that contains
`manifest.json` (for extensions you build yourself or that are not on the store).

## How it works

Electron implements only part of the Chrome extension platform. Vela adds the rest in two layers:

- [electron-chrome-web-store](https://github.com/samuelmaddock/electron-browser-shell) (MIT):
  the store's install button, downloads, updates and uninstall.
- [electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell) (GPL-3.0,
  the reason Vela is GPL, see [DECISIONS.md](../DECISIONS.md) D035): `chrome.action`, `tabs`,
  `windows`, `contextMenus`, `cookies`, `notifications`, `permissions`, `webNavigation`,
  `commands`, mapped onto Vela's own tabs. An extension that opens, activates or closes a tab drives
  the sidebar.
- Vela's own fix (`src/preload/extensionCompat.ts`): Chromium now has a native `browser` namespace
  beside `chrome`; extensions built with Mozilla's webextension-polyfill use it and would miss every
  API added above, so Vela points `browser` at the completed `chrome`.

## Compatibility: the 20 most used extensions

Measured by `apps/desktop/perf/extensions/compat.mjs`: each one is installed from its real Web
Store page, then its background worker and popup are checked. Electron 44 / Chromium 152,
2026-10-12.

| Extension | Status | Notes |
| --- | --- | --- |
| Dark Reader | ✅ | |
| 1Password | ✅ | Setup flow opens from its sidebar button. |
| Vimium | ✅ | |
| React Developer Tools | ✅ | DevTools panels themselves are not loaded (Electron limit). |
| Return YouTube Dislike | ✅ | |
| Notion Web Clipper | ✅ | |
| Wappalyzer | ✅ | |
| Raindrop.io | ✅ | |
| JSON Formatter | ✅ | |
| Momentum | ✅ | |
| uBlock Origin Lite | ⚠️ | Popup and settings work; its filters do not apply (`declarativeNetRequest`). Vela's built-in blocker covers this. |
| Bitwarden | ⚠️ | Works; logs a harmless messaging error at start. |
| LastPass | ⚠️ | Popup works; one background feature expects a DOM in its worker. |
| Grammarly | ⚠️ | Works; its telemetry module reports errors. |
| Adblock Plus | ⚠️ | Popup works; filtering needs `declarativeNetRequest`. |
| Google Translate | ⚠️ | Popup works; translating the page needs a scripting permission flow Vela does not have yet. |
| SponsorBlock | ⚠️ | Popup works; it writes to the `chrome` object, which the API layer freezes. |
| Loom | ❌ | Popup does not load yet. |
| Honey | ❌ | Needs `chrome.offscreen` (not in Electron). |
| Todoist | ❌ | Needs `declarativeNetRequest` (not in Electron). |

Something you rely on is missing or broken? Open an issue with the extension's Web Store link, or
pick one of the [`extensions`](https://github.com/JoSanson/vela/labels/extensions) issues.

## What is still missing

| API | Status |
| --- | --- |
| `declarativeNetRequest` | ❌ Not implemented by Electron. Ad blockers load but do not filter; use Vela's built-in blocker. |
| `chrome.offscreen`, `chrome.userScripts`, `chrome.sidePanel` | ❌ Not implemented. |
| `chrome.history`, `chrome.bookmarks`, `chrome.downloads`, `chrome.identity`, `chrome.management` | ❌ Not implemented yet. |
| `chrome.storage.sync` | ⚠️ Backed by local storage (no cloud sync). |
| `devtools_page` | ❌ Electron does not load extension DevTools panels. |

## Security notes

- Web Store installs always go through a confirmation that lists the permissions; runtime
  `chrome.permissions.request` calls ask again.
- The store's install API only answers pages from `https://chromewebstore.google.com`; the
  extension API preload is only injected into `chrome-extension://` pages and extension service
  workers, never into websites.
- Extensions run with their declared `host_permissions` in the tab sessions only; the shell,
  overlay and `vela://` pages are not extension-accessible (`will-attach-webview` and navigation
  guards still apply).
- `allowFileAccess` is disabled: extensions cannot read `file://` URLs.
- Removing an unpacked extension leaves its folder untouched; removing a Web Store one deletes its
  copy in Vela's profile.
