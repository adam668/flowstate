import { contextBridge, ipcRenderer } from 'electron'
import type { Account, NewAccount, NewRuleProfile, NewTrade } from '../shared/types'

const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    create: (account: NewAccount) => ipcRenderer.invoke('accounts:create', account)
  },
  ruleProfiles: {
    create: (profile: NewRuleProfile) => ipcRenderer.invoke('ruleProfiles:create', profile)
  },
  trades: {
    listForAccount: (accountId: number) => ipcRenderer.invoke('trades:listForAccount', accountId),
    create: (trade: NewTrade) => ipcRenderer.invoke('trades:create', trade)
  },
  tags: {
    getOrCreate: (name: string) => ipcRenderer.invoke('tags:getOrCreate', name)
  },
  ruleStatus: {
    get: (accountId: number) => ipcRenderer.invoke('ruleStatus:get', accountId)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type FlowStateApi = typeof api
