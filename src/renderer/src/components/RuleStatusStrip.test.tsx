import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RuleStatusStrip } from './RuleStatusStrip'

describe('RuleStatusStrip', () => {
  it('renders one segment per item with a warning dot when near threshold', () => {
    render(
      <RuleStatusStrip
        items={[
          { label: 'Apex 150K', pnl: 412, limitLabel: 'Limit $2,500 · 84% remaining', state: 'clean' },
          { label: 'Topstep 50K', pnl: -890, limitLabel: 'Limit $1,000 · 11% remaining', state: 'warning' }
        ]}
      />
    )
    expect(screen.getByText('Apex 150K')).toBeInTheDocument()
    expect(screen.getByText('+$412')).toBeInTheDocument()
    expect(screen.getByText('−$890')).toBeInTheDocument()
    expect(document.querySelectorAll('.dot.warn')).toHaveLength(1)
  })
})
