import { useEffect } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listEntriesMock = vi.fn()
const deleteEntryMock = vi.fn()
const listTemplatesMock = vi.fn()
const deleteTemplateMock = vi.fn()
const createTemplateMock = vi.fn()
const updateTemplateMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    journalEntries: {
      list: (...a: unknown[]) => listEntriesMock(...a),
      delete: (...a: unknown[]) => deleteEntryMock(...a)
    },
    journalTemplates: {
      list: (...a: unknown[]) => listTemplatesMock(...a),
      create: (...a: unknown[]) => createTemplateMock(...a),
      update: (...a: unknown[]) => updateTemplateMock(...a),
      delete: (...a: unknown[]) => deleteTemplateMock(...a)
    }
  }
}))

const insertBlocksMock = vi.fn()
const editorMountMock = vi.fn()
const fakeEditor = {
  document: [{ id: 'existing', type: 'paragraph' }],
  insertBlocks: (...a: unknown[]) => insertBlocksMock(...a)
}

vi.mock('./JournalEntryEditor', () => ({
  JournalEntryEditor: ({
    date,
    onEditorReady
  }: {
    date: string
    onEditorReady?: (editor: unknown) => void
  }) => {
    useEffect(() => {
      editorMountMock(date)
      onEditorReady?.(fakeEditor)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return <div>editor-for-{date}</div>
  }
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
    listTemplatesMock.mockResolvedValue([
      {
        id: 1,
        name: 'Daily Review',
        content: JSON.stringify([{ type: 'paragraph', content: 'Grade the session' }]),
        createdAt: ''
      }
    ])
    deleteTemplateMock.mockResolvedValue(undefined)
    deleteEntryMock.mockResolvedValue(undefined)
    createTemplateMock.mockResolvedValue({})
    updateTemplateMock.mockResolvedValue({})
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

  it('saves the current document as a template using the inline name input', async () => {
    render(<JournalView />)
    await screen.findByText('Daily Review')

    fireEvent.click(screen.getByText('Save current as template'))
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Pre-market Checklist' }
    })
    fireEvent.click(screen.getByText('Save template'))

    await waitFor(() =>
      expect(createTemplateMock).toHaveBeenCalledWith({
        name: 'Pre-market Checklist',
        content: JSON.stringify(fakeEditor.document)
      })
    )
  })

  it('renames a template through the inline rename input', async () => {
    render(<JournalView />)
    await screen.findByText('Daily Review')

    fireEvent.click(screen.getByLabelText('Rename template Daily Review'))
    fireEvent.change(screen.getByLabelText('Rename template Daily Review'), {
      target: { value: 'Session Review' }
    })
    fireEvent.click(screen.getByText('Save name'))

    await waitFor(() => expect(updateTemplateMock).toHaveBeenCalledWith(1, { name: 'Session Review' }))
  })

  it('appends a template to the existing document rather than replacing it', async () => {
    render(<JournalView />)
    const templateButton = await screen.findByText('Daily Review')

    fireEvent.click(templateButton)

    expect(insertBlocksMock).toHaveBeenCalledWith(
      [{ type: 'paragraph', content: 'Grade the session' }],
      fakeEditor.document[fakeEditor.document.length - 1],
      'after'
    )
  })

  it('deletes a journal entry after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<JournalView />)
    await screen.findByText('2026-08-10')

    fireEvent.click(screen.getByLabelText('Delete journal entry 2026-08-10'))

    await waitFor(() => expect(deleteEntryMock).toHaveBeenCalledWith('2026-08-10'))
  })

  it('does not delete a journal entry when the user cancels the confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<JournalView />)
    await screen.findByText('2026-08-10')

    fireEvent.click(screen.getByLabelText('Delete journal entry 2026-08-10'))

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(deleteEntryMock).not.toHaveBeenCalled()
  })

  it('remounts the entry editor after a delete so stale content is not autosaved back', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<JournalView />)
    await screen.findByText('2026-08-10')
    const mountsBefore = editorMountMock.mock.calls.length

    fireEvent.click(screen.getByLabelText('Delete journal entry 2026-08-10'))

    await waitFor(() => expect(editorMountMock.mock.calls.length).toBeGreaterThan(mountsBefore))
  })

  it('deletes a template after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<JournalView />)
    await screen.findByText('Daily Review')

    fireEvent.click(screen.getByLabelText('Delete template Daily Review'))

    await waitFor(() => expect(deleteTemplateMock).toHaveBeenCalledWith(1))
  })
})
