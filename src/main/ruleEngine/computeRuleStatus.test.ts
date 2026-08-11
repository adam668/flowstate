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
  profitTarget: 9000
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
    notes: null,
    screenshotPaths: [],
    tagIds: []
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
})
