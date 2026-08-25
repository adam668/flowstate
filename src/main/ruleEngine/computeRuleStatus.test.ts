import { describe, it, expect } from 'vitest'
import { computeRuleStatus } from './computeRuleStatus'
import type { Account, RuleProfile, Trade } from '../../shared/types'

const account: Account = {
  id: 1,
  firmName: 'Apex',
  accountName: '150K Eval #2',
  startingBalance: 150000,
  currency: 'USD',
  status: 'evaluation',
  ruleProfileId: 1,
  createdAt: '2026-08-01T00:00:00Z'
}

const ruleProfile: RuleProfile = {
  id: 1,
  name: 'Apex 150K',
  drawdownType: 'trailing',
  drawdownAmount: 5000,
  dailyLossLimit: 2500,
  consistencyPercent: null,
  minTradingDays: null,
  profitTarget: null
}

function trade(pnl: number, entryTime: string): Trade {
  return {
    id: Math.random(),
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5000,
    entryTime,
    exitTime: entryTime,
    size: 1,
    pnl,
    rMultiple: null,
    setupThesis: null,
    executionNotes: null,
    lessonsLearned: null,
    brainstorm: null,
    screenshotPaths: [],
    tagIds: [],
    playbookId: null
  }
}

describe('computeRuleStatus', () => {
  it('reports clean state with no trades', () => {
    const status = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(status.highWaterMark).toBe(150000)
    expect(status.drawdownRemaining).toBe(5000)
    expect(status.drawdownState).toBe('clean')
    expect(status.todayPnl).toBe(0)
  })

  it('tracks trailing high-water mark after a profitable day', () => {
    const trades = [trade(3000, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.highWaterMark).toBe(153000)
    expect(status.drawdownLimit).toBe(148000)
    expect(status.drawdownRemaining).toBe(5000)
  })

  it('flags a warning when within 10% of the trailing drawdown limit', () => {
    const trades = [trade(-4600, '2026-08-11T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.drawdownRemaining).toBe(400)
    expect(status.drawdownState).toBe('warning')
  })

  it('flags a violation when the trailing drawdown limit is breached', () => {
    const trades = [trade(-5100, '2026-08-11T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.drawdownState).toBe('violation')
  })

  it('computes today-only pnl against the daily loss limit', () => {
    const trades = [trade(-1000, '2026-08-10T14:00:00Z'), trade(-300, '2026-08-11T09:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.todayPnl).toBe(-300)
    expect(status.dailyLossRemaining).toBe(2200)
    expect(status.dailyLossState).toBe('clean')
  })

  it('reports dailyLossState as n/a when the profile has no daily loss limit', () => {
    const profileNoLimit: RuleProfile = { ...ruleProfile, dailyLossLimit: null }
    const status = computeRuleStatus(account, profileNoLimit, [], '2026-08-11')
    expect(status.dailyLossState).toBe('n/a')
    expect(status.dailyLossRemaining).toBeNull()
  })

  it('uses static drawdown type based on starting balance, not high-water mark', () => {
    const staticProfile: RuleProfile = { ...ruleProfile, drawdownType: 'static' }
    const trades = [trade(3000, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, staticProfile, trades, '2026-08-11')
    expect(status.highWaterMark).toBe(153000)
    expect(status.drawdownLimit).toBe(145000) // 150000 - 5000, NOT 153000 - 5000
    expect(status.drawdownRemaining).toBe(8000) // 153000 - 145000
  })

  it('reaches exact violation boundary when drawdownRemaining equals zero', () => {
    const trades = [trade(-5000, '2026-08-11T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.drawdownRemaining).toBe(0)
    expect(status.drawdownState).toBe('violation')
  })

  it('reaches exact warning boundary when drawdownRemaining equals 10% of limit', () => {
    const trades = [trade(-4500, '2026-08-11T14:00:00Z')]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.drawdownRemaining).toBe(500) // exactly 10% of 5000
    expect(status.drawdownState).toBe('warning')
  })

  it('computes net pnl correctly with multiple same-day trades', () => {
    const trades = [
      trade(1000, '2026-08-11T09:00:00Z'),
      trade(-300, '2026-08-11T10:00:00Z'),
      trade(200, '2026-08-11T11:00:00Z')
    ]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.todayPnl).toBe(900) // 1000 - 300 + 200
  })

  it('preserves original trades array order (purity check)', () => {
    const originalTrades = [
      trade(100, '2026-08-11T14:00:00Z'),
      trade(-200, '2026-08-10T14:00:00Z')
    ]
    const tradesCopy = [...originalTrades]
    computeRuleStatus(account, ruleProfile, originalTrades, '2026-08-11')
    expect(originalTrades).toEqual(tradesCopy)
  })

  it('attributes trade pnl by exitTime, not entryTime, for daily tracking', () => {
    // Trade crosses midnight boundary in local timezone
    // Entry at noon UTC one day, exit at noon UTC next day, guarantees different local dates
    const tradesCrossingDay: Trade[] = [
      {
        id: 1,
        accountId: 1,
        instrument: 'ES',
        side: 'long',
        entryPrice: 5000,
        exitPrice: 5000,
        entryTime: '2026-08-10T12:00:00Z',
        exitTime: '2026-08-11T12:00:00Z',
        size: 1,
        pnl: -500,
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        screenshotPaths: [],
        tagIds: [],
        playbookId: null
      }
    ]
    // Compute the expected exit date in local timezone
    const exitDate = new Date('2026-08-11T12:00:00Z')
    const expectedDate = `${exitDate.getFullYear()}-${String(exitDate.getMonth() + 1).padStart(2, '0')}-${String(exitDate.getDate()).padStart(2, '0')}`

    const status = computeRuleStatus(account, ruleProfile, tradesCrossingDay, expectedDate)
    expect(status.todayPnl).toBe(-500) // counted toward exit date
  })

  it('clamps drawdownUsed to zero for static profile in profit', () => {
    const staticProfile: RuleProfile = { ...ruleProfile, drawdownType: 'static' }
    const trades = [trade(10000, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, staticProfile, trades, '2026-08-11')
    expect(status.currentBalance).toBe(160000) // in profit
    expect(status.drawdownUsed).toBe(0) // clamped, not negative
  })

  it('carries the profile drawdown type and amount through to the status', () => {
    const trailing = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(trailing.drawdownType).toBe('trailing')
    expect(trailing.drawdownAmount).toBe(5000)

    const staticProfile: RuleProfile = { ...ruleProfile, drawdownType: 'static', drawdownAmount: 3000 }
    const stat = computeRuleStatus(account, staticProfile, [], '2026-08-11')
    expect(stat.drawdownType).toBe('static')
    expect(stat.drawdownAmount).toBe(3000)
  })

  it('reports drawdownAmount as the true gauge limit for a static account in profit', () => {
    // Regression: the view used to derive the limit as highWaterMark - drawdownLimit,
    // which overstates the limit for a static account whose balance has run up.
    const staticProfile: RuleProfile = { ...ruleProfile, drawdownType: 'static' }
    const trades = [trade(10000, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, staticProfile, trades, '2026-08-11')
    expect(status.highWaterMark - status.drawdownLimit).toBe(15000) // the brittle formula
    expect(status.drawdownAmount).toBe(5000) // the real limit
  })

  it('filters trades by accountId, ignoring others', () => {
    const otherAccountTrade = { ...trade(-3000, '2026-08-11T14:00:00Z'), accountId: 999 }
    const myTrade = trade(1000, '2026-08-11T09:00:00Z')
    const status = computeRuleStatus(account, ruleProfile, [otherAccountTrade, myTrade], '2026-08-11')
    expect(status.todayPnl).toBe(1000) // only myTrade counts
    expect(status.currentBalance).toBe(151000) // only myTrade affects balance
  })

  it('reports consistencyState as n/a when the profile has no consistency limit', () => {
    const status = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(status.consistencyState).toBe('n/a')
    expect(status.bestDayProfitPercent).toBeNull()
  })

  it('reports consistencyState as n/a when total profit is not positive', () => {
    const profile: RuleProfile = { ...ruleProfile, consistencyPercent: 40 }
    const trades = [trade(-1000, '2026-08-10T14:00:00Z'), trade(500, '2026-08-11T09:00:00Z')]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.consistencyState).toBe('n/a')
    expect(status.bestDayProfitPercent).toBeNull()
  })

  it('flags a consistency violation when one day accounts for too much of total profit', () => {
    const profile: RuleProfile = { ...ruleProfile, consistencyPercent: 40 }
    const trades = [trade(3000, '2026-08-10T14:00:00Z'), trade(2000, '2026-08-11T09:00:00Z')]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.bestDayProfitPercent).toBe(60) // 3000 / 5000 * 100
    expect(status.consistencyState).toBe('violation')
  })

  it('reports a clean consistency state when profit is evenly spread', () => {
    const profile: RuleProfile = { ...ruleProfile, consistencyPercent: 40 }
    const trades = [
      trade(1200, '2026-08-08T09:00:00Z'),
      trade(1000, '2026-08-09T09:00:00Z'),
      trade(1000, '2026-08-10T09:00:00Z'),
      trade(800, '2026-08-11T09:00:00Z')
    ]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.bestDayProfitPercent).toBe(30) // 1200 / 4000 * 100, well clear of the 40% limit
    expect(status.consistencyState).toBe('clean')
  })

  it('carries the profile consistencyPercent through to the status', () => {
    const profile: RuleProfile = { ...ruleProfile, consistencyPercent: 40 }
    const status = computeRuleStatus(account, profile, [], '2026-08-11')
    expect(status.consistencyPercent).toBe(40)
  })

  it('reports profitTargetPercent as null when the profile has no profit target', () => {
    const status = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(status.profitTargetPercent).toBeNull()
  })

  it('computes profitTargetPercent as a percentage of net profit against the target', () => {
    const profile: RuleProfile = { ...ruleProfile, profitTarget: 9000 }
    const trades = [trade(4500, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.profitTargetPercent).toBe(50) // 4500 / 9000 * 100
  })

  it('clamps profitTargetPercent to zero when the account is in a net loss', () => {
    const profile: RuleProfile = { ...ruleProfile, profitTarget: 9000 }
    const trades = [trade(-1000, '2026-08-10T14:00:00Z')]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.profitTargetPercent).toBe(0)
  })

  it('reports profitTargetPercent as null when profitTarget is zero, not Infinity', () => {
    const profile: RuleProfile = { ...ruleProfile, profitTarget: 0 }
    const status = computeRuleStatus(account, profile, [], '2026-08-11')
    expect(status.profitTargetPercent).toBeNull()
  })

  it('reports tradingDaysCount as the number of distinct local trading days', () => {
    const trades = [
      trade(100, '2026-08-09T14:00:00Z'),
      trade(-50, '2026-08-09T15:00:00Z'), // same day as above
      trade(200, '2026-08-10T14:00:00Z')
    ]
    const status = computeRuleStatus(account, ruleProfile, trades, '2026-08-11')
    expect(status.tradingDaysCount).toBe(2)
  })

  it('reports tradingDaysRemaining as null when the profile has no minTradingDays', () => {
    const status = computeRuleStatus(account, ruleProfile, [], '2026-08-11')
    expect(status.tradingDaysRemaining).toBeNull()
  })

  it('computes tradingDaysRemaining against minTradingDays, clamped to zero', () => {
    const profile: RuleProfile = { ...ruleProfile, minTradingDays: 5 }
    const trades = [
      trade(100, '2026-08-08T14:00:00Z'),
      trade(100, '2026-08-09T14:00:00Z'),
      trade(100, '2026-08-10T14:00:00Z')
    ]
    const status = computeRuleStatus(account, profile, trades, '2026-08-11')
    expect(status.tradingDaysCount).toBe(3)
    expect(status.tradingDaysRemaining).toBe(2) // 5 - 3

    const profileMet: RuleProfile = { ...ruleProfile, minTradingDays: 2 }
    const statusMet = computeRuleStatus(account, profileMet, trades, '2026-08-11')
    expect(statusMet.tradingDaysRemaining).toBe(0) // already exceeded, clamped not negative
  })
})
