import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listPlaybooksMock = vi.fn()
const createPlaybookMock = vi.fn()
const deletePlaybookMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    playbooks: {
      list: (...a: unknown[]) => listPlaybooksMock(...a),
      create: (...a: unknown[]) => createPlaybookMock(...a),
      delete: (...a: unknown[]) => deletePlaybookMock(...a)
    }
  }
}))

import { PlaybooksView } from './PlaybooksView'

describe('PlaybooksView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPlaybooksMock.mockResolvedValue([
      { id: 1, name: 'ORB Breakout', criteria: 'Break of opening range', createdAt: '' }
    ])
    createPlaybookMock.mockResolvedValue({
      id: 2,
      name: 'Fade the Open',
      criteria: null,
      createdAt: ''
    })
    deletePlaybookMock.mockResolvedValue(undefined)
  })

  it('lists existing playbooks', async () => {
    render(<PlaybooksView />)
    expect(await screen.findByText('ORB Breakout')).toBeInTheDocument()
    expect(screen.getByText('Break of opening range')).toBeInTheDocument()
  })

  it('creates a new playbook from the form', async () => {
    render(<PlaybooksView />)
    await screen.findByText('ORB Breakout')

    fireEvent.change(screen.getByLabelText('Playbook name'), {
      target: { value: 'Fade the Open' }
    })
    fireEvent.click(screen.getByText('Add playbook'))

    await waitFor(() =>
      expect(createPlaybookMock).toHaveBeenCalledWith({ name: 'Fade the Open', criteria: null })
    )
  })

  it('deletes a playbook after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PlaybooksView />)

    fireEvent.click(await screen.findByLabelText('Delete playbook ORB Breakout'))

    await waitFor(() => expect(deletePlaybookMock).toHaveBeenCalledWith(1))
  })
})
