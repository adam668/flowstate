import { describe, it, expect } from 'vitest'
import { computeFilteredTrades, EMPTY_TRADE_FILTERS } from './tradeFilters'
import type { Trade } from './types'

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
    playbookId: null,
    ...overrides
  }
}

describe('computeFilteredTrades', () => {
  it('returns every trade when no filters are set', () => {
    const trades = [makeTrade({ id: 1 }), makeTrade({ id: 2 })]
    expect(computeFilteredTrades(trades, EMPTY_TRADE_FILTERS)).toEqual(trades)
  })

  it('filters by instrument, case-insensitive substring match', () => {
    const trades = [
      makeTrade({ id: 1, instrument: 'ES' }),
      makeTrade({ id: 2, instrument: 'NQ' }),
      makeTrade({ id: 3, instrument: 'MES' })
    ]
    const result = computeFilteredTrades(trades, { ...EMPTY_TRADE_FILTERS, instrument: 'es' })
    expect(result.map((t) => t.id)).toEqual([1, 3])
  })

  it('filters by exact tagId match', () => {
    const trades = [
      makeTrade({ id: 1, tagIds: [1, 2] }),
      makeTrade({ id: 2, tagIds: [2] }),
      makeTrade({ id: 3, tagIds: [] })
    ]
    const result = computeFilteredTrades(trades, { ...EMPTY_TRADE_FILTERS, tagId: 1 })
    expect(result.map((t) => t.id)).toEqual([1])
  })

  it('filters by exact playbookId match', () => {
    const trades = [
      makeTrade({ id: 1, playbookId: 5 }),
      makeTrade({ id: 2, playbookId: 6 }),
      makeTrade({ id: 3, playbookId: null })
    ]
    const result = computeFilteredTrades(trades, { ...EMPTY_TRADE_FILTERS, playbookId: 5 })
    expect(result.map((t) => t.id)).toEqual([1])
  })

  it('filters by inclusive date range against the local exit day', () => {
    const trades = [
      makeTrade({ id: 1, exitTime: '2026-08-09T14:00:00Z' }),
      makeTrade({ id: 2, exitTime: '2026-08-10T14:00:00Z' }),
      makeTrade({ id: 3, exitTime: '2026-08-11T14:00:00Z' })
    ]
    const result = computeFilteredTrades(trades, {
      ...EMPTY_TRADE_FILTERS,
      dateFrom: '2026-08-10',
      dateTo: '2026-08-10'
    })
    expect(result.map((t) => t.id)).toEqual([2])
  })

  it('combines multiple filters with AND semantics', () => {
    const trades = [
      makeTrade({ id: 1, instrument: 'ES', tagIds: [1] }),
      makeTrade({ id: 2, instrument: 'ES', tagIds: [] }),
      makeTrade({ id: 3, instrument: 'NQ', tagIds: [1] })
    ]
    const result = computeFilteredTrades(trades, {
      ...EMPTY_TRADE_FILTERS,
      instrument: 'ES',
      tagId: 1
    })
    expect(result.map((t) => t.id)).toEqual([1])
  })
})
