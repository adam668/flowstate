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
  const rMultiple = updates.rMultiple !== undefined ? updates.rMultiple : existing.r_multiple
  const setupThesis = updates.setupThesis !== undefined ? updates.setupThesis : existing.setup_thesis
  const executionNotes =
    updates.executionNotes !== undefined ? updates.executionNotes : existing.execution_notes
  const lessonsLearned =
    updates.lessonsLearned !== undefined ? updates.lessonsLearned : existing.lessons_learned
  const brainstorm = updates.brainstorm !== undefined ? updates.brainstorm : existing.brainstorm

  db.prepare(
    `
    UPDATE trades
    SET pnl = ?, r_multiple = ?, setup_thesis = ?, execution_notes = ?, lessons_learned = ?, brainstorm = ?
    WHERE id = ?
  `
  ).run(pnl, rMultiple, setupThesis, executionNotes, lessonsLearned, brainstorm, id)

  return toTrade(db, db.prepare('SELECT * FROM trades WHERE id = ?').get(id))
}
