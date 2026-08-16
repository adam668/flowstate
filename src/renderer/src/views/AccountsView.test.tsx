import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const listAccountsMock = vi.fn()
const deleteAccountMock = vi.fn()
const ruleStatusMock = vi.fn()
const listForAccountMock = vi.fn()

vi.mock('../api/client', () => ({
  flowStateApi: {
    accounts: {
      list: (...a: unknown[]) => listAccountsMock(...a),
      delete: (...a: unknown[]) => deleteAccountMock(...a)
    },
    ruleStatus: { get: (...a: unknown[]) => ruleStatusMock(...a) },
    trades: { listForAccount: (...a: unknown[]) => listForAccountMock(...a) }
  }
}))

vi.mock('./AccountForm', () => ({
  AccountForm: () => <div>account-form</div>
}))

import { AccountsView } from './AccountsView'

describe('AccountsView delete flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listAccountsMock.mockResolvedValue([
      {
        id: 9,
        firmName: 'Apex',
        accountName: '150K Eval',
        startingBalance: 150000,
        currency: 'USD',
        status: 'evaluation',
        ruleProfileId: 1,
        createdAt: ''
      }
    ])
    ruleStatusMock.mockResolvedValue({
      accountId: 9,
      highWaterMark: 150000,
      currentBalance: 150000,
      drawdownType: 'trailing',
      drawdownAmount: 5000,
      drawdownLimit: 145000,
      drawdownUsed: 0,
      drawdownRemaining: 5000,
      drawdownState: 'clean',
      todayPnl: 0,
      dailyLossLimit: 2500,
      dailyLossRemaining: 2500,
      dailyLossState: 'clean'
    })
    listForAccountMock.mockResolvedValue([{ id: 1 }, { id: 2 }])
    deleteAccountMock.mockResolvedValue(undefined)
  })

  it('deletes the account with withTrades=true after confirmation when it has trades', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<AccountsView />)

    const button = await screen.findByLabelText('Delete account Apex 150K Eval')
    fireEvent.click(button)

    await waitFor(() => expect(deleteAccountMock).toHaveBeenCalledWith(9, true))
  })

  it('does not delete the account when the user cancels the confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<AccountsView />)

    const button = await screen.findByLabelText('Delete account Apex 150K Eval')
    fireEvent.click(button)

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(deleteAccountMock).not.toHaveBeenCalled()
  })
})
