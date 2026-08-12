import { useState } from 'react'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
import type { AccountStatus, DrawdownType } from '../../../shared/types'

interface AccountFormProps {
  onCreated: () => void
}

export function AccountForm({ onCreated }: AccountFormProps): JSX.Element {
  const [firmName, setFirmName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [startingBalance, setStartingBalance] = useState('150000')
  const [status, setStatus] = useState<AccountStatus>('evaluation')
  const [drawdownType, setDrawdownType] = useState<DrawdownType>('trailing')
  const [drawdownAmount, setDrawdownAmount] = useState('5000')
  const [dailyLossLimit, setDailyLossLimit] = useState('2500')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    try {
      setError(null)
      const profile = await flowStateApi.ruleProfiles.create({
        name: `${firmName} ${accountName}`,
        drawdownType,
        drawdownAmount: Number(drawdownAmount),
        dailyLossLimit: dailyLossLimit ? Number(dailyLossLimit) : null,
        consistencyPercent: null,
        minTradingDays: null,
        profitTarget: null
      })
      await flowStateApi.accounts.create({
        firmName,
        accountName,
        startingBalance: Number(startingBalance),
        currency: 'USD',
        status,
        ruleProfileId: profile.id
      })
      setFirmName('')
      setAccountName('')
      onCreated()
    } catch (err) {
      setError(`Could not create account: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="account-form">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="field field-wide">
        <label className="field-label" htmlFor="af-firm">
          Firm
        </label>
        <input
          id="af-firm"
          placeholder="e.g. Apex, Topstep, FTMO"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          required
        />
      </div>

      <div className="field field-wide">
        <label className="field-label" htmlFor="af-account-name">
          Account Name
        </label>
        <input
          id="af-account-name"
          placeholder="e.g. 150K Eval #2"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="af-balance">
          Starting Balance ($)
        </label>
        <input
          id="af-balance"
          type="number"
          placeholder="150000"
          value={startingBalance}
          onChange={(e) => setStartingBalance(e.target.value)}
          required
        />
        <span className="field-hint">The account&apos;s size when you started — e.g. 150000 for a 150K account.</span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="af-status">
          Status
        </label>
        <select
          id="af-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as AccountStatus)}
        >
          <option value="evaluation">Evaluation</option>
          <option value="funded">Funded</option>
        </select>
        <span className="field-hint">Evaluation while proving the account, Funded once passed.</span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="af-drawdown-type">
          Drawdown Type
        </label>
        <select
          id="af-drawdown-type"
          value={drawdownType}
          onChange={(e) => setDrawdownType(e.target.value as DrawdownType)}
        >
          <option value="trailing">Trailing</option>
          <option value="static">Static</option>
        </select>
        <span className="field-hint">
          Trailing: limit rises with your peak balance. Static: limit stays fixed at starting
          balance. Check your firm&apos;s rules.
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="af-drawdown-amount">
          Drawdown Amount ($)
        </label>
        <input
          id="af-drawdown-amount"
          type="number"
          placeholder="5000"
          value={drawdownAmount}
          onChange={(e) => setDrawdownAmount(e.target.value)}
          required
        />
        <span className="field-hint">
          Max total loss allowed before the account fails &mdash; from your firm&apos;s rule
          sheet (e.g. 5000 on a 150K eval).
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="af-daily-loss">
          Daily Loss Limit ($)
        </label>
        <input
          id="af-daily-loss"
          type="number"
          placeholder="2500 (optional)"
          value={dailyLossLimit}
          onChange={(e) => setDailyLossLimit(e.target.value)}
        />
        <span className="field-hint">
          Max you can lose in a single day before it&apos;s a violation. Leave blank if your
          firm has no daily limit.
        </span>
      </div>

      <button type="submit" className="field-submit">
        Add account
      </button>
    </form>
  )
}
