import type { Account, RuleProfile, Trade, RuleStatus, RuleState } from '../../shared/types'
import { toLocalDateString } from '../../shared/date'

const WARNING_THRESHOLD_RATIO = 0.1

function stateFromRemaining(remaining: number, limit: number): RuleState {
  if (remaining <= 0) return 'violation'
  if (remaining <= limit * WARNING_THRESHOLD_RATIO) return 'warning'
  return 'clean'
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
    .filter((t) => toLocalDateString(new Date(t.exitTime)) === asOfDate)
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
    drawdownType: ruleProfile.drawdownType,
    drawdownAmount: ruleProfile.drawdownAmount,
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
