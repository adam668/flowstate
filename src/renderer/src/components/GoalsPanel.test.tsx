import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GoalsPanel } from './GoalsPanel'

describe('GoalsPanel', () => {
  it('renders the profit target bar when profitTargetPercent is set', () => {
    render(
      <GoalsPanel
        firmLabel="Apex · 150K Eval #2"
        profitTargetPercent={50}
        tradingDaysCount={3}
        tradingDaysRemaining={null}
      />
    )
    expect(screen.getByText('Profit Target')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
  })

  it('omits the profit target bar when profitTargetPercent is null', () => {
    render(
      <GoalsPanel
        firmLabel="Apex"
        profitTargetPercent={null}
        tradingDaysCount={3}
        tradingDaysRemaining={2}
      />
    )
    expect(screen.queryByText('Profit Target')).not.toBeInTheDocument()
  })

  it('renders the trading-days bar when tradingDaysRemaining is not null', () => {
    render(
      <GoalsPanel
        firmLabel="Apex"
        profitTargetPercent={null}
        tradingDaysCount={3}
        tradingDaysRemaining={2}
      />
    )
    expect(screen.getByText('Trading Days')).toBeInTheDocument()
    expect(screen.getByText('3 / 5')).toBeInTheDocument() // 3 + 2
  })

  it('omits the trading-days bar when tradingDaysRemaining is null', () => {
    render(
      <GoalsPanel
        firmLabel="Apex"
        profitTargetPercent={50}
        tradingDaysCount={3}
        tradingDaysRemaining={null}
      />
    )
    expect(screen.queryByText('Trading Days')).not.toBeInTheDocument()
  })

  it('renders a full (not NaN) trading-days bar when both count and remaining are zero', () => {
    const { container } = render(
      <GoalsPanel
        firmLabel="Apex"
        profitTargetPercent={null}
        tradingDaysCount={0}
        tradingDaysRemaining={0}
      />
    )
    const fill = container.querySelector('.goals-bar-fill')
    expect(fill).not.toBeNull()
    expect((fill as HTMLElement).style.width).toBe('100%')
  })
})
