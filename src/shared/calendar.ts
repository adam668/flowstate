import type { Trade } from './types'
import { toLocalDateString } from './date'

export interface DayAggregate {
  date: string
  pnl: number
  hasTags: boolean
}

/**
 * Aggregates trades into one entry per local calendar day (by exitTime —
 * the same attribution convention the rule engine uses), summing pnl across
 * every account and flagging whether any trade that day carried a tag.
 */
export function computeDayAggregates(trades: Trade[]): DayAggregate[] {
  const byDate = new Map<string, DayAggregate>()

  for (const trade of trades) {
    const date = toLocalDateString(new Date(trade.exitTime))
    const existing = byDate.get(date) ?? { date, pnl: 0, hasTags: false }
    existing.pnl += trade.pnl
    if (trade.tagIds.length > 0) existing.hasTags = true
    byDate.set(date, existing)
  }

  return [...byDate.values()]
}
