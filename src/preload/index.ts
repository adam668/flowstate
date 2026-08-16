import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  NewAccount,
  NewRuleProfile,
  NewTrade,
  RuleProfile,
  RuleStatus,
  Tag,
  Trade,
  UpdateStatus,
  JournalEntry,
  NewJournalEntry,
  JournalTemplate,
  NewJournalTemplate,
  UpdateJournalTemplate,
  UpdateTradeReflection
} from '../shared/types'

// Every method carries an explicit return type: `ipcRenderer.invoke` returns
// Promise<any>, so without these annotations the shared-types contract is erased
// at exactly the boundary the renderer consumes it through.
const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    create: (account: NewAccount): Promise<Account> =>
      ipcRenderer.invoke('accounts:create', account),
    delete: (id: number, withTrades: boolean): Promise<void> =>
      ipcRenderer.invoke('accounts:delete', id, withTrades)
  },
  ruleProfiles: {
    create: (profile: NewRuleProfile): Promise<RuleProfile> =>
      ipcRenderer.invoke('ruleProfiles:create', profile)
  },
  trades: {
    listForAccount: (accountId: number): Promise<Trade[]> =>
      ipcRenderer.invoke('trades:listForAccount', accountId),
    create: (trade: NewTrade): Promise<Trade> => ipcRenderer.invoke('trades:create', trade),
    listAll: (): Promise<Trade[]> => ipcRenderer.invoke('trades:listAll'),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('trades:delete', id),
    update: (id: number, updates: UpdateTradeReflection): Promise<Trade> =>
      ipcRenderer.invoke('trades:update', id, updates)
  },
  tags: {
    getOrCreate: (name: string): Promise<Tag> => ipcRenderer.invoke('tags:getOrCreate', name),
    list: (): Promise<Tag[]> => ipcRenderer.invoke('tags:list')
  },
  ruleStatus: {
    get: (accountId: number): Promise<RuleStatus> =>
      ipcRenderer.invoke('ruleStatus:get', accountId)
  },
  updates: {
    restartAndInstall: (): Promise<void> => ipcRenderer.invoke('updates:restart'),
    getStatus: (): Promise<UpdateStatus | null> => ipcRenderer.invoke('updates:getStatus'),
    onStatusChange: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
        callback(status)
      ipcRenderer.on('updates:status', listener)
      return () => ipcRenderer.removeListener('updates:status', listener)
    }
  },
  journalEntries: {
    getByDate: (date: string): Promise<JournalEntry | undefined> =>
      ipcRenderer.invoke('journalEntries:getByDate', date),
    upsert: (entry: NewJournalEntry): Promise<JournalEntry> =>
      ipcRenderer.invoke('journalEntries:upsert', entry),
    list: (): Promise<JournalEntry[]> => ipcRenderer.invoke('journalEntries:list'),
    delete: (date: string): Promise<void> => ipcRenderer.invoke('journalEntries:delete', date)
  },
  journalTemplates: {
    list: (): Promise<JournalTemplate[]> => ipcRenderer.invoke('journalTemplates:list'),
    create: (template: NewJournalTemplate): Promise<JournalTemplate> =>
      ipcRenderer.invoke('journalTemplates:create', template),
    update: (id: number, updates: UpdateJournalTemplate): Promise<JournalTemplate> =>
      ipcRenderer.invoke('journalTemplates:update', id, updates),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('journalTemplates:delete', id)
  },
  media: {
    saveImage: (base64Data: string, mimeType: string): Promise<string> =>
      ipcRenderer.invoke('media:saveImage', base64Data, mimeType)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type FlowStateApi = typeof api
