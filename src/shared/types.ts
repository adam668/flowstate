export type DrawdownType = 'trailing' | 'static'
export type AccountStatus = 'evaluation' | 'funded' | 'failed'
export type TradeSide = 'long' | 'short'
export type RuleState = 'clean' | 'warning' | 'violation'

export interface RuleProfile {
  id: number
  name: string
  drawdownType: DrawdownType
  drawdownAmount: number
  dailyLossLimit: number | null
  consistencyPercent: number | null
  minTradingDays: number | null
  profitTarget: number | null
}

export interface Account {
  id: number
  firmName: string
  accountName: string
  startingBalance: number
  currency: string
  status: AccountStatus
  ruleProfileId: number
  createdAt: string
}

export interface Tag {
  id: number
  name: string
}

export interface Trade {
  id: number
  accountId: number
  instrument: string
  side: TradeSide
  entryPrice: number
  exitPrice: number
  entryTime: string
  exitTime: string
  size: number
  pnl: number
  rMultiple: number | null
  notes: string | null
  screenshotPaths: string[]
  tagIds: number[]
}

export interface RuleStatus {
  accountId: number
  highWaterMark: number
  currentBalance: number
  drawdownLimit: number
  drawdownUsed: number
  drawdownRemaining: number
  drawdownState: RuleState
  todayPnl: number
  dailyLossLimit: number | null
  dailyLossRemaining: number | null
  dailyLossState: RuleState | 'n/a'
}

export type NewAccount = Omit<Account, 'id' | 'createdAt'>
export type NewRuleProfile = Omit<RuleProfile, 'id'>
export type NewTrade = Omit<Trade, 'id' | 'pnl'>
