import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBanner } from './ErrorBanner'

describe('ErrorBanner', () => {
  it('renders the message in an alert region', () => {
    render(<ErrorBanner message="Account 3 not found" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Account 3 not found')
  })

  it('shows a dismiss control only when an onDismiss handler is supplied', () => {
    const { rerender } = render(<ErrorBanner message="boom" />)
    expect(screen.queryByLabelText('Dismiss error')).toBeNull()

    const onDismiss = vi.fn()
    rerender(<ErrorBanner message="boom" onDismiss={onDismiss} />)
    screen.getByLabelText('Dismiss error').click()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
