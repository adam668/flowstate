import type Database from 'better-sqlite3'
import type { Playbook, NewPlaybook, UpdatePlaybook } from '../../shared/types'

function toPlaybook(row: any): Playbook {
  return { id: row.id, name: row.name, criteria: row.criteria, createdAt: row.created_at }
}

export function createPlaybook(db: Database.Database, playbook: NewPlaybook): Playbook {
  const info = db
    .prepare('INSERT INTO playbooks (name, criteria) VALUES (?, ?)')
    .run(playbook.name, playbook.criteria)
  return toPlaybook(db.prepare('SELECT * FROM playbooks WHERE id = ?').get(info.lastInsertRowid))
}

export function listPlaybooks(db: Database.Database): Playbook[] {
  return (db.prepare('SELECT * FROM playbooks ORDER BY name ASC').all() as any[]).map(toPlaybook)
}

export function updatePlaybook(
  db: Database.Database,
  id: number,
  updates: UpdatePlaybook
): Playbook {
  const existing = db.prepare('SELECT * FROM playbooks WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Playbook ${id} not found`)

  const name = updates.name !== undefined ? updates.name : existing.name
  const criteria = updates.criteria !== undefined ? updates.criteria : existing.criteria

  db.prepare('UPDATE playbooks SET name = ?, criteria = ? WHERE id = ?').run(name, criteria, id)
  return toPlaybook(db.prepare('SELECT * FROM playbooks WHERE id = ?').get(id))
}

export function deletePlaybook(db: Database.Database, id: number): void {
  const runInTransaction = db.transaction(() => {
    db.prepare('UPDATE trades SET playbook_id = NULL WHERE playbook_id = ?').run(id)
    db.prepare('DELETE FROM playbooks WHERE id = ?').run(id)
  })
  runInTransaction()
}
