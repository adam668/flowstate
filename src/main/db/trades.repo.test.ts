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
    // Create first trade (long)
    const trade1 = createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 2,
      rMultiple: 2.5,
      notes: 'Setup trade',
      screenshotPaths: [],
      tagIds: []
    })

    // Create second trade (short) and verify its pnl
    const trade2 = createTrade(db, {
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

    expect(trade2.pnl).toBe(-20)
    expect(listTradesForAccount(db, accountId)).toHaveLength(2)
  })
})
