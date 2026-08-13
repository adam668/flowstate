# Calendar & Daily Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Calendar view (P&L heatmap + behavior-tag dots) and a Notion-style block-based Daily Journal (one page per calendar day, images, user-created reusable templates) to FlowState.

**Architecture:** Two new SQLite tables (`journal_entries`, `journal_templates`) behind the existing repo/IPC/preload pattern; a BlockNote-based rich editor component shared by both the Calendar's day-click flow and a new Journal section; pasted/dropped images are written to a managed local folder and served back to the renderer through a custom `flowstate-media://` Electron protocol (never a raw filesystem path).

**Tech Stack:** BlockNote (`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`) for the editor, existing Electron/React/TypeScript/better-sqlite3 stack otherwise.

## Global Constraints

- One journal entry per calendar day, not per account — `journal_entries.date` is `UNIQUE`.
- Journal/calendar day attribution uses the existing `toLocalDateString` helper (`src/shared/date.ts`) — the same local-day convention already shared by the rule engine and IPC layer. Never `toISOString().slice(0, 10)`.
- Templates are user-created and reusable (not a fixed built-in set) — full create/rename/delete.
- Images are copied into an app-managed directory and served via a custom `flowstate-media://` protocol with a path-traversal guard — never a raw `file://` path exposed to the renderer, consistent with the app's `contextIsolation: true` / `nodeIntegration: false` posture.
- All new IPC follows the existing `flowStateApi`/`window.api` namespace pattern: explicit `Promise<T>` return types on every preload method, no bare `any`.
- Visual direction is locked in `.interface-design/system.md` — every new CSS rule uses only existing custom properties from `src/renderer/src/styles/tokens.css`; no invented colors.
- An entry row is created lazily on first save, not on merely opening/clicking a day — avoids littering the database with empty rows for days the user only glanced at.

---

## File Structure

```
src/
  shared/
    types.ts                                # + JournalEntry, JournalTemplate, NewJournalEntry, NewJournalTemplate, UpdateJournalTemplate
    calendar.ts                             # computeDayAggregates(trades) — pure function
    calendar.test.ts
  main/
    db/
      schema.ts                             # + journal_entries, journal_templates tables
      journalEntries.repo.ts
      journalEntries.repo.test.ts
      journalTemplates.repo.ts
      journalTemplates.repo.test.ts
      trades.repo.ts                        # + listAllTrades
    media/
      mediaProtocol.ts                      # flowstate-media:// handler + saveImage
      mediaProtocol.test.ts
    ipc/
      registerHandlers.ts                   # + journalEntries/journalTemplates/trades:listAll handlers
      registerMediaHandlers.ts              # media:saveImage handler
    index.ts                                # register flowstate-media:// scheme + protocol + media handlers
  preload/
    index.ts                                # + journalEntries, journalTemplates, media namespaces; trades.listAll
  renderer/
    src/
      components/
        Sidebar.tsx                         # activate Calendar (Task 6), add Journal (Task 7)
      views/
        JournalEntryEditor.tsx              # BlockNote wrapper: load, autosave, template insertion hook
        JournalEntryEditor.test.tsx
        CalendarView.tsx
        CalendarView.test.tsx
        JournalView.tsx
        JournalView.test.tsx
      styles/
        tokens.css                          # + calendar + journal editor CSS
      App.tsx                               # wire 'calendar' and 'journal' views
```

---

### Task 1: Journal entries & templates schema and repositories

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/shared/types.ts`
- Create: `src/main/db/journalEntries.repo.ts`
- Test: `src/main/db/journalEntries.repo.test.ts`
- Create: `src/main/db/journalTemplates.repo.ts`
- Test: `src/main/db/journalTemplates.repo.test.ts`

**Interfaces:**
- Consumes: `createConnection` (`src/main/db/connection.ts`, existing).
- Produces: `JournalEntry`, `NewJournalEntry`, `JournalTemplate`, `NewJournalTemplate`, `UpdateJournalTemplate` (shared types). `getJournalEntryByDate(db, date): JournalEntry | undefined`, `upsertJournalEntry(db, entry: NewJournalEntry): JournalEntry`, `listJournalEntries(db): JournalEntry[]`. `listJournalTemplates(db): JournalTemplate[]`, `createJournalTemplate(db, template: NewJournalTemplate): JournalTemplate`, `updateJournalTemplate(db, id, updates: UpdateJournalTemplate): JournalTemplate`, `deleteJournalTemplate(db, id): void`. Task 3's IPC handlers call these exact names.

- [ ] **Step 1: Add the two new tables to the schema**

In `src/main/db/schema.ts`, inside the existing `db.exec(\`...\`)` template literal, add after the `trade_tags` table and its indexes (before the closing backtick):
```sql
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

- [ ] **Step 2: Add the shared types**

Append to `src/shared/types.ts`:
```ts
export interface JournalEntry {
  id: number
  date: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface JournalTemplate {
  id: number
  name: string
  content: string
  createdAt: string
}

export interface NewJournalEntry {
  date: string
  content: string
}

export interface NewJournalTemplate {
  name: string
  content: string
}

export interface UpdateJournalTemplate {
  name?: string
  content?: string
}
```

- [ ] **Step 3: Write the failing test for journal entries**

`src/main/db/journalEntries.repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { getJournalEntryByDate, upsertJournalEntry, listJournalEntries } from './journalEntries.repo'

describe('journalEntries.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  it('returns undefined for a date with no entry', () => {
    expect(getJournalEntryByDate(db, '2026-08-13')).toBeUndefined()
  })

  it('creates an entry on first upsert and updates it on the second', () => {
    const created = upsertJournalEntry(db, { date: '2026-08-13', content: '[]' })
    expect(created.date).toBe('2026-08-13')
    expect(created.content).toBe('[]')

    const updated = upsertJournalEntry(db, {
      date: '2026-08-13',
      content: '[{"type":"paragraph"}]'
    })
    expect(updated.id).toBe(created.id)
    expect(updated.content).toBe('[{"type":"paragraph"}]')
    expect(listJournalEntries(db)).toHaveLength(1)
  })

  it('lists entries newest date first', () => {
    upsertJournalEntry(db, { date: '2026-08-01', content: '[]' })
    upsertJournalEntry(db, { date: '2026-08-13', content: '[]' })
    const entries = listJournalEntries(db)
    expect(entries.map((e) => e.date)).toEqual(['2026-08-13', '2026-08-01'])
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/main/db/journalEntries.repo.test.ts`
Expected: FAIL — `journalEntries.repo.ts` does not exist.

- [ ] **Step 5: Implement the journal entries repository**

`src/main/db/journalEntries.repo.ts`:
```ts
import type Database from 'better-sqlite3'
import type { JournalEntry, NewJournalEntry } from '../../shared/types'

function toJournalEntry(row: any): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getJournalEntryByDate(
  db: Database.Database,
  date: string
): JournalEntry | undefined {
  const row = db.prepare('SELECT * FROM journal_entries WHERE date = ?').get(date)
  return row ? toJournalEntry(row) : undefined
}

export function upsertJournalEntry(db: Database.Database, entry: NewJournalEntry): JournalEntry {
  db.prepare(
    `
    INSERT INTO journal_entries (date, content, updated_at)
    VALUES (@date, @content, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `
  ).run(entry)
  return getJournalEntryByDate(db, entry.date)!
}

export function listJournalEntries(db: Database.Database): JournalEntry[] {
  const rows = db.prepare('SELECT * FROM journal_entries ORDER BY date DESC').all()
  return rows.map(toJournalEntry)
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/main/db/journalEntries.repo.test.ts`
Expected: PASS, all 3 cases.

- [ ] **Step 7: Write the failing test for journal templates**

`src/main/db/journalTemplates.repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import {
  listJournalTemplates,
  createJournalTemplate,
  updateJournalTemplate,
  deleteJournalTemplate
} from './journalTemplates.repo'

describe('journalTemplates.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  it('creates and lists a template', () => {
    const template = createJournalTemplate(db, { name: 'Daily Review', content: '[]' })
    expect(template.name).toBe('Daily Review')
    expect(listJournalTemplates(db)).toHaveLength(1)
  })

  it('updates only the provided fields', () => {
    const template = createJournalTemplate(db, { name: 'Daily Review', content: '[]' })
    const updated = updateJournalTemplate(db, template.id, {
      content: '[{"type":"heading"}]'
    })
    expect(updated.name).toBe('Daily Review')
    expect(updated.content).toBe('[{"type":"heading"}]')
  })

  it('throws for an unknown template id', () => {
    expect(() => updateJournalTemplate(db, 999, { name: 'x' })).toThrow(
      'Journal template 999 not found'
    )
  })

  it('deletes a template', () => {
    const template = createJournalTemplate(db, { name: 'Daily Review', content: '[]' })
    deleteJournalTemplate(db, template.id)
    expect(listJournalTemplates(db)).toHaveLength(0)
  })
})
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run src/main/db/journalTemplates.repo.test.ts`
Expected: FAIL — `journalTemplates.repo.ts` does not exist.

- [ ] **Step 9: Implement the journal templates repository**

`src/main/db/journalTemplates.repo.ts`:
```ts
import type Database from 'better-sqlite3'
import type { JournalTemplate, NewJournalTemplate, UpdateJournalTemplate } from '../../shared/types'

function toJournalTemplate(row: any): JournalTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    createdAt: row.created_at
  }
}

export function listJournalTemplates(db: Database.Database): JournalTemplate[] {
  const rows = db.prepare('SELECT * FROM journal_templates ORDER BY created_at DESC').all()
  return rows.map(toJournalTemplate)
}

export function createJournalTemplate(
  db: Database.Database,
  template: NewJournalTemplate
): JournalTemplate {
  const info = db
    .prepare('INSERT INTO journal_templates (name, content) VALUES (@name, @content)')
    .run(template)
  const row = db
    .prepare('SELECT * FROM journal_templates WHERE id = ?')
    .get(Number(info.lastInsertRowid))
  return toJournalTemplate(row)
}

export function updateJournalTemplate(
  db: Database.Database,
  id: number,
  updates: UpdateJournalTemplate
): JournalTemplate {
  const existing = db.prepare('SELECT * FROM journal_templates WHERE id = ?').get(id) as
    | { id: number; name: string; content: string; created_at: string }
    | undefined
  if (!existing) throw new Error(`Journal template ${id} not found`)
  const name = updates.name ?? existing.name
  const content = updates.content ?? existing.content
  db.prepare('UPDATE journal_templates SET name = ?, content = ? WHERE id = ?').run(
    name,
    content,
    id
  )
  return toJournalTemplate({ ...existing, name, content })
}

export function deleteJournalTemplate(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM journal_templates WHERE id = ?').run(id)
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/main/db/journalTemplates.repo.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 11: Commit**

```bash
git add src/main/db/schema.ts src/shared/types.ts src/main/db/journalEntries.repo.ts src/main/db/journalEntries.repo.test.ts src/main/db/journalTemplates.repo.ts src/main/db/journalTemplates.repo.test.ts
git commit -m "feat: journal entries and templates schema and repositories"
```

---

### Task 2: Media protocol handler

**Files:**
- Create: `src/main/media/mediaProtocol.ts`
- Test: `src/main/media/mediaProtocol.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `registerMediaProtocol(mediaDir: string): void`, `saveImage(mediaDir: string, base64Data: string, mimeType: string): Promise<string>` (returns a `flowstate-media://<filename>` URL). Task 3's IPC handler and Task 4's main-process wiring call these exact names.

- [ ] **Step 1: Write the failing tests**

`src/main/media/mediaProtocol.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let registeredHandler: ((request: Request) => Promise<Response>) | null = null

vi.mock('electron', () => ({
  protocol: {
    handle: vi.fn((_scheme: string, handler: (request: Request) => Promise<Response>) => {
      registeredHandler = handler
    })
  }
}))

import { registerMediaProtocol, saveImage } from './mediaProtocol'

describe('mediaProtocol', () => {
  let mediaDir: string

  beforeEach(() => {
    mediaDir = mkdtempSync(join(tmpdir(), 'flowstate-media-test-'))
    registeredHandler = null
    registerMediaProtocol(mediaDir)
  })

  it('serves a file that exists in the media directory', async () => {
    writeFileSync(join(mediaDir, 'test.png'), Buffer.from('fake-image-bytes'))
    const response = await registeredHandler!(new Request('flowstate-media://test.png'))
    expect(response.status).toBe(200)
    const body = Buffer.from(await response.arrayBuffer())
    expect(body.toString()).toBe('fake-image-bytes')
  })

  it('returns 404 for a file that does not exist', async () => {
    const response = await registeredHandler!(new Request('flowstate-media://missing.png'))
    expect(response.status).toBe(404)
  })

  it('rejects a path-traversal request with 403', async () => {
    const response = await registeredHandler!(
      new Request('flowstate-media://' + encodeURIComponent('../../../etc/passwd'))
    )
    expect(response.status).toBe(403)
  })
})

describe('saveImage', () => {
  it('writes decoded base64 bytes to the media directory and returns a flowstate-media URL', async () => {
    const mediaDir = mkdtempSync(join(tmpdir(), 'flowstate-media-test-'))
    const base64 = Buffer.from('hello').toString('base64')
    const url = await saveImage(mediaDir, base64, 'image/png')
    expect(url).toMatch(/^flowstate-media:\/\/[\w-]+\.png$/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/media/mediaProtocol.test.ts`
Expected: FAIL — `mediaProtocol.ts` does not exist.

- [ ] **Step 3: Implement the media protocol handler**

`src/main/media/mediaProtocol.ts`:
```ts
import { protocol } from 'electron'
import { join, normalize } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

/**
 * Serves files from `mediaDir` over a custom `flowstate-media://<filename>`
 * scheme, so journal-embedded images never expose a raw filesystem path to
 * the renderer. Guards against path traversal — a request that would resolve
 * outside `mediaDir` (e.g. via `../`) is rejected with 403 rather than served.
 */
export function registerMediaProtocol(mediaDir: string): void {
  protocol.handle('flowstate-media', async (request) => {
    const requestedName = decodeURIComponent(request.url.replace('flowstate-media://', ''))
    const resolved = normalize(join(mediaDir, requestedName))
    if (!resolved.startsWith(normalize(mediaDir))) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const data = await readFile(resolved)
      return new Response(data)
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  })
}

export async function saveImage(
  mediaDir: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  await mkdir(mediaDir, { recursive: true })
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin'
  const filename = `${randomUUID()}.${extension}`
  const buffer = Buffer.from(base64Data, 'base64')
  await writeFile(join(mediaDir, filename), buffer)
  return `flowstate-media://${filename}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/media/mediaProtocol.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/main/media/mediaProtocol.ts src/main/media/mediaProtocol.test.ts
git commit -m "feat: flowstate-media:// protocol for local journal images"
```

---

### Task 3: IPC wiring and main-process integration

**Files:**
- Modify: `src/main/db/trades.repo.ts` (add `listAllTrades`)
- Modify: `src/main/ipc/registerHandlers.ts`
- Create: `src/main/ipc/registerMediaHandlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: repositories from Task 1, `registerMediaProtocol`/`saveImage` from Task 2.
- Produces: IPC channels `journalEntries:{getByDate,upsert,list}`, `journalTemplates:{list,create,update,delete}`, `trades:listAll`, `media:saveImage`. Preload exposes `window.api.journalEntries`, `window.api.journalTemplates`, `window.api.media`, and `window.api.trades.listAll`. Task 5/6/7's renderer code calls these exact names.

- [ ] **Step 1: Add `listAllTrades` to the trades repository**

In `src/main/db/trades.repo.ts`, add after the existing `listTradesForAccount` function:
```ts
export function listAllTrades(db: Database.Database): Trade[] {
  const rows = db.prepare('SELECT * FROM trades ORDER BY entry_time ASC').all()
  return rows.map((row) => toTrade(db, row))
}
```

- [ ] **Step 2: Register the new handlers**

Modify `src/main/ipc/registerHandlers.ts` — add the new imports and handler registrations:
```ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { createAccount, listAccounts, getAccount } from '../db/accounts.repo'
import { createRuleProfile, getRuleProfile } from '../db/ruleProfiles.repo'
import { createTrade, listTradesForAccount, listAllTrades } from '../db/trades.repo'
import { getOrCreateTag } from '../db/tags.repo'
import { computeRuleStatus } from '../ruleEngine/computeRuleStatus'
import {
  getJournalEntryByDate,
  upsertJournalEntry,
  listJournalEntries
} from '../db/journalEntries.repo'
import {
  listJournalTemplates,
  createJournalTemplate,
  updateJournalTemplate,
  deleteJournalTemplate
} from '../db/journalTemplates.repo'
import type {
  NewAccount,
  NewRuleProfile,
  NewTrade,
  NewJournalEntry,
  NewJournalTemplate,
  UpdateJournalTemplate
} from '../../shared/types'
// Local calendar day, not UTC. Shared with the rule engine so the two can never drift.
import { toLocalDateString } from '../../shared/date'

export function registerHandlers(db: Database.Database): void {
  ipcMain.handle('accounts:list', () => listAccounts(db))
  ipcMain.handle('accounts:create', (_e, account: NewAccount) => createAccount(db, account))

  ipcMain.handle('ruleProfiles:create', (_e, profile: NewRuleProfile) =>
    createRuleProfile(db, profile)
  )

  ipcMain.handle('trades:listForAccount', (_e, accountId: number) =>
    listTradesForAccount(db, accountId)
  )
  ipcMain.handle('trades:create', (_e, trade: NewTrade) => createTrade(db, trade))
  ipcMain.handle('trades:listAll', () => listAllTrades(db))

  ipcMain.handle('tags:getOrCreate', (_e, name: string) => getOrCreateTag(db, name))

  ipcMain.handle('ruleStatus:get', (_e, accountId: number) => {
    const account = getAccount(db, accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)
    const profile = getRuleProfile(db, account.ruleProfileId)
    if (!profile) throw new Error(`Rule profile ${account.ruleProfileId} not found`)
    const trades = listTradesForAccount(db, accountId)
    const today = toLocalDateString(new Date())
    return computeRuleStatus(account, profile, trades, today)
  })

  ipcMain.handle('journalEntries:getByDate', (_e, date: string) => getJournalEntryByDate(db, date))
  ipcMain.handle('journalEntries:upsert', (_e, entry: NewJournalEntry) =>
    upsertJournalEntry(db, entry)
  )
  ipcMain.handle('journalEntries:list', () => listJournalEntries(db))

  ipcMain.handle('journalTemplates:list', () => listJournalTemplates(db))
  ipcMain.handle('journalTemplates:create', (_e, template: NewJournalTemplate) =>
    createJournalTemplate(db, template)
  )
  ipcMain.handle('journalTemplates:update', (_e, id: number, updates: UpdateJournalTemplate) =>
    updateJournalTemplate(db, id, updates)
  )
  ipcMain.handle('journalTemplates:delete', (_e, id: number) => deleteJournalTemplate(db, id))
}
```

- [ ] **Step 3: Write the media IPC handler**

`src/main/ipc/registerMediaHandlers.ts`:
```ts
import { ipcMain } from 'electron'
import { saveImage } from '../media/mediaProtocol'

export function registerMediaHandlers(mediaDir: string): void {
  ipcMain.handle('media:saveImage', (_e, base64Data: string, mimeType: string) =>
    saveImage(mediaDir, base64Data, mimeType)
  )
}
```

- [ ] **Step 4: Wire the media protocol and handlers into the main process entry**

Modify `src/main/index.ts` — register the custom scheme as privileged (must happen before `app.ready`, at module scope), then register the protocol handler and media IPC handler inside the existing `app.on('ready', ...)` block:
```ts
import { app, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import { createConnection } from './db/connection'
import { registerHandlers } from './ipc/registerHandlers'
import { registerUpdateHandlers } from './ipc/registerUpdateHandlers'
import { registerMediaHandlers } from './ipc/registerMediaHandlers'
import { registerMediaProtocol } from './media/mediaProtocol'
import { checkForUpdates } from './updates/checkForUpdates'
import type { UpdateStatus } from '../shared/types'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'flowstate-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true }
  }
])

let mainWindow: BrowserWindow | null = null
// Cached so the renderer can pull the last status on mount via
// `updates:getStatus` — a status pushed before it subscribed isn't lost.
let lastUpdateStatus: UpdateStatus | null = null

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
  registerUpdateHandlers(() => lastUpdateStatus)

  const mediaDir = join(app.getPath('userData'), 'journal-images')
  registerMediaProtocol(mediaDir)
  registerMediaHandlers(mediaDir)

  createWindow()
  if (process.env['FLOWSTATE_FAKE_UPDATE']) {
    const fakeStatus: UpdateStatus = { state: 'ready', version: '9.9.9' }
    lastUpdateStatus = fakeStatus
    setTimeout(() => mainWindow?.webContents.send('updates:status', fakeStatus), 1000)
  } else {
    checkForUpdates((status) => {
      lastUpdateStatus = status
      if (status.state === 'error') {
        console.error('[updates]', status.message)
      }
      mainWindow?.webContents.send('updates:status', status)
    })
  }
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

- [ ] **Step 5: Expose the new API from preload**

Modify `src/preload/index.ts` — add the new type imports and the three new namespaces (plus `trades.listAll`) to the `api` object:
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
  UpdateStatus,
  JournalEntry,
  NewJournalEntry,
  JournalTemplate,
  NewJournalTemplate,
  UpdateJournalTemplate
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
    create: (trade: NewTrade): Promise<Trade> => ipcRenderer.invoke('trades:create', trade),
    listAll: (): Promise<Trade[]> => ipcRenderer.invoke('trades:listAll')
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
    getStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke('updates:getStatus'),
    onStatusChange: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
        callback(status)
      ipcRenderer.on('updates:status', listener)
      return () => ipcRenderer.removeListener('updates:status', listener)
    }
  },
  journalEntries: {
    getByDate: (date: string): Promise<JournalEntry | undefined> =>
      ipcRenderer.invoke('journalEntries:getByDate', date),
    upsert: (entry: NewJournalEntry): Promise<JournalEntry> =>
      ipcRenderer.invoke('journalEntries:upsert', entry),
    list: (): Promise<JournalEntry[]> => ipcRenderer.invoke('journalEntries:list')
  },
  journalTemplates: {
    list: (): Promise<JournalTemplate[]> => ipcRenderer.invoke('journalTemplates:list'),
    create: (template: NewJournalTemplate): Promise<JournalTemplate> =>
      ipcRenderer.invoke('journalTemplates:create', template),
    update: (id: number, updates: UpdateJournalTemplate): Promise<JournalTemplate> =>
      ipcRenderer.invoke('journalTemplates:update', id, updates),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('journalTemplates:delete', id)
  },
  media: {
    saveImage: (base64Data: string, mimeType: string): Promise<string> =>
      ipcRenderer.invoke('media:saveImage', base64Data, mimeType)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type FlowStateApi = typeof api
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/main/db/trades.repo.ts src/main/ipc/registerHandlers.ts src/main/ipc/registerMediaHandlers.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: wire journal, template, and media IPC channels"
```

---

### Task 4: Calendar day aggregation

**Files:**
- Create: `src/shared/calendar.ts`
- Test: `src/shared/calendar.test.ts`

**Interfaces:**
- Consumes: `Trade` type (existing), `toLocalDateString` (`src/shared/date.ts`, existing).
- Produces: `computeDayAggregates(trades: Trade[]): DayAggregate[]` where `DayAggregate = { date: string; pnl: number; hasTags: boolean }`. Task 6's `CalendarView` calls this exact name/shape.

- [ ] **Step 1: Write the failing test**

`src/shared/calendar.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeDayAggregates } from './calendar'
import type { Trade } from './types'

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: Math.random(),
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5000,
    entryTime: '2026-08-13T14:00:00Z',
    exitTime: '2026-08-13T14:00:00Z',
    size: 1,
    pnl: 0,
    rMultiple: null,
    notes: null,
    screenshotPaths: [],
    tagIds: [],
    ...overrides
  }
}

describe('computeDayAggregates', () => {
  it('sums pnl for trades from different accounts on the same day', () => {
    const trades = [
      trade({ accountId: 1, pnl: 500, exitTime: '2026-08-13T14:00:00Z' }),
      trade({ accountId: 2, pnl: -200, exitTime: '2026-08-13T18:00:00Z' })
    ]
    const result = computeDayAggregates(trades)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ date: '2026-08-13', pnl: 300, hasTags: false })
  })

  it('marks hasTags true if any trade that day has a tag', () => {
    const result = computeDayAggregates([trade({ tagIds: [1] })])
    expect(result[0].hasTags).toBe(true)
  })

  it('attributes by exitTime local day, not entryTime', () => {
    const result = computeDayAggregates([
      trade({ entryTime: '2026-08-12T23:00:00Z', exitTime: '2026-08-13T01:00:00Z', pnl: 100 })
    ])
    expect(result[0].date).toBe('2026-08-13')
  })

  it('returns an empty array for no trades', () => {
    expect(computeDayAggregates([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/calendar.test.ts`
Expected: FAIL — `calendar.ts` does not exist.

- [ ] **Step 3: Implement the aggregation function**

`src/shared/calendar.ts`:
```ts
import type { Trade } from './types'
import { toLocalDateString } from './date'

export interface DayAggregate {
  date: string
  pnl: number
  hasTags: boolean
}

/**
 * Aggregates trades into one entry per local calendar day (by exitTime —
 * the same attribution convention the rule engine uses), summing pnl across
 * every account and flagging whether any trade that day carried a tag.
 */
export function computeDayAggregates(trades: Trade[]): DayAggregate[] {
  const byDate = new Map<string, DayAggregate>()

  for (const trade of trades) {
    const date = toLocalDateString(new Date(trade.exitTime))
    const existing = byDate.get(date) ?? { date, pnl: 0, hasTags: false }
    existing.pnl += trade.pnl
    if (trade.tagIds.length > 0) existing.hasTags = true
    byDate.set(date, existing)
  }

  return [...byDate.values()]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/calendar.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/shared/calendar.ts src/shared/calendar.test.ts
git commit -m "feat: pure day-aggregation function for the calendar view"
```

---

### Task 5: Journal entry editor (BlockNote)

**Files:**
- Modify: `package.json` (add `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`)
- Create: `src/renderer/src/views/JournalEntryEditor.tsx`
- Test: `src/renderer/src/views/JournalEntryEditor.test.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.journalEntries.{getByDate,upsert}`, `flowStateApi.media.saveImage` (Task 3), `ErrorBanner` (existing).
- Produces: `<JournalEntryEditor date={string} onEditorReady?={(editor: BlockNoteEditor) => void} onSaved?={() => void} />`. Task 6 (`CalendarView`) and Task 7 (`JournalView`) both render this exact component with these exact props — `onEditorReady` is how a parent captures the live editor instance (needed by Task 7 to call `editor.insertBlocks(...)` when applying a template).

- [ ] **Step 1: Install BlockNote**

```bash
npm install @blocknote/core @blocknote/react @blocknote/mantine
```

- [ ] **Step 2: Write the failing tests**

`src/renderer/src/views/JournalEntryEditor.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEditor = { document: [{ type: 'paragraph', content: 'hello' }] }

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: vi.fn(() => mockEditor)
}))

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ onChange }: { onChange: () => void }) => (
    <button type="button" onClick={onChange}>
      simulate-edit
    </button>
  )
}))

vi.mock('@blocknote/core/fonts/inter.css', () => ({}))
vi.mock('@blocknote/mantine/style.css', () => ({}))

const getByDateMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    journalEntries: {
      getByDate: (...args: unknown[]) => getByDateMock(...args),
      upsert: (...args: unknown[]) => upsertMock(...args)
    },
    media: { saveImage: vi.fn() }
  }
}))

import { JournalEntryEditor } from './JournalEntryEditor'

describe('JournalEntryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertMock.mockResolvedValue({})
  })

  it('loads the entry for the given date and renders the editor once ready', async () => {
    getByDateMock.mockResolvedValue({
      id: 1,
      date: '2026-08-13',
      content: '[]',
      createdAt: '',
      updatedAt: ''
    })
    render(<JournalEntryEditor date="2026-08-13" />)
    await waitFor(() => expect(screen.getByText('simulate-edit')).toBeInTheDocument())
    expect(getByDateMock).toHaveBeenCalledWith('2026-08-13')
  })

  it('starts with an empty document when no entry exists yet for the date', async () => {
    getByDateMock.mockResolvedValue(undefined)
    render(<JournalEntryEditor date="2026-08-14" />)
    await waitFor(() => expect(screen.getByText('simulate-edit')).toBeInTheDocument())
  })

  it('calls onEditorReady once the editor is created', async () => {
    getByDateMock.mockResolvedValue(undefined)
    const onEditorReady = vi.fn()
    render(<JournalEntryEditor date="2026-08-14" onEditorReady={onEditorReady} />)
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledWith(mockEditor))
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/views/JournalEntryEditor.test.tsx`
Expected: FAIL — `JournalEntryEditor.tsx` does not exist.

- [ ] **Step 4: Implement the editor component**

`src/renderer/src/views/JournalEntryEditor.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'

const AUTOSAVE_DEBOUNCE_MS = 800

interface JournalEntryEditorProps {
  date: string
  onEditorReady?: (editor: BlockNoteEditor) => void
  onSaved?: () => void
}

export function JournalEntryEditor({
  date,
  onEditorReady,
  onSaved
}: JournalEntryEditorProps): JSX.Element {
  const [initialContent, setInitialContent] = useState<PartialBlock[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInitialContent(null)
    flowStateApi.journalEntries
      .getByDate(date)
      .then((entry) => {
        setInitialContent(entry ? (JSON.parse(entry.content) as PartialBlock[]) : [])
      })
      .catch((err: unknown) => {
        setError(`Could not load journal entry: ${err instanceof Error ? err.message : String(err)}`)
        setInitialContent([])
      })
  }, [date])

  if (initialContent === null) {
    return <p className="journal-editor-loading">Loading…</p>
  }

  return (
    <div className="journal-editor">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <JournalEntryEditorBody
        date={date}
        initialContent={initialContent}
        onEditorReady={onEditorReady}
        onSaved={onSaved}
        onSaveError={setError}
      />
    </div>
  )
}

interface JournalEntryEditorBodyProps {
  date: string
  initialContent: PartialBlock[]
  onEditorReady?: (editor: BlockNoteEditor) => void
  onSaved?: () => void
  onSaveError: (message: string) => void
}

function JournalEntryEditorBody({
  date,
  initialContent,
  onEditorReady,
  onSaved,
  onSaveError
}: JournalEntryEditorBodyProps): JSX.Element {
  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
    uploadFile: async (file: File): Promise<string> => {
      const buffer = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buffer)
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      return flowStateApi.media.saveImage(base64, file.type)
    }
  })

  useEffect(() => {
    onEditorReady?.(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

  function handleChange(): void {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      flowStateApi.journalEntries
        .upsert({ date, content: JSON.stringify(editor.document) })
        .then(() => onSaved?.())
        .catch((err: unknown) => {
          onSaveError(
            `Could not save journal entry: ${err instanceof Error ? err.message : String(err)}`
          )
        })
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  return <BlockNoteView editor={editor} theme="dark" onChange={handleChange} />
}
```

Note: BlockNote's exact public API (in particular the `uploadFile` option's shape and the `BlockNoteView`/`useCreateBlockNote` prop names) can shift slightly between versions. If anything here fails to typecheck against the installed version, check the type definitions shipped in `node_modules/@blocknote/core` / `node_modules/@blocknote/react` and adjust names to match — the intent (load initial content, autosave on change, upload pasted images through `media.saveImage`) is what must be preserved, not these exact identifiers if the library has moved on.

- [ ] **Step 5: Add journal editor CSS**

Append to `src/renderer/src/styles/tokens.css`:
```css
.journal-editor { display: flex; flex-direction: column; gap: 8px; }
.journal-editor-loading { color: var(--text-muted); font-size: 13px; font-family: var(--sans); }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/views/JournalEntryEditor.test.tsx`
Expected: PASS, all 3 cases.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. If BlockNote's types don't match Step 4's code, fix the code to match the installed version's actual types (see the note in Step 4) — do not loosen types to `any` to work around a mismatch.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/renderer/src/views/JournalEntryEditor.tsx src/renderer/src/views/JournalEntryEditor.test.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: JournalEntryEditor with BlockNote, autosave, and image upload"
```

---

### Task 6: Calendar view

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Create: `src/renderer/src/views/CalendarView.tsx`
- Test: `src/renderer/src/views/CalendarView.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.trades.listAll` (Task 3), `computeDayAggregates` (Task 4), `JournalEntryEditor` (Task 5).
- Produces: `'calendar'` added to `ViewName`. No further consumers in this plan beyond `App.tsx`.

- [ ] **Step 1: Activate the Calendar nav item**

Modify `src/renderer/src/components/Sidebar.tsx`:
```tsx
export type ViewName = 'dashboard' | 'tradeLog' | 'accounts' | 'calendar'

interface SidebarProps {
  active: ViewName
  onSelect: (view: ViewName) => void
}

export function Sidebar({ active, onSelect }: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar">
      <button
        type="button"
        className={`sidebar-item ${active === 'dashboard' ? 'active' : ''}`}
        onClick={() => onSelect('dashboard')}
        aria-current={active === 'dashboard' ? 'page' : undefined}
      >
        Dashboard
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'tradeLog' ? 'active' : ''}`}
        onClick={() => onSelect('tradeLog')}
        aria-current={active === 'tradeLog' ? 'page' : undefined}
      >
        Trade Log
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'accounts' ? 'active' : ''}`}
        onClick={() => onSelect('accounts')}
        aria-current={active === 'accounts' ? 'page' : undefined}
      >
        Accounts
      </button>
      <button
        type="button"
        className={`sidebar-item ${active === 'calendar' ? 'active' : ''}`}
        onClick={() => onSelect('calendar')}
        aria-current={active === 'calendar' ? 'page' : undefined}
      >
        Calendar
      </button>
      <span className="sidebar-item disabled" aria-disabled="true">
        Analytics
      </span>
    </nav>
  )
}
```

- [ ] **Step 2: Write the failing test**

`src/renderer/src/views/CalendarView.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const listAllMock = vi.fn()
vi.mock('../api/client', () => ({
  flowStateApi: { trades: { listAll: (...args: unknown[]) => listAllMock(...args) } }
}))

vi.mock('./JournalEntryEditor', () => ({
  JournalEntryEditor: ({ date }: { date: string }) => <div>editor-for-{date}</div>
}))

import { CalendarView } from './CalendarView'
import type { Trade } from '../../../shared/types'

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: 1,
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5000,
    entryTime: '2026-08-13T14:00:00Z',
    exitTime: '2026-08-13T14:00:00Z',
    size: 1,
    pnl: 0,
    rMultiple: null,
    notes: null,
    screenshotPaths: [],
    tagIds: [],
    ...overrides
  }
}

describe('CalendarView', () => {
  it('opens the journal entry editor for a clicked day with trades', async () => {
    const now = new Date()
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`
    listAllMock.mockResolvedValue([trade({ pnl: 250, exitTime: `${dateKey}T14:00:00Z` })])

    const { container } = render(<CalendarView />)
    await waitFor(() => expect(listAllMock).toHaveBeenCalled())

    const positiveCell = await waitFor(() => {
      const el = container.querySelector('.calendar-cell.pos')
      if (!el) throw new Error('not rendered yet')
      return el
    })
    fireEvent.click(positiveCell)

    expect(await screen.findByText(/editor-for-/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/views/CalendarView.test.tsx`
Expected: FAIL — `CalendarView.tsx` does not exist.

- [ ] **Step 4: Implement the calendar view**

`src/renderer/src/views/CalendarView.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import { flowStateApi } from '../api/client'
import { computeDayAggregates } from '../../../shared/calendar'
import { JournalEntryEditor } from './JournalEntryEditor'
import type { Trade } from '../../../shared/types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function CalendarView(): JSX.Element {
  const [trades, setTrades] = useState<Trade[]>([])
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    flowStateApi.trades.listAll().then(setTrades)
  }, [])

  const aggregatesByDate = useMemo(() => {
    const map = new Map<string, { pnl: number; hasTags: boolean }>()
    for (const agg of computeDayAggregates(trades)) {
      map.set(agg.date, agg)
    }
    return map
  }, [trades])

  const firstOfMonth = new Date(cursor.year, cursor.month, 1)
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const startWeekday = firstOfMonth.getDay()

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]

  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <button
          type="button"
          onClick={() =>
            setCursor((c) => ({
              year: c.month === 0 ? c.year - 1 : c.year,
              month: (c.month + 11) % 12
            }))
          }
        >
          ←
        </button>
        <span className="calendar-month-label">{monthLabel}</span>
        <button
          type="button"
          onClick={() =>
            setCursor((c) => ({
              year: c.month === 11 ? c.year + 1 : c.year,
              month: (c.month + 1) % 12
            }))
          }
        >
          →
        </button>
      </div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div key={label} className="calendar-weekday">
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="calendar-cell empty" />
          const dateKey = toDateKey(cursor.year, cursor.month, day)
          const agg = aggregatesByDate.get(dateKey)
          const pnlClass = agg ? (agg.pnl >= 0 ? 'pos' : 'neg') : ''
          return (
            <button
              type="button"
              key={dateKey}
              className={`calendar-cell ${pnlClass} ${selectedDate === dateKey ? 'selected' : ''}`}
              onClick={() => setSelectedDate(dateKey)}
            >
              <span className="calendar-cell-day">{day}</span>
              {agg && (
                <span className="calendar-cell-pnl">
                  {agg.pnl >= 0 ? '+' : ''}
                  {Math.round(agg.pnl)}
                </span>
              )}
              {agg?.hasTags && <span className="calendar-cell-dot" />}
            </button>
          )
        })}
      </div>
      {selectedDate && (
        <div className="calendar-entry-panel">
          <h3 className="calendar-entry-heading">{selectedDate}</h3>
          <JournalEntryEditor date={selectedDate} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Add calendar CSS**

Append to `src/renderer/src/styles/tokens.css`:
```css
.calendar-view { display: flex; flex-direction: column; gap: 16px; }
.calendar-header { display: flex; align-items: center; gap: 12px; }
.calendar-header button { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); padding: 4px 10px; cursor: pointer; font-family: var(--sans); }
.calendar-month-label { font-family: var(--mono); font-size: 13px; font-weight: 500; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.calendar-weekday { font-family: var(--mono); font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; text-align: center; padding-bottom: 4px; }
.calendar-cell {
  position: relative;
  aspect-ratio: 1;
  background: var(--surface-1);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  color: var(--text-secondary);
  font-family: var(--sans);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 6px;
  gap: 2px;
}
.calendar-cell.empty { visibility: hidden; cursor: default; }
.calendar-cell.pos { background: var(--pnl-pos-dim); border-color: var(--pnl-pos); color: var(--pnl-pos); }
.calendar-cell.neg { background: var(--pnl-neg-dim); border-color: var(--pnl-neg); color: var(--pnl-neg); }
.calendar-cell.selected { outline: 2px solid var(--accent); outline-offset: 1px; }
.calendar-cell-day { font-family: var(--mono); font-size: 11px; color: var(--text-muted); }
.calendar-cell-pnl { font-family: var(--mono); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.calendar-cell-dot { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.calendar-entry-panel { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.calendar-entry-heading { font-family: var(--mono); font-size: 12px; color: var(--text-secondary); margin: 0 0 12px; }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/views/CalendarView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Wire the view into App.tsx**

Modify `src/renderer/src/App.tsx` — add the `CalendarView` import and render it when `view === 'calendar'`, alongside the existing conditionals:
```tsx
import { CalendarView } from './views/CalendarView'
// ...
{view === 'calendar' && <CalendarView />}
```

- [ ] **Step 8: Typecheck and run the full suite**

Run: `npm run typecheck && npm test -- run`
Expected: typecheck exits 0; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx src/renderer/src/views/CalendarView.tsx src/renderer/src/views/CalendarView.test.tsx src/renderer/src/App.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: Calendar view with P&L heatmap and journal entry access"
```

---

### Task 7: Journal section (entry list, search, templates)

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Create: `src/renderer/src/views/JournalView.tsx`
- Test: `src/renderer/src/views/JournalView.test.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.journalEntries.list`, `flowStateApi.journalTemplates.{list,create,delete}` (Task 3), `JournalEntryEditor` (Task 5), `toLocalDateString` (existing, `src/shared/date.ts`).
- Produces: `'journal'` added to `ViewName`. No further consumers in this plan.

- [ ] **Step 1: Add the Journal nav item**

Modify `src/renderer/src/components/Sidebar.tsx`:
```tsx
export type ViewName = 'dashboard' | 'tradeLog' | 'accounts' | 'calendar' | 'journal'
```
Add a new button, placed after the Calendar button and before the disabled Analytics span:
```tsx
      <button
        type="button"
        className={`sidebar-item ${active === 'journal' ? 'active' : ''}`}
        onClick={() => onSelect('journal')}
        aria-current={active === 'journal' ? 'page' : undefined}
      >
        Journal
      </button>
```

- [ ] **Step 2: Write the failing tests**

`src/renderer/src/views/JournalView.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listEntriesMock = vi.fn()
const listTemplatesMock = vi.fn()
const deleteTemplateMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    journalEntries: { list: (...a: unknown[]) => listEntriesMock(...a) },
    journalTemplates: {
      list: (...a: unknown[]) => listTemplatesMock(...a),
      create: vi.fn(),
      delete: (...a: unknown[]) => deleteTemplateMock(...a)
    }
  }
}))

vi.mock('./JournalEntryEditor', () => ({
  JournalEntryEditor: ({ date }: { date: string }) => <div>editor-for-{date}</div>
}))

import { JournalView } from './JournalView'

describe('JournalView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listEntriesMock.mockResolvedValue([
      {
        id: 1,
        date: '2026-08-10',
        content: JSON.stringify([{ content: [{ text: 'Pre-market plan' }] }]),
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 2,
        date: '2026-08-11',
        content: JSON.stringify([{ content: [{ text: 'Revenge trade after loss' }] }]),
        createdAt: '',
        updatedAt: ''
      }
    ])
    listTemplatesMock.mockResolvedValue([{ id: 1, name: 'Daily Review', content: '[]', createdAt: '' }])
    deleteTemplateMock.mockResolvedValue(undefined)
  })

  it('filters the entry list by search text', async () => {
    render(<JournalView />)
    await screen.findByText('2026-08-10')
    expect(screen.getByText('2026-08-11')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search entries…'), {
      target: { value: 'revenge' }
    })

    expect(screen.queryByText('2026-08-10')).not.toBeInTheDocument()
    expect(screen.getByText('2026-08-11')).toBeInTheDocument()
  })

  it('deletes a template after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<JournalView />)
    await screen.findByText('Daily Review')

    fireEvent.click(screen.getByLabelText('Delete template Daily Review'))

    await waitFor(() => expect(deleteTemplateMock).toHaveBeenCalledWith(1))
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/src/views/JournalView.test.tsx`
Expected: FAIL — `JournalView.tsx` does not exist.

- [ ] **Step 4: Implement the journal view**

`src/renderer/src/views/JournalView.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'
import { flowStateApi } from '../api/client'
import { JournalEntryEditor } from './JournalEntryEditor'
import { ErrorBanner } from '../components/ErrorBanner'
import type { JournalEntry, JournalTemplate } from '../../../shared/types'
import { toLocalDateString } from '../../../shared/date'

function extractPlainText(contentJson: string): string {
  try {
    const blocks = JSON.parse(contentJson) as Array<{ content?: Array<{ text?: string }> }>
    return blocks
      .flatMap((block) => block.content ?? [])
      .map((inline) => inline.text ?? '')
      .join(' ')
  } catch {
    return ''
  }
}

export function JournalView(): JSX.Element {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [templates, setTemplates] = useState<JournalTemplate[]>([])
  const [search, setSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateString(new Date()))
  const [activeEditor, setActiveEditor] = useState<BlockNoteEditor | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refreshEntries(): void {
    flowStateApi.journalEntries.list().then(setEntries)
  }
  function refreshTemplates(): void {
    flowStateApi.journalTemplates.list().then(setTemplates)
  }

  useEffect(() => {
    refreshEntries()
    refreshTemplates()
  }, [])

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return entries
    const needle = search.toLowerCase()
    return entries.filter((entry) => extractPlainText(entry.content).toLowerCase().includes(needle))
  }, [entries, search])

  function applyTemplate(template: JournalTemplate): void {
    if (!activeEditor) return
    const blocks = JSON.parse(template.content) as PartialBlock[]
    const lastBlock = activeEditor.document[activeEditor.document.length - 1]
    activeEditor.insertBlocks(blocks, lastBlock, 'after')
  }

  async function saveCurrentAsTemplate(): Promise<void> {
    if (!activeEditor) return
    const name = window.prompt('Template name?')
    if (!name) return
    try {
      await flowStateApi.journalTemplates.create({
        name,
        content: JSON.stringify(activeEditor.document)
      })
      refreshTemplates()
    } catch (err) {
      setError(`Could not save template: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function deleteTemplate(id: number): Promise<void> {
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    try {
      await flowStateApi.journalTemplates.delete(id)
      refreshTemplates()
    } catch (err) {
      setError(`Could not delete template: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="journal-view">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <aside className="journal-sidebar">
        <input
          className="journal-search"
          placeholder="Search entries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="journal-date-picker">
          <label className="field-label" htmlFor="journal-date">
            Date
          </label>
          <input
            id="journal-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <ul className="journal-entry-list">
          {filteredEntries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={`journal-entry-item ${selectedDate === entry.date ? 'active' : ''}`}
                onClick={() => setSelectedDate(entry.date)}
              >
                {entry.date}
              </button>
            </li>
          ))}
        </ul>
        <div className="journal-templates">
          <div className="journal-templates-header">
            <span className="field-label">Templates</span>
            <button type="button" onClick={saveCurrentAsTemplate}>
              Save current as template
            </button>
          </div>
          <ul className="journal-template-list">
            {templates.map((template) => (
              <li key={template.id} className="journal-template-item">
                <button type="button" onClick={() => applyTemplate(template)}>
                  {template.name}
                </button>
                <button
                  type="button"
                  className="journal-template-delete"
                  onClick={() => deleteTemplate(template.id)}
                  aria-label={`Delete template ${template.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <div className="journal-editor-pane">
        <JournalEntryEditor
          key={selectedDate}
          date={selectedDate}
          onEditorReady={setActiveEditor}
          onSaved={refreshEntries}
        />
      </div>
    </div>
  )
}
```

Note: `editor.insertBlocks(blocksToInsert, referenceBlock, placement)` is BlockNote's documented core method for inserting blocks relative to another block. If the installed version's signature differs, check `node_modules/@blocknote/core`'s types and adjust — the intent (append the template's blocks after the current last block) is what must be preserved.

- [ ] **Step 5: Add journal view CSS**

Append to `src/renderer/src/styles/tokens.css`:
```css
.journal-view { display: grid; grid-template-columns: 260px 1fr; gap: 16px; height: 100%; }
.journal-sidebar { display: flex; flex-direction: column; gap: 12px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 14px; overflow-y: auto; }
.journal-search { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-family: var(--sans); font-size: 13px; color: var(--text-primary); }
.journal-date-picker { display: flex; flex-direction: column; gap: 4px; }
.journal-date-picker input { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; color: var(--text-primary); font-family: var(--sans); font-size: 13px; }
.journal-entry-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.journal-entry-item { width: 100%; text-align: left; background: none; border: none; border-radius: 6px; padding: 6px 8px; font-family: var(--mono); font-size: 12px; color: var(--text-secondary); cursor: pointer; }
.journal-entry-item.active { background: var(--surface-2); color: var(--text-primary); }
.journal-templates { border-top: 1px solid var(--border-soft); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.journal-templates-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.journal-templates-header button { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 11px; color: var(--text-secondary); cursor: pointer; }
.journal-template-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.journal-template-item { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.journal-template-item > button:first-child { flex: 1; text-align: left; background: none; border: none; padding: 4px 8px; font-family: var(--sans); font-size: 12px; color: var(--text-secondary); cursor: pointer; }
.journal-template-delete { background: none; border: none; color: var(--text-muted); font-size: 14px; cursor: pointer; padding: 0 4px; }
.journal-template-delete:hover { color: var(--pnl-neg); }
.journal-editor-pane { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px; overflow-y: auto; }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/views/JournalView.test.tsx`
Expected: PASS, both cases.

- [ ] **Step 7: Wire the view into App.tsx**

Modify `src/renderer/src/App.tsx` — add the `JournalView` import and render it when `view === 'journal'`:
```tsx
import { JournalView } from './views/JournalView'
// ...
{view === 'journal' && <JournalView />}
```

- [ ] **Step 8: Typecheck and run the full suite**

Run: `npm run typecheck && npm test -- run`
Expected: typecheck exits 0; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx src/renderer/src/views/JournalView.tsx src/renderer/src/views/JournalView.test.tsx src/renderer/src/App.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: Journal section with entry search and template library"
```

---

## Self-Review

**Spec coverage:**
- One journal entry per calendar day (not per account) — Task 1's `journal_entries.date UNIQUE`, Task 5/6/7's date-scoped editor. ✓
- Notion-style block editing (BlockNote) — Task 5. ✓
- User-created reusable templates (create/rename-via-update/delete/apply) — Task 1, 3, 7. ✓
- Local image storage via `flowstate-media://`, no raw paths exposed — Task 2, 3. ✓
- Calendar P&L heatmap + tag-dot indicators — Task 4, 6. ✓
- Separate Journal section (search, template library) — Task 7. ✓
- Local-day convention shared with the rule engine — Task 4's `toLocalDateString` reuse, Task 1's schema note. ✓
- Lazy entry creation (not on click) — Task 6/7 never call `journalEntries.upsert` until the editor's own autosave fires; opening a day only reads. ✓
- Error handling (autosave failures, image save failures, destructive template deletion confirmed) — Task 5's `ErrorBanner` wiring, Task 7's `window.confirm` guard. ✓

**Placeholder scan:** no TBD/TODO; every step has runnable code or exact commands. The two BlockNote-API-uncertainty notes (Task 5 Step 4, Task 7 Step 4) are not placeholders — they give complete, concrete code and flag the one thing that's inherently unverifiable without running against the live installed version of a fast-moving third-party library, with explicit instructions on how to resolve a mismatch.

**Type consistency:** `JournalEntry`/`NewJournalEntry`/`JournalTemplate`/`NewJournalTemplate`/`UpdateJournalTemplate` defined once in Task 1, used identically in Task 3's IPC/preload, Task 5/7's components. `computeDayAggregates`/`DayAggregate` from Task 4 match Task 6's usage exactly. `registerMediaProtocol`/`saveImage` from Task 2 match Task 3's imports. `JournalEntryEditor`'s props (`date`, `onEditorReady`, `onSaved`) are defined in Task 5 and consumed identically by Task 6 (only `date`) and Task 7 (all three).
