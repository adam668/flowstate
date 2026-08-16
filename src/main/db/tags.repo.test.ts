import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { getOrCreateTag, listTags } from './tags.repo'

describe('tags.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  describe('listTags', () => {
    it('returns an empty array when no tags exist', () => {
      expect(listTags(db)).toEqual([])
    })

    it('returns all tags created via getOrCreateTag', () => {
      const fomo = getOrCreateTag(db, 'FOMO')
      const breakout = getOrCreateTag(db, 'ORB Breakout')

      const tags = listTags(db)

      expect(tags).toHaveLength(2)
      expect(tags).toContainEqual(fomo)
      expect(tags).toContainEqual(breakout)
    })
  })
})
