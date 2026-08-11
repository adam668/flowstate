import { describe, it, expect } from 'vitest'
import { bindingConstraint } from './DashboardView'
import type { RuleStatus } from '../../../shared/types'

const base: RuleStatus = {
  accountId: 1,
  highWaterMark: 150000,
  currentBalance: 150000,
  drawdownType: 'trailing',
  drawdownAmount: 5000,
  drawdownLimit: 145000,
  drawdownUsed: 0,
  drawdownRemaining: 5000,
  drawdownState: 'clean',
  todayPnl: 0,
  dailyLossLimit: 2500,
  dailyLossRemaining: 2500,
  dailyLossState: 'clean'
}

describe('bindingConstraint', () => {
  it('surfaces a drawdown violation even when the day is flat and clean', () => {
    const { state, limitLabel } = bindingConstraint({
      ...base,
      drawdownState: 'violation',
      drawdownRemaining: -100,
      dailyLossState: 'clean'
    })
    expect(state).toBe('violation')
    expect(limitLabel).toContain('Trailing DD')
  })

  it('surfaces a drawdown warning over a clean day', () => {
    const { state } = bindingConstraint({ ...base, drawdownState: 'warning' })
    expect(state).toBe('warning')
  })

  it('uses the daily loss state when it is strictly worse than drawdown', () => {
    const { state, limitLabel } = bindingConstraint({
      ...base,
      drawdownState: 'clean',
      dailyLossState: 'violation',
      dailyLossRemaining: 0
    })
    expect(state).toBe('violation')
    expect(limitLabel).toContain('Limit $2,500')
  })

  it('treats an n/a daily loss state as clean rather than leaking it into the strip', () => {
    const { state } = bindingConstraint({
      ...base,
      dailyLossLimit: null,
      dailyLossRemaining: null,
      dailyLossState: 'n/a'
    })
    expect(state).toBe('clean')
  })

  it('labels a static drawdown account as Static DD', () => {
    const { limitLabel } = bindingConstraint({ ...base, drawdownType: 'static' })
    expect(limitLabel).toContain('Static DD')
    expect(limitLabel).toContain('$5,000')
  })

  it('never shows a negative remaining figure once breached', () => {
    const { limitLabel } = bindingConstraint({
      ...base,
      drawdownState: 'violation',
      drawdownRemaining: -750
    })
    expect(limitLabel).toContain('$0 of $5,000')
  })
})
