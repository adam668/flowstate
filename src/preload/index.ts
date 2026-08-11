import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  NewAccount,
  NewRuleProfile,
  NewTrade,
  RuleProfile,
  RuleStatus,
  Tag,
  Trade
} from '../shared/types'

// Every method carries an explicit return type: `ipcRenderer.invoke` returns
// Promise<any>, so without these annotations the shared-types contract is erased
// at exactly the boundary the renderer consumes it through.
const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    create: (account: NewAccount): Promise<Account> =>
      ipcRenderer.invoke('accounts:create', account)
  },
  ruleProfiles: {
    create: (profile: NewRuleProfile): Promise<RuleProfile> =>
      ipcRenderer.invoke('ruleProfiles:create', profile)
  },
  trades: {
    listForAccount: (accountId: number): Promise<Trade[]> =>
      ipcRenderer.invoke('trades:listForAccount', accountId),
    create: (trade: NewTrade): Promise<Trade> => ipcRenderer.invoke('trades:create', trade)
  },
  tags: {
    getOrCreate: (name: string): Promise<Tag> => ipcRenderer.invoke('tags:getOrCreate', name)
  },
  ruleStatus: {
    get: (accountId: number): Promise<RuleStatus> =>
      ipcRenderer.invoke('ruleStatus:get', accountId)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type FlowStateApi = typeof api
