# FlowState

A desktop journaling app for futures traders on prop firm accounts (Topstep, Apex, FTMO-style, and similar). Built with Electron, React, and TypeScript.

FlowState unifies three things prop firm traders usually track in separate tools:

- **Automatic rule tracking** — a rule engine computes trailing/static drawdown and daily loss limit status from your trade log in real time, so violations and near-misses surface before they end an account.
- **Trade performance analytics** — an equity curve and rule status, updated live as you log trades.
- **Trade journaling** — a fast, keyboard-first trade log so logging a trade takes seconds, not minutes.

Everything is local. No accounts, no backend, no network calls beyond checking for app updates.

## Screens

- **Dashboard** — an ambient rule-status strip (today's P&L vs. daily loss limit per account) and an equity curve.
- **Trade Log** — a keyboard-first quick-add form plus a running trade table.
- **Accounts** — create and manage prop firm accounts, each with its own rule profile (drawdown type/amount, daily loss limit) and a live drawdown gauge.

## Getting Started

Requires [Node.js](https://nodejs.org/) 20+ and npm.

```bash
npm install
npm run dev
```

`npm install` also rebuilds the native `better-sqlite3` module for your system Node — this happens automatically via a `postinstall`-equivalent hook, no extra steps needed.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the app in development mode with hot reload. |
| `npm run build` | Build the app for production. |
| `npm test` | Run the test suite (Vitest). |
| `npm run typecheck` | Type-check the whole project (`tsc --build`). |
| `npm run publish` | Build and publish a release (used by CI, see [RELEASING.md](RELEASING.md)). |

## Tech Stack

- **Electron** + **electron-vite** — desktop shell and build tooling.
- **React** + **TypeScript** — renderer UI.
- **better-sqlite3** — local SQLite storage (accounts, rule profiles, trades, tags).
- **Recharts** — the equity curve.
- **electron-updater** — self-updating installs, publishing to GitHub Releases.
- **Vitest** + **React Testing Library** — tests.

## Installing a Release

Not building from source? See [INSTALL.md](INSTALL.md) for Windows and Mac install instructions, or grab the latest release directly from the [Releases page](https://github.com/adam668/flowstate/releases).

Once installed, the app checks for and applies updates automatically — no need to reinstall.

## Project Structure

```
src/
  main/       # Electron main process: SQLite data layer, rule engine, IPC handlers, auto-updater
  preload/    # contextBridge-exposed API surface (window.api)
  renderer/   # React UI
  shared/     # Types and helpers shared across all three processes
```

## Releasing

See [RELEASING.md](RELEASING.md) for the release process — a version bump and a tag push triggers a GitHub Actions workflow that builds and publishes Windows and Mac installers automatically.

## License

MIT
