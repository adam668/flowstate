# FlowState — Installer & Auto-Update Design

Date: 2026-08-12
Status: Approved for planning

## Summary

Package FlowState as distributable installers (Windows `.exe`, Mac `.dmg`) that the user can send to friends, and wire in self-updating so friends' installed apps automatically pick up new releases without re-downloading and reinstalling. Releases are published to a public GitHub repo (`adam668/flowstate`) and built/published via GitHub Actions on tag push.

## Goals

- One-time install: a friend downloads a single installer file, runs it, has a working app.
- After that, updates happen automatically — the app checks GitHub Releases, downloads new versions in the background, and prompts the user to restart when ready.
- Both Windows and Mac installers, built via CI (not requiring the developer to own a Mac).
- Zero ongoing cost: no code signing certificates, no private hosting.

## Non-goals

- Code signing / notarization. Installers are unsigned. Windows SmartScreen and Mac Gatekeeper will show warnings on first install; documented as a one-time click-through in `INSTALL.md`, not solved in software.
- Private/restricted distribution. The GitHub repo and its releases are public.
- Delta/differential updates beyond what `electron-updater` does by default.
- Automated version bumping — the release process is a manual `npm version` + tag push.

## Architecture

- **Packaging**: `electron-builder`, configured via `electron-builder.yml` at the repo root. Two targets: `nsis` (Windows installer) and `dmg` (Mac). `publish` is set to `{ provider: 'github', owner: 'adam668', repo: 'flowstate' }`.
- **Auto-update**: `electron-updater`'s `autoUpdater` runs in the main process. On app ready, it calls `checkForUpdatesAndNotify`-equivalent logic (custom-wired, not the built-in OS notification, since the update surface is the in-app banner instead). Events (`update-available`, `update-downloaded`, `error`) are forwarded to the renderer over a new IPC channel (`updates:status`) so the UI can react.
- **CI/CD**: `.github/workflows/release.yml`, triggered on push of a tag matching `v*`. Two parallel jobs — `windows-latest` and `macos-latest` — each run `npm ci` then `npm run publish` (`electron-builder --publish always`), authenticated via the workflow's automatically-provided `GITHUB_TOKEN` (repo is public, so no extra PAT/secret is needed; workflow permissions set `contents: write`).

## Components

### `electron-builder.yml`
Defines `appId` (`com.flowstate.app`), `productName` (`FlowState`), `files`/`directories` pointing at `out/` (electron-vite's build output), the `win`/`mac` target blocks, and the `publish` block described above.

### Main process: update checking (`src/main/updates/checkForUpdates.ts`)
A small module wrapping `electron-updater`'s `autoUpdater`: disables its default auto-download-prompt dialogs, listens for `update-available` / `update-downloaded` / `error`, and forwards each as a typed event over IPC (`updates:status`) to the renderer. Called once from `src/main/index.ts` after `app.whenReady()`, and does nothing (silently) in dev mode (`electron-updater` requires a packaged app with a valid `app-update.yml`, which only exists in a built installer — the module no-ops if `app.isPackaged` is false).

### Renderer: update banner (`src/renderer/src/components/UpdateBanner.tsx`)
A new small component, visually parallel to `ErrorBanner` but in the app's accent tone (not `--pnl-neg`), rendered at the app shell level (in `App.tsx`, above the current view) when the main process reports `update-downloaded`. Shows "A new version is ready" with a "Restart & Update" button that calls `window.api.updates.restartAndInstall()` (a new one-line IPC call wired the same way as every other `window.api` method).

### IPC additions (`src/main/ipc/registerHandlers.ts`, `src/preload/index.ts`)
- `updates:restart` — invokes `autoUpdater.quitAndInstall()`.
- A `webContents.send('updates:status', event)` push channel (not request/response) for the main process to notify the renderer, since update state changes originate in the main process, not from a renderer request. Preload exposes this via `window.api.updates.onStatusChange(callback)`, following the standard `ipcRenderer.on` → `contextBridge` pattern.

### Release process (`RELEASING.md`)
1. `npm version patch` (or `minor`/`major`) — bumps `package.json`, creates a commit + git tag.
2. `git push && git push --tags`.
3. GitHub Actions builds and publishes both installers to a new GitHub Release automatically.
4. Send friends the GitHub Releases page link (or the direct installer URLs) once — after that, their apps self-update.

### Friend-facing install doc (`INSTALL.md`)
Plain-language instructions: download the installer for your OS from the Releases page, run it, click through the one-time SmartScreen ("More info" → "Run anyway") or Gatekeeper (right-click → Open) warning, done. After that, updates happen automatically.

## Data Flow

1. Friend downloads `FlowState-Setup-x.y.z.exe` (or `.dmg`) from the GitHub Release, installs it.
2. On next launch (and each subsequent launch), `checkForUpdates` fires in the main process, hits GitHub's releases API via `electron-updater`.
3. If a newer version exists, it downloads in the background (no UI yet).
4. Once fully downloaded, main process sends `updates:status` with `{ state: 'ready' }` to the renderer.
5. `UpdateBanner` appears; user clicks "Restart & Update"; `autoUpdater.quitAndInstall()` closes and relaunches the app on the new version.

## Error Handling

- If the update check fails (no network, GitHub unreachable, malformed release), the main process logs the error and the app continues running normally on the current version — no error surfaced to the user for a background check failure, since this must never block normal app usage.
- In dev mode (unpackaged), the update module no-ops entirely rather than throwing (electron-updater's normal behavior when `app-update.yml` is absent is to throw or warn loudly).

## Testing

- `checkForUpdates` module: unit test that it correctly no-ops when `app.isPackaged` is false, and that it registers the expected `autoUpdater` event listeners when packaged (mock `electron-updater`).
- `UpdateBanner`: component test rendering it with a mock "ready" status, asserting the restart button is present and calls the expected IPC method.
- No automated test for the actual GitHub Actions release pipeline or real update download — verified manually by cutting a real tagged release and confirming a locally-installed prior version updates.

## Open Items for Future Versions

- Code signing, if the unsigned-install friction becomes a real problem for friends.
- Linux target, if any friend needs it.
