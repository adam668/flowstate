import type { Trade, Tag } from './types'

export interface TagWinRate {
  tagName: string
  wins: number
  losses: number
  winRate: number
}

export interface HourWinRate {
  hour: number
  wins: number
  losses: number
  winRate: number
}

export interface RMultipleBucket {
  bucket: string
  count: number
}

export function computeRMultipleDistribution(trades: Trade[]): RMultipleBucket[] {
  const byBucket = new Map<number, RMultipleBucket>()

  for (const trade of trades) {
    if (trade.rMultiple === null) continue
    const floor = Math.floor(trade.rMultiple)
    const bucket = `${floor}R to ${floor + 1}R`
    const existing = byBucket.get(floor) ?? { bucket, count: 0 }
    existing.count += 1
    byBucket.set(floor, existing)
  }

  return [...byBucket.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value)
}

export function computeWinRateByHour(trades: Trade[]): HourWinRate[] {
  const byHour = new Map<number, HourWinRate>()

  for (const trade of trades) {
    const hour = new Date(trade.exitTime).getHours()
    const existing = byHour.get(hour) ?? { hour, wins: 0, losses: 0, winRate: 0 }
    if (trade.pnl > 0) existing.wins += 1
    else existing.losses += 1
    byHour.set(hour, existing)
  }

  return [...byHour.values()].map((entry) => ({
    ...entry,
    winRate: entry.wins / (entry.wins + entry.losses)
  }))
}

export function computeWinRateByTag(trades: Trade[], tags: Tag[]): TagWinRate[] {
  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]))
  const byTag = new Map<string, TagWinRate>()

  for (const trade of trades) {
    for (const tagId of trade.tagIds) {
      const tagName = tagNameById.get(tagId)
      if (!tagName) continue
      const existing = byTag.get(tagName) ?? { tagName, wins: 0, losses: 0, winRate: 0 }
      if (trade.pnl > 0) existing.wins += 1
      else existing.losses += 1
      byTag.set(tagName, existing)
    }
  }

  return [...byTag.values()].map((entry) => ({
    ...entry,
    winRate: entry.wins / (entry.wins + entry.losses)
  }))
}
