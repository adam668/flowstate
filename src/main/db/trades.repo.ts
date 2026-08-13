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

export function listAllTrades(db: Database.Database): Trade[] {
  const rows = db.prepare('SELECT * FROM trades ORDER BY entry_time ASC').all()
  return rows.map((row) => toTrade(db, row))
}
