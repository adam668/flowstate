interface GoalsPanelProps {
  firmLabel: string
  profitTargetPercent: number | null
  tradingDaysCount: number
  tradingDaysRemaining: number | null
}

export function GoalsPanel({
  firmLabel,
  profitTargetPercent,
  tradingDaysCount,
  tradingDaysRemaining
}: GoalsPanelProps): JSX.Element {
  const showProfitTarget = profitTargetPercent !== null
  const showTradingDays = tradingDaysRemaining !== null
  const tradingDaysTarget = tradingDaysCount + (tradingDaysRemaining ?? 0)
  const tradingDaysFillPercent =
    tradingDaysTarget > 0 ? Math.min(100, (tradingDaysCount / tradingDaysTarget) * 100) : 100

  return (
    <div className="goals-card">
      <span className="gauge-firm">{firmLabel}</span>
      {showProfitTarget && (
        <div className="goals-bar-row">
          <div className="goals-bar-label">
            <span>Profit Target</span>
            <span>{profitTargetPercent.toFixed(1)}%</span>
          </div>
          <div className="goals-bar-track">
            <div
              className="goals-bar-fill"
              style={{ width: `${Math.min(100, profitTargetPercent)}%` }}
            />
          </div>
        </div>
      )}
      {showTradingDays && (
        <div className="goals-bar-row">
          <div className="goals-bar-label">
            <span>Trading Days</span>
            <span>
              {tradingDaysCount} / {tradingDaysTarget}
            </span>
          </div>
          <div className="goals-bar-track">
            <div
              className="goals-bar-fill"
              style={{ width: `${tradingDaysFillPercent}%` }}
            />
          </div>
          {(tradingDaysRemaining as number) > 0 && (
            <div className="goals-bar-sub">{tradingDaysRemaining} days remaining</div>
          )}
        </div>
      )}
    </div>
  )
}
