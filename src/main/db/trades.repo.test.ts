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
