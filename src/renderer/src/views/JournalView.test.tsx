import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listEntriesMock = vi.fn()
const listTemplatesMock = vi.fn()
const deleteTemplateMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    journalEntries: { list: (...a: unknown[]) => listEntriesMock(...a) },
    journalTemplates: {
      list: (...a: unknown[]) => listTemplatesMock(...a),
      create: vi.fn(),
      delete: (...a: unknown[]) => deleteTemplateMock(...a)
    }
  }
}))

vi.mock('./JournalEntryEditor', () => ({
  JournalEntryEditor: ({ date }: { date: string }) => <div>editor-for-{date}</div>
}))

import { JournalView } from './JournalView'

describe('JournalView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listEntriesMock.mockResolvedValue([
      {
        id: 1,
        date: '2026-08-10',
        content: JSON.stringify([{ content: [{ text: 'Pre-market plan' }] }]),
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 2,
        date: '2026-08-11',
        content: JSON.stringify([{ content: [{ text: 'Revenge trade after loss' }] }]),
        createdAt: '',
        updatedAt: ''
      }
    ])
    listTemplatesMock.mockResolvedValue([{ id: 1, name: 'Daily Review', content: '[]', createdAt: '' }])
    deleteTemplateMock.mockResolvedValue(undefined)
  })

  it('filters the entry list by search text', async () => {
    render(<JournalView />)
    await screen.findByText('2026-08-10')
    expect(screen.getByText('2026-08-11')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search entries…'), {
      target: { value: 'revenge' }
    })

    expect(screen.queryByText('2026-08-10')).not.toBeInTheDocument()
    expect(screen.getByText('2026-08-11')).toBeInTheDocument()
  })

  it('deletes a template after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<JournalView />)
    await screen.findByText('Daily Review')

    fireEvent.click(screen.getByLabelText('Delete template Daily Review'))

    await waitFor(() => expect(deleteTemplateMock).toHaveBeenCalledWith(1))
  })
})
