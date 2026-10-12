# Switching from Arc to Vela

A five-minute move. Your Spaces, favorites, pinned folders, history, passwords and logins come with
you; Arc itself is left untouched, so you can go back and forth while you try Vela.

## 1. Install

Download Vela from the [latest release](https://github.com/JoSanson/vela/releases/latest)
(macOS Apple silicon or Intel, Windows). On macOS the first launch needs System Settings →
Privacy & Security → **Open Anyway** (builds are not notarized yet).

## 2. Import your Arc

Vela offers it on first launch. Later, it lives in **Settings → Import & export → Arc**. Arc can
stay open: Vela reads a copy of its files.

| Arc | Vela |
| --- | --- |
| Spaces (name, emoji, colours) | Spaces with the same name, emoji and gradient |
| Profiles attached to Spaces | Profiles attached to the same Spaces (separate cookies and logins) |
| Favorites (the top grid) | Favorites, per profile |
| Pinned tabs and nested folders | Pinned tabs and nested folders, same order |
| History | History, full-text searchable from the command bar |
| Saved passwords | Password manager, encrypted with your OS keychain |
| Cookies | Cookies in the matching profile: you stay logged in |

On macOS you are asked once to let Vela read "Arc Safe Storage" from the keychain: that is the key
Arc encrypts passwords and cookies with. It is read once, locally, and never leaves your Mac.

Importing again later merges: nothing is duplicated, so it is safe to re-run after a week of
using both.

## 3. Your muscle memory

Most default shortcuts match Arc's, and every one of them can be rebound in `vela://shortcuts`
(click a shortcut, press the new chord, conflicts are explained).

| You want to… | Press |
| --- | --- |
| Open the command bar / a new tab | `⌘T` |
| Edit the current URL | `⌘L` |
| Show or hide the sidebar | `⌘S` |
| Pin / unpin a tab | `⌘D` |
| Copy the URL (as Markdown: `⌘⇧⌥C`) | `⌘⇧C` |
| Next / previous tab | `⌘⌥↓` / `⌘⌥↑` |
| Jump to the recent tab | `Ctrl+Tab` |
| Switch Space | `Ctrl+1…9`, `⌘⌥←` / `⌘⌥→` |
| Split view | `⌃⇧+` |
| Open a Little window | `⌘⌥N` |
| See archived tabs | `⌘⇧L` |

## 4. What feels different

- **Extensions**: install them again from the Chrome Web Store ("Add to Vela"); they show up in
  the sidebar. [EXTENSIONS.md](EXTENSIONS.md) lists how the 20 most used ones behave.
- **Not there yet**: Easels, Notes, AI features, sync between devices, DRM video (Netflix and
  friends need Widevine). Each one has an issue labelled
  [`arc-parity`](https://github.com/JoSanson/vela/labels/arc-parity): upvote the one you miss most,
  or pick it up.
- **Built in that Arc did not have**: a content blocker and an open codebase.

Missing something you used every day?
[Open an "Arc feature I miss" issue](https://github.com/JoSanson/vela/issues/new?template=arc_feature.yml).
