import { useEffect, useMemo, useState } from 'react'
import { flowStateApi } from '../api/client'
import { TradeQuickAddForm } from './TradeQuickAddForm'
import { TradeRow } from './TradeRow'
import { ErrorBanner } from '../components/ErrorBanner'
import { computeFilteredTrades, EMPTY_TRADE_FILTERS, TradeFilters } from '../../../shared/tradeFilters'
import type { Account, Trade, Playbook, Tag } from '../../../shared/types'

export function TradeLogView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [filters, setFilters] = useState<TradeFilters>(EMPTY_TRADE_FILTERS)
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
    flowStateApi.playbooks
      .list()
      .then(setPlaybooks)
      .catch((e: unknown) => {
        setError(`Could not load playbooks: ${e instanceof Error ? e.message : String(e)}`)
      })
    flowStateApi.tags
      .list()
      .then(setTags)
      .catch((e: unknown) => {
        setError(`Could not load tags: ${e instanceof Error ? e.message : String(e)}`)
      })
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

  const filteredTrades = useMemo(() => computeFilteredTrades(trades, filters), [trades, filters])

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

      <div className="trade-filter-bar">
        <input
          type="text"
          placeholder="Filter by instrument…"
          aria-label="Filter by instrument"
          value={filters.instrument}
          onChange={(e) => setFilters((f) => ({ ...f, instrument: e.target.value }))}
        />
        <select
          aria-label="Filter by tag"
          value={filters.tagId ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, tagId: e.target.value === '' ? null : Number(e.target.value) }))
          }
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by playbook"
          value={filters.playbookId ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              playbookId: e.target.value === '' ? null : Number(e.target.value)
            }))
          }
        >
          <option value="">All playbooks</option>
          {playbooks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Filter from date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || null }))}
        />
        <input
          type="date"
          aria-label="Filter to date"
          value={filters.dateTo ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || null }))}
        />
        {filters !== EMPTY_TRADE_FILTERS && (
          <button type="button" onClick={() => setFilters(EMPTY_TRADE_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {filteredTrades.length === 0 ? (
        <p className="trade-filter-empty">No trades match these filters.</p>
      ) : (
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
            {filteredTrades.map((t) => (
              <TradeRow
                key={t.id}
                trade={t}
                playbooks={playbooks}
                onChanged={() => selectedAccountId !== null && refreshTrades(selectedAccountId)}
                onError={setError}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
