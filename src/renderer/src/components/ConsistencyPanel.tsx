interface ConsistencyPanelProps {
  firmLabel: string
  bestDayProfitPercent: number
  consistencyPercent: number
  state: 'clean' | 'warning' | 'violation'
}

export function ConsistencyPanel({
  firmLabel,
  bestDayProfitPercent,
  consistencyPercent,
  state
}: ConsistencyPanelProps): JSX.Element {
  const fillPercent = Math.min(100, Math.max(0, (bestDayProfitPercent / consistencyPercent) * 100))

  return (
    <div className="gauge-card">
      <div className="gauge-top">
        <div>
          <span className="gauge-firm">{firmLabel}</span>
          <br />
          <span className="gauge-title">Consistency</span>
        </div>
        <span className="gauge-value">
          {bestDayProfitPercent.toFixed(1)}% / {consistencyPercent}%
        </span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${fillPercent}%` }} />
        <div className="gauge-buffer-line" style={{ left: '100%' }} />
      </div>
      <div className="gauge-foot">
        <span>BEST DAY {bestDayProfitPercent.toFixed(1)}% OF PROFIT</span>
        <span>{state === 'violation' ? 'LIMIT BREACHED' : `LIMIT ${consistencyPercent}%`}</span>
      </div>
    </div>
  )
}
