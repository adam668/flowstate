import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toLocalDateString } from '../../../shared/date'

const createTradeMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    trades: { create: (...a: unknown[]) => createTradeMock(...a) }
  }
}))

import { TradeQuickAddForm } from './TradeQuickAddForm'

describe('TradeQuickAddForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createTradeMock.mockResolvedValue({ id: 1 })
  })

  it('submits the manually typed P&L rather than a computed one', async () => {
    const onCreated = vi.fn()
    const { container } = render(<TradeQuickAddForm accountId={7} onCreated={onCreated} />)

    fireEvent.change(screen.getByPlaceholderText('Instrument (ES)'), { target: { value: 'NQ' } })
    fireEvent.change(screen.getByPlaceholderText('Size'), { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('Entry'), { target: { value: '18000' } })
    fireEvent.change(screen.getByPlaceholderText('Exit'), { target: { value: '18010' } })
    // Deliberately NOT (exit - entry) * size — the app must trust the typed value.
    fireEvent.change(screen.getByPlaceholderText('P&L'), { target: { value: '-42.5' } })

    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await waitFor(() => expect(createTradeMock).toHaveBeenCalledTimes(1))
    expect(createTradeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 7,
        instrument: 'NQ',
        side: 'long',
        size: 3,
        entryPrice: 18000,
        exitPrice: 18010,
        pnl: -42.5
      })
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('defaults the trade date to today', () => {
    render(<TradeQuickAddForm accountId={7} onCreated={vi.fn()} />)

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    expect(dateInput.value).toBe(toLocalDateString(new Date()))
  })

  it('logs the trade under a backdated date when the date field is changed', async () => {
    const onCreated = vi.fn()
    const { container } = render(<TradeQuickAddForm accountId={7} onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-10' } })
    fireEvent.change(screen.getByPlaceholderText('Instrument (ES)'), { target: { value: 'NQ' } })
    fireEvent.change(screen.getByPlaceholderText('Size'), { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText('Entry'), { target: { value: '18000' } })
    fireEvent.change(screen.getByPlaceholderText('Exit'), { target: { value: '18010' } })
    fireEvent.change(screen.getByPlaceholderText('P&L'), { target: { value: '-42.5' } })

    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await waitFor(() => expect(createTradeMock).toHaveBeenCalledTimes(1))
    const call = createTradeMock.mock.calls[0][0]
    expect(toLocalDateString(new Date(call.entryTime))).toBe('2026-08-10')
    expect(toLocalDateString(new Date(call.exitTime))).toBe('2026-08-10')
  })
})
