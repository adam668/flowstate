# Releasing FlowState

1. Bump the version and create a tag:
   ```bash
   npm version patch   # or: minor / major
   ```
2. Push the commit and the tag:
   ```bash
   git push && git push --tags
   ```
3. GitHub Actions builds the Windows and Mac installers and publishes a new
   GitHub Release automatically. Watch progress at
   https://github.com/adam668/flowstate/actions

   There is no manual "publish" step: `electron-builder.yml` sets
   `publish.releaseType: release`, so CI creates the release already live.
   (If it were left at electron-builder's default of `draft`, the release
   would be invisible to `/releases/latest` and to auto-update.)

   The two platform builds run with `max-parallel: 1` so they don't race to
   create the same release — expect the Windows job to finish before the Mac
   job starts. The Mac job produces two DMGs, `FlowState-x.y.z-arm64.dmg` and
   `FlowState-x.y.z-x64.dmg` (both consistently arch-suffixed, since
   `electron-builder.yml` now sets `artifactName` explicitly — otherwise
   electron-builder silently drops the suffix from the default arch's
   filename). It also publishes a matching `.zip` for each arch; those power
   electron-updater's Squirrel.Mac auto-update mechanism (which cannot apply
   a `.dmg`) and friends never interact with them directly.
4. Once the release is published, friends' already-installed apps detect and
   download the update automatically on their next launch. For a first
   install, send them the Releases page:
   https://github.com/adam668/flowstate/releases

## Testing the update banner without a real release

`checkForUpdates` no-ops in dev mode (electron-updater needs a packaged app),
so the banner would otherwise only be verifiable after cutting a real release.
To smoke-test it locally instead:

```bash
FLOWSTATE_FAKE_UPDATE=1 npm run dev
```

On Windows PowerShell:

```powershell
$env:FLOWSTATE_FAKE_UPDATE = "1"; npm run dev
```

The main process pushes a fake `{ state: 'ready', version: '9.9.9' }` status
about a second after the window opens, and caches it so a late-mounting
renderer still picks it up via `updates:getStatus`. The banner should appear
with version 9.9.9.

This works in unpackaged dev mode because it is a separate branch that never
calls `checkForUpdates` at all — no guard bypass is needed. Clicking
**Restart** still calls the real `autoUpdater.quitAndInstall()`, which will do
nothing useful in dev; the point of this hatch is verifying the banner renders
and the IPC chain is wired, not the install itself.
