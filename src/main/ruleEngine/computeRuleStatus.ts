import type { Account, RuleProfile, Trade, RuleStatus, RuleState } from '../../shared/types'

const WARNING_THRESHOLD_RATIO = 0.1

function stateFromRemaining(remaining: number, limit: number): RuleState {
  if (remaining <= 0) return 'violation'
  if (remaining <= limit * WARNING_THRESHOLD_RATIO) return 'warning'
  return 'clean'
}

function toLocalDateString(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function computeRuleStatus(
  account: Account,
  ruleProfile: RuleProfile,
  trades: Trade[],
  asOfDate: string
): RuleStatus {
  const accountTrades = trades.filter((t) => t.accountId === account.id)
  const sorted = [...accountTrades].sort((a, b) => a.exitTime.localeCompare(b.exitTime))

  let runningBalance = account.startingBalance
  let highWaterMark = account.startingBalance
  for (const t of sorted) {
    runningBalance += t.pnl
    if (runningBalance > highWaterMark) highWaterMark = runningBalance
  }

  const drawdownBase = ruleProfile.drawdownType === 'trailing' ? highWaterMark : account.startingBalance
  const drawdownLimit = drawdownBase - ruleProfile.drawdownAmount
  const drawdownRemaining = runningBalance - drawdownLimit
  const drawdownState = stateFromRemaining(drawdownRemaining, ruleProfile.drawdownAmount)

  const todayPnl = sorted
    .filter((t) => toLocalDateString(t.exitTime) === asOfDate)
    .reduce((sum, t) => sum + t.pnl, 0)

  let dailyLossRemaining: number | null = null
  let dailyLossState: RuleState | 'n/a' = 'n/a'
  if (ruleProfile.dailyLossLimit !== null) {
    dailyLossRemaining = ruleProfile.dailyLossLimit + Math.min(todayPnl, 0)
    dailyLossState = stateFromRemaining(dailyLossRemaining, ruleProfile.dailyLossLimit)
  }

  return {
    accountId: account.id,
    highWaterMark,
    currentBalance: runningBalance,
    drawdownLimit,
    drawdownUsed: Math.max(0, drawdownBase - runningBalance),
    drawdownRemaining,
    drawdownState,
    todayPnl,
    dailyLossLimit: ruleProfile.dailyLossLimit,
    dailyLossRemaining,
    dailyLossState
  }
}
