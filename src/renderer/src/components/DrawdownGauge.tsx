interface DrawdownGaugeProps {
  firmLabel: string
  accountLabel: string
  usedAmount: number
  limitAmount: number
  highWaterMark: number
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function DrawdownGauge({
  firmLabel,
  accountLabel,
  usedAmount,
  limitAmount,
  highWaterMark
}: DrawdownGaugeProps): JSX.Element {
  const fillPercent = Math.min(100, Math.max(0, (usedAmount / limitAmount) * 100))
  const remaining = limitAmount - usedAmount

  return (
    <div className="gauge-card">
      <div className="gauge-top">
        <div>
          <span className="gauge-firm">{firmLabel}</span>
          <br />
          <span className="gauge-title">{accountLabel}</span>
        </div>
        <span className="gauge-value">
          {formatCurrency(usedAmount)} / {formatCurrency(limitAmount)}
        </span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${fillPercent}%` }} />
        <div className="gauge-buffer-line" style={{ left: '100%' }} />
      </div>
      <div className="gauge-foot">
        <span>HIGH-WATER {formatCurrency(highWaterMark)}</span>
        <span>BUFFER REMAINING {formatCurrency(remaining)}</span>
      </div>
    </div>
  )
}
