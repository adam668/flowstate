import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from '../db/connection'
import { createRuleProfile } from '../db/ruleProfiles.repo'
import { createAccount } from '../db/accounts.repo'
import { createTrade } from '../db/trades.repo'
import { toLocalDateString } from '../../shared/date'
import type { RuleStatus } from '../../shared/types'

// Capture every handler registered via ipcMain.handle so we can invoke them directly.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown): void => {
      handlers.set(channel, fn)
    }
  }
}))

// Wrap the real rule engine so we can assert the exact asOfDate the handler computes.
const computeRuleStatusSpy = vi.fn()
vi.mock('../ruleEngine/computeRuleStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ruleEngine/computeRuleStatus')>()
  return {
    computeRuleStatus: (...args: Parameters<typeof actual.computeRuleStatus>) => {
      computeRuleStatusSpy(...args)
      return actual.computeRuleStatus(...args)
    }
  }
})

// Imported after the mock so registerHandlers picks up the mocked ipcMain.
const { registerHandlers } = await import('./registerHandlers')

function invoke<T>(channel: string, ...args: unknown[]): T {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler(null, ...args) as T
}

describe('registerHandlers', () => {
  let db: Database.Database
  let accountId: number

  beforeEach(() => {
    handlers.clear()
    computeRuleStatusSpy.mockClear()
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
    registerHandlers(db)
  })

  it('registers every IPC channel the preload API calls', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        'accounts:create',
        'accounts:delete',
        'accounts:list',
        'journalEntries:delete',
        'journalEntries:getByDate',
        'journalEntries:list',
        'journalEntries:upsert',
        'journalTemplates:create',
        'journalTemplates:delete',
        'journalTemplates:list',
        'journalTemplates:update',
        'ruleProfiles:create',
        'ruleStatus:get',
        'tags:getOrCreate',
        'tags:list',
        'trades:create',
        'trades:delete',
        'trades:listAll',
        'trades:listForAccount',
        'trades:update'
      ].sort()
    )
  })

  it('computes ruleStatus against the local calendar day, counting a trade exiting today', () => {
    // Exit "now" — whatever the local day is, the handler must attribute it to today.
    const now = new Date()
    createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 4990,
      entryTime: now.toISOString(),
      exitTime: now.toISOString(),
      size: 1,
      pnl: -10,
      rMultiple: null,
      setupThesis: null,
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: []
    })

    const status = invoke<RuleStatus>('ruleStatus:get', accountId)
    expect(status.accountId).toBe(accountId)
    expect(status.todayPnl).toBeLessThan(0)
    expect(status.todayPnl).toBe(status.currentBalance - 150000)
  })

  it('does not count a trade that exited on a different local day toward todayPnl', () => {
    // 48h ago is unambiguously a different local calendar day in every timezone.
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    expect(toLocalDateString(twoDaysAgo)).not.toBe(toLocalDateString(new Date()))
    createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 4990,
      entryTime: twoDaysAgo.toISOString(),
      exitTime: twoDaysAgo.toISOString(),
      size: 1,
      pnl: -10,
      rMultiple: null,
      setupThesis: null,
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: []
    })

    const status = invoke<RuleStatus>('ruleStatus:get', accountId)
    expect(status.todayPnl).toBe(0)
    // ...but it still moved the balance, so it is a real trade, just not today's.
    expect(status.currentBalance).toBeLessThan(150000)
  })

  it('passes the rule profile drawdown type and amount through to the status', () => {
    const status = invoke<RuleStatus>('ruleStatus:get', accountId)
    expect(status.drawdownType).toBe('trailing')
    expect(status.drawdownAmount).toBe(5000)
  })

  it('calls computeRuleStatus with the local calendar day as asOfDate', () => {
    invoke<RuleStatus>('ruleStatus:get', accountId)
    expect(computeRuleStatusSpy).toHaveBeenCalledTimes(1)
    const asOfDate = computeRuleStatusSpy.mock.calls[0][3]
    expect(asOfDate).toBe(toLocalDateString(new Date()))
    // Guard the regression this replaced: the UTC slice, not the local day.
    expect(asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('throws a descriptive error for an unknown account', () => {
    expect(() => invoke<RuleStatus>('ruleStatus:get', 9999)).toThrow(/Account 9999 not found/)
  })
})
