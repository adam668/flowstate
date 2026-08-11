import Database from 'better-sqlite3'
import { applySchema } from './schema'

export function createConnection(path: string): Database.Database {
  const db = new Database(path)
  applySchema(db)
  return db
}
