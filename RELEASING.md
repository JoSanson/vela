# Releasing Vela

How a version goes from `main` to users' machines, and what the repo owner must configure once.

## TL;DR

```
tag vX.Y.Z  ──►  release.yml  ──►  GitHub Release (dmg/zip/exe/AppImage/deb + latest*.yml)
                                        └──►  electron-updater in running apps picks it up
```

Manual release:

```bash
pnpm ci:local                              # same gates as CI, locally
node scripts/bump-version.mjs minor        # 0.1.x → 0.2.0 in both package.json + CHANGELOG.md
git commit -am "chore(release): v0.2.0"
git tag -a v0.2.0 -m "Vela v0.2.0"
git push origin main v0.2.0                # the tag push triggers release.yml
```

Engine (Chromium) releases are fully automated — see [Engine pipeline](#engine-pipeline-chromium-up-to-date-in--24-h).

## Workflows

| File                                 | Trigger                                         | What it does                                                                                                                          |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`           | PR, push to `main`, `workflow_dispatch`         | `quality` (lint, typecheck, format, coverage), `e2e` (Playwright under xvfb), `build` matrix (mac arm64/x64, win x64, linux)           |
| `.github/workflows/release.yml`      | tag `v*`, `workflow_dispatch` (`tag` input)     | verifies tag == package version, builds + signs on 4 runners, merges `latest-mac.yml`, publishes the GitHub Release                   |
| `.github/workflows/engine-watch.yml` | every 6 h, `workflow_dispatch`, CI `workflow_run` | bumps Electron when a newer stable exists, opens an auto-merging PR; opens an issue when CI on that PR fails                           |
| `.github/workflows/engine-release.yml` | push to `main`                                | when the merged commit is an engine bump: patch-bump, commit `chore(release): vX.Y.Z`, tag, push (→ release.yml)                        |
| `.github/workflows/codeql.yml`       | PR, push to `main`, daily                       | CodeQL `javascript-typescript`, security-and-quality queries                                                                          |
| `.github/workflows/audit.yml`        | daily, `workflow_dispatch`                      | `pnpm audit --audit-level=high`; opens/updates/closes a single issue labelled `security`                                              |
| `renovate.json`                      | Renovate app                                    | pins ranges, automerges minor/patch, Electron prioritised with the engine commit message                                              |

Helper scripts (plain Node, no dependencies):

| Script                          | Purpose                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scripts/bump-version.mjs`      | `<patch\|minor\|major\|x.y.z> [--dry-run]` — updates root + `apps/desktop` `package.json`, promotes CHANGELOG "Unreleased" |
| `scripts/engine-check.mjs`      | `[--force x.y.z]` — pinned vs latest Electron, Chromium/Node versions from releases.electronjs.org                         |
| `scripts/merge-latest-mac.mjs`  | merges the arm64 and x64 `latest-mac.yml` into one file (electron-updater needs both entries)                              |
| `scripts/release-notes.mjs`     | prints the CHANGELOG section for a version (empty when absent → generated notes only)                                      |

## release.yml in detail

1. **verify** — the tag must equal `v` + `apps/desktop/package.json` version. Mismatch = hard fail, nothing is built.
2. **build** (matrix) — `pnpm build:bundle` then `pnpm exec electron-builder --publish never <target>` in `apps/desktop`:

   | Runner           | Target          | Output                                                   |
   | ---------------- | --------------- | -------------------------------------------------------- |
   | `macos-14`       | `--mac --arm64` | `Vela-X.Y.Z-arm64.dmg`, `Vela-X.Y.Z-arm64-mac.zip`, `latest-mac.yml` |
   | `macos-15-intel` | `--mac --x64`   | `Vela-X.Y.Z.dmg`, `Vela-X.Y.Z-mac.zip`, `latest-mac.yml`  |
   | `windows-latest` | `--win --x64`   | `Vela Setup X.Y.Z.exe`, `latest.yml`                      |
   | `ubuntu-latest`  | `--linux`       | `Vela-X.Y.Z.AppImage`, `vela_X.Y.Z_amd64.deb`, `latest-linux.yml` |

   Each arch builds on its native runner so the `better-sqlite3` binary rebuilt in `postinstall` matches the packaged Electron.

3. **publish** — downloads the four artifact sets, merges the two `latest-mac.yml`, writes notes
   (CHANGELOG section + GitHub generated notes), creates the release as **draft**, uploads every
   asset, then flips it to published. electron-updater never sees a half-uploaded release.

Why not `electron-builder --publish always` from every runner: each would overwrite
`latest-mac.yml` with only its own arch, breaking auto-update for the other one.

Re-running the workflow on an existing tag is safe: assets are re-uploaded with `--clobber`.

### Signing & notarization secrets (all optional)

Without them the build is **unsigned** and still succeeds (`CSC_IDENTITY_AUTO_DISCOVERY=false`
is set automatically when `CSC_LINK` is empty). Unsigned builds are fine for testing; macOS
Gatekeeper and Windows SmartScreen will warn users.

| Secret                        | Platform | Content                                                                                     |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `CSC_LINK`                    | macOS    | base64 of the Developer ID Application `.p12` (`base64 -i cert.p12 \| pbcopy`)               |
| `CSC_KEY_PASSWORD`            | macOS    | password of that `.p12`                                                                     |
| `APPLE_ID`                    | macOS    | Apple ID email used for notarization                                                        |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS    | app-specific password generated at appleid.apple.com                                        |
| `APPLE_TEAM_ID`               | macOS    | 10-character team id                                                                        |
| `WIN_CSC_LINK`                | Windows  | base64 of the code-signing `.pfx`                                                           |
| `WIN_CSC_KEY_PASSWORD`        | Windows  | password of that `.pfx`                                                                     |

Notarization (`-c.mac.notarize=true`) is only enabled when the certificate **and** the three
`APPLE_*` secrets are present. `electron-builder.yml` keeps `notarize: false` so local
`pnpm build` never tries to notarize.

### Repo settings for release.yml

- Nothing beyond `GITHUB_TOKEN` (the workflow requests `contents: write`).
- Settings ▸ Actions ▸ General ▸ Workflow permissions: **Read and write permissions** (or leave
  read-only — every workflow declares its own `permissions:` block, which is what counts).

## Engine pipeline (Chromium up to date in < 24 h)

```
engine-watch.yml (every 6 h)
  npm view electron version > pin?  ──►  branch engine/electron-<ver>
                                         pnpm --filter @vela/desktop add -D -E electron@<ver>
                                         PR "chore(engine): bump electron to <ver>" [label engine]
                                         gh pr merge --auto --squash
          ┌──────────────────────────────────────┴──────────────────────────────┐
   CI green → squash-merged into main                              CI red → issue "Electron <ver> bump failed"
          │                                                                 (run link + last 100 log lines, no duplicates)
   engine-release.yml (push to main, commit message matches)
          scripts/bump-version.mjs patch → "chore(release): vX.Y.Z" → tag vX.Y.Z → push
          │
   release.yml → GitHub Release → auto-update
```

Renovate watches `electron` too (`renovate.json`): `prPriority: 10`, `schedule: at any time`, no
PR limits, label `engine`, automerge, and the **same commit message** (`chore(engine): bump
electron to X`), so a Renovate-merged bump also triggers `engine-release.yml`. `engine-watch`
skips when an open `engine` PR already mentions the version, so the two never race.

### Required repo settings (owner checklist)

1. **Settings ▸ General ▸ Pull Requests**: enable **Allow auto-merge**, enable **Allow squash
   merging** with default message **Pull request title** (keeps `chore(engine): …` as the merge
   commit title, which `engine-release.yml` matches on).
2. **Branch protection / ruleset on `main`**:
   - Require a pull request before merging.
   - Require status checks to pass: **`quality`**, **`e2e`**, **`build (mac-arm64)`**,
     **`build (mac-x64)`**, **`build (win-x64)`**, **`build (linux-x64)`** (names as reported by
     ci.yml). Require branches to be up to date: optional.
   - **Bypass**: `engine-release.yml` pushes the `chore(release)` commit straight to `main`. Add
     the PAT owner (you) — or, with GITHUB_TOKEN, the `github-actions` app — to "Allow specified
     actors to bypass required pull requests". With rulesets: add a bypass for *Repository admin*
     (if you own the PAT) or for the *GitHub Actions* app.
3. **Labels**: `engine` and `security` are created on the fly by the workflows if missing.
4. **Settings ▸ Actions ▸ General**: "Allow GitHub Actions to create and approve pull requests"
   must be ON (needed when falling back to GITHUB_TOKEN).
5. **Secret `ENGINE_WATCH_TOKEN`** (strongly recommended): fine-grained PAT scoped to this repo
   with *Contents: write*, *Pull requests: write*, *Issues: write*, *Workflows: write*.
   - Why: anything created with `GITHUB_TOKEN` (branches, PRs, tags) **does not trigger other
     workflows**. Without the PAT the engine PR would get no `pull_request` CI run, and the tag
     pushed by `engine-release.yml` would not start `release.yml`.
   - Fallback without the PAT (built in): `engine-watch` dispatches `ci.yml` on the branch
     (`gh workflow run ci.yml --ref engine/electron-<ver>`); the check runs land on the same
     commit SHA, so required status checks are satisfied and auto-merge proceeds.
     `engine-release` dispatches `release.yml` with the `tag` input. Both paths work, but the
     PAT keeps everything on the normal event triggers and keeps audit logs attributed to you.
6. **Code scanning**: Settings ▸ Code security ▸ Code scanning ▸ leave **Default setup OFF**
   (codeql.yml is the advanced setup; both at once errors).
7. **Renovate**: install the Renovate GitHub App on the repo. Do not add `dependabot.yml`.

Workflow permissions used: `contents: write`, `pull-requests: write`, `issues: write`,
`actions: write` (engine-watch), `contents: write` + `actions: write` (engine-release),
`contents: write` (release), `issues: write` (audit), `security-events: write` (codeql).

### Simulate an engine bump

```bash
# Pretend 44.99.0 is the latest Electron: creates the branch, PR, auto-merge — the full path.
gh workflow run engine-watch.yml -f force_version=44.99.0
gh run watch
gh pr list --label engine
```

`force_version` must be a real published Electron version or `pnpm add` fails (which is itself a
good test of the failure → issue path once the PR's CI runs). To test only the comparison
locally:

```bash
node scripts/engine-check.mjs                   # current/latest/chromium/node/update
node scripts/engine-check.mjs --force 44.99.0   # update=true
node scripts/bump-version.mjs patch --dry-run   # prints next version, writes nothing
```

To test the failure report: open a PR from a branch named `engine/electron-0.0.0` that breaks a
test; when CI goes red, `engine-watch.yml` (`workflow_run`) opens "Electron 0.0.0 bump failed".

## Testing auto-update (v0.1.0 → v0.1.1)

electron-updater reads `latest*.yml` from the **latest published** GitHub Release of
`JoSanson/vela` (`publish.provider: github` in `electron-builder.yml`).

1. Release **v0.1.0** (tag + release.yml, or `gh workflow run release.yml --ref v0.1.0 -f tag=v0.1.0`).
2. Install v0.1.0 from the release assets on a test machine and launch it once. The log
   (`~/Library/Logs/Vela/main.log` on macOS, `%APPDATA%\Vela\logs` on Windows,
   `~/.config/Vela/logs` on Linux) should show `Checking for update` with no update found.
3. Bump and release **v0.1.1**:

   ```bash
   node scripts/bump-version.mjs patch
   git commit -am "chore(release): v0.1.1" && git tag -a v0.1.1 -m "Vela v0.1.1" && git push origin main v0.1.1
   ```

4. Relaunch v0.1.0 (or wait for the 6 h check): it downloads v0.1.1 silently, shows the release
   notes UI, and installs on quit. Verify `Vela ▸ About` reads 0.1.1 after restart.
5. On macOS, auto-update **requires a signed app** (Squirrel.Mac refuses unsigned updates).
   Unsigned test builds can verify the *check* and *download* steps only; the install step
   needs the `CSC_*` secrets. Windows NSIS and Linux AppImage update unsigned.

### Local proof without GitHub

`node apps/desktop/scripts/prove-update.mjs` packages the current tree twice (as v0.1.0 and v0.1.1),
serves the v0.1.1 directory (`latest*.yml` + installer) from a local HTTP server as a *generic*
electron-updater feed, launches the v0.1.0 app with `VELA_UPDATE_URL` pointing at it, and records
the updater state machine (`checking → available → downloading → downloaded`) into
`UPDATE-PROOF.md`. Add `--install` to call `quitAndInstall()` at the end (works on Linux/Windows;
macOS needs a signed build). `--skip-build` reuses `apps/desktop/release/update-proof/{a,b}`.

Pre-releases: tag `v0.2.0-beta.1` publishes a release whose `latest*.yml` is picked up by
clients with `allowPrerelease` only.

## `pnpm ci:local`

```bash
pnpm ci:local   # lint → typecheck → format:check → coverage → build → e2e → perf
```

Runs exactly the gates CI enforces, on the current OS (one electron-builder target). On Linux
without a display `pnpm e2e` wraps Playwright in `xvfb-run -a` automatically. Required Linux
packages: `libnss3 libgtk-3-0 libxss1 libasound2t64 libgbm1 xvfb`.
