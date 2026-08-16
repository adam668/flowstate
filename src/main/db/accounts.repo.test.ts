import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { createRuleProfile } from './ruleProfiles.repo'
import { createAccount, listAccounts, getAccount, deleteAccount } from './accounts.repo'
import { createTrade, listTradesForAccount } from './trades.repo'

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
})
