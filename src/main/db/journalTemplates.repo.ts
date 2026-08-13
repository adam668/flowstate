import type Database from 'better-sqlite3'
import type { JournalTemplate, NewJournalTemplate, UpdateJournalTemplate } from '../../shared/types'

function toJournalTemplate(row: any): JournalTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    createdAt: row.created_at
  }
}

export function listJournalTemplates(db: Database.Database): JournalTemplate[] {
  const rows = db.prepare('SELECT * FROM journal_templates ORDER BY created_at DESC').all()
  return rows.map(toJournalTemplate)
}

export function createJournalTemplate(
  db: Database.Database,
  template: NewJournalTemplate
): JournalTemplate {
  const info = db
    .prepare('INSERT INTO journal_templates (name, content) VALUES (@name, @content)')
    .run(template)
  const row = db
    .prepare('SELECT * FROM journal_templates WHERE id = ?')
    .get(Number(info.lastInsertRowid))
  return toJournalTemplate(row)
}

export function updateJournalTemplate(
  db: Database.Database,
  id: number,
  updates: UpdateJournalTemplate
): JournalTemplate {
  const existing = db.prepare('SELECT * FROM journal_templates WHERE id = ?').get(id) as
    | { id: number; name: string; content: string; created_at: string }
    | undefined
  if (!existing) throw new Error(`Journal template ${id} not found`)
  const name = updates.name ?? existing.name
  const content = updates.content ?? existing.content
  db.prepare('UPDATE journal_templates SET name = ?, content = ? WHERE id = ?').run(
    name,
    content,
    id
  )
  return toJournalTemplate({ ...existing, name, content })
}

export function deleteJournalTemplate(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM journal_templates WHERE id = ?').run(id)
}
