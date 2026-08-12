# Installer & Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package FlowState as Windows/Mac installers publishable to a public GitHub repo, with the running app self-updating via `electron-updater` and a small in-app "update ready" banner.

**Architecture:** `electron-builder` packages the app (NSIS on Windows, DMG on Mac) and publishes to GitHub Releases. A new main-process module wraps `electron-updater`'s `autoUpdater`, forwarding status over a push-style IPC channel to the renderer, which shows a banner once an update has finished downloading. A GitHub Actions workflow builds and publishes both platforms on tag push, since Mac installers require a real Mac to build.

**Tech Stack:** `electron-builder` (already present), `electron-updater` (new), GitHub Actions, existing IPC/preload/React patterns.

## Global Constraints

- Public GitHub repo: `adam668/flowstate`. No private-repo token handling.
- No code signing — installers are unsigned; the friction is documented in `INSTALL.md`, not solved in code.
- `electron-updater` must no-op in dev (unpackaged) mode — it requires a real packaged app with `app-update.yml`.
- Update-check failures must never surface as a blocking error or crash the app — log/report status only, the app keeps working on the current version.
- Follow the existing `flowStateApi` / `window.api` pattern for all new IPC — explicit `Promise<T>` return types, no bare `any`.

---

## File Structure

```
electron-builder.yml                          # packaging + publish config
package.json                                   # + electron-updater dep, "publish" script
src/
  shared/
    types.ts                                   # + UpdateStatus type
  main/
    updates/
      checkForUpdates.ts                       # wraps autoUpdater, reports status via callback
      checkForUpdates.test.ts
    ipc/
      registerUpdateHandlers.ts                # updates:restart handler
    index.ts                                   # wire checkForUpdates + registerUpdateHandlers, push status to renderer
  preload/
    index.ts                                   # + window.api.updates.{restartAndInstall, onStatusChange}
  renderer/
    src/
      components/
        UpdateBanner.tsx
        UpdateBanner.test.tsx
      App.tsx                                  # render UpdateBanner when an update is ready
      styles/
        tokens.css                             # + .update-banner rules
.github/
  workflows/
    release.yml                                # build+publish both platforms on tag push
RELEASING.md
INSTALL.md
```

---

### Task 1: Packaging config

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` (add `electron-updater` dependency, add `"publish"` script)

**Interfaces:**
- Produces: a working `npx electron-builder --dir` (unpacked build, no publish) and the `"publish"` npm script later tasks/CI invoke as `npm run publish`. Nothing from this task is imported by code — it's build tooling only.

- [ ] **Step 1: Install electron-updater**

```bash
npm install electron-updater
```

- [ ] **Step 2: Write the packaging config**

`electron-builder.yml`:
```yaml
appId: com.flowstate.app
productName: FlowState
directories:
  output: dist
files:
  - out/**/*
  - package.json
win:
  target: nsis
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
mac:
  target: dmg
  category: public.app-category.finance
publish:
  provider: github
  owner: adam668
  repo: flowstate
```

- [ ] **Step 3: Add the publish script**

In `package.json`, add to `"scripts"` (alongside the existing `dev`/`build`/`preview`/`test`/`typecheck`/`pretest`/`predev`/`prebuild` entries):
```json
"publish": "npm run build && electron-builder --publish always"
```

- [ ] **Step 4: Verify packaging works without publishing**

Run: `npm run build && npx electron-builder --dir`
Expected: exits 0, and `dist/win-unpacked/FlowState.exe` (on Windows) exists. This validates `electron-builder.yml` is well-formed and the app packages, without needing a GitHub token or network publish.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml package.json package-lock.json
git commit -m "feat: add electron-builder packaging config and publish script"
```

---

### Task 2: Update-check module

**Files:**
- Create: `src/main/updates/checkForUpdates.ts`
- Test: `src/main/updates/checkForUpdates.test.ts`
- Modify: `src/shared/types.ts` (add `UpdateStatus`)

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan.
- Produces: `UpdateStatus` (shared type), `checkForUpdates(onStatus: (status: UpdateStatus) => void): void`, `restartAndInstall(): void` — both from `src/main/updates/checkForUpdates.ts`. Task 3's `src/main/index.ts` wiring and `registerUpdateHandlers.ts` call these exact names.

- [ ] **Step 1: Add the shared UpdateStatus type**

Append to `src/shared/types.ts`:
```ts
export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
```

- [ ] **Step 2: Write the failing test**

`src/main/updates/checkForUpdates.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listeners: Record<string, (...args: any[]) => void> = {}
const mockAutoUpdater = {
  autoDownload: false,
  autoInstallOnAppQuit: true,
  on: vi.fn((event: string, cb: (...args: any[]) => void) => {
    listeners[event] = cb
  }),
  checkForUpdates: vi.fn(() => Promise.resolve()),
  quitAndInstall: vi.fn()
}

vi.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }))

let isPackaged = true
vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return isPackaged
    }
  }
}))

import { checkForUpdates, restartAndInstall } from './checkForUpdates'

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(listeners).forEach((k) => delete listeners[k])
    isPackaged = true
  })

  it('no-ops when the app is not packaged (dev mode)', () => {
    isPackaged = false
    const onStatus = vi.fn()
    checkForUpdates(onStatus)
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(onStatus).not.toHaveBeenCalled()
  })

  it('checks for updates and reports ready when update-downloaded fires', () => {
    const onStatus = vi.fn()
    checkForUpdates(onStatus)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled()
    listeners['update-downloaded']({ version: '1.2.3' })
    expect(onStatus).toHaveBeenCalledWith({ state: 'ready', version: '1.2.3' })
  })

  it('reports download progress as a rounded percent', () => {
    const onStatus = vi.fn()
    checkForUpdates(onStatus)
    listeners['download-progress']({ percent: 42.7 })
    expect(onStatus).toHaveBeenCalledWith({ state: 'downloading', percent: 43 })
  })

  it('reports error status when the update check rejects, without throwing', async () => {
    mockAutoUpdater.checkForUpdates.mockReturnValueOnce(Promise.reject(new Error('network down')))
    const onStatus = vi.fn()
    expect(() => checkForUpdates(onStatus)).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onStatus).toHaveBeenCalledWith({ state: 'error', message: 'network down' })
  })

  it('restartAndInstall calls autoUpdater.quitAndInstall', () => {
    restartAndInstall()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/main/updates/checkForUpdates.test.ts`
Expected: FAIL — `checkForUpdates.ts` does not exist yet.

- [ ] **Step 4: Implement the module**

`src/main/updates/checkForUpdates.ts`:
```ts
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../../shared/types'

/**
 * Wraps electron-updater's autoUpdater, forwarding every state change through
 * a plain callback instead of electron-updater's own dialogs, so the renderer
 * controls how (and whether) it's surfaced. No-ops entirely when the app is
 * running unpackaged (dev mode) — electron-updater requires a real packaged
 * app with an app-update.yml, which only exists in a built installer.
 */
export function checkForUpdates(onStatus: (status: UpdateStatus) => void): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => onStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    onStatus({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => onStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    onStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => onStatus({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => onStatus({ state: 'error', message: err.message }))

  // A failed check must never crash the app or block startup — it's reported
  // through the same status channel as everything else and otherwise ignored.
  autoUpdater.checkForUpdates().catch((err: Error) => {
    onStatus({ state: 'error', message: err.message })
  })
}

export function restartAndInstall(): void {
  autoUpdater.quitAndInstall()
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/main/updates/checkForUpdates.test.ts`
Expected: PASS, all 5 cases.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/updates/checkForUpdates.ts src/main/updates/checkForUpdates.test.ts
git commit -m "feat: update-check module wrapping electron-updater"
```

---

### Task 3: IPC wiring and main-process integration

**Files:**
- Create: `src/main/ipc/registerUpdateHandlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `checkForUpdates`, `restartAndInstall` (Task 2), `UpdateStatus` (Task 2).
- Produces: IPC channel `updates:restart` (request/response) and `updates:status` (main→renderer push). Preload exposes `window.api.updates.restartAndInstall(): Promise<void>` and `window.api.updates.onStatusChange(callback: (status: UpdateStatus) => void): () => void` (returns an unsubscribe function). Task 4's `App.tsx` calls these exact names.

- [ ] **Step 1: Write the update IPC handler**

`src/main/ipc/registerUpdateHandlers.ts`:
```ts
import { ipcMain } from 'electron'
import { restartAndInstall } from '../updates/checkForUpdates'

export function registerUpdateHandlers(): void {
  ipcMain.handle('updates:restart', () => restartAndInstall())
}
```

- [ ] **Step 2: Wire update checking into the main process entry**

Modify `src/main/index.ts` — add the imports and call `checkForUpdates`/`registerUpdateHandlers` inside the existing `app.on('ready', ...)` handler:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createConnection } from './db/connection'
import { registerHandlers } from './ipc/registerHandlers'
import { registerUpdateHandlers } from './ipc/registerUpdateHandlers'
import { checkForUpdates } from './updates/checkForUpdates'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('ready', () => {
  const db = createConnection(join(app.getPath('userData'), 'flowstate.db'))
  registerHandlers(db)
  registerUpdateHandlers()
  createWindow()
  checkForUpdates((status) => {
    mainWindow?.webContents.send('updates:status', status)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
```

- [ ] **Step 3: Expose the update API from preload**

Modify `src/preload/index.ts` — add the `UpdateStatus` import and the `updates` block to the `api` object:
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  NewAccount,
  NewRuleProfile,
  NewTrade,
  RuleProfile,
  RuleStatus,
  Tag,
  Trade,
  UpdateStatus
} from '../shared/types'

const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    create: (account: NewAccount): Promise<Account> =>
      ipcRenderer.invoke('accounts:create', account)
  },
  ruleProfiles: {
    create: (profile: NewRuleProfile): Promise<RuleProfile> =>
      ipcRenderer.invoke('ruleProfiles:create', profile)
  },
  trades: {
    listForAccount: (accountId: number): Promise<Trade[]> =>
      ipcRenderer.invoke('trades:listForAccount', accountId),
    create: (trade: NewTrade): Promise<Trade> => ipcRenderer.invoke('trades:create', trade)
  },
  tags: {
    getOrCreate: (name: string): Promise<Tag> => ipcRenderer.invoke('tags:getOrCreate', name)
  },
  ruleStatus: {
    get: (accountId: number): Promise<RuleStatus> =>
      ipcRenderer.invoke('ruleStatus:get', accountId)
  },
  updates: {
    restartAndInstall: (): Promise<void> => ipcRenderer.invoke('updates:restart'),
    onStatusChange: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
        callback(status)
      ipcRenderer.on('updates:status', listener)
      return () => ipcRenderer.removeListener('updates:status', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type FlowStateApi = typeof api
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/registerUpdateHandlers.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: wire update IPC channels and main-process integration"
```

---

### Task 4: Update banner UI

**Files:**
- Create: `src/renderer/src/components/UpdateBanner.tsx`
- Test: `src/renderer/src/components/UpdateBanner.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.updates.{restartAndInstall, onStatusChange}` (Task 3), `UpdateStatus` (Task 2).
- Produces: `<UpdateBanner version={string} onRestart={() => void} />` — a presentational component, no further consumers in this plan.

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/UpdateBanner.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UpdateBanner } from './UpdateBanner'

describe('UpdateBanner', () => {
  it('shows the version and calls onRestart when the button is clicked', () => {
    const onRestart = vi.fn()
    render(<UpdateBanner version="1.2.3" onRestart={onRestart} />)

    expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /restart/i }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/UpdateBanner.test.tsx`
Expected: FAIL — `UpdateBanner.tsx` does not exist.

- [ ] **Step 3: Implement the component**

`src/renderer/src/components/UpdateBanner.tsx`:
```tsx
interface UpdateBannerProps {
  version: string
  onRestart: () => void
}

/**
 * Appears only once an update has fully downloaded and is ready to install —
 * no UI at all on the common path (checking, downloading, up to date).
 */
export function UpdateBanner({ version, onRestart }: UpdateBannerProps): JSX.Element {
  return (
    <div className="update-banner" role="status">
      <span className="update-banner-label">Update Ready</span>
      <span className="update-banner-message">Version {version} has been downloaded.</span>
      <button type="button" className="update-banner-action" onClick={onRestart}>
        Restart &amp; Update
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Add the update banner CSS**

Append to `src/renderer/src/styles/tokens.css`:
```css
.update-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent-dim);
  color: var(--text-primary);
  font-family: var(--sans);
  font-size: 13px;
}
.update-banner-label {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
.update-banner-message { flex: 1; }
.update-banner-action {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 500;
  color: var(--bg);
  cursor: pointer;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/UpdateBanner.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the banner into App.tsx**

Modify `src/renderer/src/App.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Sidebar, ViewName } from './components/Sidebar'
import { DashboardView } from './views/DashboardView'
import { AccountsView } from './views/AccountsView'
import { TradeLogView } from './views/TradeLogView'
import { UpdateBanner } from './components/UpdateBanner'
import { flowStateApi } from './api/client'
import type { UpdateStatus } from '../../shared/types'

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewName>('dashboard')
  const [readyVersion, setReadyVersion] = useState<string | null>(null)

  useEffect(() => {
    return flowStateApi.updates.onStatusChange((status: UpdateStatus) => {
      if (status.state === 'ready') setReadyVersion(status.version)
    })
  }, [])

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} />
      <main className="main-content">
        {readyVersion && (
          <UpdateBanner
            version={readyVersion}
            onRestart={() => flowStateApi.updates.restartAndInstall()}
          />
        )}
        {view === 'dashboard' && <DashboardView />}
        {view === 'accounts' && <AccountsView />}
        {view === 'tradeLog' && <TradeLogView />}
      </main>
    </div>
  )
}
```

- [ ] **Step 7: Typecheck and run the full test suite**

Run: `npm run typecheck && npm test -- run`
Expected: typecheck exits 0; all tests (existing + new) pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/UpdateBanner.tsx src/renderer/src/components/UpdateBanner.test.tsx src/renderer/src/App.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: show an update-ready banner in the app shell"
```

---

### Task 5: Release automation and friend-facing docs

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `RELEASING.md`
- Create: `INSTALL.md`

**Interfaces:**
- Consumes: the `"publish"` script from Task 1.
- Produces: nothing consumed by other tasks — this is the final task in the plan.

- [ ] **Step 1: Write the GitHub Actions release workflow**

`.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    strategy:
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Write the release process doc**

`RELEASING.md`:
```markdown
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
4. Once the release is published, friends' already-installed apps detect and
   download the update automatically on their next launch. For a first
   install, send them the Releases page:
   https://github.com/adam668/flowstate/releases
```

- [ ] **Step 3: Write the friend-facing install doc**

`INSTALL.md`:
```markdown
# Installing FlowState

## Windows

1. Download `FlowState-Setup-x.y.z.exe` from the
   [latest release](https://github.com/adam668/flowstate/releases/latest).
2. Run it. Windows will show a blue "Windows protected your PC" screen — this
   is expected for a new app that isn't code-signed. Click **More info**,
   then **Run anyway**.
3. Follow the installer.

## Mac

1. Download `FlowState-x.y.z.dmg` from the
   [latest release](https://github.com/adam668/flowstate/releases/latest).
2. Open the `.dmg` and drag FlowState into Applications.
3. The first time you open it, macOS will block it ("FlowState can't be
   opened because it is from an unidentified developer"). Right-click (or
   Control-click) the app in Applications and choose **Open**, then confirm
   **Open** again in the dialog. You only need to do this once.

After the first install, FlowState updates itself automatically — no need to
repeat these steps.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml RELEASING.md INSTALL.md
git commit -m "feat: add GitHub Actions release workflow and install/release docs"
```

---

## Self-Review

**Spec coverage:**
- Packaging (Windows NSIS + Mac DMG, publish to GitHub) — Task 1. ✓
- Auto-update wrapping electron-updater, no-op in dev — Task 2. ✓
- IPC + preload wiring for restart/status — Task 3. ✓
- In-app update banner — Task 4. ✓
- GitHub Actions release pipeline, `RELEASING.md`, `INSTALL.md` — Task 5. ✓
- Error handling (update-check failure never blocks the app) — Task 2's `.catch()` + test. ✓

**Placeholder scan:** no TBD/TODO; every step has runnable code or exact commands/YAML.

**Type consistency:** `UpdateStatus` defined once in Task 2, used identically in Task 2's module, Task 3's preload, and Task 4's `App.tsx`. `checkForUpdates`/`restartAndInstall` names match between Task 2's definition and Task 3's imports. `window.api.updates.{restartAndInstall,onStatusChange}` names match between Task 3's preload and Task 4's `App.tsx` usage.
