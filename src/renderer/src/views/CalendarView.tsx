import { useEffect, useMemo, useState } from 'react'
import { flowStateApi } from '../api/client'
import { computeDayAggregates } from '../../../shared/calendar'
import { JournalEntryEditor } from './JournalEntryEditor'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Trade } from '../../../shared/types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function CalendarView(): JSX.Element {
  const [trades, setTrades] = useState<Trade[]>([])
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    flowStateApi.trades
      .listAll()
      .then(setTrades)
      .catch((err: unknown) => {
        setError(
          `Could not load trades for the calendar: ${err instanceof Error ? err.message : String(err)}`
        )
      })
  }, [])

  const aggregatesByDate = useMemo(() => {
    const map = new Map<string, { pnl: number; hasTags: boolean }>()
    for (const agg of computeDayAggregates(trades)) {
      map.set(agg.date, agg)
    }
    return map
  }, [trades])

  const firstOfMonth = new Date(cursor.year, cursor.month, 1)
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const startWeekday = firstOfMonth.getDay()

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]

  const monthLabel = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="calendar-view">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <div className="calendar-header">
        <button
          type="button"
          onClick={() =>
            setCursor((c) => ({
              year: c.month === 0 ? c.year - 1 : c.year,
              month: (c.month + 11) % 12
            }))
          }
        >
          ←
        </button>
        <span className="calendar-month-label">{monthLabel}</span>
        <button
          type="button"
          onClick={() =>
            setCursor((c) => ({
              year: c.month === 11 ? c.year + 1 : c.year,
              month: (c.month + 1) % 12
            }))
          }
        >
          →
        </button>
      </div>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <div key={label} className="calendar-weekday">
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="calendar-cell empty" />
          const dateKey = toDateKey(cursor.year, cursor.month, day)
          const agg = aggregatesByDate.get(dateKey)
          const pnlClass = agg ? (agg.pnl >= 0 ? 'pos' : 'neg') : ''
          return (
            <button
              type="button"
              key={dateKey}
              className={`calendar-cell ${pnlClass} ${selectedDate === dateKey ? 'selected' : ''}`}
              onClick={() => setSelectedDate(dateKey)}
            >
              <span className="calendar-cell-day">{day}</span>
              {agg && (
                <span className="calendar-cell-pnl">
                  {agg.pnl >= 0 ? '+' : ''}
                  {Math.round(agg.pnl)}
                </span>
              )}
              {agg?.hasTags && <span className="calendar-cell-dot" />}
            </button>
          )
        })}
      </div>
      {selectedDate && (
        <div className="calendar-entry-panel">
          <h3 className="calendar-entry-heading">{selectedDate}</h3>
          <JournalEntryEditor date={selectedDate} />
        </div>
      )}
    </div>
  )
}
