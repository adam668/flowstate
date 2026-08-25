# v1 Settings, Theme, Export & Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings page hosting theme (dark/light) + accent-color preferences, CSV/PDF export, and DB backup/restore.

**Architecture:** A new single-row `settings` table backs theme/accent preferences via the existing IPC-namespace pattern. Export and backup/restore get their own small `registerXHandlers` main-process files (mirroring the existing `registerMediaHandlers`/`registerUpdateHandlers` split, since both need extra runtime state — `dialog`, `BrowserWindow`, the live `db` instance — beyond a plain db-CRUD handler). No new dependencies: CSV is manual string-building, PDF uses Electron's built-in `webContents.printToPDF`.

**Tech Stack:** TypeScript, React, better-sqlite3, Electron (`dialog`, `BrowserWindow`, `app.relaunch`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-v1-update-design.md` (sections 4–7)

## Global Constraints

- Every new/changed function needs a failing test first (TDD Iron Law — no exceptions). Code that's only exercisable through a real Electron dialog/window (not mockable cheaply) gets its logic extracted into a pure/testable function wherever possible, with the thin IPC/dialog glue left to manual verification (documented per-task).
- New UI styles via `.interface-design/system.md` tokens only.
- Run `npm run typecheck` and `npm test -- run` clean after every task.
- `npm test`'s `pretest` hook rebuilds `better-sqlite3` for Node; `npm run build`/`npm run dev` rebuild it for Electron — re-run `npm test -- run` after either before the next task's tests (existing project convention).
- This plan assumes `docs/superpowers/plans/2026-08-24-v1-data-features.md` has already landed (or lands first) — no hard dependency between the two, but both touch `src/shared/types.ts` and `tokens.css`, so running them sequentially (not in parallel) avoids merge churn.

---

### Task 1: `settings` table + repo

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/shared/types.ts`
- Create: `src/main/db/settings.repo.ts`
- Create: `src/main/db/settings.repo.test.ts`

**Interfaces:**
- Produces: `Settings { theme: 'dark' | 'light'; accentColor: string }`, `UpdateSettings { theme?: 'dark' | 'light'; accentColor?: string }`, `getSettings(db): Settings`, `updateSettings(db, updates: UpdateSettings): Settings`

- [ ] **Step 1: Write the failing tests**

Create `src/main/db/settings.repo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { getSettings, updateSettings } from './settings.repo'

describe('settings.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  it('returns the seeded default row when nothing has been changed', () => {
    const settings = getSettings(db)
    expect(settings).toEqual({ theme: 'dark', accentColor: '#D99A3D' })
  })

  it('updates only the provided fields', () => {
    const updated = updateSettings(db, { theme: 'light' })
    expect(updated.theme).toBe('light')
    expect(updated.accentColor).toBe('#D99A3D')
  })

  it('persists updates across calls', () => {
    updateSettings(db, { accentColor: '#4C8DFF' })
    expect(getSettings(db).accentColor).toBe('#4C8DFF')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/db/settings.repo.test.ts`
Expected: FAIL — `Cannot find module './settings.repo'`.

- [ ] **Step 3: Add the `settings` table to the schema**

In `src/main/db/schema.ts`, add a new `CREATE TABLE` inside the existing `db.exec` template string, after the `playbooks` table:

```sql
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
      accent_color TEXT NOT NULL DEFAULT '#D99A3D'
    );

    INSERT OR IGNORE INTO settings (id, theme, accent_color) VALUES (1, 'dark', '#D99A3D');
```

(The `INSERT OR IGNORE` runs every time `applySchema` runs — on the first run it seeds the row, on every run after it's a no-op since `id = 1` already exists. This is the same idempotent-by-construction pattern the rest of the schema already uses.)

- [ ] **Step 4: Add `Settings`/`UpdateSettings` types**

In `src/shared/types.ts`, add after the `Playbook`/`NewPlaybook`/`UpdatePlaybook` block:

```ts
export interface Settings {
  theme: 'dark' | 'light'
  accentColor: string
}

export interface UpdateSettings {
  theme?: 'dark' | 'light'
  accentColor?: string
}
```

- [ ] **Step 5: Implement `settings.repo.ts`**

Create `src/main/db/settings.repo.ts`:

```ts
import type Database from 'better-sqlite3'
import type { Settings, UpdateSettings } from '../../shared/types'

function toSettings(row: any): Settings {
  return { theme: row.theme, accentColor: row.accent_color }
}

export function getSettings(db: Database.Database): Settings {
  return toSettings(db.prepare('SELECT * FROM settings WHERE id = 1').get())
}

export function updateSettings(db: Database.Database, updates: UpdateSettings): Settings {
  const existing = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any
  const theme = updates.theme ?? existing.theme
  const accentColor = updates.accentColor ?? existing.accent_color
  db.prepare('UPDATE settings SET theme = ?, accent_color = ? WHERE id = 1').run(
    theme,
    accentColor
  )
  return { theme, accentColor }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/main/db/settings.repo.test.ts`
Expected: 3 tests pass.

- [ ] **Step 7: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/main/db/schema.ts src/shared/types.ts src/main/db/settings.repo.ts src/main/db/settings.repo.test.ts
git commit -m "feat: settings table and repo (theme, accent color)"
```

---

### Task 2: `settings` IPC + preload

**Files:**
- Modify: `src/main/ipc/registerHandlers.ts`
- Modify: `src/main/ipc/registerHandlers.test.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `getSettings`, `updateSettings` (Task 1)
- Produces: IPC channels `settings:get`, `settings:update`; `flowStateApi.settings.get(): Promise<Settings>`, `flowStateApi.settings.update(updates: UpdateSettings): Promise<Settings>`

- [ ] **Step 1: Write the failing test**

In `src/main/ipc/registerHandlers.test.ts`, add `'settings:get'` and `'settings:update'` to the sorted array inside `it('registers every IPC channel the preload API calls', ...)`, in alphabetical position (between `'ruleStatus:get'` and `'tags:getOrCreate'`):

```ts
        'ruleStatus:get',
        'settings:get',
        'settings:update',
        'tags:getOrCreate',
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/ipc/registerHandlers.test.ts`
Expected: FAIL — the actual registered channel list is missing `settings:get`/`settings:update`.

- [ ] **Step 3: Register the handlers**

In `src/main/ipc/registerHandlers.ts`, add the import:
```ts
import { getSettings, updateSettings } from '../db/settings.repo'
```

Add `UpdateSettings` to the type-only import block:
```ts
  UpdatePlaybook,
  UpdateSettings
```

Add the handlers at the end of `registerHandlers`, after the `playbooks:delete` line:
```ts
  ipcMain.handle('settings:get', () => getSettings(db))
  ipcMain.handle('settings:update', (_e, updates: UpdateSettings) => updateSettings(db, updates))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/ipc/registerHandlers.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Add the preload wrapper**

In `src/preload/index.ts`, add `Settings`, `UpdateSettings` to the type-only import:
```ts
  UpdatePlaybook,
  Settings,
  UpdateSettings
```

Add a new namespace to `api`, after `playbooks`:
```ts
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (updates: UpdateSettings): Promise<Settings> =>
      ipcRenderer.invoke('settings:update', updates)
  }
```

- [ ] **Step 6: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/registerHandlers.ts src/main/ipc/registerHandlers.test.ts src/preload/index.ts
git commit -m "feat: settings IPC channels and preload API"
```

---

### Task 3: Settings page shell + theme toggle

**Files:**
- Create: `src/renderer/src/views/SettingsView.tsx`
- Create: `src/renderer/src/views/SettingsView.test.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.settings.get()`, `flowStateApi.settings.update()` (Task 2)

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/views/SettingsView.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSettingsMock = vi.fn()
const updateSettingsMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    settings: {
      get: (...a: unknown[]) => getSettingsMock(...a),
      update: (...a: unknown[]) => updateSettingsMock(...a)
    }
  }
}))

import { SettingsView } from './SettingsView'

describe('SettingsView theme toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettingsMock.mockResolvedValue({ theme: 'dark', accentColor: '#D99A3D' })
    updateSettingsMock.mockResolvedValue({ theme: 'light', accentColor: '#D99A3D' })
  })

  it('shows the current theme as active', async () => {
    render(<SettingsView />)
    const darkButton = await screen.findByRole('button', { name: 'Dark' })
    expect(darkButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls settings.update with the new theme when clicked', async () => {
    render(<SettingsView />)
    await screen.findByRole('button', { name: 'Dark' })

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalledWith({ theme: 'light' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/views/SettingsView.test.tsx`
Expected: FAIL — `Failed to resolve import "./SettingsView"`.

- [ ] **Step 3: Implement `SettingsView`**

Create `src/renderer/src/views/SettingsView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Settings } from '../../../shared/types'

export function SettingsView(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    flowStateApi.settings
      .get()
      .then(setSettings)
      .catch((err: unknown) => {
        setError(`Could not load settings: ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [])

  async function handleThemeChange(theme: 'dark' | 'light'): Promise<void> {
    try {
      const updated = await flowStateApi.settings.update({ theme })
      setSettings(updated)
      document.documentElement.dataset.theme = updated.theme
    } catch (err) {
      setError(`Could not update theme: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (!settings) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>

  return (
    <div className="settings-view">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <section className="settings-section">
        <span className="field-label">Theme</span>
        <div className="settings-theme-toggle">
          <button
            type="button"
            aria-pressed={settings.theme === 'dark'}
            className={settings.theme === 'dark' ? 'active' : ''}
            onClick={() => void handleThemeChange('dark')}
          >
            Dark
          </button>
          <button
            type="button"
            aria-pressed={settings.theme === 'light'}
            className={settings.theme === 'light' ? 'active' : ''}
            onClick={() => void handleThemeChange('light')}
          >
            Light
          </button>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS**

In `src/renderer/src/styles/tokens.css`, append:

```css
.settings-view { display: flex; flex-direction: column; gap: 24px; max-width: 460px; }
.settings-section { display: flex; flex-direction: column; gap: 10px; }
.settings-theme-toggle { display: flex; gap: 8px; }
.settings-theme-toggle button { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 16px; font-family: var(--sans); font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.settings-theme-toggle button.active { color: var(--bg); background: var(--accent); border-color: var(--accent); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/views/SettingsView.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 6: Wire into Sidebar and App**

In `src/renderer/src/components/Sidebar.tsx`, add `'settings'` to the `ViewName` union:
```ts
export type ViewName =
  | 'dashboard'
  | 'tradeLog'
  | 'accounts'
  | 'calendar'
  | 'journal'
  | 'analytics'
  | 'playbooks'
  | 'settings'
```

Add a new button after the Playbooks button, before the closing `</nav>`:
```tsx
      <button
        type="button"
        className={`sidebar-item ${active === 'settings' ? 'active' : ''}`}
        onClick={() => onSelect('settings')}
        aria-current={active === 'settings' ? 'page' : undefined}
      >
        Settings
      </button>
```

In `src/renderer/src/App.tsx`, add the import:
```ts
import { SettingsView } from './views/SettingsView'
```

Add the render branch after `{view === 'playbooks' && <PlaybooksView />}`:
```tsx
        {view === 'settings' && <SettingsView />}
```

- [ ] **Step 7: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/views/SettingsView.tsx src/renderer/src/views/SettingsView.test.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/App.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: Settings page with theme toggle"
```

---

### Task 4: Light theme palette + apply-on-load

**Files:**
- Modify: `src/renderer/src/styles/tokens.css`
- Modify: `src/renderer/src/App.tsx`
- Modify: `.interface-design/system.md`

**Interfaces:**
- Consumes: `flowStateApi.settings.get()` (Task 2)

- [ ] **Step 1: Add the light palette**

This is a CSS/visual task with no automated test (color tokens have no behavior to assert beyond "the CSS parses," which typecheck/build already cover). In `src/renderer/src/styles/tokens.css`, add a new block immediately after the existing `:root { ... }` block (before the `* { box-sizing: border-box; }` rule):

```css
:root[data-theme="light"] {
  --bg: #F7F8F9;
  --surface-1: #FFFFFF;
  --surface-2: #EEF0F2;
  --surface-3: #E3E6E9;
  --border: rgba(11,13,15,0.10);
  --border-soft: rgba(11,13,15,0.06);
  --text-primary: #14171A;
  --text-secondary: #4B535B;
  --text-muted: #8A929A;
  --accent-dim: rgba(217,154,61,0.18);
  --pnl-pos: #1E9A5C;
  --pnl-pos-dim: rgba(30,154,92,0.12);
  --pnl-neg: #C23B31;
  --pnl-neg-dim: rgba(194,59,49,0.12);
}
```

(`--accent` itself is intentionally omitted here — it's set at runtime via `style.setProperty` from the accent-color picker in Task 5, independent of light/dark, and defaults to the base `:root`'s `#D99A3D` until a preference is saved.)

- [ ] **Step 2: Apply the persisted theme on app load**

In `src/renderer/src/App.tsx`, add to the existing `useEffect` that already runs on mount (the one handling `updates.getStatus`) — add a second, independent `useEffect` rather than merging into the existing one (different concern, different dependency lifecycle):

```ts
  useEffect(() => {
    flowStateApi.settings.get().then((settings) => {
      document.documentElement.dataset.theme = settings.theme
      document.documentElement.style.setProperty('--accent', settings.accentColor)
    })
  }, [])
```

Place this as a new `useEffect` call directly after the existing one in the component body.

- [ ] **Step 3: Update the design system doc**

In `.interface-design/system.md`, under the `## Palette` section, replace the line `Dark-first, single-theme by design (the terminal-at-night concept is the identity, not a mode).` with:

```markdown
Dark-first — the "terminal at night" identity is the primary design target and default. A real light theme now also exists (`:root[data-theme="light"]` in `tokens.css`, same semantic token names, inverted lightness on the same neutral hue) — every new component must be checked against both palettes, not just the dark default.
```

- [ ] **Step 4: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass (App.tsx has no dedicated test file currently, so this task has no new automated coverage beyond typecheck/build — see manual verification below).

- [ ] **Step 5: Manual verification**

Run: `npm run build` then `npm run dev`. In the running app, go to Settings, toggle to Light, and click through every existing view (Dashboard, Trade Log, Accounts, Calendar, Journal, Analytics, Playbooks, Settings) checking text is readable and P&L green/red still reads correctly against the new light backgrounds. Toggle back to Dark and confirm nothing regressed. Restart the app (`npm run dev` again) and confirm the theme choice persisted (light theme applies before any manual toggle).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/styles/tokens.css src/renderer/src/App.tsx .interface-design/system.md
git commit -m "feat: light theme palette, applied from persisted settings on load"
```

---

### Task 5: Accent-color picker

**Files:**
- Modify: `src/renderer/src/views/SettingsView.tsx`
- Modify: `src/renderer/src/views/SettingsView.test.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.settings.update({ accentColor })` (Task 2)

- [ ] **Step 1: Write the failing test**

In `src/renderer/src/views/SettingsView.test.tsx`, update the `getSettingsMock`/`updateSettingsMock` resolved values in `beforeEach` to include a distinguishable starting accent, and add a new test at the end of the `describe` block:

Change the `beforeEach` mocks to:
```ts
    getSettingsMock.mockResolvedValue({ theme: 'dark', accentColor: '#D99A3D' })
    updateSettingsMock.mockResolvedValue({ theme: 'dark', accentColor: '#4C8DFF' })
```

Add:
```ts
  it('calls settings.update with the chosen accent color when a swatch is clicked', async () => {
    render(<SettingsView />)
    await screen.findByRole('button', { name: 'Dark' })

    fireEvent.click(screen.getByLabelText('Accent color Blue'))

    await waitFor(() => expect(updateSettingsMock).toHaveBeenCalledWith({ accentColor: '#4C8DFF' }))
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/views/SettingsView.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Accent color Blue`.

- [ ] **Step 3: Implement the accent picker**

In `src/renderer/src/views/SettingsView.tsx`, add the preset list above the component (module scope):

```ts
const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Amber', hex: '#D99A3D' },
  { name: 'Blue', hex: '#4C8DFF' },
  { name: 'Teal', hex: '#2FB8A6' },
  { name: 'Violet', hex: '#9B7FE8' },
  { name: 'Rose', hex: '#E0637A' }
]
```

Add a handler next to `handleThemeChange`:
```ts
  async function handleAccentChange(accentColor: string): Promise<void> {
    try {
      const updated = await flowStateApi.settings.update({ accentColor })
      setSettings(updated)
      document.documentElement.style.setProperty('--accent', updated.accentColor)
    } catch (err) {
      setError(`Could not update accent color: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
```

Add a new section after the theme-toggle `<section>`, before the closing `</div>`:
```tsx
      <section className="settings-section">
        <span className="field-label">Accent Color</span>
        <div className="settings-accent-swatches">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              className={`settings-accent-swatch ${settings.accentColor === preset.hex ? 'active' : ''}`}
              style={{ background: preset.hex }}
              aria-label={`Accent color ${preset.name}`}
              onClick={() => void handleAccentChange(preset.hex)}
            />
          ))}
        </div>
      </section>
```

- [ ] **Step 4: Add CSS**

In `src/renderer/src/styles/tokens.css`, append:

```css
.settings-accent-swatches { display: flex; gap: 10px; }
.settings-accent-swatch { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.settings-accent-swatch.active { border-color: var(--text-primary); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/views/SettingsView.test.tsx`
Expected: all tests pass (5 total: 4 existing/updated + 1 new).

- [ ] **Step 6: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/SettingsView.tsx src/renderer/src/views/SettingsView.test.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: accent-color picker in Settings"
```

---

### Task 6: CSV export

**Files:**
- Create: `src/main/export/csv.ts`
- Create: `src/main/export/csv.test.ts`
- Create: `src/main/export/registerExportHandlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/views/SettingsView.tsx`

**Interfaces:**
- Produces: `buildTradesCsv(trades: Trade[], playbooks: Playbook[], tags: Tag[]): string` (pure, tested); `registerExportHandlers(db: Database.Database): void` registering `export:csv`; `flowStateApi.export.csv(accountId: number): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/main/export/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTradesCsv } from './csv'
import type { Trade, Playbook, Tag } from '../../shared/types'

function makeTrade(overrides: Partial<Trade>): Trade {
  return {
    id: 1,
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5010,
    entryTime: '2026-08-11T13:35:00Z',
    exitTime: '2026-08-11T13:50:00Z',
    size: 1,
    pnl: 10,
    rMultiple: 2.5,
    setupThesis: null,
    executionNotes: null,
    lessonsLearned: null,
    brainstorm: null,
    screenshotPaths: [],
    tagIds: [],
    playbookId: null,
    ...overrides
  }
}

describe('buildTradesCsv', () => {
  it('writes a header row and one row per trade', () => {
    const csv = buildTradesCsv(
      [makeTrade({ id: 1, instrument: 'ES', pnl: 125.5 })],
      [],
      []
    )
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(
      'Date,Instrument,Side,Size,Entry,Exit,PnL,R-Multiple,Playbook,Tags,Setup Thesis,Execution Notes,Lessons Learned'
    )
    expect(lines[1]).toContain('ES')
    expect(lines[1]).toContain('125.5')
  })

  it('resolves playbook and tag names from ids', () => {
    const playbooks: Playbook[] = [{ id: 1, name: 'ORB Breakout', criteria: null, createdAt: '' }]
    const tags: Tag[] = [{ id: 1, name: 'FOMO' }, { id: 2, name: 'Revenge' }]
    const csv = buildTradesCsv(
      [makeTrade({ playbookId: 1, tagIds: [1, 2] })],
      playbooks,
      tags
    )
    const dataLine = csv.trim().split('\n')[1]
    expect(dataLine).toContain('ORB Breakout')
    expect(dataLine).toContain('FOMO')
    expect(dataLine).toContain('Revenge')
  })

  it('quotes and escapes fields containing a comma', () => {
    const csv = buildTradesCsv(
      [makeTrade({ setupThesis: 'Break, then retest' })],
      [],
      []
    )
    expect(csv).toContain('"Break, then retest"')
  })

  it('escapes embedded double quotes by doubling them', () => {
    const csv = buildTradesCsv([makeTrade({ setupThesis: 'Called it "the setup"' })], [], [])
    expect(csv).toContain('"Called it ""the setup"""')
  })

  it('renders an empty string for null reflection fields', () => {
    const csv = buildTradesCsv([makeTrade({ setupThesis: null })], [], [])
    const fields = csv.trim().split('\n')[1].split(',')
    // Setup Thesis is the 11th column (index 10)
    expect(fields[10]).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/export/csv.test.ts`
Expected: FAIL — `Cannot find module './csv'`.

- [ ] **Step 3: Implement `buildTradesCsv`**

Create `src/main/export/csv.ts`:

```ts
import type { Trade, Playbook, Tag } from '../../shared/types'

const HEADER = [
  'Date',
  'Instrument',
  'Side',
  'Size',
  'Entry',
  'Exit',
  'PnL',
  'R-Multiple',
  'Playbook',
  'Tags',
  'Setup Thesis',
  'Execution Notes',
  'Lessons Learned'
]

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildTradesCsv(trades: Trade[], playbooks: Playbook[], tags: Tag[]): string {
  const playbookNameById = new Map(playbooks.map((p) => [p.id, p.name]))
  const tagNameById = new Map(tags.map((t) => [t.id, t.name]))

  const rows = trades.map((trade) => {
    const playbookName = trade.playbookId !== null ? (playbookNameById.get(trade.playbookId) ?? '') : ''
    const tagNames = trade.tagIds.map((id) => tagNameById.get(id) ?? '').join('; ')
    const fields = [
      trade.exitTime,
      trade.instrument,
      trade.side,
      String(trade.size),
      String(trade.entryPrice),
      String(trade.exitPrice),
      String(trade.pnl),
      trade.rMultiple !== null ? String(trade.rMultiple) : '',
      playbookName,
      tagNames,
      trade.setupThesis ?? '',
      trade.executionNotes ?? '',
      trade.lessonsLearned ?? ''
    ]
    return fields.map(escapeCsvField).join(',')
  })

  return [HEADER.join(','), ...rows].join('\n') + '\n'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/export/csv.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Implement the IPC handler**

Create `src/main/export/registerExportHandlers.ts`:

```ts
import { ipcMain, dialog } from 'electron'
import type Database from 'better-sqlite3'
import { writeFileSync } from 'fs'
import { getAccount } from '../db/accounts.repo'
import { listTradesForAccount } from '../db/trades.repo'
import { listPlaybooks } from '../db/playbooks.repo'
import { listTags } from '../db/tags.repo'
import { buildTradesCsv } from './csv'

export function registerExportHandlers(db: Database.Database): void {
  ipcMain.handle('export:csv', async (_e, accountId: number) => {
    const account = getAccount(db, accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)
    const trades = listTradesForAccount(db, accountId)
    const playbooks = listPlaybooks(db)
    const tags = listTags(db)
    const csv = buildTradesCsv(trades, playbooks, tags)

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `flowstate-${account.accountName}-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return
    writeFileSync(filePath, csv, 'utf-8')
  })
}
```

- [ ] **Step 6: Wire into `src/main/index.ts`**

Add the import:
```ts
import { registerExportHandlers } from './export/registerExportHandlers'
```

Add the call inside `app.on('ready', ...)`, right after `registerHandlers(db)`:
```ts
  registerExportHandlers(db)
```

- [ ] **Step 7: Add the preload wrapper**

In `src/preload/index.ts`, add a new namespace after `settings`:
```ts
  export: {
    csv: (accountId: number): Promise<void> => ipcRenderer.invoke('export:csv', accountId)
  }
```

- [ ] **Step 8: Add the Settings UI**

In `src/renderer/src/views/SettingsView.tsx`, this needs an account list to choose which account to export — add state and a load effect. Add to the imports:
```ts
import type { Account, Settings } from '../../../shared/types'
```

Add state, next to `settings`/`error`:
```ts
  const [accounts, setAccounts] = useState<Account[]>([])
  const [exportAccountId, setExportAccountId] = useState<number | null>(null)
```

Extend the existing mount `useEffect` (the one calling `flowStateApi.settings.get()`) to also load accounts — change it to:
```ts
  useEffect(() => {
    flowStateApi.settings
      .get()
      .then(setSettings)
      .catch((err: unknown) => {
        setError(`Could not load settings: ${err instanceof Error ? err.message : String(err)}`)
      })
    flowStateApi.accounts
      .list()
      .then((list) => {
        setAccounts(list)
        if (list.length > 0) setExportAccountId(list[0].id)
      })
      .catch((err: unknown) => {
        setError(`Could not load accounts: ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [])
```

Add a handler:
```ts
  async function handleExportCsv(): Promise<void> {
    if (exportAccountId === null) return
    try {
      await flowStateApi.export.csv(exportAccountId)
    } catch (err) {
      setError(`Could not export CSV: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
```

Add a new section after the Accent Color section, before the closing `</div>`:
```tsx
      <section className="settings-section">
        <span className="field-label">Export</span>
        <div className="settings-export-row">
          <select
            aria-label="Export account"
            value={exportAccountId ?? ''}
            onChange={(e) => setExportAccountId(Number(e.target.value))}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firmName} · {a.accountName}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void handleExportCsv()}>
            Export trades (CSV)
          </button>
        </div>
      </section>
```

- [ ] **Step 9: Add CSS**

In `src/renderer/src/styles/tokens.css`, append:

```css
.settings-export-row { display: flex; gap: 10px; align-items: center; }
.settings-export-row select { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: var(--sans); font-size: 13px; color: var(--text-primary); }
.settings-export-row button { background: var(--accent); border: none; border-radius: 6px; padding: 8px 16px; font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--bg); cursor: pointer; }
```

- [ ] **Step 10: Update `SettingsView.test.tsx`'s mock for the new `accounts.list()` call**

`SettingsView`'s mount effect now also calls `flowStateApi.accounts.list()` (Step 8) — the test file's `vi.mock('../api/client', ...)` factory needs an `accounts` namespace or that call throws inside every existing test. Declare `const accountsListMock = vi.fn()` alongside the file's other mock declarations, add `accounts: { list: (...a: unknown[]) => accountsListMock(...a) }` to the mocked `flowStateApi` object, and add `accountsListMock.mockResolvedValue([])` to `beforeEach`.

- [ ] **Step 11: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 12: Manual verification**

Run: `npm run build` then `npm run dev`. In Settings, pick an account and click "Export trades (CSV)". Confirm a native save dialog opens, save the file, and open it to confirm the header row and trade rows are correct.

- [ ] **Step 13: Commit**

```bash
git add src/main/export/csv.ts src/main/export/csv.test.ts src/main/export/registerExportHandlers.ts src/main/index.ts src/preload/index.ts src/renderer/src/views/SettingsView.tsx src/renderer/src/views/SettingsView.test.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: CSV trade export"
```

---

### Task 7: PDF export

**Files:**
- Create: `src/main/export/pdfReport.ts`
- Create: `src/main/export/pdfReport.test.ts`
- Modify: `src/main/export/registerExportHandlers.ts`
- Modify: `src/main/index.ts` (no change needed — `registerExportHandlers` already wired in Task 6)
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/views/SettingsView.tsx`

**Interfaces:**
- Produces: `buildReportHtml(account: Account, status: RuleStatus, trades: Trade[]): string` (pure, tested); `export:pdf` IPC channel; `flowStateApi.export.pdf(accountId: number): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/main/export/pdfReport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildReportHtml } from './pdfReport'
import type { Account, RuleStatus, Trade } from '../../shared/types'

const account: Account = {
  id: 1,
  firmName: 'Apex',
  accountName: '150K Eval #2',
  startingBalance: 150000,
  currency: 'USD',
  status: 'evaluation',
  ruleProfileId: 1,
  createdAt: '2026-08-01T00:00:00Z'
}

const status: RuleStatus = {
  accountId: 1,
  highWaterMark: 153000,
  currentBalance: 152500,
  drawdownType: 'trailing',
  drawdownAmount: 5000,
  drawdownLimit: 148000,
  drawdownUsed: 500,
  drawdownRemaining: 4500,
  drawdownState: 'clean',
  todayPnl: 200,
  dailyLossLimit: 2500,
  dailyLossRemaining: 2300,
  dailyLossState: 'clean',
  consistencyPercent: null,
  bestDayProfitPercent: null,
  consistencyState: 'n/a',
  profitTargetPercent: 27.8,
  tradingDaysCount: 4,
  tradingDaysRemaining: null
}

function trade(pnl: number): Trade {
  return {
    id: 1,
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5010,
    entryTime: '2026-08-11T13:35:00Z',
    exitTime: '2026-08-11T13:50:00Z',
    size: 1,
    pnl,
    rMultiple: null,
    setupThesis: null,
    executionNotes: null,
    lessonsLearned: null,
    brainstorm: null,
    screenshotPaths: [],
    tagIds: [],
    playbookId: null
  }
}

describe('buildReportHtml', () => {
  it('includes the account name and firm', () => {
    const html = buildReportHtml(account, status, [trade(100), trade(-50)])
    expect(html).toContain('Apex')
    expect(html).toContain('150K Eval #2')
  })

  it('includes the trade count and win rate', () => {
    const html = buildReportHtml(account, status, [trade(100), trade(-50), trade(75)])
    expect(html).toContain('3') // trade count
    expect(html).toContain('67%') // 2 of 3 winners, rounded
  })

  it('reports 0% win rate for no trades without dividing by zero', () => {
    const html = buildReportHtml(account, status, [])
    expect(html).toContain('0%')
    expect(html).not.toContain('NaN')
  })

  it('is a complete, self-contained HTML document', () => {
    const html = buildReportHtml(account, status, [])
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<style>')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/export/pdfReport.test.ts`
Expected: FAIL — `Cannot find module './pdfReport'`.

- [ ] **Step 3: Implement `buildReportHtml`**

Create `src/main/export/pdfReport.ts`:

```ts
import type { Account, RuleStatus, Trade } from '../../shared/types'

export function buildReportHtml(account: Account, status: RuleStatus, trades: Trade[]): string {
  const wins = trades.filter((t) => t.pnl > 0).length
  const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0
  const bestDay = trades.reduce((max, t) => Math.max(max, t.pnl), 0)
  const worstDay = trades.reduce((min, t) => Math.min(min, t.pnl), 0)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #14171A; padding: 40px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #4B535B; font-weight: 500; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  td { padding: 8px 0; border-bottom: 1px solid #E3E6E9; font-size: 13px; }
  td:first-child { color: #4B535B; }
  td:last-child { text-align: right; font-weight: 600; }
</style>
</head>
<body>
  <h1>${account.firmName} — ${account.accountName}</h1>
  <h2>Evaluation Report — generated ${new Date().toLocaleDateString()}</h2>
  <table>
    <tr><td>Starting Balance</td><td>$${account.startingBalance.toLocaleString()}</td></tr>
    <tr><td>Current Balance</td><td>$${status.currentBalance.toLocaleString()}</td></tr>
    <tr><td>Total Trades</td><td>${trades.length}</td></tr>
    <tr><td>Win Rate</td><td>${winRate}%</td></tr>
    <tr><td>Best Day</td><td>$${bestDay.toLocaleString()}</td></tr>
    <tr><td>Worst Day</td><td>$${worstDay.toLocaleString()}</td></tr>
    <tr><td>Drawdown Status</td><td>${status.drawdownState}</td></tr>
    <tr><td>Consistency Status</td><td>${status.consistencyState}</td></tr>
    <tr><td>Profit Target Progress</td><td>${status.profitTargetPercent !== null ? status.profitTargetPercent.toFixed(1) + '%' : '—'}</td></tr>
  </table>
</body>
</html>`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/export/pdfReport.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Add the IPC handler**

In `src/main/export/registerExportHandlers.ts`, add imports:
```ts
import { BrowserWindow } from 'electron'
import { getRuleProfile } from '../db/ruleProfiles.repo'
import { computeRuleStatus } from '../ruleEngine/computeRuleStatus'
import { buildReportHtml } from './pdfReport'
```
(`dialog`, `writeFileSync`, `getAccount`, `listTradesForAccount` are already imported from Task 6.)

Add a second handler inside `registerExportHandlers`, after the `export:csv` handler:
```ts
  ipcMain.handle('export:pdf', async (_e, accountId: number) => {
    const account = getAccount(db, accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)
    const profile = getRuleProfile(db, account.ruleProfileId)
    if (!profile) throw new Error(`Rule profile ${account.ruleProfileId} not found`)
    const trades = listTradesForAccount(db, accountId)
    const status = computeRuleStatus(account, profile, trades, new Date().toISOString().slice(0, 10))
    const html = buildReportHtml(account, status, trades)

    const reportWindow = new BrowserWindow({ show: false })
    try {
      await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdfBuffer = await reportWindow.webContents.printToPDF({})

      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: `flowstate-${account.accountName}-report-${new Date().toISOString().slice(0, 10)}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (canceled || !filePath) return
      writeFileSync(filePath, pdfBuffer)
    } finally {
      reportWindow.destroy()
    }
  })
```

- [ ] **Step 6: Add the preload wrapper**

In `src/preload/index.ts`, add to the `export` namespace:
```ts
  export: {
    csv: (accountId: number): Promise<void> => ipcRenderer.invoke('export:csv', accountId),
    pdf: (accountId: number): Promise<void> => ipcRenderer.invoke('export:pdf', accountId)
  }
```

- [ ] **Step 7: Add the Settings UI button**

In `src/renderer/src/views/SettingsView.tsx`, add a handler next to `handleExportCsv`:
```ts
  async function handleExportPdf(): Promise<void> {
    if (exportAccountId === null) return
    try {
      await flowStateApi.export.pdf(exportAccountId)
    } catch (err) {
      setError(`Could not export PDF: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
```

Add a second button next to the existing CSV button inside `.settings-export-row`:
```tsx
          <button type="button" onClick={() => void handleExportPdf()}>
            Export report (PDF)
          </button>
```

- [ ] **Step 8: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 9: Manual verification**

Run: `npm run build` then `npm run dev`. In Settings, click "Export report (PDF)", save, and open the resulting PDF — confirm it renders account name, balances, win rate, and rule status readably.

- [ ] **Step 10: Commit**

```bash
git add src/main/export/pdfReport.ts src/main/export/pdfReport.test.ts src/main/export/registerExportHandlers.ts src/preload/index.ts src/renderer/src/views/SettingsView.tsx
git commit -m "feat: PDF evaluation report export"
```

---

### Task 8: Backup / Restore

**Files:**
- Create: `src/main/backup/validateRestoreFile.ts`
- Create: `src/main/backup/validateRestoreFile.test.ts`
- Create: `src/main/backup/registerBackupHandlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/views/SettingsView.tsx`

**Interfaces:**
- Produces: `validateRestoreFile(path: string): boolean` (pure-ish, real file I/O, tested); `registerBackupHandlers(db: Database.Database, dbPath: string): void` registering `backup:create`, `backup:restore`; `flowStateApi.backup.create(): Promise<void>`, `flowStateApi.backup.restore(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/main/backup/validateRestoreFile.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { validateRestoreFile } from './validateRestoreFile'

describe('validateRestoreFile', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flowstate-restore-test-'))
  })

  it('returns true for a real SQLite database file', () => {
    const path = join(dir, 'valid.db')
    new Database(path).close() // creates a valid, empty SQLite file
    expect(validateRestoreFile(path)).toBe(true)
  })

  it('returns false for a non-SQLite file', () => {
    const path = join(dir, 'not-a-db.db')
    writeFileSync(path, 'this is definitely not a sqlite database')
    expect(validateRestoreFile(path)).toBe(false)
  })

  it('returns false for a nonexistent file', () => {
    expect(validateRestoreFile(join(dir, 'does-not-exist.db'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/backup/validateRestoreFile.test.ts`
Expected: FAIL — `Cannot find module './validateRestoreFile'`.

- [ ] **Step 3: Implement `validateRestoreFile`**

Create `src/main/backup/validateRestoreFile.ts`:

```ts
import Database from 'better-sqlite3'

/**
 * Confirms a candidate restore file is a real, openable SQLite database
 * before it's ever copied over the live DB — a bad file must fail here,
 * not after the live database has already been overwritten.
 */
export function validateRestoreFile(path: string): boolean {
  try {
    const db = new Database(path, { fileMustExist: true, readonly: true })
    db.prepare('SELECT 1').get()
    db.close()
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/backup/validateRestoreFile.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Implement the IPC handlers**

Create `src/main/backup/registerBackupHandlers.ts`:

```ts
import { ipcMain, dialog, app } from 'electron'
import type Database from 'better-sqlite3'
import { copyFileSync } from 'fs'
import { validateRestoreFile } from './validateRestoreFile'

export function registerBackupHandlers(db: Database.Database, dbPath: string): void {
  ipcMain.handle('backup:create', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `flowstate-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'FlowState Database', extensions: ['db'] }]
    })
    if (canceled || !filePath) return
    copyFileSync(dbPath, filePath)
  })

  ipcMain.handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'FlowState Database', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return
    const chosenPath = filePaths[0]

    if (!validateRestoreFile(chosenPath)) {
      throw new Error('That file is not a valid FlowState backup.')
    }

    db.close()
    copyFileSync(chosenPath, dbPath)
    app.relaunch()
    app.exit()
  })
}
```

- [ ] **Step 6: Wire into `src/main/index.ts`**

Add the import:
```ts
import { registerBackupHandlers } from './backup/registerBackupHandlers'
```

Change the `db` creation line to capture the path in a variable so it can be passed to `registerBackupHandlers`:
```ts
  const dbPath = join(app.getPath('userData'), 'flowstate.db')
  const db = createConnection(dbPath)
  registerHandlers(db)
  registerExportHandlers(db)
  registerBackupHandlers(db, dbPath)
```

(This replaces the existing single-line `const db = createConnection(join(app.getPath('userData'), 'flowstate.db'))` — same value, just named so it can be reused.)

- [ ] **Step 7: Add the preload wrapper**

In `src/preload/index.ts`, add a new namespace after `export`:
```ts
  backup: {
    create: (): Promise<void> => ipcRenderer.invoke('backup:create'),
    restore: (): Promise<void> => ipcRenderer.invoke('backup:restore')
  }
```

- [ ] **Step 8: Add the Settings UI**

In `src/renderer/src/views/SettingsView.tsx`, add handlers after `handleExportPdf`:
```ts
  async function handleBackup(): Promise<void> {
    try {
      await flowStateApi.backup.create()
    } catch (err) {
      setError(`Could not create backup: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleRestore(): Promise<void> {
    if (
      !window.confirm(
        'Restoring replaces all current data with the backup file and restarts the app. This cannot be undone. Continue?'
      )
    ) {
      return
    }
    try {
      await flowStateApi.backup.restore()
    } catch (err) {
      setError(`Could not restore backup: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
```

Add a final section after the Export section, before the closing `</div>`:
```tsx
      <section className="settings-section">
        <span className="field-label">Backup</span>
        <div className="settings-export-row">
          <button type="button" onClick={() => void handleBackup()}>
            Back up data…
          </button>
          <button type="button" onClick={() => void handleRestore()}>
            Restore from backup…
          </button>
        </div>
      </section>
```

(Reuses `.settings-export-row`'s existing flex layout — no new CSS needed.)

- [ ] **Step 9: Add a test for the confirm-then-invoke flow**

In `src/renderer/src/views/SettingsView.test.tsx`, add `backup: { create: (...a: unknown[]) => backupCreateMock(...a), restore: (...a: unknown[]) => backupRestoreMock(...a) }` to the mocked `flowStateApi` object, declare `const backupCreateMock = vi.fn()` and `const backupRestoreMock = vi.fn()` alongside the other mock declarations, and add `backupCreateMock.mockResolvedValue(undefined)` / `backupRestoreMock.mockResolvedValue(undefined)` to `beforeEach`. Then add:

```ts
  it('backs up without confirmation', async () => {
    render(<SettingsView />)
    await screen.findByRole('button', { name: 'Dark' })

    fireEvent.click(screen.getByText('Back up data…'))

    await waitFor(() => expect(backupCreateMock).toHaveBeenCalled())
  })

  it('restores only after the user confirms the destructive prompt', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SettingsView />)
    await screen.findByRole('button', { name: 'Dark' })

    fireEvent.click(screen.getByText('Restore from backup…'))

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(backupRestoreMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 10: Run typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test -- run`
Expected: all tests pass.

- [ ] **Step 11: Manual verification (real round-trip, not just unit tests)**

Run: `npm run build` then `npm run dev`. In Settings: click "Back up data…", save a backup file. Make an observable change (e.g. create a new account). Click "Restore from backup…", pick the backup file, confirm the destructive prompt. Confirm the app relaunches and the observable change (the new account) is gone — the restored data matches the pre-change state. Separately, attempt to restore a non-`.db` or corrupted file and confirm the `ErrorBanner` reports the failure without the app relaunching or losing current data.

- [ ] **Step 12: Commit**

```bash
git add src/main/backup/validateRestoreFile.ts src/main/backup/validateRestoreFile.test.ts src/main/backup/registerBackupHandlers.ts src/main/index.ts src/preload/index.ts src/renderer/src/views/SettingsView.tsx src/renderer/src/views/SettingsView.test.tsx
git commit -m "feat: database backup and restore"
```

---

## Final Verification (after all 8 tasks)

- [ ] Run `npm run typecheck` — clean.
- [ ] Run `npm test -- run` — all tests pass.
- [ ] Run `npm run build` — succeeds.
- [ ] Run `npm run dev`, walk through: Settings page loads with current theme/accent selected; toggling theme and accent updates the whole app live and persists across restart; CSV export produces a correct file; PDF export produces a readable report; backup/restore round-trips correctly (see Task 8 Step 11) including the invalid-file rejection path.
- [ ] Spot-check the light theme (Task 4) across every view one more time now that Settings/export/backup UI also exists.
