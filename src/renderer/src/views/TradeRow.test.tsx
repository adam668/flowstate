import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const deleteTradeMock = vi.fn()
const updateTradeMock = vi.fn()
const saveImageMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    trades: {
      delete: (...a: unknown[]) => deleteTradeMock(...a),
      update: (...a: unknown[]) => updateTradeMock(...a)
    },
    media: {
      saveImage: (...a: unknown[]) => saveImageMock(...a)
    }
  }
}))

import { TradeRow } from './TradeRow'
import type { Trade, Playbook } from '../../../shared/types'

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
  tagIds: [],
  playbookId: null
}

const samplePlaybooks: Playbook[] = [
  { id: 1, name: 'ORB Breakout', criteria: null, createdAt: '' },
  { id: 2, name: 'Fade the Open', criteria: null, createdAt: '' }
]

function renderRow(): void {
  render(
    <table>
      <tbody>
        <TradeRow
          trade={sampleTrade}
          playbooks={samplePlaybooks}
          onChanged={vi.fn()}
          onError={vi.fn()}
        />
      </tbody>
    </table>
  )
}

describe('TradeRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteTradeMock.mockResolvedValue(undefined)
    updateTradeMock.mockResolvedValue(undefined)
    saveImageMock.mockResolvedValue('flowstate-media://new-screenshot.png')
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
        brainstorm: null,
        playbookId: null,
        screenshotPaths: []
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
        brainstorm: null,
        playbookId: null,
        screenshotPaths: []
      })
    )
  })

  it('sends the selected playbook id along with the reflection fields on save', async () => {
    renderRow()

    fireEvent.click(screen.getByLabelText('Expand trade details'))

    fireEvent.change(screen.getByLabelText('Playbook'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Save notes'))

    await waitFor(() =>
      expect(updateTradeMock).toHaveBeenCalledWith(42, {
        pnl: 125.5,
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        playbookId: 2,
        screenshotPaths: []
      })
    )
  })

  it('uploads a screenshot and includes it in the save payload', async () => {
    renderRow()

    fireEvent.click(screen.getByLabelText('Expand trade details'))

    const file = new File(['fake-image-bytes'], 'chart.png', { type: 'image/png' })
    const fileInput = screen.getByLabelText('Add screenshot') as HTMLInputElement
    await waitFor(() => fireEvent.change(fileInput, { target: { files: [file] } }))

    await waitFor(() => expect(saveImageMock).toHaveBeenCalled())
    expect(await screen.findByAltText('Trade screenshot 1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Save notes'))

    await waitFor(() =>
      expect(updateTradeMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ screenshotPaths: ['flowstate-media://new-screenshot.png'] })
      )
    )
  })

  it('removes a screenshot from the in-memory list without deleting the file', async () => {
    renderRow()

    fireEvent.click(screen.getByLabelText('Expand trade details'))
    const file = new File(['fake-image-bytes'], 'chart.png', { type: 'image/png' })
    const fileInput = screen.getByLabelText('Add screenshot') as HTMLInputElement
    await waitFor(() => fireEvent.change(fileInput, { target: { files: [file] } }))
    await screen.findByAltText('Trade screenshot 1')

    fireEvent.click(screen.getByLabelText('Remove screenshot 1'))
    fireEvent.click(screen.getByText('Save notes'))

    await waitFor(() =>
      expect(updateTradeMock).toHaveBeenCalledWith(42, expect.objectContaining({ screenshotPaths: [] }))
    )
  })
})
