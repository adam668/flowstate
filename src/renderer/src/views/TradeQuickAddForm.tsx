import { useState } from 'react'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
import type { TradeSide } from '../../../shared/types'

interface TradeQuickAddFormProps {
  accountId: number
  onCreated: () => void
}

export function TradeQuickAddForm({ accountId, onCreated }: TradeQuickAddFormProps): JSX.Element {
  const [instrument, setInstrument] = useState('')
  const [side, setSide] = useState<TradeSide>('long')
  const [size, setSize] = useState('1')
  const [entryPrice, setEntryPrice] = useState('')
  const [exitPrice, setExitPrice] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const now = new Date().toISOString()
    try {
      setError(null)
      await flowStateApi.trades.create({
        accountId,
        instrument,
        side,
        entryPrice: Number(entryPrice),
        exitPrice: Number(exitPrice),
        entryTime: now,
        exitTime: now,
        size: Number(size),
        rMultiple: null,
        notes: null,
        screenshotPaths: [],
        tagIds: []
      })
      setInstrument('')
      setEntryPrice('')
      setExitPrice('')
      onCreated()
    } catch (err) {
      setError(`Could not log trade: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="trade-quick-add">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
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
      <button type="submit">Log trade</button>
    </form>
  )
}
