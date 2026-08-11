import { useState } from 'react'
import { flowStateApi } from '../api/client'
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

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
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
  }

  return (
    <form onSubmit={handleSubmit} className="account-form">
      <input
        placeholder="Firm (e.g. Apex)"
        value={firmName}
        onChange={(e) => setFirmName(e.target.value)}
        required
      />
      <input
        placeholder="Account name"
        value={accountName}
        onChange={(e) => setAccountName(e.target.value)}
        required
      />
      <input
        type="number"
        placeholder="Starting balance"
        value={startingBalance}
        onChange={(e) => setStartingBalance(e.target.value)}
        required
      />
      <select value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
        <option value="evaluation">Evaluation</option>
        <option value="funded">Funded</option>
      </select>
      <select
        value={drawdownType}
        onChange={(e) => setDrawdownType(e.target.value as DrawdownType)}
      >
        <option value="trailing">Trailing drawdown</option>
        <option value="static">Static drawdown</option>
      </select>
      <input
        type="number"
        placeholder="Drawdown amount"
        value={drawdownAmount}
        onChange={(e) => setDrawdownAmount(e.target.value)}
        required
      />
      <input
        type="number"
        placeholder="Daily loss limit"
        value={dailyLossLimit}
        onChange={(e) => setDailyLossLimit(e.target.value)}
      />
      <button type="submit">Add account</button>
    </form>
  )
}
