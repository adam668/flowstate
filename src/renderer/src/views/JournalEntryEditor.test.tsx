import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEditor = { document: [{ type: 'paragraph', content: 'hello' }] }

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: vi.fn(() => mockEditor)
}))

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ onChange }: { onChange: () => void }) => (
    <button type="button" onClick={onChange}>
      simulate-edit
    </button>
  )
}))

vi.mock('@blocknote/core/fonts/inter.css', () => ({}))
vi.mock('@blocknote/mantine/style.css', () => ({}))

const getByDateMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    journalEntries: {
      getByDate: (...args: unknown[]) => getByDateMock(...args),
      upsert: (...args: unknown[]) => upsertMock(...args)
    },
    media: { saveImage: vi.fn() }
  }
}))

import { JournalEntryEditor } from './JournalEntryEditor'

describe('JournalEntryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsertMock.mockResolvedValue({})
  })

  it('loads the entry for the given date and renders the editor once ready', async () => {
    getByDateMock.mockResolvedValue({
      id: 1,
      date: '2026-08-13',
      content: '[]',
      createdAt: '',
      updatedAt: ''
    })
    render(<JournalEntryEditor date="2026-08-13" />)
    await waitFor(() => expect(screen.getByText('simulate-edit')).toBeInTheDocument())
    expect(getByDateMock).toHaveBeenCalledWith('2026-08-13')
  })

  it('starts with an empty document when no entry exists yet for the date', async () => {
    getByDateMock.mockResolvedValue(undefined)
    render(<JournalEntryEditor date="2026-08-14" />)
    await waitFor(() => expect(screen.getByText('simulate-edit')).toBeInTheDocument())
  })

  it('round-trips an edit through the IPC layer after the autosave debounce', async () => {
    vi.useFakeTimers()
    try {
      getByDateMock.mockResolvedValue(undefined)
      render(<JournalEntryEditor date="2026-08-13" />)
      // Flush the pending getByDate promise so the editor body renders.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('simulate-edit')).toBeInTheDocument()

      fireEvent.click(screen.getByText('simulate-edit'))
      expect(upsertMock).not.toHaveBeenCalled()

      vi.runAllTimers()

      expect(upsertMock).toHaveBeenCalledWith({
        date: '2026-08-13',
        content: JSON.stringify(mockEditor.document)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('calls onEditorReady once the editor is created', async () => {
    getByDateMock.mockResolvedValue(undefined)
    const onEditorReady = vi.fn()
    render(<JournalEntryEditor date="2026-08-14" onEditorReady={onEditorReady} />)
    await waitFor(() => expect(onEditorReady).toHaveBeenCalledWith(mockEditor))
  })
})
