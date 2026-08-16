import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { TradeQuickAddForm } from './TradeQuickAddForm'
import { TradeRow } from './TradeRow'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Account, Trade } from '../../../shared/types'

export function TradeLogView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadAccounts(): Promise<void> {
      try {
        setError(null)
        const list = await flowStateApi.accounts.list()
        setAccounts(list)
        if (list.length > 0) setSelectedAccountId(list[0].id)
      } catch (e) {
        setError(`Could not load accounts: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    loadAccounts()
  }, [])

  async function refreshTrades(accountId: number): Promise<void> {
    try {
      setError(null)
      setTrades(await flowStateApi.trades.listForAccount(accountId))
    } catch (e) {
      setError(`Could not load trades: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    if (selectedAccountId !== null) refreshTrades(selectedAccountId)
  }, [selectedAccountId])

  if (accounts.length === 0) {
    return (
      <div>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <p style={{ color: 'var(--text-secondary)' }}>Create an account first.</p>
      </div>
    )
  }

  return (
    <div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <select
        value={selectedAccountId ?? ''}
        onChange={(e) => setSelectedAccountId(Number(e.target.value))}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.firmName} · {a.accountName}
          </option>
        ))}
      </select>

      {selectedAccountId !== null && (
        <TradeQuickAddForm
          accountId={selectedAccountId}
          onCreated={() => refreshTrades(selectedAccountId)}
        />
      )}

      <table className="trade-table">
        <thead>
          <tr>
            <th>Instrument</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>P&amp;L</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <TradeRow
              key={t.id}
              trade={t}
              onChanged={() => selectedAccountId !== null && refreshTrades(selectedAccountId)}
              onError={setError}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
