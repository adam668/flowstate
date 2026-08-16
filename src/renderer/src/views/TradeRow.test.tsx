import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const deleteTradeMock = vi.fn()
const updateTradeMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    trades: {
      delete: (...a: unknown[]) => deleteTradeMock(...a),
      update: (...a: unknown[]) => updateTradeMock(...a)
    }
  }
}))

import { TradeRow } from './TradeRow'
import type { Trade } from '../../../shared/types'

const sampleTrade: Trade = {
  id: 42,
  accountId: 1,
  instrument: 'ES',
  side: 'long',
  entryPrice: 5000,
  exitPrice: 5010,
  entryTime: '2026-08-13T14:00:00Z',
  exitTime: '2026-08-13T14:30:00Z',
  size: 2,
  pnl: 125.5,
  rMultiple: null,
  setupThesis: null,
  executionNotes: null,
  lessonsLearned: null,
  brainstorm: null,
  screenshotPaths: [],
  tagIds: []
}

function renderRow(): void {
  render(
    <table>
      <tbody>
        <TradeRow trade={sampleTrade} onChanged={vi.fn()} onError={vi.fn()} />
      </tbody>
    </table>
  )
}

describe('TradeRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteTradeMock.mockResolvedValue(undefined)
    updateTradeMock.mockResolvedValue(undefined)
  })

  it('deletes the trade after the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderRow()

    fireEvent.click(screen.getByLabelText('Delete trade ES'))

    await waitFor(() => expect(deleteTradeMock).toHaveBeenCalledWith(42))
  })

  it('does not delete the trade when the user cancels the confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderRow()

    fireEvent.click(screen.getByLabelText('Delete trade ES'))

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(deleteTradeMock).not.toHaveBeenCalled()
  })

  it('sends an edited P&L along with the reflection fields on save', async () => {
    renderRow()

    fireEvent.click(screen.getByLabelText('Expand trade details'))

    const pnlInput = screen.getByLabelText('P&L ($)') as HTMLInputElement
    expect(pnlInput.value).toBe('125.5')
    fireEvent.change(pnlInput, { target: { value: '-80.25' } })
    fireEvent.change(screen.getByLabelText('Lessons Learned'), {
      target: { value: 'Sized too big' }
    })
    fireEvent.click(screen.getByText('Save notes'))

    await waitFor(() =>
      expect(updateTradeMock).toHaveBeenCalledWith(42, {
        pnl: -80.25,
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: 'Sized too big',
        brainstorm: null
      })
    )
  })

  it('sends an edited R-multiple along with the reflection fields on save', async () => {
    renderRow()

    fireEvent.click(screen.getByLabelText('Expand trade details'))

    const rMultipleInput = screen.getByLabelText('R-Multiple') as HTMLInputElement
    expect(rMultipleInput.value).toBe('')
    fireEvent.change(rMultipleInput, { target: { value: '2.5' } })
    fireEvent.click(screen.getByText('Save notes'))

    await waitFor(() =>
      expect(updateTradeMock).toHaveBeenCalledWith(42, {
        pnl: 125.5,
        rMultiple: 2.5,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null
      })
    )
  })
})
