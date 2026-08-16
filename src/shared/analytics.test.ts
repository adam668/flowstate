import { describe, it, expect } from 'vitest'
import { computeWinRateByTag, computeWinRateByHour, computeRMultipleDistribution } from './analytics'
import type { Trade, Tag } from './types'

function makeTrade(overrides: Partial<Trade>): Trade {
  return {
    id: 1,
    accountId: 1,
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
    tagIds: [],
    ...overrides
  }
}

describe('computeRMultipleDistribution', () => {
  it('buckets trades into whole-R ranges and ignores trades with no rMultiple', () => {
    const trades: Trade[] = [
      makeTrade({ id: 1, rMultiple: 2.5 }),
      makeTrade({ id: 2, rMultiple: 2.1 }),
      makeTrade({ id: 3, rMultiple: -0.5 }),
      makeTrade({ id: 4, rMultiple: 3.0 }),
      makeTrade({ id: 5, rMultiple: null })
    ]

    const result = computeRMultipleDistribution(trades)

    expect(result).toContainEqual({ bucket: '2R to 3R', count: 2 })
    expect(result).toContainEqual({ bucket: '-1R to 0R', count: 1 })
    expect(result).toContainEqual({ bucket: '3R to 4R', count: 1 })
    expect(result.reduce((sum, b) => sum + b.count, 0)).toBe(4)
  })

  it('returns an empty array when no trades have an rMultiple', () => {
    expect(computeRMultipleDistribution([makeTrade({ rMultiple: null })])).toEqual([])
  })
})

describe('computeWinRateByHour', () => {
  it('buckets trades by the local hour of exitTime', () => {
    const morning = '2026-08-11T13:35:00Z'
    const afternoon = '2026-08-11T19:10:00Z'
    const morningHour = new Date(morning).getHours()
    const afternoonHour = new Date(afternoon).getHours()

    const trades: Trade[] = [
      makeTrade({ id: 1, pnl: 10, exitTime: morning }),
      makeTrade({ id: 2, pnl: -5, exitTime: morning }),
      makeTrade({ id: 3, pnl: 20, exitTime: afternoon })
    ]

    const result = computeWinRateByHour(trades)

    expect(result).toContainEqual({ hour: morningHour, wins: 1, losses: 1, winRate: 0.5 })
    expect(result).toContainEqual({ hour: afternoonHour, wins: 1, losses: 0, winRate: 1 })
  })

  it('returns an empty array when there are no trades', () => {
    expect(computeWinRateByHour([])).toEqual([])
  })
})

describe('computeWinRateByTag', () => {
  it('computes win rate per tag from tagged trades', () => {
    const tags: Tag[] = [
      { id: 1, name: 'FOMO' },
      { id: 2, name: 'Breakout' }
    ]
    const trades: Trade[] = [
      makeTrade({ id: 1, pnl: 10, tagIds: [1] }),
      makeTrade({ id: 2, pnl: -5, tagIds: [1] }),
      makeTrade({ id: 3, pnl: 20, tagIds: [2] })
    ]

    const result = computeWinRateByTag(trades, tags)

    expect(result).toContainEqual({ tagName: 'FOMO', wins: 1, losses: 1, winRate: 0.5 })
    expect(result).toContainEqual({ tagName: 'Breakout', wins: 1, losses: 0, winRate: 1 })
  })

  it('excludes untagged trades and tags with no trades', () => {
    const tags: Tag[] = [
      { id: 1, name: 'FOMO' },
      { id: 2, name: 'Unused' }
    ]
    const trades: Trade[] = [makeTrade({ id: 1, pnl: 10, tagIds: [] })]

    const result = computeWinRateByTag(trades, tags)

    expect(result).toEqual([])
  })
})
