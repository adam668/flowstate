import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

const listAllMock = vi.fn()
vi.mock('../api/client', () => ({
  flowStateApi: { trades: { listAll: (...args: unknown[]) => listAllMock(...args) } }
}))

vi.mock('./JournalEntryEditor', () => ({
  JournalEntryEditor: ({ date }: { date: string }) => <div>editor-for-{date}</div>
}))

import { CalendarView } from './CalendarView'
import type { Trade } from '../../../shared/types'

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: 1,
    accountId: 1,
    instrument: 'ES',
    side: 'long',
    entryPrice: 5000,
    exitPrice: 5000,
    entryTime: '2026-08-13T14:00:00Z',
    exitTime: '2026-08-13T14:00:00Z',
    size: 1,
    pnl: 0,
    rMultiple: null,
    notes: null,
    screenshotPaths: [],
    tagIds: [],
    ...overrides
  }
}

describe('CalendarView', () => {
  it('opens the journal entry editor for a clicked day with trades', async () => {
    const now = new Date()
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`
    listAllMock.mockResolvedValue([trade({ pnl: 250, exitTime: `${dateKey}T14:00:00Z` })])

    const { container } = render(<CalendarView />)
    await waitFor(() => expect(listAllMock).toHaveBeenCalled())

    const positiveCell = await waitFor(() => {
      const el = container.querySelector('.calendar-cell.pos')
      if (!el) throw new Error('not rendered yet')
      return el
    })
    fireEvent.click(positiveCell)

    expect(await screen.findByText(/editor-for-/)).toBeInTheDocument()
  })
})
