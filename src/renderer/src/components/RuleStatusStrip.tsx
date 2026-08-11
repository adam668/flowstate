export interface StripItem {
  label: string
  pnl: number
  limitLabel: string
  state: 'clean' | 'warning' | 'violation'
}

function formatSignedCurrency(n: number): string {
  const sign = n >= 0 ? '+' : '−'
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

export function RuleStatusStrip({ items }: { items: StripItem[] }): JSX.Element {
  return (
    <div className="strip">
      {items.map((item) => (
        <div className="strip-item" key={item.label}>
          <span className="strip-label">{item.label}</span>
          <span className={`strip-value ${item.pnl >= 0 ? 'pos' : 'neg'}`}>
            {(item.state === 'warning' || item.state === 'violation') && (
              <span className={`dot ${item.state === 'violation' ? 'violation' : 'warn'}`} />
            )}
            {formatSignedCurrency(item.pnl)}
          </span>
          <div className="strip-sub">{item.limitLabel}</div>
        </div>
      ))}
    </div>
  )
}
