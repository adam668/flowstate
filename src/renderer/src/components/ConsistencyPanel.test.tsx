import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ConsistencyPanel } from './ConsistencyPanel'

describe('ConsistencyPanel', () => {
  it('renders the best-day percent against the consistency limit', () => {
    render(
      <ConsistencyPanel
        firmLabel="Apex · 150K Eval #2"
        bestDayProfitPercent={30}
        consistencyPercent={40}
        state="clean"
      />
    )
    expect(screen.getByText('30.0% / 40%')).toBeInTheDocument()
  })

  it('fills the bar proportional to the limit, capped at 100%', () => {
    const { container } = render(
      <ConsistencyPanel
        firmLabel="Apex"
        bestDayProfitPercent={60}
        consistencyPercent={40}
        state="violation"
      />
    )
    const fill = container.querySelector('.gauge-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })
})
