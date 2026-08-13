import { describe, it, expect } from 'vitest'
import { computeDayAggregates } from './calendar'
import type { Trade } from './types'

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: Math.random(),
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5000,
    entryTime: '2026-08-13T14:00:00Z',
    exitTime: '2026-08-13T14:00:00Z',
    size: 1,
    pnl: 0,
    rMultiple: null,
    notes: null,
    screenshotPaths: [],
    tagIds: [],
    ...overrides
  }
}

describe('computeDayAggregates', () => {
  it('sums pnl for trades from different accounts on the same day', () => {
    const trades = [
      trade({ accountId: 1, pnl: 500, exitTime: '2026-08-13T14:00:00Z' }),
      trade({ accountId: 2, pnl: -200, exitTime: '2026-08-13T18:00:00Z' })
    ]
    const result = computeDayAggregates(trades)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ date: '2026-08-13', pnl: 300, hasTags: false })
  })

  it('marks hasTags true if any trade that day has a tag', () => {
    const result = computeDayAggregates([trade({ tagIds: [1] })])
    expect(result[0].hasTags).toBe(true)
  })

  it('attributes by exitTime local day, not entryTime', () => {
    const result = computeDayAggregates([
      trade({ entryTime: '2026-08-12T23:00:00Z', exitTime: '2026-08-13T01:00:00Z', pnl: 100 })
    ])
    expect(result[0].date).toBe('2026-08-13')
  })

  it('returns an empty array for no trades', () => {
    expect(computeDayAggregates([])).toEqual([])
  })
})
