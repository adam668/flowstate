import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { createAccount, listAccounts, getAccount } from '../db/accounts.repo'
import { createRuleProfile, getRuleProfile } from '../db/ruleProfiles.repo'
import { createTrade, listTradesForAccount } from '../db/trades.repo'
import { getOrCreateTag } from '../db/tags.repo'
import { computeRuleStatus } from '../ruleEngine/computeRuleStatus'
import type { NewAccount, NewRuleProfile, NewTrade } from '../../shared/types'
// Local calendar day, not UTC. Shared with the rule engine so the two can never drift.
import { toLocalDateString } from '../../shared/date'

export function registerHandlers(db: Database.Database): void {
  ipcMain.handle('accounts:list', () => listAccounts(db))
  ipcMain.handle('accounts:create', (_e, account: NewAccount) => createAccount(db, account))

  ipcMain.handle('ruleProfiles:create', (_e, profile: NewRuleProfile) => createRuleProfile(db, profile))

  ipcMain.handle('trades:listForAccount', (_e, accountId: number) => listTradesForAccount(db, accountId))
  ipcMain.handle('trades:create', (_e, trade: NewTrade) => createTrade(db, trade))

  ipcMain.handle('tags:getOrCreate', (_e, name: string) => getOrCreateTag(db, name))

  ipcMain.handle('ruleStatus:get', (_e, accountId: number) => {
    const account = getAccount(db, accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)
    const profile = getRuleProfile(db, account.ruleProfileId)
    if (!profile) throw new Error(`Rule profile ${account.ruleProfileId} not found`)
    const trades = listTradesForAccount(db, accountId)
    const today = toLocalDateString(new Date())
    return computeRuleStatus(account, profile, trades, today)
  })
}
