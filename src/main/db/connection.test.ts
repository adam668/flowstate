import { describe, it, expect } from 'vitest'
import { createConnection } from './connection'

describe('createConnection', () => {
  it('creates all expected tables', () => {
    const db = createConnection(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)

    expect(tables).toEqual(
      expect.arrayContaining(['rule_profiles', 'accounts', 'tags', 'trades', 'trade_tags'])
    )
  })
})
