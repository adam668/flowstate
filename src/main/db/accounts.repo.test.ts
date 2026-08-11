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
