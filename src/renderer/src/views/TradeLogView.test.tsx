import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listAccountsMock = vi.fn()
const listForAccountMock = vi.fn()
const listPlaybooksMock = vi.fn()
const listTagsMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    accounts: { list: (...a: unknown[]) => listAccountsMock(...a) },
    trades: { listForAccount: (...a: unknown[]) => listForAccountMock(...a) },
    playbooks: { list: (...a: unknown[]) => listPlaybooksMock(...a) },
    tags: { list: (...a: unknown[]) => listTagsMock(...a) }
  }
}))

vi.mock('./TradeQuickAddForm', () => ({
  TradeQuickAddForm: () => <div>quick-add-form</div>
}))

vi.mock('./TradeRow', () => ({
  TradeRow: ({ trade }: { trade: { instrument: string } }) => <tr><td>{trade.instrument}</td></tr>
}))

import { TradeLogView } from './TradeLogView'

describe('TradeLogView filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listAccountsMock.mockResolvedValue([
      {
        id: 1,
        firmName: 'Apex',
        accountName: '150K Eval',
        startingBalance: 150000,
        currency: 'USD',
        status: 'evaluation',
        ruleProfileId: 1,
        createdAt: ''
      }
    ])
    listForAccountMock.mockResolvedValue([
      {
        id: 1,
        accountId: 1,
        instrument: 'ES',
        side: 'long',
        entryPrice: 5000,
        exitPrice: 5010,
        entryTime: '2026-08-11T13:35:00Z',
        exitTime: '2026-08-11T13:50:00Z',
        size: 1,
        pnl: 10,
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        screenshotPaths: [],
        tagIds: [],
        playbookId: null
      },
      {
        id: 2,
        accountId: 1,
        instrument: 'NQ',
        side: 'short',
        entryPrice: 18000,
        exitPrice: 17950,
        entryTime: '2026-08-12T13:35:00Z',
        exitTime: '2026-08-12T13:50:00Z',
        size: 1,
        pnl: 20,
        rMultiple: null,
        setupThesis: null,
        executionNotes: null,
        lessonsLearned: null,
        brainstorm: null,
        screenshotPaths: [],
        tagIds: [],
        playbookId: null
      }
    ])
    listPlaybooksMock.mockResolvedValue([])
    listTagsMock.mockResolvedValue([])
  })

  it('narrows the visible rows by instrument text', async () => {
    render(<TradeLogView />)
    await screen.findByText('ES')
    expect(screen.getByText('NQ')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter by instrument'), { target: { value: 'ES' } })

    await waitFor(() => expect(screen.queryByText('NQ')).not.toBeInTheDocument())
    expect(screen.getByText('ES')).toBeInTheDocument()
  })

  it('shows an empty-state message when no trades match the filters', async () => {
    render(<TradeLogView />)
    await screen.findByText('ES')

    fireEvent.change(screen.getByLabelText('Filter by instrument'), { target: { value: 'ZZZ' } })

    expect(await screen.findByText('No trades match these filters.')).toBeInTheDocument()
  })
})
