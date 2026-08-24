import { useEffect, useState } from 'react'
import { flowStateApi } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
import type { Playbook } from '../../../shared/types'

export function PlaybooksView(): JSX.Element {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [name, setName] = useState('')
  const [criteria, setCriteria] = useState('')
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    flowStateApi.playbooks
      .list()
      .then(setPlaybooks)
      .catch((err: unknown) => {
        setError(`Could not load playbooks: ${err instanceof Error ? err.message : String(err)}`)
      })
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    try {
      await flowStateApi.playbooks.create({ name: trimmedName, criteria: criteria.trim() || null })
      setName('')
      setCriteria('')
      refresh()
    } catch (err) {
      setError(`Could not create playbook: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDelete(playbook: Playbook): Promise<void> {
    if (!window.confirm(`Delete "${playbook.name}"? Trades using it will keep their history but lose the link. This cannot be undone.`)) {
      return
    }
    try {
      await flowStateApi.playbooks.delete(playbook.id)
      refresh()
    } catch (err) {
      setError(`Could not delete playbook: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="playbooks-view">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form className="playbooks-form" onSubmit={(e) => void handleCreate(e)}>
        <div className="field">
          <label className="field-label" htmlFor="playbook-name">
            Playbook name
          </label>
          <input
            id="playbook-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ORB Breakout"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="playbook-criteria">
            Setup criteria
          </label>
          <textarea
            id="playbook-criteria"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="Entry rules, risk rules, invalidation..."
          />
        </div>
        <button type="submit" className="field-submit">
          Add playbook
        </button>
      </form>
      <div className="playbooks-list">
        {playbooks.map((playbook) => (
          <div key={playbook.id} className="playbook-card">
            <div className="playbook-card-header">
              <span className="playbook-card-name">{playbook.name}</span>
              <button
                type="button"
                className="playbook-delete"
                onClick={() => void handleDelete(playbook)}
                aria-label={`Delete playbook ${playbook.name}`}
              >
                ×
              </button>
            </div>
            {playbook.criteria && <p className="playbook-card-criteria">{playbook.criteria}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
