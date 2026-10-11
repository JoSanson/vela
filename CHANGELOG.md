# Changelog

All notable changes to Vela are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Import panel: source rows keep a fixed grid (the name column collapsed under a long option
  label); the Arc hint and the Safari Full Disk Access message are short and translated.
- Sidebar: the toggle inside the floating sidebar docks it back; the content inset, corner radius
  and hover edge follow the slide instead of jumping on the last frame.

## [0.3.0] - 2026-10-11

### Added

- Password manager: logins are offered to be saved after a sign-in, encrypted with the OS
  keychain, and filled from a popover under the login field; Settings > Passwords.
- Multi-window (D024): ⌘N opens a window on another Space; Spaces move between windows, overlays
  and Peek follow the active window.
- Import from Arc (the whole sidebar: Spaces with name, emoji and colour, pinned tabs and nested
  folders in order, open tabs, favorites, plus history), Safari (bookmarks, Reading List and
  history; asks for Full Disk Access when macOS denies the read) and Firefox (bookmarks and
  history from the most recent profile), next to Chrome, Brave and Edge.
- Safe browsing: known phishing and malware URLs (URLhaus, OpenPhish lists bundled and refreshed
  daily, checked locally) are stopped before they load, with an interstitial and a way through.
- Customisable keyboard shortcuts (vela://shortcuts): click a chord to record a new one, conflicts
  are explained, custom chords are badged and reset in one click.
- Language setting (System / English / Français): menus, settings and internal pages follow it live.

### Fixed

- Command bar and switcher no longer lose the keyboard selection when the pointer happens to rest
  over the list while results arrive.

## [0.2.0] - 2026-10-11

### Added

- HTTP and proxy authentication prompt; links to other apps (`zoommtg:`, `slack:`…) ask once per
  scheme; PDFs open inline; print, save page, open local files (dialog, drag & drop, Finder/argv),
  view source, translate page/selection via Peek; richer context menus (save link, copy image
  address, video picture-in-picture, email address).
- Private spaces (in-memory profile: no history, favicons, archive or persisted tabs), clear
  browsing data, default-browser setting, download folder and ask-where-to-save, find match case,
  HTTPS-first with silent fallback, Global Privacy Control header.
- Command bar results now include history (FTS5) and the archive on demand.

### Fixed

- `capturePage()` on a tab that never committed or is parked on an HTTP auth challenge killed the
  browser process (Electron 44): switcher previews and snapshots now skip such tabs.
- Toasts were drawn under the page view; they live in the sidebar column (or the overlay).
- A bypassed certificate was reported as a secure connection; a navigation that became a download
  left a blank tab; "Undo" after Clear skipped internal pages; ⌘⇧N created a space without opening
  its editor; the split picker offered the pane you were in.
- Content blocker `$redirect` rules no longer spam `ERR_UNSAFE_REDIRECT` in page consoles.

### Changed

- State is broadcast as action deltas with revisions (D019); the state database heals itself and
  saves with row-level upserts (D023); prefs are debounced, fsync'd and backed up.
- Crash handling: shell/overlay renderers are revived, GPU restarts re-layout views, main keeps
  local minidumps, an unclean exit is reported at the next start.
- CI runs the e2e suite on ubuntu, macOS and Windows; Electron major bumps are no longer
  auto-merged.

### Changed (UX polish pass, two independent design reviews)

- Motion vocabulary: every button answers a press in the same frame; sidebar lists glide (FLIP) on
  reorder/insert; overlays play a 90 ms exit; Space switches cross-fade every tinted surface
  (registered colour properties); hover-reveal sidebar keeps a 180 ms leave grace.
- Sidebar: loading ring on the favicon (no row shift), audio equaliser, Space dots without layout
  animation, download progress ring on the downloads button, "Clear" with Undo, nav tooltips
  with shortcuts.
- One theme source for the shell, overlays and internal pages (global preference overrides the
  Space mode); internal pages are tinted by the Space colour.
- Internal pages: sliding segmented control, toggle thumb that stretches while pressed, friendlier
  network errors, styled range/select/checkbox controls, reader blockquote without side stripe.
- Onboarding: annotated miniature sidebar replaces the identical card grid.
- Copy: no em dashes, tab titles without the "Vela" suffix, plain-case permission pills.
- Accessibility: muted/faint ink contrast raised on light Space gradients; spinners static and the
  sidebar tween skipped under reduced motion; larger hit targets (Space dots, onboarding steps).

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
