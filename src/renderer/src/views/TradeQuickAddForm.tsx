import { useState } from 'react'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
import type { TradeSide } from '../../../shared/types'
import { toLocalDateString } from '../../../shared/date'

interface TradeQuickAddFormProps {
  accountId: number
  onCreated: () => void
}

/**
 * Combines the picked trade date with the current time-of-day so the
 * entry/exit timestamp still sorts sensibly within a day, while
 * `toLocalDateString` (used everywhere trades are attributed to a day)
 * reflects the date the trader actually chose, not "now".
 */
function toTradeTimestamp(date: string): string {
  const now = new Date()
  const [year, month, day] = date.split('-').map(Number)
  return new Date(
    year,
    month - 1,
    day,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ).toISOString()
}

export function TradeQuickAddForm({ accountId, onCreated }: TradeQuickAddFormProps): JSX.Element {
  const [date, setDate] = useState(() => toLocalDateString(new Date()))
  const [instrument, setInstrument] = useState('')
  const [side, setSide] = useState<TradeSide>('long')
  const [size, setSize] = useState('1')
  const [entryPrice, setEntryPrice] = useState('')
  const [exitPrice, setExitPrice] = useState('')
  const [pnl, setPnl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const timestamp = toTradeTimestamp(date)
    try {
      setError(null)
      await flowStateApi.trades.create({
        accountId,
        instrument,
        side,
        entryPrice: Number(entryPrice),
        exitPrice: Number(exitPrice),
        entryTime: timestamp,
        exitTime: timestamp,
        size: Number(size),
        pnl: Number(pnl),
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        screenshotPaths: [],
        tagIds: []
      })
      setInstrument('')
      setEntryPrice('')
      setExitPrice('')
      setPnl('')
      onCreated()
    } catch (err) {
      setError(`Could not log trade: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="trade-quick-add">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <label className="trade-quick-add-date-label">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <input
        autoFocus
        placeholder="Instrument (ES)"
        value={instrument}
        onChange={(e) => setInstrument(e.target.value)}
        required
      />
      <select value={side} onChange={(e) => setSide(e.target.value as TradeSide)}>
        <option value="long">Long</option>
        <option value="short">Short</option>
      </select>
      <input
        type="number"
        placeholder="Size"
        value={size}
        onChange={(e) => setSize(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.01"
        placeholder="Entry"
        value={entryPrice}
        onChange={(e) => setEntryPrice(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.01"
        placeholder="Exit"
        value={exitPrice}
        onChange={(e) => setExitPrice(e.target.value)}
        required
      />
      <input
        type="number"
        step="0.01"
        placeholder="P&L"
        value={pnl}
        onChange={(e) => setPnl(e.target.value)}
        required
      />
      <button type="submit">Log trade</button>
    </form>
  )
}
