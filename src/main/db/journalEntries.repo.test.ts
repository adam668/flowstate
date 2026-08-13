import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { getJournalEntryByDate, upsertJournalEntry, listJournalEntries } from './journalEntries.repo'

describe('journalEntries.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  it('returns undefined for a date with no entry', () => {
    expect(getJournalEntryByDate(db, '2026-08-13')).toBeUndefined()
  })

  it('creates an entry on first upsert and updates it on the second', () => {
    const created = upsertJournalEntry(db, { date: '2026-08-13', content: '[]' })
    expect(created.date).toBe('2026-08-13')
    expect(created.content).toBe('[]')

    const updated = upsertJournalEntry(db, {
      date: '2026-08-13',
      content: '[{"type":"paragraph"}]'
    })
    expect(updated.id).toBe(created.id)
    expect(updated.content).toBe('[{"type":"paragraph"}]')
    expect(listJournalEntries(db)).toHaveLength(1)
  })

  it('lists entries newest date first', () => {
    upsertJournalEntry(db, { date: '2026-08-01', content: '[]' })
    upsertJournalEntry(db, { date: '2026-08-13', content: '[]' })
    const entries = listJournalEntries(db)
    expect(entries.map((e) => e.date)).toEqual(['2026-08-13', '2026-08-01'])
  })
})
