# Changelog

All notable changes to Vela are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-10

### Security (review pass 2)

- Favicon URLs carry a per-launch secret token; icons that cannot be cached are not loaded from
  the remote URL (D017).
- Certificate interstitial also covers redirect targets and fragment URLs; subresource and
  redirect cases are e2e-tested against a local self-signed server.
- Reader-mode sanitiser also walks the children of removed elements.
- Dead `app/pickFile` / `app/readFile` / `tab/pip` / `certificate/error` IPC channels removed.

### Fixed (review pass 2)

- Update notes could be re-shown after every overlay close once queued; hide hooks are one-shot.
- macOS Dock re-activation created an invisible window (and was skipped when a Little window
  was open).
- Peek "Open as tab" leaked a second renderer and showed a reloaded page instead of the peeked one
  (D018); unloading a pinned tab spawned a throw-away renderer.
- Permission prompts no longer replace an open command bar/switcher; camera + microphone stop at
  the first denial; screen-share loopback audio only on Windows.
- Unreserved shortcuts survive a page's `stopPropagation()`; Zap selector type-checked; prefs
  listeners isolated; ATC wildcard runs collapsed and capped; import backups pruned; Peek view
  destroyed with the window; archive page refreshes when tabs change.

### Added

- Arc-style sidebar: global Favorites grid, per-space Pinned tabs with nested folders, Today tabs,
  drag & drop everywhere (reorder, into folders, to favorites, between spaces, into a split pane),
  inline rename, emoji icons, resizable and hideable sidebar with hover reveal.
- Spaces: unlimited, each with name, emoji, two-colour gradient + grain, light/dark/system
  appearance and an optional isolated profile (cookies/sessions). Ctrl+1…9, trackpad swipe, dots.
- Command bar (⌘T / ⌘L): URL + search (Google, DuckDuckGo, Bing, Brave, Kagi), search suggestions,
  fuzzy search across open tabs, archive, history, favorites and browser commands.
- Ctrl+Tab switcher with live previews, split view (2–4 panes, resizable, persisted per space),
  Peek for links from pinned/favorite tabs, Little Vela floating windows for links from other apps,
  Air Traffic Control rules, find in page, zoom, full screen, back/forward gestures.
- Auto-archive (12 h / 24 h / 7 d / 30 d) with a searchable archive, memory saver (sleeps idle tabs
  and frees their process, restores URL + scroll), lazy session restore that survives `kill -9`.
- Automatic Picture-in-Picture when leaving a tab that plays video.
- Boosts: per-site CSS/JS, Zap element picker, font presets, export/import.
- Downloads panel, history, per-site permissions with prompts, favicons cache, certificate
  interstitial, crash/network error pages, context menus.
- Import from Chrome/Brave/Edge (bookmarks + history), JSON export/import of all data,
  three-screen onboarding, keyboard shortcuts page.
- Built-in content blocker (EasyList + EasyPrivacy, per-site toggle, counters), site control center,
  reader mode, palette-from-image themes, glass sidebar, unpacked MV3 Chrome extensions.
- Auto-updates (electron-updater, checked at launch and every 6 h, installed on quit) and a fully
  automated Electron/Chromium bump pipeline (engine watch + Renovate).
