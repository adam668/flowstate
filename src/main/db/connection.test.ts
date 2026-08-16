import { describe, it, expect } from 'vitest'
import { createConnection } from './connection'
import { applySchema } from './schema'
import { createRuleProfile } from './ruleProfiles.repo'
import { createAccount } from './accounts.repo'

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

describe('applySchema migration idempotency', () => {
  it('backfills execution_notes from a pre-migration-style row on re-run, and never re-copies or errors on subsequent runs', () => {
    // createConnection already calls applySchema once, adding the new
    // reflection columns to the (empty) trades table.
    const db = createConnection(':memory:')

    const profile = createRuleProfile(db, {
      name: 'Apex 150K',
      drawdownType: 'trailing',
      drawdownAmount: 5000,
      dailyLossLimit: 2500,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: 9000
    })
    const accountId = createAccount(db, {
      firmName: 'Apex',
      accountName: '150K Eval #2',
      startingBalance: 150000,
      currency: 'USD',
      status: 'evaluation',
      ruleProfileId: profile.id
    }).id

    // Insert a trade row directly via raw SQL, bypassing trades.repo (which
    // no longer writes to `notes`), to simulate a row created by the
    // pre-migration app version: `notes` populated, `execution_notes` unset.
    const info = db
      .prepare(
        `
      INSERT INTO trades
        (account_id, instrument, side, entry_price, exit_price, entry_time, exit_time, size, pnl, notes, screenshot_paths)
      VALUES
        (?, 'ES', 'long', 5000, 5010, '2026-08-11T13:35:00Z', '2026-08-11T13:50:00Z', 2, 20, 'Original freeform notes', '[]')
    `
      )
      .run(accountId)
    const tradeId = Number(info.lastInsertRowid)

    const beforeMigration = db
      .prepare('SELECT notes, execution_notes FROM trades WHERE id = ?')
      .get(tradeId) as { notes: string; execution_notes: string | null }
    expect(beforeMigration.notes).toBe('Original freeform notes')
    expect(beforeMigration.execution_notes).toBeNull()

    // Simulate the app restarting: applySchema runs again against a db that
    // already has the new columns and now has a row needing backfill.
    expect(() => applySchema(db)).not.toThrow()

    const afterSecondRun = db
      .prepare('SELECT execution_notes FROM trades WHERE id = ?')
      .get(tradeId) as { execution_notes: string | null }
    expect(afterSecondRun.execution_notes).toBe('Original freeform notes')

    // Simulate the user editing the reflection field after migration —
    // execution_notes now diverges from the original notes value.
    db.prepare('UPDATE trades SET execution_notes = ? WHERE id = ?').run(
      'Edited after migration',
      tradeId
    )

    // A third applySchema call (another app restart) must not re-add the
    // already-present columns (implicit: no error thrown) and must not
    // overwrite the user's edit by re-copying from `notes` — the WHERE
    // clause guard only backfills when execution_notes is null/empty.
    expect(() => applySchema(db)).not.toThrow()

    const afterThirdRun = db
      .prepare('SELECT notes, execution_notes FROM trades WHERE id = ?')
      .get(tradeId) as { notes: string; execution_notes: string | null }
    expect(afterThirdRun.execution_notes).toBe('Edited after migration')
    expect(afterThirdRun.notes).toBe('Original freeform notes')
  })
})
