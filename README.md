# Vela

An Arc-inspired desktop browser: Chromium (via Electron), a vertical sidebar with Spaces, a command
bar instead of a URL bar, and an obsession with staying light. MIT licensed.

![Vela demo](docs/demo.gif)

## Highlights

- **Sidebar, not tabs.** Favorites → Pinned (with nested folders) → Today. Today tabs archive
  themselves after 12 h / 24 h / 7 d / 30 d; the archive is searchable and restorable.
- **Spaces** with their own tabs, gradient theme (+ grain, light/dark, palette from an image, glass)
  and optional isolated **profile** (separate cookies and logins).
- **Command bar** (`⌘T` / `⌘L`): URLs with inline completion of hosts you know, search with
  suggestions, fuzzy search across open tabs, archive, full-text history and favorites, and browser
  commands with their shortcuts, in a few milliseconds.
- **Split view** (2–4 panes), **Peek** for links from pinned tabs, **Little Vela** floating windows
  for links opened from other apps, **Air Traffic Control** rules that route URLs to spaces,
  **multiple windows** (one Space per window, ⌘N).
- **Password manager** built in: saved after sign-in, encrypted with the OS keychain, filled from a
  popover under the field, never sent anywhere.
- **Light by design.** Idle tabs go to sleep and free their process (≈ 1 MB residual), the session
  restores lazily, background views are detached so Chromium throttles them, and the shell idles
  at ~110 MB. Measured by `pnpm perf` → [PERF.md](PERF.md).
- **Auto PiP**, **Boosts** (per-site CSS/JS + Zap element picker), built-in **content blocker**,
  **reader mode**, downloads, history (full-text), per-site permissions, import from
  Chrome/Brave/Edge, unpacked Chrome extensions, in-app auto-updates.
- **Daily-driver basics done right.** HTTP auth prompt, inline PDFs, print and save page, local
  files (open, drop, Finder), private spaces, clear browsing data, HTTPS-first, external-app links
  with a confirmation, default-browser registration, translate via Peek.
- **Chromium always fresh.** A scheduled workflow (`engine-watch.yml`) bumps Electron within 24 h
  of a stable release, runs the full CI and publishes a release automatically.

## Install

Until the repository is pushed to GitHub (see [DECISIONS.md](DECISIONS.md) D013) there is no public
release: build locally with `pnpm build` (installers land in `apps/desktop/release/`). Once the
`release.yml` workflow runs, installers are attached to GitHub Releases (`.dmg`/`.zip` for macOS
arm64 and x64, `.exe` for Windows, `.AppImage`/`.deb` for Linux) and the in-app updater picks them
up; the update flow was proven locally against a generic feed ([UPDATE-PROOF.md](UPDATE-PROOF.md)).
Builds are unsigned until signing secrets are configured (see [RELEASING.md](RELEASING.md)); on
macOS right-click → Open the first time.

## Develop

```bash
pnpm install          # Node ≥ 22, pnpm 10; rebuilds better-sqlite3 for Electron
pnpm dev              # electron-vite with HMR
pnpm build            # installer for the current OS → apps/desktop/release
pnpm test             # unit tests (Vitest), pnpm coverage for the report
pnpm e2e              # Playwright _electron suite (headed on macOS, xvfb on Linux)
pnpm perf             # performance budgets → PERF.md
pnpm ci:local         # everything CI runs
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the process model, [SECURITY.md](SECURITY.md) for
the hardening checklist, [DECISIONS.md](DECISIONS.md) for the why, and
[docs/EXTENSIONS.md](docs/EXTENSIONS.md) for the supported extension subset.

## Keyboard shortcuts

`vela://shortcuts` lists everything. The essentials (⌘ on macOS, Ctrl elsewhere):

| Action                     | Shortcut            |
| -------------------------- | ------------------- |
| New tab / command bar      | `⌘T`                |
| Edit current URL           | `⌘L`                |
| Close tab                  | `⌘W`                |
| Reopen closed tab          | `⌘⇧T`               |
| Pin / unpin                | `⌘D`                |
| Switch to recent tab       | `Ctrl+Tab`          |
| Toggle sidebar             | `⌘S`                |
| Split view / close pane    | `⌘⇧D` / `⌘⇧W`       |
| Find in page               | `⌘F`                |
| Reader mode                | `⌘⌥R`               |
| Spaces                     | `Ctrl+1…9`, `⌘⌥←/→` |
| New space                  | `⌘⇧N`               |
| Archived tabs / History    | `⌘⇧A` / `⌘Y`        |
| Downloads                  | `⌘⇧J`               |
| Little Vela window         | `⌘⌥N`               |

## Status

v0.1.0 — every P0 and P1 feature from the product spec is implemented and covered by the e2e suite
(`apps/desktop/e2e`). See [PROGRESS.md](PROGRESS.md) and [CHANGELOG.md](CHANGELOG.md).
