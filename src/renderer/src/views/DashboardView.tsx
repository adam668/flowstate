import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { RuleStatusStrip, StripItem } from '../components/RuleStatusStrip'
import { EquityCurve } from '../components/EquityCurve'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Account, RuleState, RuleStatus, Trade } from '../../../shared/types'

const SEVERITY: Record<RuleState, number> = { clean: 0, warning: 1, violation: 2 }

/**
 * The strip must reflect BOTH rules, not just the daily loss limit: drawdown is
 * the failure mode that actually ends prop accounts, so a trader flat on the day
 * but one tick from a trailing-drawdown breach must not see a clean strip.
 * The binding constraint is whichever rule is in the worse state; ties go to
 * drawdown, since that is the account-ending one.
 */
export function bindingConstraint(status: RuleStatus): { state: RuleState; limitLabel: string } {
  const dailyState: RuleState = status.dailyLossState === 'n/a' ? 'clean' : status.dailyLossState
  const drawdownWins = SEVERITY[status.drawdownState] >= SEVERITY[dailyState]
  const state: RuleState = drawdownWins ? status.drawdownState : dailyState

  if (drawdownWins) {
    const label = status.drawdownType === 'trailing' ? 'Trailing DD' : 'Static DD'
    return {
      state,
      limitLabel: `${label} $${Math.round(
        Math.max(0, status.drawdownRemaining)
      ).toLocaleString()} of $${status.drawdownAmount.toLocaleString()} remaining`
    }
  }

  const dailyLossLimit = status.dailyLossLimit
  return {
    state,
    limitLabel: dailyLossLimit
      ? `Limit $${dailyLossLimit.toLocaleString()} · ${Math.round(
          ((status.dailyLossRemaining ?? 0) / dailyLossLimit) * 100
        )}% remaining`
      : 'No daily loss limit'
  }
}

export function DashboardView(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stripItems, setStripItems] = useState<StripItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        setError(null)
        const list = await flowStateApi.accounts.list()
        setAccounts(list)
        if (list.length > 0) setSelectedAccountId(list[0].id)

        const items = await Promise.all(
          list.map(async (a) => {
            const status = await flowStateApi.ruleStatus.get(a.id)
            const { state, limitLabel } = bindingConstraint(status)
            return {
              label: `${a.firmName} ${a.accountName}`,
              pnl: status.todayPnl,
              limitLabel,
              state
            } as StripItem
          })
        )
        setStripItems(items)
      } catch (e) {
        setError(`Could not load rule status: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadTrades(): Promise<void> {
      if (selectedAccountId === null) return
      try {
        setTrades(await flowStateApi.trades.listForAccount(selectedAccountId))
      } catch (e) {
        setError(`Could not load trades: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    loadTrades()
  }, [selectedAccountId])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

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
      <RuleStatusStrip items={stripItems} />
      {selectedAccount && (
        <div style={{ marginTop: 24 }}>
          <EquityCurve startingBalance={selectedAccount.startingBalance} trades={trades} />
        </div>
      )}
    </div>
  )
}
