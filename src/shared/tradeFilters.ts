import type { Trade } from './types'
import { toLocalDateString } from './date'

export interface TradeFilters {
  instrument: string
  tagId: number | null
  playbookId: number | null
  dateFrom: string | null
  dateTo: string | null
}

export const EMPTY_TRADE_FILTERS: TradeFilters = {
  instrument: '',
  tagId: null,
  playbookId: null,
  dateFrom: null,
  dateTo: null
}

export function computeFilteredTrades(trades: Trade[], filters: TradeFilters): Trade[] {
  return trades.filter((trade) => {
    if (filters.instrument.trim() !== '') {
      const needle = filters.instrument.trim().toLowerCase()
      if (!trade.instrument.toLowerCase().includes(needle)) return false
    }
    if (filters.tagId !== null && !trade.tagIds.includes(filters.tagId)) return false
    if (filters.playbookId !== null && trade.playbookId !== filters.playbookId) return false
    if (filters.dateFrom !== null || filters.dateTo !== null) {
      const exitDay = toLocalDateString(new Date(trade.exitTime))
      if (filters.dateFrom !== null && exitDay < filters.dateFrom) return false
      if (filters.dateTo !== null && exitDay > filters.dateTo) return false
    }
    return true
  })
}
