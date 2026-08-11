import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { RuleStatusStrip, StripItem } from '../components/RuleStatusStrip'
import { EquityCurve } from '../components/EquityCurve'
import type { Account, Trade } from '../../../shared/types'

export function DashboardView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stripItems, setStripItems] = useState<StripItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])

  useEffect(() => {
    async function load(): Promise<void> {
      const list = await flowStateApi.accounts.list()
      setAccounts(list)
      if (list.length > 0) setSelectedAccountId(list[0].id)

      const items = await Promise.all(
        list.map(async (a) => {
          const status = await flowStateApi.ruleStatus.get(a.id)
          return {
            label: `${a.firmName} ${a.accountName}`,
            pnl: status.todayPnl,
            limitLabel: status.dailyLossLimit
              ? `Limit $${status.dailyLossLimit.toLocaleString()} · ${Math.round(
                  ((status.dailyLossRemaining ?? 0) / status.dailyLossLimit) * 100
                )}% remaining`
              : 'No daily loss limit',
            state: status.dailyLossState === 'n/a' ? 'clean' : status.dailyLossState
          } as StripItem
        })
      )
      setStripItems(items)
    }
    load()
  }, [])

  useEffect(() => {
    if (selectedAccountId !== null) {
      flowStateApi.trades.listForAccount(selectedAccountId).then(setTrades)
    }
  }, [selectedAccountId])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  if (accounts.length === 0) {
    return <p style={{ color: 'var(--text-secondary)' }}>Create an account first.</p>
  }

  return (
    <div>
      <RuleStatusStrip items={stripItems} />
      {selectedAccount && (
        <div style={{ marginTop: 24 }}>
          <EquityCurve startingBalance={selectedAccount.startingBalance} trades={trades} />
        </div>
      )}
    </div>
  )
}
