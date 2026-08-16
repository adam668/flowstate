import type Database from 'better-sqlite3'
import type { JournalEntry, NewJournalEntry } from '../../shared/types'

function toJournalEntry(row: any): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function getJournalEntryByDate(
  db: Database.Database,
  date: string
): JournalEntry | undefined {
  const row = db.prepare('SELECT * FROM journal_entries WHERE date = ?').get(date)
  return row ? toJournalEntry(row) : undefined
}

export function upsertJournalEntry(db: Database.Database, entry: NewJournalEntry): JournalEntry {
  db.prepare(
    `
    INSERT INTO journal_entries (date, content, updated_at)
    VALUES (@date, @content, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `
  ).run(entry)
  return getJournalEntryByDate(db, entry.date)!
}

export function listJournalEntries(db: Database.Database): JournalEntry[] {
  const rows = db.prepare('SELECT * FROM journal_entries ORDER BY date DESC').all()
  return rows.map(toJournalEntry)
}

export function deleteJournalEntry(db: Database.Database, date: string): void {
  db.prepare('DELETE FROM journal_entries WHERE date = ?').run(date)
}
