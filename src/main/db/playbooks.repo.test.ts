import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createConnection } from './connection'
import { createRuleProfile } from './ruleProfiles.repo'
import { createAccount } from './accounts.repo'
import { createTrade } from './trades.repo'
import {
  createPlaybook,
  listPlaybooks,
  updatePlaybook,
  deletePlaybook
} from './playbooks.repo'

describe('playbooks.repo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createConnection(':memory:')
  })

  it('creates a playbook and returns it with an id', () => {
    const playbook = createPlaybook(db, { name: 'ORB Breakout', criteria: 'Break of opening range' })
    expect(playbook.id).toBeGreaterThan(0)
    expect(playbook.name).toBe('ORB Breakout')
    expect(playbook.criteria).toBe('Break of opening range')
  })

  it('lists playbooks ordered by name', () => {
    createPlaybook(db, { name: 'ORB Breakout', criteria: null })
    createPlaybook(db, { name: 'Fade the Open', criteria: null })
    const playbooks = listPlaybooks(db)
    expect(playbooks.map((p) => p.name)).toEqual(['Fade the Open', 'ORB Breakout'])
  })

  it('updates only the provided fields', () => {
    const playbook = createPlaybook(db, { name: 'ORB Breakout', criteria: 'Original criteria' })
    const updated = updatePlaybook(db, playbook.id, { criteria: 'Refined criteria' })
    expect(updated.name).toBe('ORB Breakout')
    expect(updated.criteria).toBe('Refined criteria')
  })

  it('throws for an unknown playbook id on update', () => {
    expect(() => updatePlaybook(db, 999, { name: 'X' })).toThrow('Playbook 999 not found')
  })

  it('deletes a playbook and nulls out playbook_id on any trades referencing it', () => {
    const profile = createRuleProfile(db, {
      name: 'Apex 150K',
      drawdownType: 'trailing',
      drawdownAmount: 5000,
      dailyLossLimit: 2500,
      consistencyPercent: null,
      minTradingDays: null,
      profitTarget: 9000
    })
    const accountId = createAccount(db, {
      firmName: 'Apex',
      accountName: '150K Eval #2',
      startingBalance: 150000,
      currency: 'USD',
      status: 'evaluation',
      ruleProfileId: profile.id
    }).id
    const playbook = createPlaybook(db, { name: 'ORB Breakout', criteria: null })
    const trade = createTrade(db, {
      accountId,
      instrument: 'ES',
      side: 'long',
      entryPrice: 5000,
      exitPrice: 5010,
      entryTime: '2026-08-11T13:35:00Z',
      exitTime: '2026-08-11T13:50:00Z',
      size: 2,
      pnl: 20,
      rMultiple: null,
      setupThesis: null,
      executionNotes: null,
      lessonsLearned: null,
      brainstorm: null,
      screenshotPaths: [],
      tagIds: [],
      playbookId: playbook.id
    })

    deletePlaybook(db, playbook.id)

    expect(listPlaybooks(db)).toHaveLength(0)
    const row = db.prepare('SELECT playbook_id FROM trades WHERE id = ?').get(trade.id) as {
      playbook_id: number | null
    }
    expect(row.playbook_id).toBeNull()
  })
})
