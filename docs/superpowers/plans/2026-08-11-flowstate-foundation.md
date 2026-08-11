# FlowState Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build FlowState's foundation and core daily-use loop: project scaffolding, local SQLite data layer, the automatic rule engine, and three of the five views (Dashboard, Trade Log, Accounts) wired end-to-end, styled per the approved design system.

**Architecture:** Electron app via `electron-vite` (main / preload / renderer split). Main process owns a `better-sqlite3` database and exposes typed IPC handlers; preload exposes a typed `window.api` via `contextBridge`; renderer is a React + TypeScript SPA consuming that API. Shared types live in one module imported by all three processes.

**Tech Stack:** Electron, `electron-vite`, React 18, TypeScript, `better-sqlite3`, Vitest + React Testing Library, Recharts (Dashboard equity curve).

## Global Constraints

- Fully local, no network calls — per spec's Non-goals.
- Data model must not preclude future CSV import (spec's Open Items) — trade fields stay broker-shaped (instrument, side, price, time, size), not hand-wavy.
- Visual direction is locked in `.interface-design/system.md` — tokens, type scale, borders-only depth, and the drawdown gauge/status strip patterns defined there are not to be reinvented per view.
- Rule engine is a pure function of (account, rule profile, trades, date) — no stored "current status" that can drift; see spec's Error Handling.
- Tags are user-defined/ad-hoc, not a hardcoded enum — per spec's Data Model.

## Scope Note

This plan covers the **Foundation + Core Loop**: scaffolding, data layer, rule engine, and the Dashboard / Trade Log / Accounts views — enough to create an account with a rule profile, log trades against it, and see live rule status. Calendar, Analytics, export/import, and packaging are deliberately deferred to a follow-up plan once this loop is validated, per the spec's Open Items and YAGNI.

---

## File Structure

```
package.json
electron.vite.config.ts
tsconfig.json / tsconfig.node.json / tsconfig.web.json
src/
  shared/
    types.ts                  # types used by main, preload, renderer
  main/
    index.ts                  # app entry, window creation, IPC registration
    db/
      connection.ts           # better-sqlite3 connection + PRAGMA setup
      schema.ts                # CREATE TABLE statements
      accounts.repo.ts
      ruleProfiles.repo.ts
      trades.repo.ts
      tags.repo.ts
    ruleEngine/
      computeRuleStatus.ts
    ipc/
      registerHandlers.ts
  preload/
    index.ts                  # contextBridge, exposes window.api
  renderer/
    src/
      main.tsx
      App.tsx
      styles/
        tokens.css             # design tokens from .interface-design/system.md
      api/
        client.ts              # thin typed wrapper over window.api
      components/
        DrawdownGauge.tsx
        DrawdownGauge.test.tsx
        RuleStatusStrip.tsx
        Sidebar.tsx
      views/
        DashboardView.tsx
        AccountsView.tsx
        AccountForm.tsx
        TradeLogView.tsx
        TradeQuickAddForm.tsx
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`

**Interfaces:**
- Produces: a working `npm run dev` that opens an Electron window rendering `App.tsx`. Later tasks build on this window and on `src/main/index.ts` as the place IPC handlers get registered.

- [ ] **Step 1: Scaffold with electron-vite's React-TS template**

```bash
npm create @quick-start/electron@latest . -- --template react-ts
```

When prompted for a project name, accept the current directory. This generates `package.json`, `electron.vite.config.ts`, the three `tsconfig*.json` files, and the `src/main` / `src/preload` / `src/renderer` skeletons.

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install better-sqlite3
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/better-sqlite3
```

- [ ] **Step 3: Replace the generated `App.tsx` with a minimal placeholder**

`src/renderer/src/App.tsx`:
```tsx
export default function App(): JSX.Element {
  return <div>FlowState</div>
}
```

- [ ] **Step 4: Verify the dev app launches**

Run: `npm run dev`
Expected: an Electron window opens showing the text "FlowState". Close the window, stop the process.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + React + TypeScript app"
```

---

### Task 2: Design tokens and app shell

**Files:**
- Create: `src/renderer/src/styles/tokens.css`
- Create: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/main.tsx` (import tokens.css)

**Interfaces:**
- Consumes: nothing new.
- Produces: CSS custom properties (`--bg`, `--surface-1`, `--surface-2`, `--surface-3`, `--border`, `--border-soft`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--pnl-pos`, `--pnl-neg`, `--mono`, `--sans`) that every later component styles against. Produces `<Sidebar>` with nav items `Dashboard`, `Trade Log`, `Accounts` (and disabled `Calendar`, `Analytics` placeholders) — later tasks' views render in the layout this establishes.

- [ ] **Step 1: Write the token stylesheet**

`src/renderer/src/styles/tokens.css`:
```css
:root {
  --bg: #0B0D0F;
  --surface-1: #14171A;
  --surface-2: #1C2024;
  --surface-3: #23282D;
  --border: rgba(255,255,255,0.08);
  --border-soft: rgba(255,255,255,0.05);
  --text-primary: #E4E7EA;
  --text-secondary: #9BA3AB;
  --text-muted: #5C646C;
  --accent: #D99A3D;
  --accent-dim: rgba(217,154,61,0.14);
  --pnl-pos: #3FB77F;
  --pnl-pos-dim: rgba(63,183,127,0.12);
  --pnl-neg: #E0594F;
  --pnl-neg-dim: rgba(224,89,79,0.12);
  --mono: 'SF Mono', ui-monospace, Consolas, monospace;
  --sans: Inter, -apple-system, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text-primary);
  font-family: var(--sans);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

.app-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: 100vh;
}

.sidebar {
  background: var(--surface-1);
  border-right: 1px solid var(--border);
  padding: 16px 12px;
}

.sidebar-item {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  cursor: pointer;
}

.sidebar-item.active {
  color: var(--text-primary);
  background: var(--surface-2);
}

.sidebar-item.disabled {
  color: var(--text-muted);
  cursor: default;
}

.main-content {
  padding: 24px 32px;
  overflow-y: auto;
}
```

- [ ] **Step 2: Write the Sidebar component**

`src/renderer/src/components/Sidebar.tsx`:
```tsx
export type ViewName = 'dashboard' | 'tradeLog' | 'accounts'

interface SidebarProps {
  active: ViewName
  onSelect: (view: ViewName) => void
}

export function Sidebar({ active, onSelect }: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar">
      <a
        className={`sidebar-item ${active === 'dashboard' ? 'active' : ''}`}
        onClick={() => onSelect('dashboard')}
      >
        Dashboard
      </a>
      <a
        className={`sidebar-item ${active === 'tradeLog' ? 'active' : ''}`}
        onClick={() => onSelect('tradeLog')}
      >
        Trade Log
      </a>
      <a
        className={`sidebar-item ${active === 'accounts' ? 'active' : ''}`}
        onClick={() => onSelect('accounts')}
      >
        Accounts
      </a>
      <a className="sidebar-item disabled">Calendar</a>
      <a className="sidebar-item disabled">Analytics</a>
    </nav>
  )
}
```

- [ ] **Step 3: Wire the shell into App.tsx**

`src/renderer/src/App.tsx`:
```tsx
import { useState } from 'react'
import { Sidebar, ViewName } from './components/Sidebar'

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewName>('dashboard')

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} />
      <main className="main-content">
        <p style={{ color: 'var(--text-secondary)' }}>Current view: {view}</p>
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Import the stylesheet**

In `src/renderer/src/main.tsx`, add `import './styles/tokens.css'` above the existing imports.

- [ ] **Step 5: Verify visually**

Run: `npm run dev`
Expected: dark graphite window, left sidebar with Dashboard/Trade Log/Accounts clickable and Calendar/Analytics visibly disabled; clicking an item updates the "Current view" text and highlights the active item.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: design tokens and app shell with sidebar navigation"
```

---

### Task 3: Shared types

**Files:**
- Create: `src/shared/types.ts`

**Interfaces:**
- Produces: `RuleProfile`, `Account`, `Trade`, `Tag`, `RuleStatus`, `DrawdownType`, `AccountStatus`, `TradeSide`, `RuleState` — every later task (repositories, rule engine, IPC, components) imports from here. No task redefines these shapes locally.

- [ ] **Step 1: Write the shared types module**

`src/shared/types.ts`:
```ts
export type DrawdownType = 'trailing' | 'static'
export type AccountStatus = 'evaluation' | 'funded' | 'failed'
export type TradeSide = 'long' | 'short'
export type RuleState = 'clean' | 'warning' | 'violation'

export interface RuleProfile {
  id: number
  name: string
  drawdownType: DrawdownType
  drawdownAmount: number
  dailyLossLimit: number | null
  consistencyPercent: number | null
  minTradingDays: number | null
  profitTarget: number | null
}

export interface Account {
  id: number
  firmName: string
  accountName: string
  startingBalance: number
  currency: string
  status: AccountStatus
  ruleProfileId: number
  createdAt: string
}

export interface Tag {
  id: number
  name: string
}

export interface Trade {
  id: number
  accountId: number
  instrument: string
  side: TradeSide
  entryPrice: number
  exitPrice: number
  entryTime: string
  exitTime: string
  size: number
  pnl: number
  rMultiple: number | null
  notes: string | null
  screenshotPaths: string[]
  tagIds: number[]
}

export interface RuleStatus {
  accountId: number
  highWaterMark: number
  currentBalance: number
  drawdownLimit: number
  drawdownUsed: number
  drawdownRemaining: number
  drawdownState: RuleState
  todayPnl: number
  dailyLossLimit: number | null
  dailyLossRemaining: number | null
  dailyLossState: RuleState | 'n/a'
}

export type NewAccount = Omit<Account, 'id' | 'createdAt'>
export type NewRuleProfile = Omit<RuleProfile, 'id'>
export type NewTrade = Omit<Trade, 'id' | 'pnl'>
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: no errors (file has no consumers yet, so this only checks the file parses/type-checks on its own).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: shared domain types"
```

---

### Task 4: SQLite schema and connection

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/connection.ts`
- Test: `src/main/db/connection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createConnection(path: string): Database.Database` from `connection.ts`, which runs `applySchema` on open. Later repository tasks call `createConnection(':memory:')` in tests and `createConnection(<userData path>)` in the app.

- [ ] **Step 1: Write the schema**

`src/main/db/schema.ts`:
```ts
import type Database from 'better-sqlite3'

export function applySchema(db: Database.Database): void {
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS rule_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      drawdown_type TEXT NOT NULL CHECK (drawdown_type IN ('trailing', 'static')),
      drawdown_amount REAL NOT NULL,
      daily_loss_limit REAL,
      consistency_percent REAL,
      min_trading_days INTEGER,
      profit_target REAL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      starting_balance REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL CHECK (status IN ('evaluation', 'funded', 'failed')),
      rule_profile_id INTEGER NOT NULL REFERENCES rule_profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      instrument TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('long', 'short')),
      entry_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT NOT NULL,
      size REAL NOT NULL,
      pnl REAL NOT NULL,
      r_multiple REAL,
      notes TEXT,
      screenshot_paths TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS trade_tags (
      trade_id INTEGER NOT NULL REFERENCES trades(id),
      tag_id INTEGER NOT NULL REFERENCES tags(id),
      PRIMARY KEY (trade_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_trades_account_id ON trades(account_id);
    CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
  `)
}
```

- [ ] **Step 2: Write the connection module**

`src/main/db/connection.ts`:
```ts
import Database from 'better-sqlite3'
import { applySchema } from './schema'

export function createConnection(path: string): Database.Database {
  const db = new Database(path)
  applySchema(db)
  return db
}
```

- [ ] **Step 3: Write the failing test**

`src/main/db/connection.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createConnection } from './connection'

describe('createConnection', () => {
  it('creates all expected tables', () => {
    const db = createConnection(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)

    expect(tables).toEqual(
      expect.arrayContaining(['rule_profiles', 'accounts', 'tags', 'trades', 'trade_tags'])
    )
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/main/db/connection.test.ts`
Expected: PASS (this task has no prior failing-state — schema and test are written together since there's no simpler behavior to red-green here).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: SQLite schema and connection helper"
```

---

### Task 5: Rule profile and account repositories

**Files:**
- Create: `src/main/db/ruleProfiles.repo.ts`
- Create: `src/main/db/accounts.repo.ts`
- Test: `src/main/db/accounts.repo.test.ts`

**Interfaces:**
- Consumes: `createConnection` (Task 4), `RuleProfile`, `NewRuleProfile`, `Account`, `NewAccount` (Task 3).
- Produces:
  - `createRuleProfile(db, profile: NewRuleProfile): RuleProfile`
  - `getRuleProfile(db, id: number): RuleProfile | undefined`
  - `createAccount(db, account: NewAccount): Account`
  - `listAccounts(db): Account[]`
  - `getAccount(db, id: number): Account | undefined`

  Later tasks (rule engine, IPC handlers, Accounts view) call these exact names.

- [ ] **Step 1: Write the rule profile repository**

`src/main/db/ruleProfiles.repo.ts`:
```ts
import type Database from 'better-sqlite3'
import type { RuleProfile, NewRuleProfile } from '../../shared/types'

function toRuleProfile(row: any): RuleProfile {
  return {
    id: row.id,
    name: row.name,
    drawdownType: row.drawdown_type,
    drawdownAmount: row.drawdown_amount,
    dailyLossLimit: row.daily_loss_limit,
    consistencyPercent: row.consistency_percent,
    minTradingDays: row.min_trading_days,
    profitTarget: row.profit_target
  }
}

export function createRuleProfile(db: Database.Database, profile: NewRuleProfile): RuleProfile {
  const stmt = db.prepare(`
    INSERT INTO rule_profiles
      (name, drawdown_type, drawdown_amount, daily_loss_limit, consistency_percent, min_trading_days, profit_target)
    VALUES (@name, @drawdownType, @drawdownAmount, @dailyLossLimit, @consistencyPercent, @minTradingDays, @profitTarget)
  `)
  const info = stmt.run({
    name: profile.name,
    drawdownType: profile.drawdownType,
    drawdownAmount: profile.drawdownAmount,
    dailyLossLimit: profile.dailyLossLimit,
    consistencyPercent: profile.consistencyPercent,
    minTradingDays: profile.minTradingDays,
    profitTarget: profile.profitTarget
  })
  return getRuleProfile(db, Number(info.lastInsertRowid))!
}

export function getRuleProfile(db: Database.Database, id: number): RuleProfile | undefined {
  const row = db.prepare('SELECT * FROM rule_profiles WHERE id = ?').get(id)
  return row ? toRuleProfile(row) : undefined
}
```

- [ ] **Step 2: Write the accounts repository**

`src/main/db/accounts.repo.ts`:
```ts
import type Database from 'better-sqlite3'
import type { Account, NewAccount } from '../../shared/types'

function toAccount(row: any): Account {
  return {
    id: row.id,
    firmName: row.firm_name,
    accountName: row.account_name,
    startingBalance: row.starting_balance,
    currency: row.currency,
    status: row.status,
    ruleProfileId: row.rule_profile_id,
    createdAt: row.created_at
  }
}

export function createAccount(db: Database.Database, account: NewAccount): Account {
  const stmt = db.prepare(`
    INSERT INTO accounts (firm_name, account_name, starting_balance, currency, status, rule_profile_id)
    VALUES (@firmName, @accountName, @startingBalance, @currency, @status, @ruleProfileId)
  `)
  const info = stmt.run(account)
  return getAccount(db, Number(info.lastInsertRowid))!
}

export function listAccounts(db: Database.Database): Account[] {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all()
  return rows.map(toAccount)
}

export function getAccount(db: Database.Database, id: number): Account | undefined {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
  return row ? toAccount(row) : undefined
}
```

- [ ] **Step 3: Write the failing test**

`src/main/db/accounts.repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { createRuleProfile } from './ruleProfiles.repo'
import { createAccount, listAccounts, getAccount } from './accounts.repo'

describe('accounts.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  it('creates and retrieves an account linked to a rule profile', () => {
    const profile = createRuleProfile(db, {
      name: 'Apex 150K',
      drawdownType: 'trailing',
      drawdownAmount: 5000,
      dailyLossLimit: 2500,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: 9000
    })

    const account = createAccount(db, {
      firmName: 'Apex',
      accountName: '150K Eval #2',
      startingBalance: 150000,
      currency: 'USD',
      status: 'evaluation',
      ruleProfileId: profile.id
    })

    expect(account.id).toBeTypeOf('number')
    expect(getAccount(db, account.id)?.accountName).toBe('150K Eval #2')
    expect(listAccounts(db)).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails first**

Temporarily this test can only be run after both repo files exist since TS won't compile otherwise — for this task, write Steps 1-2 first, then run:

Run: `npx vitest run src/main/db/accounts.repo.test.ts`
Expected: PASS (repositories were written to satisfy this exact test; if it fails, fix the repository code, not the test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rule profile and account repositories"
```

---

### Task 6: Trade repository

**Files:**
- Create: `src/main/db/tags.repo.ts`
- Create: `src/main/db/trades.repo.ts`
- Test: `src/main/db/trades.repo.test.ts`

**Interfaces:**
- Consumes: `createConnection`, `createAccount`, `createRuleProfile` (Tasks 4-5), `Trade`, `NewTrade`, `Tag` (Task 3).
- Produces:
  - `getOrCreateTag(db, name: string): Tag`
  - `createTrade(db, trade: NewTrade): Trade` (computes `pnl` from side/entry/exit/size and persists tag links)
  - `listTradesForAccount(db, accountId: number): Trade[]`

  Later tasks (rule engine, Trade Log view) call these exact names and rely on `createTrade` computing `pnl` itself — callers never pass `pnl` in.

- [ ] **Step 1: Write the tags repository**

`src/main/db/tags.repo.ts`:
```ts
import type Database from 'better-sqlite3'
import type { Tag } from '../../shared/types'

export function getOrCreateTag(db: Database.Database, name: string): Tag {
  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as
    | { id: number; name: string }
    | undefined
  if (existing) return existing

  const info = db.prepare('INSERT INTO tags (name) VALUES (?)').run(name)
  return { id: Number(info.lastInsertRowid), name }
}
```

- [ ] **Step 2: Write the trades repository**

`src/main/db/trades.repo.ts`:
```ts
import type Database from 'better-sqlite3'
import type { Trade, NewTrade } from '../../shared/types'

function computePnl(trade: NewTrade): number {
  const direction = trade.side === 'long' ? 1 : -1
  return (trade.exitPrice - trade.entryPrice) * direction * trade.size
}

function toTrade(db: Database.Database, row: any): Trade {
  const tagRows = db
    .prepare('SELECT tag_id FROM trade_tags WHERE trade_id = ?')
    .all(row.id) as { tag_id: number }[]

  return {
    id: row.id,
    accountId: row.account_id,
    instrument: row.instrument,
    side: row.side,
    entryPrice: row.entry_price,
    exitPrice: row.exit_price,
    entryTime: row.entry_time,
    exitTime: row.exit_time,
    size: row.size,
    pnl: row.pnl,
    rMultiple: row.r_multiple,
    notes: row.notes,
    screenshotPaths: JSON.parse(row.screenshot_paths),
    tagIds: tagRows.map((t) => t.tag_id)
  }
}

export function createTrade(db: Database.Database, trade: NewTrade): Trade {
  const pnl = computePnl(trade)

  const insertTrade = db.prepare(`
    INSERT INTO trades
      (account_id, instrument, side, entry_price, exit_price, entry_time, exit_time, size, pnl, r_multiple, notes, screenshot_paths)
    VALUES
      (@accountId, @instrument, @side, @entryPrice, @exitPrice, @entryTime, @exitTime, @size, @pnl, @rMultiple, @notes, @screenshotPaths)
  `)

  const insertTagLink = db.prepare('INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)')

  const runInTransaction = db.transaction((t: NewTrade, computedPnl: number) => {
    const info = insertTrade.run({
      accountId: t.accountId,
      instrument: t.instrument,
      side: t.side,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      size: t.size,
      pnl: computedPnl,
      rMultiple: t.rMultiple,
      notes: t.notes,
      screenshotPaths: JSON.stringify(t.screenshotPaths)
    })
    const tradeId = Number(info.lastInsertRowid)
    for (const tagId of t.tagIds) {
      insertTagLink.run(tradeId, tagId)
    }
    return tradeId
  })

  const tradeId = runInTransaction(trade, pnl)
  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId)
  return toTrade(db, row)
}

export function listTradesForAccount(db: Database.Database, accountId: number): Trade[] {
  const rows = db
    .prepare('SELECT * FROM trades WHERE account_id = ? ORDER BY entry_time ASC')
    .all(accountId)
  return rows.map((row) => toTrade(db, row))
}
```

- [ ] **Step 3: Write the test**

`src/main/db/trades.repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { createRuleProfile } from './ruleProfiles.repo'
import { createAccount } from './accounts.repo'
import { createTrade, listTradesForAccount } from './trades.repo'
import { getOrCreateTag } from './tags.repo'

describe('trades.repo', () => {
  let db: Database.Database
  let accountId: number

  beforeEach(() => {
    db = createConnection(':memory:')
    const profile = createRuleProfile(db, {
      name: 'Apex 150K',
      drawdownType: 'trailing',
      drawdownAmount: 5000,
      dailyLossLimit: 2500,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: 9000
    })
    accountId = createAccount(db, {
      firmName: 'Apex',
      accountName: '150K Eval #2',
      startingBalance: 150000,
      currency: 'USD',
      status: 'evaluation',
      ruleProfileId: profile.id
    }).id
  })

  it('computes pnl for a long trade and persists tags', () => {
    const fomo = getOrCreateTag(db, 'FOMO')

    const trade = createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 2,
      rMultiple: 2.5,
      notes: 'Chased the open',
      screenshotPaths: [],
      tagIds: [fomo.id]
    })

    expect(trade.pnl).toBe(20)
    expect(trade.tagIds).toEqual([fomo.id])
  })

  it('computes pnl for a short trade as negative when price rises', () => {
    const trade = createTrade(db, {
      accountId,
      instrument: 'NQ',
      side: 'short',
      entryPrice: 18000,
      exitPrice: 18020,
      entryTime: '2026-08-11T14:00:00Z',
      exitTime: '2026-08-11T14:10:00Z',
      size: 1,
      rMultiple: null,
      notes: null,
      screenshotPaths: [],
      tagIds: []
    })

    expect(trade.pnl).toBe(-20)
    expect(listTradesForAccount(db, accountId)).toHaveLength(2)
  })
})
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/main/db/trades.repo.test.ts`
Expected: PASS. If `pnl` signs are wrong, fix `computePnl` in `trades.repo.ts`, not the test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: trade and tag repositories with pnl computation"
```

---

### Task 7: Rule engine

**Files:**
- Create: `src/main/ruleEngine/computeRuleStatus.ts`
- Test: `src/main/ruleEngine/computeRuleStatus.test.ts`

**Interfaces:**
- Consumes: `Account`, `RuleProfile`, `Trade`, `RuleStatus`, `RuleState` (Task 3).
- Produces: `computeRuleStatus(account: Account, ruleProfile: RuleProfile, trades: Trade[], asOfDate: string): RuleStatus`. IPC handlers (Task 8) and the Dashboard/Accounts views call this exact signature — `asOfDate` is an ISO date string (`YYYY-MM-DD`) used to compute "today's" P&L.

- [ ] **Step 1: Write the failing test**

`src/main/ruleEngine/computeRuleStatus.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeRuleStatus } from './computeRuleStatus'
import type { Account, RuleProfile, Trade } from '../../shared/types'

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

const ruleProfile: RuleProfile = {
  id: 1,
  name: 'Apex 150K',
  drawdownType: 'trailing',
  drawdownAmount: 5000,
  dailyLossLimit: 2500,
  consistencyPercent: null,
  minTradingDays: null,
  profitTarget: 9000
}

function trade(pnl: number, entryTime: string): Trade {
  return {
    id: Math.random(),
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5000,
    entryTime,
    exitTime: entryTime,
    size: 1,
    pnl,
    rMultiple: null,
    notes: null,
    screenshotPaths: [],
    tagIds: []
  }
}

describe('computeRuleStatus', () => {
  it('reports clean state with no trades', () => {
    const status = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(status.highWaterMark).toBe(150000)
    expect(status.drawdownRemaining).toBe(5000)
    expect(status.drawdownState).toBe('clean')
    expect(status.todayPnl).toBe(0)
  })

  it('tracks trailing high-water mark after a profitable day', () => {
    const trades = [trade(3000, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.highWaterMark).toBe(153000)
    expect(status.drawdownLimit).toBe(148000)
    expect(status.drawdownRemaining).toBe(5000)
  })

  it('flags a warning when within 10% of the trailing drawdown limit', () => {
    const trades = [trade(-4600, '2026-08-11T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.drawdownRemaining).toBe(400)
    expect(status.drawdownState).toBe('warning')
  })

  it('flags a violation when the trailing drawdown limit is breached', () => {
    const trades = [trade(-5100, '2026-08-11T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.drawdownState).toBe('violation')
  })

  it('computes today-only pnl against the daily loss limit', () => {
    const trades = [trade(-1000, '2026-08-10T14:00:00Z'), trade(-300, '2026-08-11T09:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.todayPnl).toBe(-300)
    expect(status.dailyLossRemaining).toBe(2200)
    expect(status.dailyLossState).toBe('clean')
  })

  it('reports dailyLossState as n/a when the profile has no daily loss limit', () => {
    const profileNoLimit: RuleProfile = { ...ruleProfile, dailyLossLimit: null }
    const status = computeRuleStatus(account, profileNoLimit, [], '2026-08-11')
    expect(status.dailyLossState).toBe('n/a')
    expect(status.dailyLossRemaining).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/ruleEngine/computeRuleStatus.test.ts`
Expected: FAIL — `computeRuleStatus.ts` does not exist yet.

- [ ] **Step 3: Implement the rule engine**

`src/main/ruleEngine/computeRuleStatus.ts`:
```ts
import type { Account, RuleProfile, Trade, RuleStatus, RuleState } from '../../shared/types'

const WARNING_THRESHOLD_RATIO = 0.1

function stateFromRemaining(remaining: number, limit: number): RuleState {
  if (remaining <= 0) return 'violation'
  if (remaining <= limit * WARNING_THRESHOLD_RATIO) return 'warning'
  return 'clean'
}

export function computeRuleStatus(
  account: Account,
  ruleProfile: RuleProfile,
  trades: Trade[],
  asOfDate: string
): RuleStatus {
  const sorted = [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))

  let runningBalance = account.startingBalance
  let highWaterMark = account.startingBalance
  for (const t of sorted) {
    runningBalance += t.pnl
    if (runningBalance > highWaterMark) highWaterMark = runningBalance
  }

  const drawdownBase = ruleProfile.drawdownType === 'trailing' ? highWaterMark : account.startingBalance
  const drawdownLimit = drawdownBase - ruleProfile.drawdownAmount
  const drawdownRemaining = runningBalance - drawdownLimit
  const drawdownState = stateFromRemaining(drawdownRemaining, ruleProfile.drawdownAmount)

  const todayPnl = sorted
    .filter((t) => t.entryTime.startsWith(asOfDate))
    .reduce((sum, t) => sum + t.pnl, 0)

  let dailyLossRemaining: number | null = null
  let dailyLossState: RuleState | 'n/a' = 'n/a'
  if (ruleProfile.dailyLossLimit !== null) {
    dailyLossRemaining = ruleProfile.dailyLossLimit + Math.min(todayPnl, 0)
    dailyLossState = stateFromRemaining(dailyLossRemaining, ruleProfile.dailyLossLimit)
  }

  return {
    accountId: account.id,
    highWaterMark,
    currentBalance: runningBalance,
    drawdownLimit,
    drawdownUsed: drawdownBase - runningBalance,
    drawdownRemaining,
    drawdownState,
    todayPnl,
    dailyLossLimit: ruleProfile.dailyLossLimit,
    dailyLossRemaining,
    dailyLossState
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/ruleEngine/computeRuleStatus.test.ts`
Expected: PASS, all 6 cases.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rule engine computing drawdown and daily loss status"
```

---

### Task 8: IPC handlers and preload API

**Files:**
- Create: `src/main/ipc/registerHandlers.ts`
- Modify: `src/main/index.ts` (open DB connection, call `registerHandlers`)
- Modify: `src/preload/index.ts`
- Create: `src/preload/api.d.ts` (ambient `window.api` typing for the renderer)

**Interfaces:**
- Consumes: repositories (Tasks 5-6), `computeRuleStatus` (Task 7).
- Produces: `window.api` in the renderer with:
  - `window.api.accounts.list(): Promise<Account[]>`
  - `window.api.accounts.create(account: NewAccount): Promise<Account>`
  - `window.api.ruleProfiles.create(profile: NewRuleProfile): Promise<RuleProfile>`
  - `window.api.trades.listForAccount(accountId: number): Promise<Trade[]>`
  - `window.api.trades.create(trade: NewTrade): Promise<Trade>`
  - `window.api.tags.getOrCreate(name: string): Promise<Tag>`
  - `window.api.ruleStatus.get(accountId: number): Promise<RuleStatus>`

  Task 9-13's `src/renderer/src/api/client.ts` wraps exactly these calls; no other IPC channel names are introduced.

- [ ] **Step 1: Write the IPC channel registration**

`src/main/ipc/registerHandlers.ts`:
```ts
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { createAccount, listAccounts, getAccount } from '../db/accounts.repo'
import { createRuleProfile, getRuleProfile } from '../db/ruleProfiles.repo'
import { createTrade, listTradesForAccount } from '../db/trades.repo'
import { getOrCreateTag } from '../db/tags.repo'
import { computeRuleStatus } from '../ruleEngine/computeRuleStatus'
import type { NewAccount, NewRuleProfile, NewTrade } from '../../shared/types'

export function registerHandlers(db: Database.Database): void {
  ipcMain.handle('accounts:list', () => listAccounts(db))
  ipcMain.handle('accounts:create', (_e, account: NewAccount) => createAccount(db, account))

  ipcMain.handle('ruleProfiles:create', (_e, profile: NewRuleProfile) => createRuleProfile(db, profile))

  ipcMain.handle('trades:listForAccount', (_e, accountId: number) => listTradesForAccount(db, accountId))
  ipcMain.handle('trades:create', (_e, trade: NewTrade) => createTrade(db, trade))

  ipcMain.handle('tags:getOrCreate', (_e, name: string) => getOrCreateTag(db, name))

  ipcMain.handle('ruleStatus:get', (_e, accountId: number) => {
    const account = getAccount(db, accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)
    const profile = getRuleProfile(db, account.ruleProfileId)
    if (!profile) throw new Error(`Rule profile ${account.ruleProfileId} not found`)
    const trades = listTradesForAccount(db, accountId)
    const today = new Date().toISOString().slice(0, 10)
    return computeRuleStatus(account, profile, trades, today)
  })
}
```

- [ ] **Step 2: Wire it into the main process entry**

In `src/main/index.ts`, inside the existing `app.whenReady().then(() => { ... })` block (added by the scaffold), add before `createWindow()` is called:

```ts
import { join } from 'path'
import { app } from 'electron'
import { createConnection } from './db/connection'
import { registerHandlers } from './ipc/registerHandlers'

// inside app.whenReady().then(() => { ... }):
const db = createConnection(join(app.getPath('userData'), 'flowstate.db'))
registerHandlers(db)
```

- [ ] **Step 3: Expose the API from preload**

`src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Account, NewAccount, NewRuleProfile, NewTrade } from '../shared/types'

const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    create: (account: NewAccount) => ipcRenderer.invoke('accounts:create', account)
  },
  ruleProfiles: {
    create: (profile: NewRuleProfile) => ipcRenderer.invoke('ruleProfiles:create', profile)
  },
  trades: {
    listForAccount: (accountId: number) => ipcRenderer.invoke('trades:listForAccount', accountId),
    create: (trade: NewTrade) => ipcRenderer.invoke('trades:create', trade)
  },
  tags: {
    getOrCreate: (name: string) => ipcRenderer.invoke('tags:getOrCreate', name)
  },
  ruleStatus: {
    get: (accountId: number) => ipcRenderer.invoke('ruleStatus:get', accountId)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type FlowStateApi = typeof api
```

- [ ] **Step 4: Type `window.api` for the renderer**

`src/preload/api.d.ts`:
```ts
import type { FlowStateApi } from './index'

declare global {
  interface Window {
    api: FlowStateApi
  }
}
```

- [ ] **Step 5: Verify end-to-end manually**

Run: `npm run dev`. In the Electron devtools console, run:
```js
await window.api.ruleProfiles.create({ name: 'Test', drawdownType: 'trailing', drawdownAmount: 5000, dailyLossLimit: 2500, consistencyPercent: null, minTradingDays: null, profitTarget: null })
```
Expected: resolves with an object containing `id: 1`. Then `await window.api.accounts.list()` resolves to `[]`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: IPC handlers and typed preload API"
```

---

### Task 9: DrawdownGauge component

**Files:**
- Create: `src/renderer/src/components/DrawdownGauge.tsx`
- Test: `src/renderer/src/components/DrawdownGauge.test.tsx`
- Modify: `vite.config` test setup if not already present (electron-vite scaffold includes a `vitest.config.ts` — confirm it points `environment: 'jsdom'` for renderer tests; if not, add a second Vitest project/config for `src/renderer`)

**Interfaces:**
- Consumes: nothing beyond React and design tokens (Task 2).
- Produces: `<DrawdownGauge firmLabel accountLabel usedAmount limitAmount highWaterMark />` — a presentational component. Task 11 (Accounts view) and Task 13 (Dashboard) both render this with live `RuleStatus` data; they must map their data to exactly these props.

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/DrawdownGauge.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DrawdownGauge } from './DrawdownGauge'

describe('DrawdownGauge', () => {
  it('renders the used and limit amounts', () => {
    render(
      <DrawdownGauge
        firmLabel="Apex · 150K Eval #2"
        accountLabel="Trailing Drawdown"
        usedAmount={3150}
        limitAmount={5000}
        highWaterMark={152340}
      />
    )
    expect(screen.getByText('$3,150 / $5,000')).toBeInTheDocument()
    expect(screen.getByText(/152,340/)).toBeInTheDocument()
  })

  it('marks the hard limit line near the right edge proportional to the limit', () => {
    const { container } = render(
      <DrawdownGauge
        firmLabel="Apex"
        accountLabel="Trailing Drawdown"
        usedAmount={0}
        limitAmount={5000}
        highWaterMark={150000}
      />
    )
    const fill = container.querySelector('.gauge-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/DrawdownGauge.test.tsx`
Expected: FAIL — `DrawdownGauge.tsx` does not exist.

- [ ] **Step 3: Implement the component**

`src/renderer/src/components/DrawdownGauge.tsx`:
```tsx
interface DrawdownGaugeProps {
  firmLabel: string
  accountLabel: string
  usedAmount: number
  limitAmount: number
  highWaterMark: number
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function DrawdownGauge({
  firmLabel,
  accountLabel,
  usedAmount,
  limitAmount,
  highWaterMark
}: DrawdownGaugeProps): JSX.Element {
  const fillPercent = Math.min(100, Math.max(0, (usedAmount / limitAmount) * 100))
  const remaining = limitAmount - usedAmount

  return (
    <div className="gauge-card">
      <div className="gauge-top">
        <div>
          <span className="gauge-firm">{firmLabel}</span>
          <br />
          <span className="gauge-title">{accountLabel}</span>
        </div>
        <span className="gauge-value">
          {formatCurrency(usedAmount)} / {formatCurrency(limitAmount)}
        </span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${fillPercent}%` }} />
        <div className="gauge-buffer-line" style={{ left: '100%' }} />
      </div>
      <div className="gauge-foot">
        <span>HIGH-WATER {formatCurrency(highWaterMark)}</span>
        <span>BUFFER REMAINING {formatCurrency(remaining)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the gauge CSS to tokens.css**

Append to `src/renderer/src/styles/tokens.css`:
```css
.gauge-card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px 22px;
  max-width: 460px;
}
.gauge-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
.gauge-title { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.gauge-firm { font-family: var(--mono); font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.gauge-value { font-family: var(--mono); font-size: 20px; font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums; }
.gauge-track { position: relative; height: 28px; background: var(--surface-3); border-radius: 4px; overflow: hidden; border: 1px solid var(--border-soft); }
.gauge-fill { position: absolute; top: 0; bottom: 0; left: 0; background: linear-gradient(90deg, rgba(217,154,61,0.35), rgba(217,154,61,0.55)); border-right: 2px solid var(--accent); }
.gauge-buffer-line { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--pnl-neg); }
.gauge-foot { display: flex; justify-content: space-between; margin-top: 10px; font-family: var(--mono); font-size: 10px; color: var(--text-muted); }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/DrawdownGauge.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: DrawdownGauge signature component"
```

---

### Task 10: RuleStatusStrip component

**Files:**
- Create: `src/renderer/src/components/RuleStatusStrip.tsx`
- Test: `src/renderer/src/components/RuleStatusStrip.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React and tokens.
- Produces: `<RuleStatusStrip items={StripItem[]} />` where `StripItem = { label: string; pnl: number; limitLabel: string; state: 'clean' | 'warning' | 'violation' }`. Task 13 (Dashboard) maps one `StripItem` per account from `RuleStatus` + `Account`.

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/RuleStatusStrip.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RuleStatusStrip } from './RuleStatusStrip'

describe('RuleStatusStrip', () => {
  it('renders one segment per item with a warning dot when near threshold', () => {
    render(
      <RuleStatusStrip
        items={[
          { label: 'Apex 150K', pnl: 412, limitLabel: 'Limit $2,500 · 84% remaining', state: 'clean' },
          { label: 'Topstep 50K', pnl: -890, limitLabel: 'Limit $1,000 · 11% remaining', state: 'warning' }
        ]}
      />
    )
    expect(screen.getByText('Apex 150K')).toBeInTheDocument()
    expect(screen.getByText('+$412')).toBeInTheDocument()
    expect(screen.getByText('−$890')).toBeInTheDocument()
    expect(document.querySelectorAll('.dot.warn')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/components/RuleStatusStrip.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

`src/renderer/src/components/RuleStatusStrip.tsx`:
```tsx
export interface StripItem {
  label: string
  pnl: number
  limitLabel: string
  state: 'clean' | 'warning' | 'violation'
}

function formatSignedCurrency(n: number): string {
  const sign = n >= 0 ? '+' : '−'
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

export function RuleStatusStrip({ items }: { items: StripItem[] }): JSX.Element {
  return (
    <div className="strip">
      {items.map((item) => (
        <div className="strip-item" key={item.label}>
          <span className="strip-label">{item.label}</span>
          <span className={`strip-value ${item.pnl >= 0 ? 'pos' : 'neg'}`}>
            {(item.state === 'warning' || item.state === 'violation') && (
              <span className={`dot ${item.state === 'violation' ? 'violation' : 'warn'}`} />
            )}
            {formatSignedCurrency(item.pnl)}
          </span>
          <div className="strip-sub">{item.limitLabel}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Add the strip CSS to tokens.css**

Append to `src/renderer/src/styles/tokens.css`:
```css
.strip { display: flex; background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.strip-item { padding: 14px 20px; border-right: 1px solid var(--border-soft); flex: 1; }
.strip-item:last-child { border-right: none; }
.strip-label { font-family: var(--mono); font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 6px; }
.strip-value { font-family: var(--mono); font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.strip-value.pos { color: var(--pnl-pos); }
.strip-value.neg { color: var(--pnl-neg); }
.strip-sub { font-size: 10px; color: var(--text-muted); margin-top: 3px; font-family: var(--mono); }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; position: relative; top: -1px; }
.dot.warn { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.dot.violation { background: var(--pnl-neg); box-shadow: 0 0 0 3px var(--pnl-neg-dim); }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/RuleStatusStrip.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: RuleStatusStrip ambient status component"
```

---

### Task 11: Accounts view

**Files:**
- Create: `src/renderer/src/api/client.ts`
- Create: `src/renderer/src/views/AccountForm.tsx`
- Create: `src/renderer/src/views/AccountsView.tsx`
- Modify: `src/renderer/src/App.tsx` (render `AccountsView` when `view === 'accounts'`)

**Interfaces:**
- Consumes: `window.api` (Task 8), `DrawdownGauge` (Task 9), `RuleStatus`/`Account`/`RuleProfile` types (Task 3).
- Produces: `src/renderer/src/api/client.ts` exporting `flowStateApi = window.api` typed re-export, used by every subsequent view instead of touching `window.api` directly.

- [ ] **Step 1: Write the API client wrapper**

`src/renderer/src/api/client.ts`:
```ts
export const flowStateApi = window.api
```

- [ ] **Step 2: Write the account creation form**

`src/renderer/src/views/AccountForm.tsx`:
```tsx
import { useState } from 'react'
import { flowStateApi } from '../api/client'
import type { AccountStatus, DrawdownType } from '../../../shared/types'

interface AccountFormProps {
  onCreated: () => void
}

export function AccountForm({ onCreated }: AccountFormProps): JSX.Element {
  const [firmName, setFirmName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [startingBalance, setStartingBalance] = useState('150000')
  const [status, setStatus] = useState<AccountStatus>('evaluation')
  const [drawdownType, setDrawdownType] = useState<DrawdownType>('trailing')
  const [drawdownAmount, setDrawdownAmount] = useState('5000')
  const [dailyLossLimit, setDailyLossLimit] = useState('2500')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const profile = await flowStateApi.ruleProfiles.create({
      name: `${firmName} ${accountName}`,
      drawdownType,
      drawdownAmount: Number(drawdownAmount),
      dailyLossLimit: dailyLossLimit ? Number(dailyLossLimit) : null,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: null
    })
    await flowStateApi.accounts.create({
      firmName,
      accountName,
      startingBalance: Number(startingBalance),
      currency: 'USD',
      status,
      ruleProfileId: profile.id
    })
    setFirmName('')
    setAccountName('')
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="account-form">
      <input placeholder="Firm (e.g. Apex)" value={firmName} onChange={(e) => setFirmName(e.target.value)} required />
      <input placeholder="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
      <input type="number" placeholder="Starting balance" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} required />
      <select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
        <option value="evaluation">Evaluation</option>
        <option value="funded">Funded</option>
      </select>
      <select value={drawdownType} onChange={(e) => setDrawdownType(e.target.value as DrawdownType)}>
        <option value="trailing">Trailing drawdown</option>
        <option value="static">Static drawdown</option>
      </select>
      <input type="number" placeholder="Drawdown amount" value={drawdownAmount} onChange={(e) => setDrawdownAmount(e.target.value)} required />
      <input type="number" placeholder="Daily loss limit" value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value)} />
      <button type="submit">Add account</button>
    </form>
  )
}
```

- [ ] **Step 3: Write the Accounts view**

`src/renderer/src/views/AccountsView.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { AccountForm } from './AccountForm'
import { DrawdownGauge } from '../components/DrawdownGauge'
import type { Account, RuleStatus } from '../../../shared/types'

export function AccountsView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [statuses, setStatuses] = useState<Record<number, RuleStatus>>({})

  async function refresh(): Promise<void> {
    const list = await flowStateApi.accounts.list()
    setAccounts(list)
    const entries = await Promise.all(
      list.map(async (a) => [a.id, await flowStateApi.ruleStatus.get(a.id)] as const)
    )
    setStatuses(Object.fromEntries(entries))
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        Accounts
      </h2>
      <AccountForm onCreated={refresh} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {accounts.map((account) => {
          const status = statuses[account.id]
          if (!status) return null
          return (
            <DrawdownGauge
              key={account.id}
              firmLabel={`${account.firmName} · ${account.accountName}`}
              accountLabel="Trailing Drawdown"
              usedAmount={status.drawdownUsed}
              limitAmount={status.drawdownLimit === status.highWaterMark ? 1 : status.highWaterMark - status.drawdownLimit}
              highWaterMark={status.highWaterMark}
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the view into App.tsx**

Modify `src/renderer/src/App.tsx`:
```tsx
import { useState } from 'react'
import { Sidebar, ViewName } from './components/Sidebar'
import { AccountsView } from './views/AccountsView'

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewName>('dashboard')

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} />
      <main className="main-content">
        {view === 'accounts' && <AccountsView />}
        {view !== 'accounts' && (
          <p style={{ color: 'var(--text-secondary)' }}>Current view: {view}</p>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`. Click "Accounts", fill in the form with a firm, account name, starting balance 150000, trailing drawdown 5000, daily loss limit 2500, submit. Expected: a drawdown gauge card appears showing `$0 / $5,000` and `HIGH-WATER $150,000`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Accounts view with rule profile creation and drawdown gauge"
```

---

### Task 12: Trade Log view

**Files:**
- Create: `src/renderer/src/views/TradeQuickAddForm.tsx`
- Create: `src/renderer/src/views/TradeLogView.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `flowStateApi` (Task 11), `Trade`/`NewTrade`/`TradeSide` types (Task 3).
- Produces: nothing consumed by later tasks in this plan — this is a leaf view.

- [ ] **Step 1: Write the keyboard-first quick-add form**

`src/renderer/src/views/TradeQuickAddForm.tsx`:
```tsx
import { useState } from 'react'
import { flowStateApi } from '../api/client'
import type { TradeSide } from '../../../shared/types'

interface TradeQuickAddFormProps {
  accountId: number
  onCreated: () => void
}

export function TradeQuickAddForm({ accountId, onCreated }: TradeQuickAddFormProps): JSX.Element {
  const [instrument, setInstrument] = useState('')
  const [side, setSide] = useState<TradeSide>('long')
  const [size, setSize] = useState('1')
  const [entryPrice, setEntryPrice] = useState('')
  const [exitPrice, setExitPrice] = useState('')

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const now = new Date().toISOString()
    await flowStateApi.trades.create({
      accountId,
      instrument,
      side,
      entryPrice: Number(entryPrice),
      exitPrice: Number(exitPrice),
      entryTime: now,
      exitTime: now,
      size: Number(size),
      rMultiple: null,
      notes: null,
      screenshotPaths: [],
      tagIds: []
    })
    setInstrument('')
    setEntryPrice('')
    setExitPrice('')
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="trade-quick-add">
      <input autoFocus placeholder="Instrument (ES)" value={instrument} onChange={(e) => setInstrument(e.target.value)} required />
      <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)}>
        <option value="long">Long</option>
        <option value="short">Short</option>
      </select>
      <input type="number" placeholder="Size" value={size} onChange={(e) => setSize(e.target.value)} required />
      <input type="number" step="0.01" placeholder="Entry" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} required />
      <input type="number" step="0.01" placeholder="Exit" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} required />
      <button type="submit">Log trade</button>
    </form>
  )
}
```

- [ ] **Step 2: Write the Trade Log view**

`src/renderer/src/views/TradeLogView.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { TradeQuickAddForm } from './TradeQuickAddForm'
import type { Account, Trade } from '../../../shared/types'

export function TradeLogView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    flowStateApi.accounts.list().then((list) => {
      setAccounts(list)
      if (list.length > 0) setSelectedAccountId(list[0].id)
    })
  }, [])

  async function refreshTrades(accountId: number): Promise<void> {
    setTrades(await flowStateApi.trades.listForAccount(accountId))
  }

  useEffect(() => {
    if (selectedAccountId !== null) refreshTrades(selectedAccountId)
  }, [selectedAccountId])

  if (accounts.length === 0) {
    return <p style={{ color: 'var(--text-secondary)' }}>Create an account first.</p>
  }

  return (
    <div>
      <select
        value={selectedAccountId ?? ''}
        onChange={(e) => setSelectedAccountId(Number(e.target.value))}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.firmName} · {a.accountName}
          </option>
        ))}
      </select>

      {selectedAccountId !== null && (
        <TradeQuickAddForm accountId={selectedAccountId} onCreated={() => refreshTrades(selectedAccountId)} />
      )}

      <table className="trade-table">
        <thead>
          <tr>
            <th>Instrument</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td>{t.instrument}</td>
              <td>{t.side}</td>
              <td>{t.size}</td>
              <td>{t.entryPrice}</td>
              <td>{t.exitPrice}</td>
              <td className={t.pnl >= 0 ? 'pos' : 'neg'}>{t.pnl.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Add trade table styling to tokens.css**

Append to `src/renderer/src/styles/tokens.css`:
```css
.trade-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-family: var(--mono); font-size: 13px; font-variant-numeric: tabular-nums; }
.trade-table th { text-align: left; padding: 8px 12px; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
.trade-table td { padding: 8px 12px; border-bottom: 1px solid var(--border-soft); color: var(--text-primary); }
.trade-table td.pos { color: var(--pnl-pos); }
.trade-table td.neg { color: var(--pnl-neg); }
.trade-quick-add, .account-form { display: flex; gap: 8px; margin: 16px 0; }
.trade-quick-add input, .trade-quick-add select, .account-form input, .account-form select {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
}
```

- [ ] **Step 4: Wire the view into App.tsx**

Modify `src/renderer/src/App.tsx` to add `import { TradeLogView } from './views/TradeLogView'` and render it when `view === 'tradeLog'`, following the same conditional pattern as `AccountsView`.

- [ ] **Step 5: Verify manually**

Run: `npm run dev`. Create an account (Task 11's flow), switch to Trade Log, log a trade (ES, long, size 1, entry 5000, exit 5010). Expected: the trade appears in the table with P&L `10.00` in green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Trade Log view with keyboard-first quick-add form"
```

---

### Task 13: Dashboard view

**Files:**
- Create: `src/renderer/src/views/DashboardView.tsx`
- Create: `src/renderer/src/components/EquityCurve.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `package.json` (add `recharts` dependency)

**Interfaces:**
- Consumes: `flowStateApi`, `RuleStatusStrip` (Task 10), `Account`/`RuleStatus`/`Trade` types.
- Produces: nothing consumed elsewhere — leaf view completing this plan's scope.

- [ ] **Step 1: Install Recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Write the equity curve component**

`src/renderer/src/components/EquityCurve.tsx`:
```tsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Trade } from '../../../shared/types'

interface EquityCurveProps {
  startingBalance: number
  trades: Trade[]
}

export function EquityCurve({ startingBalance, trades }: EquityCurveProps): JSX.Element {
  const sorted = [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))
  let running = startingBalance
  const data = [
    { label: 'Start', balance: running },
    ...sorted.map((t, i) => {
      running += t.pnl
      return { label: `#${i + 1}`, balance: running }
    })
  ]

  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D99A3D" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#D99A3D" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" stroke="#5C646C" fontSize={10} tickLine={false} />
          <YAxis stroke="#5C646C" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#14171A', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'monospace', fontSize: 12 }}
          />
          <Area type="monotone" dataKey="balance" stroke="#D99A3D" fill="url(#equityFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Write the Dashboard view**

`src/renderer/src/views/DashboardView.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { RuleStatusStrip, StripItem } from '../components/RuleStatusStrip'
import { EquityCurve } from '../components/EquityCurve'
import type { Account, Trade } from '../../../shared/types'

export function DashboardView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stripItems, setStripItems] = useState<StripItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    async function load(): Promise<void> {
      const list = await flowStateApi.accounts.list()
      setAccounts(list)
      if (list.length > 0) setSelectedAccountId(list[0].id)

      const items = await Promise.all(
        list.map(async (a) => {
          const status = await flowStateApi.ruleStatus.get(a.id)
          return {
            label: `${a.firmName} ${a.accountName}`,
            pnl: status.todayPnl,
            limitLabel: status.dailyLossLimit
              ? `Limit $${status.dailyLossLimit.toLocaleString()} · ${Math.round(
                  ((status.dailyLossRemaining ?? 0) / status.dailyLossLimit) * 100
                )}% remaining`
              : 'No daily loss limit',
            state: status.dailyLossState === 'n/a' ? 'clean' : status.dailyLossState
          } as StripItem
        })
      )
      setStripItems(items)
    }
    load()
  }, [])

  useEffect(() => {
    if (selectedAccountId !== null) {
      flowStateApi.trades.listForAccount(selectedAccountId).then(setTrades)
    }
  }, [selectedAccountId])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  if (accounts.length === 0) {
    return <p style={{ color: 'var(--text-secondary)' }}>Create an account first.</p>
  }

  return (
    <div>
      <RuleStatusStrip items={stripItems} />
      {selectedAccount && (
        <div style={{ marginTop: 24 }}>
          <EquityCurve startingBalance={selectedAccount.startingBalance} trades={trades} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire the view into App.tsx**

Modify `src/renderer/src/App.tsx` to import `DashboardView` and render it when `view === 'dashboard'`, replacing the placeholder text for that branch. Final `main` content becomes:
```tsx
<main className="main-content">
  {view === 'dashboard' && <DashboardView />}
  {view === 'accounts' && <AccountsView />}
  {view === 'tradeLog' && <TradeLogView />}
</main>
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`. With the account and trade created in Tasks 11-12, land on Dashboard. Expected: the status strip shows the account with today's P&L, and the equity curve shows two points (Start, #1) stepping up from the starting balance.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Dashboard view with ambient rule status strip and equity curve"
```

---

## Self-Review

**Spec coverage:**
- Architecture (Electron main/renderer/IPC, SQLite, no network) — Tasks 1, 4, 8. ✓
- Data model (accounts, rule_profiles, trades, tags, daily_logs) — Task 4 covers all but `daily_logs`, which has no consumer until Calendar/Analytics (deferred; noted in Scope Note). ✓ intentionally partial.
- Rule engine (violation/warning states, trailing/static drawdown, daily loss limit) — Task 7. ✓
- Visual direction (tokens, drawdown gauge, status strip, borders-only, mono figures) — Tasks 2, 9, 10. ✓
- Dashboard / Trade Log / Accounts views — Tasks 11-13. ✓
- Calendar / Analytics / export-import / packaging — explicitly deferred per Scope Note, matching spec's Open Items.

**Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact shell command.

**Type consistency:** `RuleStatus`, `Account`, `RuleProfile`, `Trade`, `NewTrade`, `NewAccount`, `NewRuleProfile` are defined once in Task 3 and referenced by identical names throughout; `computeRuleStatus` signature in Task 7 matches its IPC call site in Task 8; `DrawdownGauge` props in Task 9 match its usage in Task 11; `StripItem` in Task 10 matches its construction in Task 13.

---

## Next Steps (follow-up plan, not this one)

- `daily_logs` table usage, Calendar view (P&L heatmap + behavior tag dots).
- Analytics view (win rate by tag/time-of-day, R-multiple histogram).
- Screenshot paste/drag-and-drop attachment UI and app-managed file storage.
- Export/import with schema versioning.
- Electron packaging (`electron-builder`) for distribution.
