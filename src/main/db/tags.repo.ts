import type Database from 'better-sqlite3'
import type { Tag } from '../../shared/types'

export function getOrCreateTag(db: Database.Database, name: string): Tag {
  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as
    | { id: number; name: string }
    | undefined
  if (existing) return existing

  const info = db.prepare('INSERT INTO tags (name) VALUES (?)').run(name)
  return { id: Number(info.lastInsertRowid), name }
}
