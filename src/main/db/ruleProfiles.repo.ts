import type Database from 'better-sqlite3'
import type { RuleProfile, NewRuleProfile } from '../../shared/types'

function toRuleProfile(row: any): RuleProfile {
  return {
    id: row.id,
    name: row.name,
    drawdownType: row.drawdown_type,
    drawdownAmount: row.drawdown_amount,
    dailyLossLimit: row.daily_loss_limit,
    consistencyPercent: row.consistency_percent,
    minTradingDays: row.min_trading_days,
    profitTarget: row.profit_target
  }
}

export function createRuleProfile(db: Database.Database, profile: NewRuleProfile): RuleProfile {
  const stmt = db.prepare(`
    INSERT INTO rule_profiles
      (name, drawdown_type, drawdown_amount, daily_loss_limit, consistency_percent, min_trading_days, profit_target)
    VALUES (@name, @drawdownType, @drawdownAmount, @dailyLossLimit, @consistencyPercent, @minTradingDays, @profitTarget)
  `)
  const info = stmt.run({
    name: profile.name,
    drawdownType: profile.drawdownType,
    drawdownAmount: profile.drawdownAmount,
    dailyLossLimit: profile.dailyLossLimit,
    consistencyPercent: profile.consistencyPercent,
    minTradingDays: profile.minTradingDays,
    profitTarget: profile.profitTarget
  })
  return getRuleProfile(db, Number(info.lastInsertRowid))!
}

export function getRuleProfile(db: Database.Database, id: number): RuleProfile | undefined {
  const row = db.prepare('SELECT * FROM rule_profiles WHERE id = ?').get(id)
  return row ? toRuleProfile(row) : undefined
}
