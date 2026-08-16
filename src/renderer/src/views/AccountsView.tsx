import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { AccountForm } from './AccountForm'
import { DrawdownGauge } from '../components/DrawdownGauge'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Account, RuleStatus } from '../../../shared/types'

export function AccountsView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [statuses, setStatuses] = useState<Record<number, RuleStatus>>({})
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      setError(null)
      const list = await flowStateApi.accounts.list()
      setAccounts(list)
      const entries = await Promise.all(
        list.map(async (a) => [a.id, await flowStateApi.ruleStatus.get(a.id)] as const)
      )
      setStatuses(Object.fromEntries(entries))
    } catch (e) {
      setError(`Could not load accounts: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDeleteAccount(account: Account): Promise<void> {
    try {
      const trades = await flowStateApi.trades.listForAccount(account.id)
      const confirmText =
        trades.length > 0
          ? `This account has ${trades.length} trade(s). Delete the account and all ${trades.length} trade(s)? This cannot be undone.`
          : `Delete ${account.firmName} ${account.accountName}? This cannot be undone.`
      if (!window.confirm(confirmText)) return
      await flowStateApi.accounts.delete(account.id, trades.length > 0)
      refresh()
    } catch (err) {
      setError(`Could not delete account: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div>
      <h2
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase'
        }}
      >
        Accounts
      </h2>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <AccountForm onCreated={refresh} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {accounts.map((account) => {
          const status = statuses[account.id]
          if (!status) return null
          return (
            <div key={account.id} className="account-row">
              <DrawdownGauge
                firmLabel={`${account.firmName} · ${account.accountName}`}
                accountLabel={
                  status.drawdownType === 'trailing' ? 'Trailing Drawdown' : 'Static Drawdown'
                }
                usedAmount={status.drawdownUsed}
                limitAmount={status.drawdownAmount}
                highWaterMark={status.highWaterMark}
              />
              <button
                type="button"
                className="account-delete"
                onClick={() => handleDeleteAccount(account)}
                aria-label={`Delete account ${account.firmName} ${account.accountName}`}
              >
                Delete account
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
