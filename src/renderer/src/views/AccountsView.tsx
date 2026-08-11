import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { AccountForm } from './AccountForm'
import { DrawdownGauge } from '../components/DrawdownGauge'
import type { Account, RuleStatus } from '../../../shared/types'

export function AccountsView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [statuses, setStatuses] = useState<Record<number, RuleStatus>>({})

  async function refresh(): Promise<void> {
    const list = await flowStateApi.accounts.list()
    setAccounts(list)
    const entries = await Promise.all(
      list.map(async (a) => [a.id, await flowStateApi.ruleStatus.get(a.id)] as const)
    )
    setStatuses(Object.fromEntries(entries))
  }

  useEffect(() => {
    refresh()
  }, [])

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
      <AccountForm onCreated={refresh} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {accounts.map((account) => {
          const status = statuses[account.id]
          if (!status) return null
          return (
            <DrawdownGauge
              key={account.id}
              firmLabel={`${account.firmName} · ${account.accountName}`}
              accountLabel="Trailing Drawdown"
              usedAmount={status.drawdownUsed}
              limitAmount={
                status.drawdownLimit === status.highWaterMark
                  ? 1
                  : status.highWaterMark - status.drawdownLimit
              }
              highWaterMark={status.highWaterMark}
            />
          )
        })}
      </div>
    </div>
  )
}
