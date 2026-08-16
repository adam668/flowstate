import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { createAccount, listAccounts, getAccount, deleteAccount } from '../db/accounts.repo'
import { createRuleProfile, getRuleProfile } from '../db/ruleProfiles.repo'
import {
  createTrade,
  listTradesForAccount,
  listAllTrades,
  deleteTrade,
  updateTradeReflection
} from '../db/trades.repo'
import { getOrCreateTag } from '../db/tags.repo'
import { computeRuleStatus } from '../ruleEngine/computeRuleStatus'
import {
  getJournalEntryByDate,
  upsertJournalEntry,
  listJournalEntries,
  deleteJournalEntry
} from '../db/journalEntries.repo'
import {
  listJournalTemplates,
  createJournalTemplate,
  updateJournalTemplate,
  deleteJournalTemplate
} from '../db/journalTemplates.repo'
import type {
  NewAccount,
  NewRuleProfile,
  NewTrade,
  NewJournalEntry,
  NewJournalTemplate,
  UpdateJournalTemplate,
  UpdateTradeReflection
} from '../../shared/types'
// Local calendar day, not UTC. Shared with the rule engine so the two can never drift.
import { toLocalDateString } from '../../shared/date'

export function registerHandlers(db: Database.Database): void {
  ipcMain.handle('accounts:list', () => listAccounts(db))
  ipcMain.handle('accounts:create', (_e, account: NewAccount) => createAccount(db, account))
  ipcMain.handle('accounts:delete', (_e, id: number, withTrades: boolean) =>
    deleteAccount(db, id, { withTrades })
  )

  ipcMain.handle('ruleProfiles:create', (_e, profile: NewRuleProfile) =>
    createRuleProfile(db, profile)
  )

  ipcMain.handle('trades:listForAccount', (_e, accountId: number) =>
    listTradesForAccount(db, accountId)
  )
  ipcMain.handle('trades:create', (_e, trade: NewTrade) => createTrade(db, trade))
  ipcMain.handle('trades:listAll', () => listAllTrades(db))
  ipcMain.handle('trades:delete', (_e, id: number) => deleteTrade(db, id))
  ipcMain.handle('trades:update', (_e, id: number, updates: UpdateTradeReflection) =>
    updateTradeReflection(db, id, updates)
  )

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

  ipcMain.handle('journalEntries:getByDate', (_e, date: string) => getJournalEntryByDate(db, date))
  ipcMain.handle('journalEntries:upsert', (_e, entry: NewJournalEntry) =>
    upsertJournalEntry(db, entry)
  )
  ipcMain.handle('journalEntries:list', () => listJournalEntries(db))
  ipcMain.handle('journalEntries:delete', (_e, date: string) => deleteJournalEntry(db, date))

  ipcMain.handle('journalTemplates:list', () => listJournalTemplates(db))
  ipcMain.handle('journalTemplates:create', (_e, template: NewJournalTemplate) =>
    createJournalTemplate(db, template)
  )
  ipcMain.handle('journalTemplates:update', (_e, id: number, updates: UpdateJournalTemplate) =>
    updateJournalTemplate(db, id, updates)
  )
  ipcMain.handle('journalTemplates:delete', (_e, id: number) => deleteJournalTemplate(db, id))
}
