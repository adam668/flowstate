import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { TradeQuickAddForm } from './TradeQuickAddForm'
import type { Account, Trade } from '../../../shared/types'

export function TradeLogView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    flowStateApi.accounts.list().then((list) => {
      setAccounts(list)
      if (list.length > 0) setSelectedAccountId(list[0].id)
    })
  }, [])

  async function refreshTrades(accountId: number): Promise<void> {
    setTrades(await flowStateApi.trades.listForAccount(accountId))
  }

  useEffect(() => {
    if (selectedAccountId !== null) refreshTrades(selectedAccountId)
  }, [selectedAccountId])

  if (accounts.length === 0) {
    return <p style={{ color: 'var(--text-secondary)' }}>Create an account first.</p>
  }

  return (
    <div>
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
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td>{t.instrument}</td>
              <td>{t.side}</td>
              <td>{t.size}</td>
              <td>{t.entryPrice}</td>
              <td>{t.exitPrice}</td>
              <td className={t.pnl >= 0 ? 'pos' : 'neg'}>{t.pnl.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
