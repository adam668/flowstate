# Advanced Trade Log & Universal Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make trade P&L manual instead of computed, replace the single trade `notes` field with four structured reflection fields, and add delete to trades, accounts, and journal entries.

**Architecture:** A backward-compatible SQLite migration adds four nullable columns to `trades` and backfills `notes` into `execution_notes` once; `createTrade` stops deriving `pnl`. Delete operations are plain repo functions wrapped in transactions where a table has dependents (accounts → rule profile + trades). All new IPC follows the existing `flowStateApi` namespace pattern. UI work for the trade row expand-out, delete buttons, and the account-delete confirmation flow goes through the `interface-design` skill so it stays consistent with `.interface-design/system.md` rather than improvised inline styles.

**Tech Stack:** Existing Electron/React/TypeScript/better-sqlite3 stack; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-advanced-trade-log-and-delete-design.md`

## Global Constraints

- P&L is a required manual field on trade creation — `createTrade` never derives it. Only `pnl` and the four reflection fields (`setupThesis`, `executionNotes`, `lessonsLearned`, `brainstorm`) are editable after creation; price/size/instrument/side/times are not (out of scope per the spec's Non-goals).
- The `notes` SQLite column is never dropped — the migration adds new columns and backfills once, but leaves `notes` in place for safety on already-released installs (v0.1.0/v0.2.0 are live). `applySchema` runs on every app start and must be idempotent — re-running it must never re-add a column or re-copy `notes` into an already-populated `execution_notes`.
- Journal entries are addressed by `date` (the table's unique key), not `id` — both UI call sites (Journal section's entry list, Calendar's day panel) naturally have the date on hand.
- Every new IPC method follows the existing `flowStateApi`/`window.api` pattern: explicit `Promise<T>` return types, no bare `any`.
- Every delete is gated by `window.confirm` (matching the existing journal-template-delete precedent in `JournalView.tsx`) — no silent/undoable deletes.
- New UI (trade row expand-out, delete buttons, account-delete confirmation) must be built by invoking the `interface-design` skill during that task, so it's reviewed against `.interface-design/system.md` rather than shipped as an improvised first draft — see each UI task's explicit step for this.
- Visual direction is locked in `.interface-design/system.md` — only existing CSS custom properties from `src/renderer/src/styles/tokens.css`, no invented colors.

---

## File Structure

```
src/
  shared/
    types.ts                                # Trade/NewTrade reshaped, + UpdateTradeReflection
  main/
    db/
      schema.ts                             # + trades migration (4 columns, notes backfill)
      trades.repo.ts                        # manual pnl, deleteTrade, updateTradeReflection
      trades.repo.test.ts                   # updated fixtures + new tests
      accounts.repo.ts                      # + deleteAccount
      accounts.repo.test.ts                 # + delete tests
      journalEntries.repo.ts                # + deleteJournalEntry (by date)
      journalEntries.repo.test.ts           # + delete test
      journalTemplates.repo.test.ts         # unaffected — reference only
    ruleEngine/
      computeRuleStatus.test.ts             # trade fixture updated for new Trade shape
    ipc/
      registerHandlers.ts                   # + trades:delete/update, accounts:delete, journalEntries:delete
  preload/
    index.ts                                # + delete/update methods on trades/accounts/journalEntries
  renderer/
    src/
      views/
        TradeQuickAddForm.tsx               # + manual P&L input
        TradeRow.tsx                        # new — row + expand-out (4 fields, save, delete)
        TradeLogView.tsx                    # renders TradeRow instead of inline <tr>
        AccountsView.tsx                    # + delete button/confirm flow
        JournalView.tsx                     # + delete button per entry
        CalendarView.tsx                    # + delete button in entry panel, correct remount keying
        CalendarView.test.tsx               # trade fixture updated for new Trade shape
      styles/
        tokens.css                          # + trade-row detail/delete, account-delete, journal-entry-delete CSS
```

---

### Task 1: Shared types, schema migration, and trades repository

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/db/trades.repo.ts`
- Modify: `src/main/db/trades.repo.test.ts`
- Modify: `src/main/ruleEngine/computeRuleStatus.test.ts`
- Modify: `src/renderer/src/views/CalendarView.test.tsx`
- Modify: `src/shared/calendar.test.ts`

**Interfaces:**
- Consumes: nothing new — this is the type/schema contract other tasks build on.
- Produces: reshaped `Trade`/`NewTrade` (pnl required on create, `notes` replaced by `setupThesis`/`executionNotes`/`lessonsLearned`/`brainstorm`), `UpdateTradeReflection` type, `createTrade(db, trade: NewTrade): Trade` (no longer derives pnl), `deleteTrade(db, id: number): void`, `updateTradeReflection(db, id: number, updates: UpdateTradeReflection): Trade`. Task 4's IPC wiring and Task 5's UI call these exact names.

- [ ] **Step 1: Reshape the shared types**

In `src/shared/types.ts`, replace the `Trade` interface and `NewTrade` type, and add `UpdateTradeReflection`:
```ts
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
  setupThesis: string | null
  executionNotes: string | null
  lessonsLearned: string | null
  brainstorm: string | null
  screenshotPaths: string[]
  tagIds: number[]
}

export type NewTrade = Omit<Trade, 'id'>

export interface UpdateTradeReflection {
  pnl?: number
  setupThesis?: string | null
  executionNotes?: string | null
  lessonsLearned?: string | null
  brainstorm?: string | null
}
```
(`NewTrade` no longer omits `pnl` — it's now a required field the caller supplies, same as `entryPrice`.)

- [ ] **Step 2: Add the schema migration**

In `src/main/db/schema.ts`, add a migration function and call it at the end of `applySchema`:
```ts
function migrateTradesTable(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(trades)').all() as { name: string }[]
  const columnNames = new Set(columns.map((c) => c.name))

  const newColumns: [string, string][] = [
    ['setup_thesis', 'TEXT'],
    ['execution_notes', 'TEXT'],
    ['lessons_learned', 'TEXT'],
    ['brainstorm', 'TEXT']
  ]
  for (const [name, type] of newColumns) {
    if (!columnNames.has(name)) {
      db.exec(`ALTER TABLE trades ADD COLUMN ${name} ${type}`)
    }
  }

  // One-time backfill: carry forward any existing freeform notes into
  // execution_notes. The WHERE clause makes this idempotent — once a row's
  // execution_notes is populated, re-running this never touches it again.
  db.exec(`
    UPDATE trades
    SET execution_notes = notes
    WHERE notes IS NOT NULL AND notes != ''
      AND (execution_notes IS NULL OR execution_notes = '')
  `)
}
```
Call `migrateTradesTable(db)` as the last line of `applySchema`, after the existing `db.exec(...)` call that creates all the tables.

- [ ] **Step 3: Run the existing schema test to confirm nothing broke**

Run: `npx vitest run src/main/db/connection.test.ts`
Expected: PASS (this test only checks table existence, unaffected by new columns).

- [ ] **Step 4: Update trades.repo.ts — remove computed pnl, add new fields, delete, and update**

Replace the full contents of `src/main/db/trades.repo.ts`:
```ts
import type Database from 'better-sqlite3'
import type { Trade, NewTrade, UpdateTradeReflection } from '../../shared/types'

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
    setupThesis: row.setup_thesis,
    executionNotes: row.execution_notes,
    lessonsLearned: row.lessons_learned,
    brainstorm: row.brainstorm,
    screenshotPaths: JSON.parse(row.screenshot_paths),
    tagIds: tagRows.map((t) => t.tag_id)
  }
}

export function createTrade(db: Database.Database, trade: NewTrade): Trade {
  const insertTrade = db.prepare(`
    INSERT INTO trades
      (account_id, instrument, side, entry_price, exit_price, entry_time, exit_time, size, pnl, r_multiple, setup_thesis, execution_notes, lessons_learned, brainstorm, screenshot_paths)
    VALUES
      (@accountId, @instrument, @side, @entryPrice, @exitPrice, @entryTime, @exitTime, @size, @pnl, @rMultiple, @setupThesis, @executionNotes, @lessonsLearned, @brainstorm, @screenshotPaths)
  `)

  const insertTagLink = db.prepare('INSERT INTO trade_tags (trade_id, tag_id) VALUES (?, ?)')

  const runInTransaction = db.transaction((t: NewTrade) => {
    const info = insertTrade.run({
      accountId: t.accountId,
      instrument: t.instrument,
      side: t.side,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      size: t.size,
      pnl: t.pnl,
      rMultiple: t.rMultiple,
      setupThesis: t.setupThesis,
      executionNotes: t.executionNotes,
      lessonsLearned: t.lessonsLearned,
      brainstorm: t.brainstorm,
      screenshotPaths: JSON.stringify(t.screenshotPaths)
    })
    const tradeId = Number(info.lastInsertRowid)
    for (const tagId of t.tagIds) {
      insertTagLink.run(tradeId, tagId)
    }
    return tradeId
  })

  const tradeId = runInTransaction(trade)
  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId)
  return toTrade(db, row)
}

export function listTradesForAccount(db: Database.Database, accountId: number): Trade[] {
  const rows = db
    .prepare('SELECT * FROM trades WHERE account_id = ? ORDER BY entry_time ASC')
    .all(accountId)
  return rows.map((row) => toTrade(db, row))
}

export function listAllTrades(db: Database.Database): Trade[] {
  const rows = db.prepare('SELECT * FROM trades ORDER BY entry_time ASC').all()
  return rows.map((row) => toTrade(db, row))
}

export function deleteTrade(db: Database.Database, id: number): void {
  const runInTransaction = db.transaction(() => {
    db.prepare('DELETE FROM trade_tags WHERE trade_id = ?').run(id)
    db.prepare('DELETE FROM trades WHERE id = ?').run(id)
  })
  runInTransaction()
}

export function updateTradeReflection(
  db: Database.Database,
  id: number,
  updates: UpdateTradeReflection
): Trade {
  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Trade ${id} not found`)

  const pnl = updates.pnl ?? existing.pnl
  const setupThesis = updates.setupThesis !== undefined ? updates.setupThesis : existing.setup_thesis
  const executionNotes =
    updates.executionNotes !== undefined ? updates.executionNotes : existing.execution_notes
  const lessonsLearned =
    updates.lessonsLearned !== undefined ? updates.lessonsLearned : existing.lessons_learned
  const brainstorm = updates.brainstorm !== undefined ? updates.brainstorm : existing.brainstorm

  db.prepare(
    `
    UPDATE trades
    SET pnl = ?, setup_thesis = ?, execution_notes = ?, lessons_learned = ?, brainstorm = ?
    WHERE id = ?
  `
  ).run(pnl, setupThesis, executionNotes, lessonsLearned, brainstorm, id)

  return toTrade(db, db.prepare('SELECT * FROM trades WHERE id = ?').get(id))
}
```

- [ ] **Step 5: Update the trades.repo.test.ts fixtures and add new tests**

Replace the full contents of `src/main/db/trades.repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { createRuleProfile } from './ruleProfiles.repo'
import { createAccount } from './accounts.repo'
import { createTrade, listTradesForAccount, deleteTrade, updateTradeReflection } from './trades.repo'
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

  it('stores the manually-supplied pnl verbatim, not a computed value', () => {
    const fomo = getOrCreateTag(db, 'FOMO')

    // Entry/exit/size would compute to 20 under the old formula; pass a
    // different number to prove the value is stored as typed, not derived.
    const trade = createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 2,
      pnl: 17.5,
      rMultiple: 2.5,
      setupThesis: 'Breakout above premarket high',
      executionNotes: 'Filled at 5000, scaled out at 5010',
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: [fomo.id]
    })

    expect(trade.pnl).toBe(17.5)
    expect(trade.setupThesis).toBe('Breakout above premarket high')
    expect(trade.tagIds).toEqual([fomo.id])
  })

  it('persists all four reflection fields independently', () => {
    const trade = createTrade(db, {
      accountId,
      instrument: 'NQ',
      side: 'short',
      entryPrice: 18000,
      exitPrice: 17980,
      entryTime: '2026-08-11T14:00:00Z',
      exitTime: '2026-08-11T14:10:00Z',
      size: 1,
      pnl: 20,
      rMultiple: null,
      setupThesis: 'Fade the open',
      executionNotes: 'Clean fill',
      lessonsLearned: 'Sized too small',
      brainstorm: 'Check correlation with ES tomorrow',
      screenshotPaths: [],
      tagIds: []
    })

    expect(trade.executionNotes).toBe('Clean fill')
    expect(trade.lessonsLearned).toBe('Sized too small')
    expect(trade.brainstorm).toBe('Check correlation with ES tomorrow')
    expect(listTradesForAccount(db, accountId)).toHaveLength(1)
  })

  it('deletes a trade and its tag links', () => {
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
      pnl: 20,
      rMultiple: null,
      setupThesis: null,
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: [fomo.id]
    })

    deleteTrade(db, trade.id)

    expect(listTradesForAccount(db, accountId)).toHaveLength(0)
    const tagLinks = db.prepare('SELECT * FROM trade_tags WHERE trade_id = ?').all(trade.id)
    expect(tagLinks).toHaveLength(0)
  })

  it('updates only the provided reflection fields, leaving others unchanged', () => {
    const trade = createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 2,
      pnl: 20,
      rMultiple: null,
      setupThesis: 'Original thesis',
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: []
    })

    const updated = updateTradeReflection(db, trade.id, {
      executionNotes: 'Added after the fact',
      pnl: 25
    })

    expect(updated.pnl).toBe(25)
    expect(updated.setupThesis).toBe('Original thesis')
    expect(updated.executionNotes).toBe('Added after the fact')
  })

  it('throws for an unknown trade id', () => {
    expect(() => updateTradeReflection(db, 999, { pnl: 10 })).toThrow('Trade 999 not found')
  })
})
```

- [ ] **Step 6: Update the trade fixture helper in the rule engine test**

In `src/main/ruleEngine/computeRuleStatus.test.ts`, find the `function trade(pnl: number, entryTime: string): Trade { ... }` helper and replace its `notes: null,` line with:
```ts
    setupThesis: null,
    executionNotes: null,
    lessonsLearned: null,
    brainstorm: null,
```

- [ ] **Step 7: Update the trade fixture helper in CalendarView.test.tsx**

In `src/renderer/src/views/CalendarView.test.tsx`, find the `function trade(overrides: Partial<Trade>): Trade { ... }` helper and replace its `notes: null,` line with:
```ts
    setupThesis: null,
    executionNotes: null,
    lessonsLearned: null,
    brainstorm: null,
```

- [ ] **Step 8: Update the trade fixture helper in shared/calendar.test.ts**

In `src/shared/calendar.test.ts`, find the `function trade(overrides: Partial<Trade>): Trade { ... }` helper and replace its `notes: null,` line with:
```ts
    setupThesis: null,
    executionNotes: null,
    lessonsLearned: null,
    brainstorm: null,
```

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm run typecheck && npm test -- run`
Expected: typecheck exits 0; all tests pass (existing + the 5 new trades.repo tests).

- [ ] **Step 10: Commit**

```bash
git add src/shared/types.ts src/main/db/schema.ts src/main/db/trades.repo.ts src/main/db/trades.repo.test.ts src/main/ruleEngine/computeRuleStatus.test.ts src/renderer/src/views/CalendarView.test.tsx src/shared/calendar.test.ts
git commit -m "feat: manual trade P&L, structured reflection fields, delete/update"
```

---

### Task 2: Account deletion

**Files:**
- Modify: `src/main/db/accounts.repo.ts`
- Modify: `src/main/db/accounts.repo.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `deleteAccount(db, id: number, options: { withTrades: boolean }): void`. Task 4's IPC handler and Task 6's UI call this exact name/signature.

- [ ] **Step 1: Write the failing tests**

Append to `src/main/db/accounts.repo.test.ts` (inside the existing `describe('accounts.repo', ...)` block, alongside the existing test — check the file first for the exact existing structure and add these as new `it(...)` blocks using the same `beforeEach`-created `db`):
```ts
  it('deletes an account with no trades', () => {
    const profile = createRuleProfile(db, {
      name: 'Topstep 50K',
      drawdownType: 'static',
      drawdownAmount: 2000,
      dailyLossLimit: 1000,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: null
    })
    const account = createAccount(db, {
      firmName: 'Topstep',
      accountName: '50K Combine',
      startingBalance: 50000,
      currency: 'USD',
      status: 'evaluation',
      ruleProfileId: profile.id
    })

    deleteAccount(db, account.id, { withTrades: false })

    expect(getAccount(db, account.id)).toBeUndefined()
    const profileRow = db.prepare('SELECT * FROM rule_profiles WHERE id = ?').get(profile.id)
    expect(profileRow).toBeUndefined()
  })

  it('throws and deletes nothing when the account has trades and withTrades is false', () => {
    const profile = createRuleProfile(db, {
      name: 'Apex 150K',
      drawdownType: 'trailing',
      drawdownAmount: 5000,
      dailyLossLimit: 2500,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: null
    })
    const account = createAccount(db, {
      firmName: 'Apex',
      accountName: '150K Eval',
      startingBalance: 150000,
      currency: 'USD',
      status: 'evaluation',
      ruleProfileId: profile.id
    })
    createTrade(db, {
      accountId: account.id,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 1,
      pnl: 10,
      rMultiple: null,
      setupThesis: null,
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: []
    })

    expect(() => deleteAccount(db, account.id, { withTrades: false })).toThrow(/trade/)
    expect(getAccount(db, account.id)).toBeDefined()
    expect(listTradesForAccount(db, account.id)).toHaveLength(1)
  })

  it('deletes an account and all its trades when withTrades is true', () => {
    const profile = createRuleProfile(db, {
      name: 'Apex 150K',
      drawdownType: 'trailing',
      drawdownAmount: 5000,
      dailyLossLimit: 2500,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: null
    })
    const account = createAccount(db, {
      firmName: 'Apex',
      accountName: '150K Eval',
      startingBalance: 150000,
      currency: 'USD',
      status: 'evaluation',
      ruleProfileId: profile.id
    })
    const trade = createTrade(db, {
      accountId: account.id,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 1,
      pnl: 10,
      rMultiple: null,
      setupThesis: null,
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: []
    })

    deleteAccount(db, account.id, { withTrades: true })

    expect(getAccount(db, account.id)).toBeUndefined()
    const tradeRow = db.prepare('SELECT * FROM trades WHERE id = ?').get(trade.id)
    expect(tradeRow).toBeUndefined()
  })
```
Add the necessary imports at the top of the test file if not already present: `createTrade` from `./trades.repo`, `listTradesForAccount` from `./trades.repo`, `deleteAccount` from `./accounts.repo` (alongside the existing `createAccount`/`getAccount` import).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/db/accounts.repo.test.ts`
Expected: FAIL — `deleteAccount` does not exist.

- [ ] **Step 3: Implement deleteAccount**

Append to `src/main/db/accounts.repo.ts`:
```ts
export function deleteAccount(
  db: Database.Database,
  id: number,
  options: { withTrades: boolean }
): void {
  const account = getAccount(db, id)
  if (!account) throw new Error(`Account ${id} not found`)

  const tradeCount = (
    db.prepare('SELECT COUNT(*) as count FROM trades WHERE account_id = ?').get(id) as {
      count: number
    }
  ).count

  if (tradeCount > 0 && !options.withTrades) {
    throw new Error(
      `Account ${id} has ${tradeCount} trade(s); pass withTrades: true to delete them too`
    )
  }

  const runInTransaction = db.transaction(() => {
    const tradeIds = (
      db.prepare('SELECT id FROM trades WHERE account_id = ?').all(id) as { id: number }[]
    ).map((row) => row.id)
    for (const tradeId of tradeIds) {
      db.prepare('DELETE FROM trade_tags WHERE trade_id = ?').run(tradeId)
    }
    db.prepare('DELETE FROM trades WHERE account_id = ?').run(id)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    db.prepare('DELETE FROM rule_profiles WHERE id = ?').run(account.ruleProfileId)
  })
  runInTransaction()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/db/accounts.repo.test.ts`
Expected: PASS, all cases including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/accounts.repo.ts src/main/db/accounts.repo.test.ts
git commit -m "feat: account deletion with explicit trade-cascade choice"
```

---

### Task 3: Journal entry deletion

**Files:**
- Modify: `src/main/db/journalEntries.repo.ts`
- Modify: `src/main/db/journalEntries.repo.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `deleteJournalEntry(db, date: string): void`. Task 4's IPC handler and Task 7's UI call this exact name/signature — note it's keyed by `date`, not `id`, since both UI call sites naturally have the date on hand and `date` is the table's unique key.

- [ ] **Step 1: Write the failing test**

Append to `src/main/db/journalEntries.repo.test.ts` (inside the existing `describe(...)` block, alongside the existing tests):
```ts
  it('deletes an entry by date', () => {
    upsertJournalEntry(db, { date: '2026-08-13', content: '[]' })

    deleteJournalEntry(db, '2026-08-13')

    expect(getJournalEntryByDate(db, '2026-08-13')).toBeUndefined()
    expect(listJournalEntries(db)).toHaveLength(0)
  })

  it('deleting a nonexistent date is a no-op, not an error', () => {
    expect(() => deleteJournalEntry(db, '2026-01-01')).not.toThrow()
  })
```
Add `deleteJournalEntry` to the existing import from `./journalEntries.repo` at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/main/db/journalEntries.repo.test.ts`
Expected: FAIL — `deleteJournalEntry` does not exist.

- [ ] **Step 3: Implement deleteJournalEntry**

Append to `src/main/db/journalEntries.repo.ts`:
```ts
export function deleteJournalEntry(db: Database.Database, date: string): void {
  db.prepare('DELETE FROM journal_entries WHERE date = ?').run(date)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/main/db/journalEntries.repo.test.ts`
Expected: PASS, all cases including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/journalEntries.repo.ts src/main/db/journalEntries.repo.test.ts
git commit -m "feat: journal entry deletion by date"
```

---

### Task 4: IPC wiring and preload

**Files:**
- Modify: `src/main/ipc/registerHandlers.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `deleteTrade`, `updateTradeReflection` (Task 1), `deleteAccount` (Task 2), `deleteJournalEntry` (Task 3).
- Produces: IPC channels `trades:delete`, `trades:update`, `accounts:delete`, `journalEntries:delete`. Preload exposes `window.api.trades.{delete,update}`, `window.api.accounts.delete`, `window.api.journalEntries.delete`. Task 5/6/7's UI calls these exact names.

- [ ] **Step 1: Register the new handlers**

In `src/main/ipc/registerHandlers.ts`, add to the imports:
```ts
import { createTrade, listTradesForAccount, listAllTrades, deleteTrade, updateTradeReflection } from '../db/trades.repo'
import { deleteAccount } from '../db/accounts.repo'
import { deleteJournalEntry } from '../db/journalEntries.repo'
import type { UpdateTradeReflection } from '../../shared/types'
```
(merge with the existing `trades.repo`/`accounts.repo`/`journalEntries.repo`/type imports already present rather than duplicating import statements — check the current file and combine into the existing `import { ... } from '../db/trades.repo'` etc. lines.)

Add inside `registerHandlers(db)`, alongside the existing `trades:*` handlers:
```ts
  ipcMain.handle('trades:delete', (_e, id: number) => deleteTrade(db, id))
  ipcMain.handle('trades:update', (_e, id: number, updates: UpdateTradeReflection) =>
    updateTradeReflection(db, id, updates)
  )
```
Alongside the existing `accounts:*` handlers:
```ts
  ipcMain.handle('accounts:delete', (_e, id: number, withTrades: boolean) =>
    deleteAccount(db, id, { withTrades })
  )
```
Alongside the existing `journalEntries:*` handlers:
```ts
  ipcMain.handle('journalEntries:delete', (_e, date: string) => deleteJournalEntry(db, date))
```

- [ ] **Step 2: Expose the new methods from preload**

In `src/preload/index.ts`, add `UpdateTradeReflection` to the type import from `../shared/types`. Then update the `trades`, `accounts`, and `journalEntries` namespaces in the `api` object:
```ts
  trades: {
    listForAccount: (accountId: number): Promise<Trade[]> =>
      ipcRenderer.invoke('trades:listForAccount', accountId),
    create: (trade: NewTrade): Promise<Trade> => ipcRenderer.invoke('trades:create', trade),
    listAll: (): Promise<Trade[]> => ipcRenderer.invoke('trades:listAll'),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('trades:delete', id),
    update: (id: number, updates: UpdateTradeReflection): Promise<Trade> =>
      ipcRenderer.invoke('trades:update', id, updates)
  },
```
```ts
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    create: (account: NewAccount): Promise<Account> =>
      ipcRenderer.invoke('accounts:create', account),
    delete: (id: number, withTrades: boolean): Promise<void> =>
      ipcRenderer.invoke('accounts:delete', id, withTrades)
  },
```
```ts
  journalEntries: {
    getByDate: (date: string): Promise<JournalEntry | undefined> =>
      ipcRenderer.invoke('journalEntries:getByDate', date),
    upsert: (entry: NewJournalEntry): Promise<JournalEntry> =>
      ipcRenderer.invoke('journalEntries:upsert', entry),
    list: (): Promise<JournalEntry[]> => ipcRenderer.invoke('journalEntries:list'),
    delete: (date: string): Promise<void> => ipcRenderer.invoke('journalEntries:delete', date)
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/registerHandlers.ts src/preload/index.ts
git commit -m "feat: wire trade/account/journal-entry delete and trade-update IPC"
```

---

### Task 5: Trade Log UI — manual P&L, reflection fields, delete

**Files:**
- Modify: `src/renderer/src/views/TradeQuickAddForm.tsx`
- Create: `src/renderer/src/views/TradeRow.tsx`
- Modify: `src/renderer/src/views/TradeLogView.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.trades.{create,delete,update}` (Task 4).
- Produces: `<TradeRow trade={Trade} onChanged={() => void} onError={(message: string) => void} />` — no further consumers in this plan.

- [ ] **Step 1: Invoke the interface-design skill**

Before writing any component code, invoke the `interface-design` skill (it reads `.interface-design/system.md` automatically) with this context: FlowState's Trade Log needs (a) a manual P&L input added to the existing keyboard-first quick-add form, (b) a per-row expand/collapse affordance revealing four labeled text areas (Setup/Thesis, Execution Notes, Lessons Learned, Brainstorm) with a save action, and (c) a delete action per row. Ask it to review/refine the baseline markup and CSS in Steps 2-4 below against the locked design system before you finalize them — adjust class names, spacing, or the expand/collapse interaction pattern as it recommends, as long as the underlying data flow (props, IPC calls) stays the same.

- [ ] **Step 2: Add the manual P&L field to the quick-add form**

Modify `src/renderer/src/views/TradeQuickAddForm.tsx`:
```tsx
import { useState } from 'react'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
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
  const [pnl, setPnl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const now = new Date().toISOString()
    try {
      setError(null)
      await flowStateApi.trades.create({
        accountId,
        instrument,
        side,
        entryPrice: Number(entryPrice),
        exitPrice: Number(exitPrice),
        entryTime: now,
        exitTime: now,
        size: Number(size),
        pnl: Number(pnl),
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        screenshotPaths: [],
        tagIds: []
      })
      setInstrument('')
      setEntryPrice('')
      setExitPrice('')
      setPnl('')
      onCreated()
    } catch (err) {
      setError(`Could not log trade: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="trade-quick-add">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <input
        autoFocus
        placeholder="Instrument (ES)"
        value={instrument}
        onChange={(e) => setInstrument(e.target.value)}
        required
      />
      <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)}>
        <option value="long">Long</option>
        <option value="short">Short</option>
      </select>
      <input
        type="number"
        placeholder="Size"
        value={size}
        onChange={(e) => setSize(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.01"
        placeholder="Entry"
        value={entryPrice}
        onChange={(e) => setEntryPrice(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.01"
        placeholder="Exit"
        value={exitPrice}
        onChange={(e) => setExitPrice(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.01"
        placeholder="P&L ($)"
        value={pnl}
        onChange={(e) => setPnl(e.target.value)}
        required
      />
      <button type="submit">Log trade</button>
    </form>
  )
}
```

- [ ] **Step 3: Create the TradeRow component**

`src/renderer/src/views/TradeRow.tsx`:
```tsx
import { useState } from 'react'
import { flowStateApi } from '../api/client'
import type { Trade, UpdateTradeReflection } from '../../../shared/types'

interface TradeRowProps {
  trade: Trade
  onChanged: () => void
  onError: (message: string) => void
}

export function TradeRow({ trade, onChanged, onError }: TradeRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [setupThesis, setSetupThesis] = useState(trade.setupThesis ?? '')
  const [executionNotes, setExecutionNotes] = useState(trade.executionNotes ?? '')
  const [lessonsLearned, setLessonsLearned] = useState(trade.lessonsLearned ?? '')
  const [brainstorm, setBrainstorm] = useState(trade.brainstorm ?? '')

  async function handleSave(): Promise<void> {
    const updates: UpdateTradeReflection = {
      setupThesis: setupThesis.trim() || null,
      executionNotes: executionNotes.trim() || null,
      lessonsLearned: lessonsLearned.trim() || null,
      brainstorm: brainstorm.trim() || null
    }
    try {
      await flowStateApi.trades.update(trade.id, updates)
      onChanged()
    } catch (err) {
      onError(`Could not save trade notes: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm('Delete this trade? This cannot be undone.')) return
    try {
      await flowStateApi.trades.delete(trade.id)
      onChanged()
    } catch (err) {
      onError(`Could not delete trade: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <>
      <tr>
        <td>{trade.instrument}</td>
        <td>{trade.side}</td>
        <td>{trade.size}</td>
        <td>{trade.entryPrice}</td>
        <td>{trade.exitPrice}</td>
        <td className={trade.pnl >= 0 ? 'pos' : 'neg'}>{trade.pnl.toFixed(2)}</td>
        <td className="trade-row-actions">
          <button
            type="button"
            className="trade-row-expand"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse trade details' : 'Expand trade details'}
          >
            {expanded ? '▾' : '▸'}
          </button>
          <button
            type="button"
            className="trade-row-delete"
            onClick={handleDelete}
            aria-label={`Delete trade ${trade.instrument}`}
          >
            ×
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="trade-row-detail">
          <td colSpan={7}>
            <div className="trade-row-fields">
              <div className="field">
                <label className="field-label" htmlFor={`setup-${trade.id}`}>
                  Setup / Thesis
                </label>
                <textarea
                  id={`setup-${trade.id}`}
                  value={setupThesis}
                  onChange={(e) => setSetupThesis(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`execution-${trade.id}`}>
                  Execution Notes
                </label>
                <textarea
                  id={`execution-${trade.id}`}
                  value={executionNotes}
                  onChange={(e) => setExecutionNotes(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`lessons-${trade.id}`}>
                  Lessons Learned
                </label>
                <textarea
                  id={`lessons-${trade.id}`}
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`brainstorm-${trade.id}`}>
                  Brainstorm
                </label>
                <textarea
                  id={`brainstorm-${trade.id}`}
                  value={brainstorm}
                  onChange={(e) => setBrainstorm(e.target.value)}
                />
              </div>
              <button type="button" className="trade-row-save" onClick={() => void handleSave()}>
                Save notes
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
```

- [ ] **Step 4: Wire TradeRow into TradeLogView**

Modify `src/renderer/src/views/TradeLogView.tsx` — import `TradeRow`, add an "Actions" header cell, and replace the inline `<tr>` mapping with `<TradeRow>`:
```tsx
import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { TradeQuickAddForm } from './TradeQuickAddForm'
import { TradeRow } from './TradeRow'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Account, Trade } from '../../../shared/types'

export function TradeLogView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadAccounts(): Promise<void> {
      try {
        setError(null)
        const list = await flowStateApi.accounts.list()
        setAccounts(list)
        if (list.length > 0) setSelectedAccountId(list[0].id)
      } catch (e) {
        setError(`Could not load accounts: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    loadAccounts()
  }, [])

  async function refreshTrades(accountId: number): Promise<void> {
    try {
      setError(null)
      setTrades(await flowStateApi.trades.listForAccount(accountId))
    } catch (e) {
      setError(`Could not load trades: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    if (selectedAccountId !== null) refreshTrades(selectedAccountId)
  }, [selectedAccountId])

  if (accounts.length === 0) {
    return (
      <div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <p style={{ color: 'var(--text-secondary)' }}>Create an account first.</p>
      </div>
    )
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
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
        <TradeQuickAddForm
          accountId={selectedAccountId}
          onCreated={() => refreshTrades(selectedAccountId)}
        />
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <TradeRow
              key={t.id}
              trade={t}
              onChanged={() => selectedAccountId !== null && refreshTrades(selectedAccountId)}
              onError={setError}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Add CSS for the row actions and expand-out**

Append to `src/renderer/src/styles/tokens.css` (adjust based on the interface-design skill's Step 1 recommendations, but land on something functionally equivalent to this baseline if no changes are suggested):
```css
.trade-row-actions { display: flex; gap: 4px; }
.trade-row-expand, .trade-row-delete { background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; padding: 2px 4px; }
.trade-row-expand:hover { color: var(--text-primary); }
.trade-row-delete:hover { color: var(--pnl-neg); }
.trade-row-detail td { padding: 12px; background: var(--surface-1); border-bottom: 1px solid var(--border-soft); }
.trade-row-fields { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.trade-row-fields .field { display: flex; flex-direction: column; gap: 4px; }
.trade-row-fields textarea { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: var(--sans); font-size: 13px; color: var(--text-primary); resize: vertical; min-height: 60px; }
.trade-row-fields textarea:focus { outline: none; border-color: var(--accent); }
.trade-row-save { grid-column: span 2; justify-self: start; background: var(--accent); border: none; border-radius: 6px; padding: 8px 16px; font-family: var(--sans); font-size: 13px; font-weight: 500; color: var(--bg); cursor: pointer; }
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck && npm test -- run`
Expected: typecheck exits 0; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/TradeQuickAddForm.tsx src/renderer/src/views/TradeRow.tsx src/renderer/src/views/TradeLogView.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: manual P&L, editable reflection fields, and delete in Trade Log"
```

---

### Task 6: Account deletion UI

**Files:**
- Modify: `src/renderer/src/views/AccountsView.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.trades.listForAccount`, `flowStateApi.accounts.delete` (Task 4).
- Produces: nothing consumed elsewhere in this plan.

- [ ] **Step 1: Invoke the interface-design skill**

Invoke the `interface-design` skill with this context: the Accounts view needs a delete action per account, next to its existing `DrawdownGauge` card, with a confirmation that — when the account has trades — explicitly states how many and asks whether to delete them too. Ask it to review the baseline markup/CSS in Steps 2-3 against `.interface-design/system.md` before finalizing.

- [ ] **Step 2: Add the delete handler and button**

Modify `src/renderer/src/views/AccountsView.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { AccountForm } from './AccountForm'
import { DrawdownGauge } from '../components/DrawdownGauge'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Account, RuleStatus } from '../../../shared/types'

export function AccountsView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [statuses, setStatuses] = useState<Record<number, RuleStatus>>({})
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      setError(null)
      const list = await flowStateApi.accounts.list()
      setAccounts(list)
      const entries = await Promise.all(
        list.map(async (a) => [a.id, await flowStateApi.ruleStatus.get(a.id)] as const)
      )
      setStatuses(Object.fromEntries(entries))
    } catch (e) {
      setError(`Could not load accounts: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDeleteAccount(account: Account): Promise<void> {
    try {
      const trades = await flowStateApi.trades.listForAccount(account.id)
      const confirmText =
        trades.length > 0
          ? `This account has ${trades.length} trade(s). Delete the account and all ${trades.length} trade(s)? This cannot be undone.`
          : `Delete ${account.firmName} ${account.accountName}? This cannot be undone.`
      if (!window.confirm(confirmText)) return
      await flowStateApi.accounts.delete(account.id, trades.length > 0)
      refresh()
    } catch (err) {
      setError(`Could not delete account: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase'
        }}
      >
        Accounts
      </h2>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <AccountForm onCreated={refresh} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {accounts.map((account) => {
          const status = statuses[account.id]
          if (!status) return null
          return (
            <div key={account.id} className="account-card">
              <DrawdownGauge
                firmLabel={`${account.firmName} · ${account.accountName}`}
                accountLabel={
                  status.drawdownType === 'trailing' ? 'Trailing Drawdown' : 'Static Drawdown'
                }
                usedAmount={status.drawdownUsed}
                limitAmount={status.drawdownAmount}
                highWaterMark={status.highWaterMark}
              />
              <button
                type="button"
                className="account-delete"
                onClick={() => handleDeleteAccount(account)}
                aria-label={`Delete account ${account.firmName} ${account.accountName}`}
              >
                Delete account
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add CSS for the account card and delete button**

Append to `src/renderer/src/styles/tokens.css` (adjust per the interface-design skill's recommendations from Step 1):
```css
.account-card { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.account-delete { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; font-family: var(--sans); font-size: 12px; color: var(--text-muted); cursor: pointer; }
.account-delete:hover { color: var(--pnl-neg); border-color: var(--pnl-neg); }
```

- [ ] **Step 4: Typecheck and run the full suite**

Run: `npm run typecheck && npm test -- run`
Expected: typecheck exits 0; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/AccountsView.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: account deletion UI with trade-count-aware confirmation"
```

---

### Task 7: Journal entry deletion UI

**Files:**
- Modify: `src/renderer/src/views/JournalView.tsx`
- Modify: `src/renderer/src/views/CalendarView.tsx`
- Modify: `src/renderer/src/styles/tokens.css`

**Interfaces:**
- Consumes: `flowStateApi.journalEntries.delete` (Task 4).
- Produces: nothing consumed elsewhere in this plan — final task.

- [ ] **Step 1: Invoke the interface-design skill**

Invoke the `interface-design` skill with this context: both the Journal section's entry list and the Calendar view's day panel need a delete action for a journal entry, following the existing journal-template-delete `×`-button precedent already in `JournalView.tsx`. Ask it to review the baseline markup/CSS in Steps 2-4 against `.interface-design/system.md` before finalizing.

- [ ] **Step 2: Add delete to the Journal section's entry list**

Modify `src/renderer/src/views/JournalView.tsx` — add a `handleDeleteEntry` function and a delete button per entry list item. Add this function alongside the existing `deleteTemplate` function:
```ts
  async function handleDeleteEntry(date: string): Promise<void> {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return
    try {
      await flowStateApi.journalEntries.delete(date)
      refreshEntries()
    } catch (err) {
      setError(`Could not delete journal entry: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
```
Replace the existing entry list rendering:
```tsx
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
```
with:
```tsx
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
              <button
                type="button"
                className="journal-entry-delete"
                onClick={() => handleDeleteEntry(entry.date)}
                aria-label={`Delete journal entry ${entry.date}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
```

- [ ] **Step 3: Add delete to the Calendar view's entry panel**

Modify `src/renderer/src/views/CalendarView.tsx` — add an `entryRefreshKey` state (forces `JournalEntryEditor` to remount and re-fetch after a delete, since the `date` itself doesn't change) and a delete handler, and update the entry panel's rendering:
```tsx
  const [entryRefreshKey, setEntryRefreshKey] = useState(0)
```
(add this alongside the existing `selectedDate` state declaration)
```ts
  async function handleDeleteEntry(date: string): Promise<void> {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return
    try {
      await flowStateApi.journalEntries.delete(date)
      setEntryRefreshKey((k) => k + 1)
    } catch (err) {
      setError(`Could not delete journal entry: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
```
(you'll need to add `error`/`setError` state and render an `ErrorBanner` if `CalendarView` doesn't already have them — check the current file; if it already has an `error` state from an earlier task, reuse it instead of adding a second one)

Replace the existing entry panel:
```tsx
      {selectedDate && (
        <div className="calendar-entry-panel">
          <h3 className="calendar-entry-heading">{selectedDate}</h3>
          <JournalEntryEditor date={selectedDate} />
        </div>
      )}
```
with:
```tsx
      {selectedDate && (
        <div className="calendar-entry-panel">
          <div className="calendar-entry-panel-header">
            <h3 className="calendar-entry-heading">{selectedDate}</h3>
            <button
              type="button"
              className="calendar-entry-delete"
              onClick={() => handleDeleteEntry(selectedDate)}
            >
              Delete entry
            </button>
          </div>
          <JournalEntryEditor date={selectedDate} key={`${selectedDate}-${entryRefreshKey}`} />
        </div>
      )}
```

- [ ] **Step 4: Add CSS for the new delete buttons**

Append to `src/renderer/src/styles/tokens.css` (adjust per the interface-design skill's recommendations from Step 1):
```css
.journal-entry-list li { display: flex; align-items: center; gap: 4px; }
.journal-entry-list .journal-entry-item { flex: 1; }
.journal-entry-delete { background: none; border: none; color: var(--text-muted); font-size: 14px; cursor: pointer; padding: 0 4px; }
.journal-entry-delete:hover { color: var(--pnl-neg); }
.calendar-entry-panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.calendar-entry-panel-header .calendar-entry-heading { margin: 0; }
.calendar-entry-delete { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; font-family: var(--sans); font-size: 12px; color: var(--text-muted); cursor: pointer; }
.calendar-entry-delete:hover { color: var(--pnl-neg); border-color: var(--pnl-neg); }
```
(the existing `.calendar-entry-heading` rule already sets `margin: 0 0 12px` — the override above removes the bottom margin since the header row's `margin-bottom` now handles that spacing; check the existing rule and adjust rather than duplicating a conflicting margin.)

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npm run typecheck && npm test -- run`
Expected: typecheck exits 0; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/views/JournalView.tsx src/renderer/src/views/CalendarView.tsx src/renderer/src/styles/tokens.css
git commit -m "feat: journal entry deletion in Journal section and Calendar view"
```

---

## Self-Review

**Spec coverage:**
- Manual P&L (kept entry/exit/size for context) — Task 1 (schema/repo), Task 5 (form). ✓
- Four structured reflection fields replacing `notes` — Task 1 (schema/types/repo), Task 5 (UI). ✓
- Backward-compatible migration preserving existing `notes` content — Task 1. ✓
- Trade delete — Task 1 (repo), Task 4 (IPC), Task 5 (UI). ✓
- Journal entry delete — Task 3 (repo), Task 4 (IPC), Task 7 (UI, both Journal section and Calendar). ✓
- Account delete with explicit trade-count prompt — Task 2 (repo), Task 4 (IPC), Task 6 (UI). ✓
- Templates already deletable — confirmed unchanged, no task needed. ✓
- `interface-design` skill used for new UI — explicit Step 1 in Tasks 5, 6, 7. ✓
- ErrorBanner convention on every new async call — Tasks 5, 6, 7 all wrap calls in try/catch feeding `setError`. ✓

**Placeholder scan:** no TBD/TODO; every step has runnable code or exact commands. The interface-design skill invocation steps intentionally leave room for that skill's own judgment on exact class names/spacing, but always land on a concrete, working CSS/markup baseline as the floor — not an open-ended "make it nice."

**Type consistency:** `Trade`/`NewTrade`/`UpdateTradeReflection` defined once in Task 1, used identically in Task 1's repo, Task 4's IPC/preload, and Task 5's `TradeRow`. `deleteAccount(db, id, { withTrades })` signature matches between Task 2's definition, Task 4's IPC handler, and Task 6's `flowStateApi.accounts.delete(id, withTrades: boolean)` call (boolean argument order/shape consistent across the IPC boundary). `deleteJournalEntry(db, date)` keyed by date consistently in Task 3, Task 4, and both Task 7 call sites.
