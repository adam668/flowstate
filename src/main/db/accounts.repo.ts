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
