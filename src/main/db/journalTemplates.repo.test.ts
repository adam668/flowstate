import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import {
  listJournalTemplates,
  createJournalTemplate,
  updateJournalTemplate,
  deleteJournalTemplate
} from './journalTemplates.repo'

describe('journalTemplates.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  it('creates and lists a template', () => {
    const template = createJournalTemplate(db, { name: 'Daily Review', content: '[]' })
    expect(template.name).toBe('Daily Review')
    expect(listJournalTemplates(db)).toHaveLength(1)
  })

  it('updates only the provided fields', () => {
    const template = createJournalTemplate(db, { name: 'Daily Review', content: '[]' })
    const updated = updateJournalTemplate(db, template.id, {
      content: '[{"type":"heading"}]'
    })
    expect(updated.name).toBe('Daily Review')
    expect(updated.content).toBe('[{"type":"heading"}]')
  })

  it('throws for an unknown template id', () => {
    expect(() => updateJournalTemplate(db, 999, { name: 'x' })).toThrow(
      'Journal template 999 not found'
    )
  })

  it('deletes a template', () => {
    const template = createJournalTemplate(db, { name: 'Daily Review', content: '[]' })
    deleteJournalTemplate(db, template.id)
    expect(listJournalTemplates(db)).toHaveLength(0)
  })
})
