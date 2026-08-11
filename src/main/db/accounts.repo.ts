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
