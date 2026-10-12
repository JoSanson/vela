# Contributing to Vela

Thanks for being here. Vela exists because a lot of people loved Arc and did not want that way of
browsing to stop. Every contribution, from a typo to a new feature, moves it forward.

## Ways to help (no code needed)

- **Use it and report what breaks**: [bug report](https://github.com/JoSanson/vela/issues/new?template=bug_report.yml).
- **Tell us the Arc feature you miss most**: [Arc feature I miss](https://github.com/JoSanson/vela/issues/new?template=arc_feature.yml),
  and 👍 the existing ones. Votes decide what gets built next.
- **Translate Vela** into your language (see below, about an hour).
- **Run the benchmark on your machine** and post your numbers in
  [Discussions](https://github.com/JoSanson/vela/discussions) ([how](docs/BENCHMARK.md#run-it-yourself)).
- **Star the repo and tell another Arc user.** It is how people find it.

## From clone to your change running (10 minutes)

```bash
git clone https://github.com/JoSanson/vela.git && cd vela
corepack enable          # gives you the pinned pnpm
pnpm install             # Node ≥ 22; rebuilds better-sqlite3 for Electron
pnpm dev                 # the browser opens, with hot reload for the UI
```

Where things live:

| Path | What |
| --- | --- |
| `packages/core` | Pure TypeScript domain: tabs, Spaces, folders, archive, Air Traffic Control, command bar ranking. No Electron, no Node, no DOM: easiest place to start, 100 % unit-testable. |
| `packages/shared` | IPC contract types, preferences, shortcuts, translations (`src/i18n`). |
| `apps/desktop/src/main` | Electron main process: windows, `TabManager`, sessions, SQLite persistence, importers. |
| `apps/desktop/src/preload` | The `window.vela` bridge (`contextBridge` only). |
| `apps/desktop/src/renderer` | The React shell: sidebar, command bar, overlays, `vela://` pages. |
| `apps/desktop/e2e` | Playwright end-to-end tests that drive the real app. |

[ARCHITECTURE.md](ARCHITECTURE.md) explains the process model in one page, and
[DECISIONS.md](DECISIONS.md) records why things are the way they are. Read the relevant entry before
changing a behaviour it covers.

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test   # fast checks, a minute or two
pnpm e2e                                   # the end-to-end suite (run pnpm build first)
pnpm ci:local                              # everything CI runs, when in doubt
```

- One focused change per PR, with a [conventional commit](https://www.conventionalcommits.org/)
  title: `feat(sidebar): …`, `fix(import): …`, `docs: …`.
- UI changes: add a screenshot or a short recording to the PR.
- User-facing changes: add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md).
- Tests: `packages/core` changes come with unit tests next to the code (`*.test.ts`); behaviour
  you can click comes with an e2e test.

## The rules the code follows

These keep Vela fast and safe; CI enforces most of them.

- **Security defaults everywhere**: `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`, typed IPC through `contextBridge` only, never `webSecurity: false`.
  [SECURITY.md](SECURITY.md) has the full checklist.
- **TypeScript strict**, no `any`, zero lint warnings.
- **`packages/core` stays pure**: no Electron, Node built-ins or DOM imports.
- **Animations** use `transform` and `opacity` only. Styles are CSS modules + CSS variables.
- **No Arc names, logos or assets in the app.** Vela is inspired by Arc, not a copy of it. Naming
  Arc to describe compatibility (the importer, the docs) is fine.
- Comments explain *why*, not *what*.

## Translating Vela

Translations live in `packages/shared/src/i18n/<locale>/`. To add a language:

1. Copy `packages/shared/src/i18n/en/` to `packages/shared/src/i18n/<locale>/` (e.g. `de`, `es`,
   `pt-BR`) and translate the strings. Keep the `{placeholders}` and ICU plurals as they are.
2. In `packages/shared/src/i18n/index.ts`, add the locale to `LOCALES`, its own name to
   `LANGUAGE_NAMES` (e.g. `de: 'Deutsch'`) and its messages to `MESSAGES`.
3. Add it to `electronLanguages` in `apps/desktop/electron-builder.yml`.
4. `pnpm typecheck` flags any missing key. Copy the "French covers every English key" test in
   `i18n.test.ts` for your language so empty strings are caught too.

## Good first issues

Issues labelled [`good first issue`](https://github.com/JoSanson/vela/labels/good%20first%20issue)
are scoped, have pointers to the files involved, and a maintainer will answer within a few days.
Comment on one to claim it so two people do not do the same work.

## Licence

Vela is free software under the [GPL-3.0](LICENSE). By opening a pull request you agree that your
contribution is released under the same licence. The Vela name and logo are reserved, see
[TRADEMARKS.md](TRADEMARKS.md).

## Security issues

Do not open a public issue. Use a private advisory: the repository's **Security** tab → **Report a
vulnerability**. See [SECURITY.md](SECURITY.md).

## Code of conduct

Be kind. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
