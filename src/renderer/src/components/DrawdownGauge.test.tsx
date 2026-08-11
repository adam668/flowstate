import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DrawdownGauge } from './DrawdownGauge'

describe('DrawdownGauge', () => {
  it('renders the used and limit amounts', () => {
    render(
      <DrawdownGauge
        firmLabel="Apex · 150K Eval #2"
        accountLabel="Trailing Drawdown"
        usedAmount={3150}
        limitAmount={5000}
        highWaterMark={152340}
      />
    )
    expect(screen.getByText('$3,150 / $5,000')).toBeInTheDocument()
    expect(screen.getByText(/152,340/)).toBeInTheDocument()
  })

  it('marks the hard limit line near the right edge proportional to the limit', () => {
    const { container } = render(
      <DrawdownGauge
        firmLabel="Apex"
        accountLabel="Trailing Drawdown"
        usedAmount={0}
        limitAmount={5000}
        highWaterMark={150000}
      />
    )
    const fill = container.querySelector('.gauge-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })
})
