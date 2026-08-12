import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UpdateBanner } from './UpdateBanner'

describe('UpdateBanner', () => {
  it('shows the version and calls onRestart when the button is clicked', () => {
    const onRestart = vi.fn()
    render(<UpdateBanner version="1.2.3" onRestart={onRestart} />)

    expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /restart/i }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })
})
